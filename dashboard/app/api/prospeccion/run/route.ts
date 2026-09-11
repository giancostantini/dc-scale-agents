/**
 * POST /api/prospeccion/run — dispara una corrida del Prospector
 *
 * Lo llama el dashboard al crear una campaña, para no esperar al cron del
 * lunes. La corrida es DIRIGIDA: busca solo con el ICP de esa campaña.
 *
 * Body: { campaignId?: string }  — sin él, corre todas las activas.
 * Response: { ok, queued, etaMinutes?, reason? }
 *
 * Por qué un endpoint propio y no /api/agents/run: ese exige `clientId` y
 * abre una fila en `agent_runs` antes de dispatchar. El Prospector es un
 * agente de agencia (no tiene cliente) y abre su propio run ignorando el
 * del brief — pasar por ahí dejaría una fila "running" eterna atribuida a
 * un cliente cualquiera. Por eso acá NO se abre ningún run.
 *
 * Auth: director o team.
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dispatchAgentWorkflow } from "@/lib/github-dispatch";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ventana para considerar que ya hay una corrida en curso. */
const RUNNING_WINDOW_MIN = 10;

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["director", "team"]);
  if (!access.ok) return access.response;

  let campaignId: string | null = null;
  try {
    const body = (await req.json()) as { campaignId?: string };
    if (body?.campaignId) campaignId = String(body.campaignId).trim();
  } catch {
    // sin body → corre todas las activas
  }

  // El brief se interpola dentro de comillas simples en el YAML del
  // workflow: un string libre podría romper el shell. Solo UUID.
  if (campaignId && !UUID_RE.test(campaignId)) {
    return Response.json({ error: "campaignId inválido" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Anti doble disparo: crear tres campañas seguidas no debería encimar
  // tres corridas del agente.
  const desde = new Date(Date.now() - RUNNING_WINDOW_MIN * 60_000).toISOString();
  const { data: enCurso } = await admin
    .from("agent_runs")
    .select("id")
    .eq("agent", "prospeccion")
    .eq("status", "running")
    .gte("created_at", desde)
    .limit(1);

  if (enCurso && enCurso.length > 0) {
    return Response.json({
      ok: true,
      queued: false,
      reason:
        "Ya hay una búsqueda en curso — los prospectos de esta campaña van a entrar en esa misma corrida o en la del lunes.",
    });
  }

  try {
    await dispatchAgentWorkflow({
      eventType: "prospeccion",
      payload: {
        brief: {
          source: "dashboard",
          campaignId,
          triggered_by_user_id: access.userId,
        },
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "dispatch falló";
    console.error("[prospeccion/run]", detail);
    return Response.json(
      {
        ok: false,
        queued: false,
        error: `No pude lanzar la búsqueda: ${detail}`,
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, queued: true, etaMinutes: 4 });
}
