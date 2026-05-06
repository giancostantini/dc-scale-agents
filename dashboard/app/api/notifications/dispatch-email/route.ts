/**
 * POST /api/notifications/dispatch-email
 *
 * Despacha emails transaccionales correspondientes a notifs in-app que
 * fueron creadas pero todavía no tienen `email_sent=true`. Lo llaman
 * los endpoints que insertan notif (fire-and-forget) y eventualmente
 * un cron de fallback.
 *
 * El endpoint mira la notif del client_request más reciente del cliente
 * (o, si recibe `requestId`, esa específica) y despacha el email
 * adecuado según `to_role` y/o `to_user_id`.
 *
 * Body (todos opcionales):
 *   - requestId: string  → si se pasa, despacha email para esa solicitud
 *   - phase: string + clientId  → si se pasa, despacha email de phase approved
 *   - notifId: number    → fallback genérico para una notif específica
 *
 * Si ninguno se pasa, mira las últimas 20 notifs sin email_sent del último
 * minuto y las despacha (modo "cron").
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  emailNewRequestToTeam,
  emailRequestStatusChangeToClient,
  emailRequestAssignedToTeam,
  emailPhaseApprovedToClient,
} from "@/lib/email";

interface DispatchBody {
  requestId?: string;
  phase?: "diagnostico" | "estrategia" | "setup" | "lanzamiento";
  clientId?: string;
  notifId?: number;
}

const PHASE_LABELS = {
  diagnostico: "Diagnóstico",
  estrategia: "Estrategia",
  setup: "Setup",
  lanzamiento: "Lanzamiento",
} as const;

export async function POST(req: NextRequest) {
  let body: DispatchBody = {};
  try {
    body = (await req.json()) as DispatchBody;
  } catch {
    // body vacío → modo cron, despachar lo que esté pendiente
  }

  const admin = getSupabaseAdmin();
  const results: Array<{ kind: string; ok: boolean; reason?: string }> = [];

  try {
    // ============================================================
    // CASO 1: requestId pasado → despachar emails relacionados con esa
    // solicitud. Buscamos la solicitud y miramos qué notifs tiene sin
    // email_sent. El insert lo hizo el trigger SQL (notify_client_*) o
    // el endpoint /api/portal/requests/notify (notif al team).
    // ============================================================
    if (body.requestId) {
      const { data: request, error: reqErr } = await admin
        .from("client_requests")
        .select(
          "id, client_id, type, title, description, urgency, status, response, assigned_to",
        )
        .eq("id", body.requestId)
        .maybeSingle();

      if (reqErr || !request) {
        return Response.json(
          { error: "Request not found", reason: reqErr?.message },
          { status: 404 },
        );
      }

      // Buscar notifs de esta solicitud sin email_sent (las del último 5min)
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: pendingNotifs } = await admin
        .from("notifications")
        .select("id, to_role, to_user_id, agent, title, body, level")
        .eq("client", request.client_id)
        .eq("email_sent", false)
        .gte("created_at", fiveMinAgo)
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: client } = await admin
        .from("clients")
        .select("id, name, contact_email")
        .eq("id", request.client_id)
        .maybeSingle();
      const clientName = client?.name ?? request.client_id;

      // Notif para team (rol team) → email al director + team asignado
      const teamNotif = (pendingNotifs ?? []).find(
        (n) => n.to_role === "team" && n.agent === "portal",
      );
      if (teamNotif) {
        const teamEmails = await getTeamEmailsForClient(admin, request.client_id);
        if (teamEmails.length > 0) {
          try {
            await emailNewRequestToTeam({
              teamEmails,
              clientName,
              requestType: request.type as "oferta" | "accion",
              requestTitle: request.title,
              requestDescription: request.description ?? "",
              urgency: request.urgency,
              requestId: request.id,
              clientId: request.client_id,
            });
            await admin
              .from("notifications")
              .update({ email_sent: true })
              .eq("id", teamNotif.id);
            results.push({ kind: "new-request-to-team", ok: true });
          } catch (err) {
            results.push({
              kind: "new-request-to-team",
              ok: false,
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        } else {
          results.push({
            kind: "new-request-to-team",
            ok: false,
            reason: "no team emails for client",
          });
        }
      }

      // Notif al cliente (rol client) → email al cliente
      const clientNotif = (pendingNotifs ?? []).find(
        (n) => n.to_role === "client",
      );
      if (clientNotif) {
        const clientEmail = await getClientEmail(admin, request.client_id);
        if (clientEmail) {
          try {
            await emailRequestStatusChangeToClient({
              clientEmail,
              requestTitle: request.title,
              newStatus: request.status as
                | "reviewing"
                | "in_progress"
                | "done"
                | "rejected",
              response: request.response,
            });
            await admin
              .from("notifications")
              .update({ email_sent: true })
              .eq("id", clientNotif.id);
            results.push({ kind: "status-change-to-client", ok: true });
          } catch (err) {
            results.push({
              kind: "status-change-to-client",
              ok: false,
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        } else {
          results.push({
            kind: "status-change-to-client",
            ok: false,
            reason: "no client email",
          });
        }
      }

      // Notif personal al team asignado (to_user_id) → email a ese team
      const assignedNotif = (pendingNotifs ?? []).find(
        (n) => n.to_user_id !== null && n.agent === "requests",
      );
      if (assignedNotif && request.assigned_to) {
        const { data: teamProfile } = await admin
          .from("profiles")
          .select("email, name")
          .eq("id", request.assigned_to)
          .maybeSingle();
        if (teamProfile?.email) {
          try {
            await emailRequestAssignedToTeam({
              teamEmail: teamProfile.email,
              teamName: teamProfile.name ?? "Equipo",
              clientName,
              requestTitle: request.title,
              requestDescription: request.description ?? "",
              urgency: request.urgency,
              clientId: request.client_id,
            });
            await admin
              .from("notifications")
              .update({ email_sent: true })
              .eq("id", assignedNotif.id);
            results.push({ kind: "assigned-to-team", ok: true });
          } catch (err) {
            results.push({
              kind: "assigned-to-team",
              ok: false,
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    // ============================================================
    // CASO 2: phase + clientId → email al cliente que su reporte fue aprobado
    // ============================================================
    if (body.phase && body.clientId) {
      const { data: client } = await admin
        .from("clients")
        .select("name")
        .eq("id", body.clientId)
        .maybeSingle();
      const clientEmail = await getClientEmail(admin, body.clientId);
      if (clientEmail && client) {
        try {
          await emailPhaseApprovedToClient({
            clientEmail,
            clientName: client.name,
            phaseLabel: PHASE_LABELS[body.phase],
          });
          // Marcar la notif phase_approved como email_sent
          const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
          await admin
            .from("notifications")
            .update({ email_sent: true })
            .eq("client", body.clientId)
            .eq("agent", "phases")
            .eq("email_sent", false)
            .gte("created_at", oneMinAgo);
          results.push({ kind: "phase-approved-to-client", ok: true });
        } catch (err) {
          results.push({
            kind: "phase-approved-to-client",
            ok: false,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        results.push({
          kind: "phase-approved-to-client",
          ok: false,
          reason: "no client email or client not found",
        });
      }
    }

    return Response.json({ ok: true, dispatched: results });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "unknown",
        dispatched: results,
      },
      { status: 500 },
    );
  }
}

// ============================================================
// Helpers internos
// ============================================================

async function getClientEmail(
  admin: ReturnType<typeof getSupabaseAdmin>,
  clientId: string,
): Promise<string | null> {
  // El email del cliente = profile con role='client' y client_id=X
  const { data } = await admin
    .from("profiles")
    .select("email")
    .eq("client_id", clientId)
    .eq("role", "client")
    .limit(1)
    .maybeSingle();
  if (data?.email) return data.email;

  // Fallback: contact_email del cliente (si no hay user del portal todavía)
  const { data: client } = await admin
    .from("clients")
    .select("contact_email")
    .eq("id", clientId)
    .maybeSingle();
  return client?.contact_email ?? null;
}

async function getTeamEmailsForClient(
  admin: ReturnType<typeof getSupabaseAdmin>,
  clientId: string,
): Promise<string[]> {
  // Director siempre + team con asignación a este cliente
  const { data: directors } = await admin
    .from("profiles")
    .select("email")
    .eq("role", "director");

  const { data: assignments } = await admin
    .from("client_assignments")
    .select("user_id")
    .eq("client_id", clientId);

  const teamUserIds = (assignments ?? []).map((a) => a.user_id);
  let teamEmails: string[] = [];
  if (teamUserIds.length > 0) {
    const { data: teamProfiles } = await admin
      .from("profiles")
      .select("email")
      .in("id", teamUserIds)
      .eq("role", "team");
    teamEmails = (teamProfiles ?? [])
      .map((p) => p.email)
      .filter((e): e is string => Boolean(e));
  }

  const allEmails = [
    ...(directors ?? [])
      .map((d) => d.email)
      .filter((e): e is string => Boolean(e)),
    ...teamEmails,
  ];

  // Dedupe
  return Array.from(new Set(allEmails));
}
