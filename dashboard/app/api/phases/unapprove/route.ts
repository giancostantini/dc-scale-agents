/**
 * POST /api/phases/unapprove
 *
 * Deshace la aprobación de un reporte de fase: vuelve el status a
 * 'draft', limpia approved_at/approved_by, y CASCADEA hacia las
 * fases posteriores aprobadas (porque si la fase N vuelve a draft,
 * las fases N+1, N+2... que se construyeron encima ya no tienen
 * base aprobada → quedan en un estado inconsistente).
 *
 * El content_md se preserva — solo cambia el estado. El director
 * puede pedirlo, editarlo, subirlo manualmente o regenerar desde
 * cero después de deshacer.
 *
 * Body:
 *   clientId: string
 *   phase:    "diagnostico" | "estrategia" | "setup" | "lanzamiento"
 *
 * Solo director.
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { logAction } from "@/lib/audit";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;
type PhaseKey = (typeof PHASES)[number];

export async function POST(req: NextRequest) {
  // ====== Env + auth ======
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return Response.json(
      { error: "Servidor no configurado." },
      { status: 500 },
    );
  }

  const callerToken = req.headers
    .get("authorization")
    ?.replace("Bearer ", "");
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
      { error: "Solo directores pueden deshacer aprobaciones." },
      { status: 403 },
    );
  }

  // ====== Body ======
  let body: { clientId?: string; phase?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const { clientId, phase } = body;
  if (!clientId || !phase) {
    return Response.json(
      { error: "Faltan clientId o phase" },
      { status: 400 },
    );
  }
  if (!PHASES.includes(phase as PhaseKey)) {
    return Response.json({ error: "phase inválido" }, { status: 400 });
  }
  const phaseKey = phase as PhaseKey;

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ====== Verificar estado actual ======
  const { data: current } = await admin
    .from("phase_reports")
    .select("status, content_md")
    .eq("client_id", clientId)
    .eq("phase", phaseKey)
    .maybeSingle();

  if (!current) {
    return Response.json(
      { error: "No hay reporte para esta fase." },
      { status: 404 },
    );
  }
  if (current.status !== "approved") {
    return Response.json(
      {
        error: `Solo se pueden deshacer fases aprobadas. Estado actual: ${current.status}.`,
      },
      { status: 400 },
    );
  }

  // ====== Recolectar fases posteriores aprobadas (para cascada) ======
  // Si Diagnostico está aprobado y Estrategia también, deshacer
  // Diagnostico requiere deshacer Estrategia también — sino quedás
  // con "Estrategia aprobada sobre Diagnostico en draft", inconsistente.
  const phaseIdx = PHASES.indexOf(phaseKey);
  const laterPhases = PHASES.slice(phaseIdx + 1);

  const { data: laterRows } = await admin
    .from("phase_reports")
    .select("phase, status")
    .eq("client_id", clientId)
    .in("phase", laterPhases as unknown as string[]);

  const laterApproved = (laterRows ?? [])
    .filter((r) => r.status === "approved")
    .map((r) => r.phase as PhaseKey);

  // Todas las fases a revertir: la actual + cualquiera posterior approved
  const phasesToRevert: PhaseKey[] = [phaseKey, ...laterApproved];

  // ====== Update en lote ======
  const { error: updErr } = await admin
    .from("phase_reports")
    .update({
      status: "draft",
      approved_at: null,
      approved_by: null,
    })
    .eq("client_id", clientId)
    .in("phase", phasesToRevert as unknown as string[]);

  if (updErr) {
    return Response.json(
      { error: `No se pudo deshacer: ${updErr.message}` },
      { status: 500 },
    );
  }

  // ====== Audit log ======
  await logAction({
    actorId: caller.id,
    actorEmail: caller.email ?? null,
    action: "phase.unapprove",
    targetType: "phase_report",
    targetId: `${clientId}:${phaseKey}`,
    metadata: {
      clientId,
      phase: phaseKey,
      cascadedPhases: laterApproved,
    },
  });

  return Response.json({
    success: true,
    clientId,
    phase: phaseKey,
    revertedPhases: phasesToRevert,
    cascaded: laterApproved.length,
  });
}
