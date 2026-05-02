/**
 * POST /api/storage/cleanup-orphans
 *
 * Borra archivos del bucket "client-onboarding" que NO estén referenciados en
 * `clients.onboarding.{contractFile, kickoffFile, brandingFiles}` y que tengan
 * más de N días de antigüedad. Pensado para correrse manualmente desde la UI
 * del director (o periódicamente vía cron en el futuro).
 *
 * Body (opcional):
 *   olderThanDays: number  (default 7)
 *   dryRun: boolean        (default true) — si true, solo reporta qué borraría
 *
 * Auth: solo director (validado contra el JWT del caller).
 *
 * Devuelve:
 *   { scanned, referenced, orphans, deleted, dryRun }
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const BUCKET = "client-onboarding";

interface CleanupBody {
  olderThanDays?: number;
  dryRun?: boolean;
}

interface ClientOnboardingRow {
  id: string;
  onboarding: {
    contractFile?: { path: string } | string;
    kickoffFile?: { path: string } | string;
    brandingFiles?: Array<{ path: string } | string>;
  } | null;
}

function pathOf(file: { path: string } | string): string {
  return typeof file === "string" ? file : file.path;
}

function collectReferenced(rows: ClientOnboardingRow[]): Set<string> {
  const referenced = new Set<string>();
  for (const r of rows) {
    const o = r.onboarding;
    if (!o) continue;
    if (o.contractFile) referenced.add(pathOf(o.contractFile));
    if (o.kickoffFile) referenced.add(pathOf(o.kickoffFile));
    if (o.brandingFiles) {
      for (const f of o.brandingFiles) referenced.add(pathOf(f));
    }
  }
  return referenced;
}

// supabase-js tipa el cliente con generics estrictos; para esta función
// genérica que solo usa Storage API alcanza con `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StorageClient = any;

async function listAllFiles(
  supabase: StorageClient,
  prefix = "",
): Promise<Array<{ path: string; created_at: string }>> {
  const out: Array<{ path: string; created_at: string }> = [];
  const { data: items, error } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000, offset: 0 });
  if (error || !items) return out;
  for (const it of items as Array<{
    id: string | null;
    name: string;
    created_at: string | null;
  }>) {
    const p = prefix ? `${prefix}/${it.name}` : it.name;
    if (it.id === null) {
      // Es una "carpeta" — recorrer recursivamente
      const sub = await listAllFiles(supabase, p);
      out.push(...sub);
    } else {
      out.push({ path: p, created_at: it.created_at ?? new Date().toISOString() });
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return Response.json(
      { error: "Servidor no configurado." },
      { status: 500 },
    );
  }

  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json(
      { error: "Solo directores pueden correr cleanup." },
      { status: 403 },
    );
  }

  let body: CleanupBody = {};
  try {
    body = (await req.json()) as CleanupBody;
  } catch {
    // body vacío o malformado — usar defaults
  }
  const olderThanDays = body.olderThanDays ?? 7;
  const dryRun = body.dryRun ?? true;

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Listar todos los archivos del bucket
  const allFiles = await listAllFiles(admin, "");

  // 2. Listar referencias en clients.onboarding
  const { data: clientRows } = await admin
    .from("clients")
    .select("id, onboarding");
  const referenced = collectReferenced(
    (clientRows ?? []) as ClientOnboardingRow[],
  );

  // 3. Filtrar huérfanos por antigüedad
  const cutoff = Date.now() - olderThanDays * 86400000;
  const orphans = allFiles.filter((f) => {
    if (referenced.has(f.path)) return false;
    const created = new Date(f.created_at).getTime();
    return created < cutoff;
  });

  let deleted = 0;
  if (!dryRun && orphans.length > 0) {
    const paths = orphans.map((o) => o.path);
    // Supabase Storage permite remove en chunks de 100
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { data, error } = await admin.storage.from(BUCKET).remove(chunk);
      if (!error) deleted += data?.length ?? 0;
    }
  }

  return Response.json({
    scanned: allFiles.length,
    referenced: referenced.size,
    orphans: orphans.length,
    deleted,
    dryRun,
    olderThanDays,
    paths: orphans.map((o) => o.path).slice(0, 50), // sample para inspección
  });
}
