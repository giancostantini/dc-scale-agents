/**
 * POST /api/cron/process-sync — Stage 3 · Sincronización de process_instances
 *
 * Re-deriva el estado de los 3 procesos (onboarding, ciclo de contenido,
 * reporte mensual) desde las tablas fuente y lo upsertea en
 * process_instances. Corre 1×/día (workflow "Process Sync") y también lo
 * invoca /api/phases/approve tras aprobar una fase (sync inmediato).
 *
 * Tras el sync de procesos corre runDigestSync (mig 096): reconstruye los
 * digests cliente→gerencia que alimentan al Gerente General. Best-effort:
 * si los digests fallan, el sync de procesos NO falla — se avisa al bell.
 *
 * Determinista: correrlo N veces = mismo resultado. Body opcional:
 * { clientId } para sincronizar un solo cliente.
 *
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import { NextRequest } from "next/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { runProcessSync } from "@/lib/process-sync";
import { runDigestSync, type DigestSyncResult } from "@/lib/digests";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  let clientId: string | undefined;
  try {
    const body = (await req.json()) as { clientId?: string };
    if (body?.clientId) clientId = body.clientId;
  } catch {
    // sin body → todos los clientes
  }

  try {
    const result = await runProcessSync(clientId);

    // Digests jerárquicos (mig 096) — best-effort, no rompe el sync
    let digests: DigestSyncResult | { error: string };
    try {
      digests = await runDigestSync(clientId);
      if (digests.errores.length > 0) {
        await notifyDigestProblem(digests.errores.join(" | "));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      digests = { error: msg };
      await notifyDigestProblem(msg);
    }

    return Response.json({ ok: true, ...result, digests });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return Response.json({ error: `process-sync falló: ${detail}` }, { status: 500 });
  }
}

/** Bell al director si el build de digests falla (dedup por día). */
async function notifyDigestProblem(detail: string): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.from("notifications").upsert(
      {
        client: null,
        agent: "digest-sync",
        level: "warning",
        title: "El build de digests de gerencias tuvo problemas",
        body: `runDigestSync reportó: ${detail.slice(0, 500)}\nEl Gerente General puede estar respondiendo con digests viejos. Refresh manual: POST /api/cron/digest-sync.`,
        link: "/hub",
        to_role: "director",
        email_sent: false,
        dedup_key: `digest-sync-fail-${new Date().toISOString().slice(0, 10)}`,
      },
      { onConflict: "dedup_key", ignoreDuplicates: true },
    );
  } catch {
    // el bell es best-effort del best-effort
  }
}
