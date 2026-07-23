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
} from "@/lib/email";

export const dynamic = "force-dynamic";

type NotifKind =
  | "task_assigned"
  | "client_task_assigned"
  | "client_assigned"
  | "payment_received"
  | "content_approved";

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
}

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

    return Response.json({ error: `Kind no implementado: ${body.kind}` }, { status: 400 });
  } catch (err) {
    const e = err as Error;
    console.error("[/api/notify]", e);
    return Response.json({ error: e.message ?? String(err) }, { status: 500 });
  }
}
