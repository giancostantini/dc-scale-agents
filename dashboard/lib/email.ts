/**
 * Email transaccional vía Resend.
 *
 * NUNCA importar este archivo desde un Client Component — usa
 * RESEND_TRANSACTIONAL_API_KEY (server-only).
 *
 * Esta API key es DISTINTA a la que usa Supabase Auth como SMTP password
 * (que envía invites + reset password). La separación es para que si una
 * se filtra, no compromete el otro canal.
 *
 * Setup:
 * - Crear API key en Resend con permission "Sending access" sobre el
 *   dominio sistemadearmascostantini.com
 * - Setear como RESEND_TRANSACTIONAL_API_KEY en Vercel + .env.local
 */

import { Resend } from "resend";

const FROM = "Dearmas Costantini <noreply@sistemadearmascostantini.com>";
const PORTAL_URL = "https://sistemadearmascostantini.com";

let _client: Resend | null = null;

function getResend(): Resend {
  if (_client) return _client;
  const key = process.env.RESEND_TRANSACTIONAL_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "RESEND_TRANSACTIONAL_API_KEY no está seteada. Sin esto no se pueden mandar emails transaccionales (notifs de solicitudes, reportes, etc.).",
    );
  }
  _client = new Resend(key);
  return _client;
}

interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Helper genérico de envío. Lo usan las funciones específicas debajo.
 * Si Resend devuelve error, lo lanza para que el caller decida si
 * fallar (registrar en agent_runs) o seguir (dejar la notif in-app
 * sin email — un cron posterior puede reintentar).
 */
export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: SendEmailInput): Promise<{ id: string }> {
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  });
  if (error) {
    throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`);
  }
  return { id: data?.id ?? "unknown" };
}

// ============================================================
// Templates de los 4 eventos definidos en el plan
// ============================================================

function baseLayout(content: string, ctaUrl?: string, ctaLabel?: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
</head>
<body style="margin:0;padding:0;background:#f5f1e9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a1a0c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f1e9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid rgba(10,26,12,0.08);max-width:560px;">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(10,26,12,0.06);">
              <div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#8b7355;font-weight:600;">
                Dearmas Costantini · Sistema
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;font-size:15px;line-height:1.6;color:#0a1a0c;">
              ${content}
              ${
                ctaUrl && ctaLabel
                  ? `
                <div style="margin-top:32px;">
                  <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;background:#0a1a0c;color:#f5f1e9;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">
                    ${ctaLabel}
                  </a>
                </div>
              `
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid rgba(10,26,12,0.06);font-size:11px;color:#8b7355;letter-spacing:0.02em;">
              Este mail fue generado automáticamente por el sistema de Dearmas Costantini.<br/>
              Si no esperabas recibirlo, ignoralo.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 1. Cliente crea solicitud nueva → email al director + team asignado.
 */
export async function emailNewRequestToTeam(input: {
  teamEmails: string[];
  clientName: string;
  requestType: "oferta" | "accion";
  requestTitle: string;
  requestDescription: string;
  urgency: "baja" | "media" | "alta";
  requestId: string;
  clientId: string;
}): Promise<{ id: string } | null> {
  if (input.teamEmails.length === 0) return null;
  const typeLabel = input.requestType === "oferta" ? "oferta" : "acción";
  const urgencyLabel = {
    alta: "🔴 Alta",
    media: "🟡 Media",
    baja: "🟢 Baja",
  }[input.urgency];

  const html = baseLayout(
    `
      <h1 style="font-size:24px;font-weight:700;margin:0 0 12px;letter-spacing:-0.02em;">
        Nueva ${typeLabel} de ${escapeHtml(input.clientName)}
      </h1>
      <p style="margin:0 0 20px;color:#5a5a5a;font-size:14px;">
        El cliente cargó una nueva ${typeLabel} en su portal.
      </p>
      <div style="background:#f5f1e9;padding:20px;border-left:3px solid #c4a882;margin:20px 0;">
        <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#8b7355;font-weight:600;margin-bottom:8px;">
          ${typeLabel} · urgencia ${urgencyLabel}
        </div>
        <div style="font-size:18px;font-weight:600;margin-bottom:12px;">${escapeHtml(input.requestTitle)}</div>
        <div style="font-size:13px;color:#5a5a5a;white-space:pre-wrap;">${escapeHtml(input.requestDescription)}</div>
      </div>
    `,
    `${PORTAL_URL}/cliente/${input.clientId}/solicitudes`,
    "Ver en el dashboard",
  );

  return sendEmail({
    to: input.teamEmails,
    subject: `Nueva ${typeLabel} de ${input.clientName}: ${input.requestTitle}`,
    html,
  });
}

/**
 * 2. Director/team cambia status de solicitud → email al cliente.
 */
export async function emailRequestStatusChangeToClient(input: {
  clientEmail: string;
  requestTitle: string;
  newStatus: "reviewing" | "in_progress" | "done" | "rejected";
  response?: string | null;
}): Promise<{ id: string } | null> {
  const statusLabels = {
    reviewing: { title: "Tu solicitud está en revisión", emoji: "👀" },
    in_progress: { title: "Tu solicitud está en curso", emoji: "🚀" },
    done: { title: "¡Tu solicitud fue completada!", emoji: "✅" },
    rejected: { title: "Tu solicitud fue rechazada", emoji: "❌" },
  };
  const { title } = statusLabels[input.newStatus];

  const html = baseLayout(
    `
      <h1 style="font-size:24px;font-weight:700;margin:0 0 12px;letter-spacing:-0.02em;">
        ${title}
      </h1>
      <div style="background:#f5f1e9;padding:20px;border-left:3px solid #c4a882;margin:20px 0;">
        <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#8b7355;font-weight:600;margin-bottom:8px;">
          Solicitud
        </div>
        <div style="font-size:18px;font-weight:600;">${escapeHtml(input.requestTitle)}</div>
      </div>
      ${
        input.response
          ? `
        <div style="background:#eef5ed;padding:20px;border-left:3px solid #5a8a5a;margin:20px 0;">
          <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#5a8a5a;font-weight:600;margin-bottom:8px;">
            Respuesta del equipo
          </div>
          <div style="font-size:14px;color:#0a1a0c;white-space:pre-wrap;">${escapeHtml(input.response)}</div>
        </div>
      `
          : ""
      }
    `,
    `${PORTAL_URL}/portal/solicitudes`,
    "Ver en mi portal",
  );

  return sendEmail({
    to: input.clientEmail,
    subject: `${title}: ${input.requestTitle}`,
    html,
  });
}

/**
 * 3. Director asigna solicitud a un team_member → email a ese team.
 */
export async function emailRequestAssignedToTeam(input: {
  teamEmail: string;
  teamName: string;
  clientName: string;
  requestTitle: string;
  requestDescription: string;
  urgency: "baja" | "media" | "alta";
  clientId: string;
}): Promise<{ id: string }> {
  const urgencyLabel = {
    alta: "🔴 Alta",
    media: "🟡 Media",
    baja: "🟢 Baja",
  }[input.urgency];

  const html = baseLayout(
    `
      <h1 style="font-size:24px;font-weight:700;margin:0 0 12px;letter-spacing:-0.02em;">
        Te asignaron una solicitud
      </h1>
      <p style="margin:0 0 20px;color:#5a5a5a;font-size:14px;">
        Hola ${escapeHtml(input.teamName.split(" ")[0])}, el director te asignó una nueva tarea de <strong>${escapeHtml(input.clientName)}</strong>.
      </p>
      <div style="background:#f5f1e9;padding:20px;border-left:3px solid #c4a882;margin:20px 0;">
        <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#8b7355;font-weight:600;margin-bottom:8px;">
          Urgencia ${urgencyLabel}
        </div>
        <div style="font-size:18px;font-weight:600;margin-bottom:12px;">${escapeHtml(input.requestTitle)}</div>
        <div style="font-size:13px;color:#5a5a5a;white-space:pre-wrap;">${escapeHtml(input.requestDescription)}</div>
      </div>
    `,
    `${PORTAL_URL}/cliente/${input.clientId}/solicitudes`,
    "Ver la solicitud",
  );

  return sendEmail({
    to: input.teamEmail,
    subject: `Te asignaron: ${input.requestTitle}`,
    html,
  });
}

/**
 * 4. Director aprueba reporte de fase → email al cliente.
 */
export async function emailPhaseApprovedToClient(input: {
  clientEmail: string;
  clientName: string;
  phaseLabel: string;
}): Promise<{ id: string }> {
  const html = baseLayout(
    `
      <h1 style="font-size:24px;font-weight:700;margin:0 0 12px;letter-spacing:-0.02em;">
        Reporte de ${escapeHtml(input.phaseLabel)} aprobado
      </h1>
      <p style="margin:0 0 20px;color:#5a5a5a;font-size:14px;">
        Tu reporte de la fase <strong>${escapeHtml(input.phaseLabel)}</strong> fue aprobado por el equipo. Ya podés ver el resumen ejecutivo en tu portal.
      </p>
    `,
    `${PORTAL_URL}/portal`,
    "Ver el resumen ejecutivo",
  );

  return sendEmail({
    to: input.clientEmail,
    subject: `Reporte de ${input.phaseLabel} aprobado en tu portal`,
    html,
  });
}

// ============================================================
// Helpers internos
// ============================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
