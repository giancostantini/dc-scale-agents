/**
 * PATCH /api/clients/[id]/kpis
 *
 * Mergea métricas de paid media en `clients.kpis.paid_media[platform]`.
 * Sirve para el "manual sync" de Meta/Google/TikTok/Email hasta que
 * tengamos integraciones OAuth automáticas.
 *
 * Body:
 *   platform: "meta" | "google" | "tiktok" | "email"
 *   metrics:  PlatformMetrics (spent, ROAS, leads, conversiones, etc.)
 *
 * Auth: cualquier rol con acceso al cliente. Las RLS y el lookup
 * filtran lo demás.
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { logAction } from "@/lib/audit";

const PLATFORMS = ["meta", "google", "tiktok", "email"] as const;
type Platform = (typeof PLATFORMS)[number];

interface KpisBody {
  platform?: Platform;
  metrics?: Record<string, number | string | undefined>;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return Response.json(
      { error: "Servidor no configurado (Supabase)." },
      { status: 500 },
    );
  }

  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: KpisBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const { platform, metrics } = body;
  if (!platform || !PLATFORMS.includes(platform)) {
    return Response.json(
      { error: `platform inválida. Usar: ${PLATFORMS.join(", ")}` },
      { status: 400 },
    );
  }
  if (!metrics || typeof metrics !== "object") {
    return Response.json({ error: "metrics es requerido" }, { status: 400 });
  }

  // Sanitize: solo claves conocidas, números o strings cortos.
  const allowedKeys = [
    "spent",
    "impressions",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "conversions",
    "cpa",
    "roas",
    "notes",
  ];
  const sanitized: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(metrics)) {
    if (!allowedKeys.includes(k)) continue;
    if (v === undefined || v === null || v === "") continue;
    if (k === "notes") {
      sanitized[k] = String(v).slice(0, 500);
    } else {
      const n = Number(v);
      if (Number.isFinite(n)) sanitized[k] = n;
    }
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: clientRow, error: fetchErr } = await admin
    .from("clients")
    .select("kpis")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !clientRow) {
    return Response.json(
      { error: `Cliente no encontrado: ${fetchErr?.message ?? id}` },
      { status: 404 },
    );
  }

  const currentKpis = (clientRow.kpis ?? {}) as Record<string, unknown>;
  const currentPaidMedia = (currentKpis.paid_media ?? {}) as Record<
    string,
    unknown
  >;
  const newKpis = {
    ...currentKpis,
    paid_media: {
      ...currentPaidMedia,
      [platform]: sanitized,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
  };

  const { error: updErr } = await admin
    .from("clients")
    .update({ kpis: newKpis, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updErr) {
    return Response.json(
      { error: `No se pudo actualizar: ${updErr.message}` },
      { status: 500 },
    );
  }

  await logAction({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "kpis.update",
    targetType: "client",
    targetId: id,
    metadata: { platform, fields: Object.keys(sanitized) },
  });

  return Response.json({ ok: true, kpis: newKpis });
}
