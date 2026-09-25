/**
 * POST /api/notify
 *
 * Endpoint central para disparar notificaciones por email a miembros
 * del equipo. Los callers son los lugares donde ocurre el evento:
 *   · createRequest → notify('new_request', { requestId })
 *     (esto ya estaba en /api/portal/requests/notify, lo dejamos)
 *   · addTask → notify('task_assigned', { taskId, assigneeUserId })
 *   · addAssignment → notify('client_assigned', { clientId, userId, role })
 *   · setPaymentStatus(paid) → notify('payment_received', { clientId, month })
 *   · approveContent → notify('content_approved', { contentId })
 *   · addEvent/updateEvent → notify('event_shared', { eventId, emails, updated })
 *     → mail + campana a los participantes INTERNOS (director/team), menos
 *       quien lo cargó. A externos no les escribimos desde el dashboard.
 *
 * Para cada tipo:
 *   1. Resuelve el destinatario.
 *   2. Verifica su email_on_<type> preference (default true).
 *   3. Dispara el template apropiado vía Resend.
 *   4. (Futuro) Si tiene Outlook conectado, también empuja al calendario.
 *
 * Es fire-and-forget desde el frontend. No bloquea la mutación.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";
import {
  emailTaskAssigned,
  emailClientAssigned,
  emailClientTaskAssigned,
  emailPaymentReceived,
  emailEventShared,
} from "@/lib/email";

export const dynamic = "force-dynamic";

type NotifKind =
  | "task_assigned"
  | "client_task_assigned"
  | "client_assigned"
  | "payment_received"
  | "content_approved"
  | "event_shared";

interface NotifBody {
  kind: NotifKind;
  /** task_assigned */
  taskId?: string;
  assigneeUserId?: string;
  /** client_assigned */
  clientId?: string;
  userId?: string;
  roleInClient?: string;
  /** payment_received */
  month?: string;
  /** event_shared */
  eventId?: string;
  emails?: string[];
  updated?: boolean;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  reunion: "Reunión",
  reporte: "Reporte",
  dev: "Dev",
  contenido: "Contenido",
  pauta: "Pauta",
};

export async function POST(req: NextRequest) {
  // Disparar notifs/mails es acción de equipo (lo llaman mutaciones del
  // dashboard). Antes era sin auth → cualquiera podía spamear mails.
  const access = await requireRole(req, ["director", "team"]);
  if (!access.ok) return access.response;

  let body: NotifBody;
  try {
    body = (await req.json()) as NotifBody;
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!body.kind) {
    return Response.json({ error: "Falta kind" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    if (body.kind === "task_assigned") {
      const { taskId, assigneeUserId } = body;
      if (!assigneeUserId) {
        return Response.json({ error: "Falta assigneeUserId" }, { status: 400 });
      }
      const { data: prof } = await admin
        .from("profiles")
        .select("email, name, email_on_task_assigned")
        .eq("id", assigneeUserId)
        .maybeSingle();
      if (!prof) return Response.json({ ok: true, skipped: "no-profile" });
      if ((prof as { email_on_task_assigned?: boolean }).email_on_task_assigned === false) {
        return Response.json({ ok: true, skipped: "user-opted-out" });
      }
      const profileTyped = prof as { email?: string; name?: string };
      if (!profileTyped.email) return Response.json({ ok: true, skipped: "no-email" });

      let task: Record<string, unknown> | null = null;
      let clientName: string | null = null;
      if (taskId) {
        const { data: t } = await admin
          .from("dev_tasks")
          .select("title, description, client_id, due_date, priority")
          .eq("id", taskId)
          .maybeSingle();
        task = t as Record<string, unknown> | null;
        if (task?.client_id) {
          const { data: c } = await admin
            .from("clients")
            .select("name")
            .eq("id", task.client_id as string)
            .maybeSingle();
          clientName = (c as { name?: string } | null)?.name ?? null;
        }
      }
      await emailTaskAssigned({
        assigneeEmail: profileTyped.email,
        assigneeName: profileTyped.name ?? profileTyped.email,
        taskTitle: (task?.title as string) ?? "Nueva tarea",
        taskDescription: (task?.description as string | null) ?? null,
        clientName,
        clientId: (task?.client_id as string | null) ?? null,
        dueDate: (task?.due_date as string | null) ?? null,
        priority: (task?.priority as string | null) ?? null,
      });
      return Response.json({ ok: true });
    }

    if (body.kind === "client_task_assigned") {
      // Task creada en /cliente/[id]/tareas con assignee = cliente.
      // Le mandamos email al contacto del cliente (o al perfil portal
      // del cliente, si tiene email seteado). Respeta email_on_task_assigned.
      const { taskId, clientId } = body;
      if (!taskId || !clientId) {
        return Response.json({ error: "Faltan taskId/clientId" }, { status: 400 });
      }
      const { data: task } = await admin
        .from("dev_tasks")
        .select("title, description, due_date, priority")
        .eq("id", taskId)
        .maybeSingle();
      if (!task) return Response.json({ ok: true, skipped: "no-task" });
      const t = task as {
        title: string;
        description: string | null;
        due_date: string | null;
        priority: string | null;
      };
      const { data: client } = await admin
        .from("clients")
        .select("name, contact_name, contact_email")
        .eq("id", clientId)
        .maybeSingle();
      if (!client) return Response.json({ ok: true, skipped: "no-client" });
      const c = client as {
        name: string;
        contact_name: string | null;
        contact_email: string | null;
      };
      // Preferimos el email del perfil portal del cliente (el que usa
      // para loguearse). Si no hay perfil o no tiene email, caemos al
      // contact_email cargado en el wizard.
      const { data: portalProf } = await admin
        .from("profiles")
        .select("email, name, email_on_task_assigned")
        .eq("client_id", clientId)
        .eq("role", "client")
        .maybeSingle();
      const portal = portalProf as
        | { email?: string; name?: string; email_on_task_assigned?: boolean }
        | null;
      if (portal?.email_on_task_assigned === false) {
        return Response.json({ ok: true, skipped: "client-opted-out" });
      }
      const targetEmail = portal?.email ?? c.contact_email ?? null;
      const targetName = portal?.name ?? c.contact_name ?? c.name;
      if (!targetEmail) return Response.json({ ok: true, skipped: "no-email" });

      await emailClientTaskAssigned({
        clientContactEmail: targetEmail,
        clientContactName: targetName,
        clientName: c.name,
        taskTitle: t.title,
        taskDescription: t.description,
        dueDate: t.due_date,
        priority: t.priority,
      });
      return Response.json({ ok: true });
    }

    if (body.kind === "client_assigned") {
      const { clientId, userId, roleInClient } = body;
      if (!clientId || !userId) {
        return Response.json({ error: "Faltan clientId/userId" }, { status: 400 });
      }
      const { data: prof } = await admin
        .from("profiles")
        .select("email, name, email_on_client_assigned")
        .eq("id", userId)
        .maybeSingle();
      if (!prof) return Response.json({ ok: true, skipped: "no-profile" });
      if ((prof as { email_on_client_assigned?: boolean }).email_on_client_assigned === false) {
        return Response.json({ ok: true, skipped: "user-opted-out" });
      }
      const profileTyped = prof as { email?: string; name?: string };
      if (!profileTyped.email) return Response.json({ ok: true, skipped: "no-email" });

      const { data: client } = await admin
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .maybeSingle();
      const clientName = (client as { name?: string } | null)?.name ?? clientId;
      await emailClientAssigned({
        assigneeEmail: profileTyped.email,
        assigneeName: profileTyped.name ?? profileTyped.email,
        clientName,
        clientId,
        roleInClient: roleInClient ?? "Funcional",
      });
      return Response.json({ ok: true });
    }

    if (body.kind === "payment_received") {
      const { clientId, month } = body;
      if (!clientId || !month) {
        return Response.json({ error: "Faltan clientId/month" }, { status: 400 });
      }
      // Notif a todos los directores con email_on_payment_received=true
      const { data: dirs } = await admin
        .from("profiles")
        .select("email, name, email_on_payment_received")
        .eq("role", "director");
      const targets = (dirs ?? []).filter(
        (d) =>
          (d as { email_on_payment_received?: boolean })
            .email_on_payment_received !== false,
      ) as { email?: string; name?: string }[];
      if (targets.length === 0) return Response.json({ ok: true, skipped: "no-targets" });

      const { data: client } = await admin
        .from("clients")
        .select("name, fee, default_cuenta_id")
        .eq("id", clientId)
        .maybeSingle();
      const clientTyped = client as
        | { name?: string; fee?: number | string; default_cuenta_id?: string | null }
        | null;
      const clientName = clientTyped?.name ?? clientId;

      // Intentamos calcular el monto desde el payment row
      const { data: payment } = await admin
        .from("payments")
        .select("amount_override")
        .eq("client_id", clientId)
        .eq("month", month)
        .maybeSingle();
      const override = (payment as { amount_override?: number | string } | null)?.amount_override;
      const fee =
        (override == null
          ? null
          : typeof override === "string"
            ? parseFloat(override)
            : Number(override)) ??
        (typeof clientTyped?.fee === "string"
          ? parseFloat(clientTyped.fee)
          : Number(clientTyped?.fee ?? 0));
      const amountStr = `USD ${Math.round(fee).toLocaleString("es-AR")}`;

      let cuentaName: string | null = null;
      if (clientTyped?.default_cuenta_id) {
        const { data: cuenta } = await admin
          .from("cuentas_bancarias")
          .select("bank_name, last4")
          .eq("id", clientTyped.default_cuenta_id)
          .maybeSingle();
        if (cuenta) {
          const c = cuenta as { bank_name?: string; last4?: string };
          cuentaName = `${c.bank_name ?? ""} ····${c.last4 ?? "0000"}`;
        }
      }

      await Promise.allSettled(
        targets
          .filter((t) => t.email)
          .map((t) =>
            emailPaymentReceived({
              directorEmail: t.email!,
              directorName: t.name ?? t.email!,
              clientName,
              amount: amountStr,
              month,
              cuentaName,
            }),
          ),
      );
      return Response.json({ ok: true, sent: targets.length });
    }

    if (body.kind === "event_shared") {
      const { eventId } = body;
      const emails = [
        ...new Set(
          (body.emails ?? [])
            .map((e) => String(e).trim().toLowerCase())
            .filter((e) => e.includes("@")),
        ),
      ];
      if (!eventId) return Response.json({ error: "Falta eventId" }, { status: 400 });
      if (emails.length === 0) return Response.json({ ok: true, sent: 0 });

      const { data: ev } = await admin
        .from("cal_events")
        .select("title, type, date, end_date, time, duration, client_id, client_label, meet_link, notes")
        .eq("id", eventId)
        .maybeSingle();
      if (!ev) return Response.json({ ok: true, skipped: "no-event" });
      const e = ev as {
        title: string;
        type: string;
        date: string;
        end_date: string | null;
        time: string | null;
        duration: number | null;
        client_id: string | null;
        client_label: string | null;
        meet_link: string | null;
        notes: string | null;
      };

      // Solo gente del equipo, y nunca quien cargó el evento.
      const { data: people } = await admin
        .from("profiles")
        .select("id, email, name, role")
        .in("role", ["director", "team"]);
      const targets = ((people ?? []) as Array<{
        id: string;
        email: string | null;
        name: string | null;
      }>).filter(
        (p) => p.email && emails.includes(p.email.toLowerCase()) && p.id !== access.userId,
      );
      if (targets.length === 0) return Response.json({ ok: true, sent: 0 });

      const { data: author } = await admin
        .from("profiles")
        .select("name")
        .eq("id", access.userId)
        .maybeSingle();
      const byName = (author as { name?: string } | null)?.name ?? "Alguien del equipo";
      const clientName = e.client_id ? e.client_label : null;
      const typeLabel = EVENT_TYPE_LABELS[e.type] ?? e.type;
      const title = body.updated ? "Cambió un evento en el que estás" : "Te sumaron a un evento";

      // Campana: una notificación personal por destinatario.
      await admin.from("notifications").insert(
        targets.map((t) => ({
          client: e.client_id,
          to_user_id: t.id,
          agent: "calendario",
          level: "info",
          title,
          body: `${e.title} · ${e.date}${e.time ? ` ${e.time}` : ""} — ${byName}`,
          link: "/calendario",
          read: false,
          email_sent: true,
        })),
      );

      const sent = await Promise.allSettled(
        targets.map((t) =>
          emailEventShared({
            to: t.email!,
            name: t.name ?? t.email!,
            byName,
            title: e.title,
            typeLabel,
            date: e.date,
            endDate: e.end_date,
            time: e.time,
            duration: e.duration,
            clientName,
            meetLink: e.meet_link,
            notes: e.notes,
            updated: body.updated === true,
          }),
        ),
      );
      return Response.json({
        ok: true,
        sent: sent.filter((r) => r.status === "fulfilled").length,
        failed: sent.filter((r) => r.status === "rejected").length,
      });
    }

    return Response.json({ error: `Kind no implementado: ${body.kind}` }, { status: 400 });
  } catch (err) {
    const e = err as Error;
    console.error("[/api/notify]", e);
    return Response.json({ error: e.message ?? String(err) }, { status: 500 });
  }
}
