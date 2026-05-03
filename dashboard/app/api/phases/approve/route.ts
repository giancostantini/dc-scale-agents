/**
 * POST /api/phases/approve
 *
 * Marca un reporte de fase como approved y dispara la generación
 * automática del siguiente reporte (si existe). Solo directores.
 *
 * Body:
 *   clientId: string
 *   phase:    "diagnostico" | "estrategia" | "setup" | "lanzamiento"
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { logAction } from "@/lib/audit";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;
type PhaseKey = (typeof PHASES)[number];

function nextPhaseOf(p: PhaseKey): PhaseKey | null {
  const i = PHASES.indexOf(p);
  if (i === -1 || i === PHASES.length - 1) return null;
  return PHASES[i + 1];
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return Response.json(
      { error: "Servidor no configurado (Supabase / service role key)." },
      { status: 500 },
    );
  }

  // Auth
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
      { error: "Solo directores pueden aprobar reportes." },
      { status: 403 },
    );
  }

  // Body
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

  // Verificar que el reporte exista y esté en draft
  const { data: existing } = await admin
    .from("phase_reports")
    .select("status")
    .eq("client_id", clientId)
    .eq("phase", phaseKey)
    .maybeSingle();

  if (!existing) {
    return Response.json(
      { error: "El reporte no existe todavía. Generalo antes de aprobar." },
      { status: 400 },
    );
  }
  if (existing.status === "approved") {
    return Response.json(
      { error: "Este reporte ya estaba aprobado." },
      { status: 400 },
    );
  }
  if (existing.status !== "draft") {
    return Response.json(
      {
        error: `Solo se puede aprobar un reporte en draft. Estado actual: ${existing.status}.`,
      },
      { status: 400 },
    );
  }

  // Marcar como approved
  const { error: updErr } = await admin
    .from("phase_reports")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: caller.id,
    })
    .eq("client_id", clientId)
    .eq("phase", phaseKey);

  if (updErr) {
    return Response.json(
      { error: `No se pudo aprobar: ${updErr.message}` },
      { status: 500 },
    );
  }

  // Disparar la siguiente fase como 'pending' (lista para generar).
  // El director va a clickear "Generar" para arrancarla, o podríamos
  // auto-generar acá. Por ahora la dejamos pending y que decida humano.
  const next = nextPhaseOf(phaseKey);
  if (next) {
    await admin.from("phase_reports").upsert(
      {
        client_id: clientId,
        phase: next,
        status: "pending",
        version: 1,
      },
      { onConflict: "client_id,phase" },
    );
  }

  // Notificar al cliente que tiene un nuevo reporte aprobado.
  // Realtime filtra por client; el bell del portal lo levanta.
  // Si falla (RLS, validation), seguimos — la aprobación ya quedó.
  const { data: clientRow } = await admin
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .maybeSingle();

  const phaseLabels: Record<PhaseKey, string> = {
    diagnostico: "Diagnóstico",
    estrategia: "Estrategia",
    setup: "Setup",
    lanzamiento: "Lanzamiento",
  };

  const { error: notifErr } = await admin.from("notifications").insert({
    client: clientId,
    to_role: "client", // dirigida solo al cliente del portal
    agent: "phases",
    level: "success",
    title: `Reporte de ${phaseLabels[phaseKey]} aprobado`,
    body: clientRow?.name
      ? `Ya podés ver el resumen ejecutivo en tu portal.`
      : "Resumen ejecutivo disponible en tu portal.",
    link: "/portal",
    read: false,
    email_sent: false,
  });
  if (notifErr) {
    console.warn("[phases/approve] notif insert failed:", notifErr.message);
  }

  // Disparar email transaccional al cliente. Fire-and-forget.
  fetch(`${req.nextUrl.origin}/api/notifications/dispatch-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phase: phaseKey, clientId }),
  }).catch((err) => {
    console.warn("[phases/approve] dispatch-email failed:", err);
  });

  await logAction({
    actorId: caller.id,
    actorEmail: caller.email ?? null,
    action: "phase.approve",
    targetType: "phase_report",
    targetId: `${clientId}:${phaseKey}`,
    metadata: { clientId, phase: phaseKey, next },
  });

  return Response.json({
    success: true,
    clientId,
    phase: phaseKey,
    next,
  });
}
