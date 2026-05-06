/**
 * Helper para armar el "weekly digest" — email que se manda los lunes
 * a cada cliente activo con un resumen de la semana anterior.
 *
 * Disparado desde GitHub Actions cron via /api/portal/digest/send-all.
 * Reusa la lógica de agregación de /api/portal/this-month pero filtrada
 * a últimos 7 días.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface WeeklyDigestStats {
  contentPosts: number;
  campaigns: number;
  reports: number;
  meetings: number;
  requestsResolved: number;
  agentRuns: number;
}

export interface WeeklyDigestHighlight {
  /** "Reuniones tuvimos · 2 esta semana" — title + count para el bullet */
  label: string;
  count: number;
  /** Lista corta de items (1-2) para mencionar en el cuerpo */
  examples?: string[];
}

export interface WeeklyDigestPayload {
  clientId: string;
  clientName: string;
  recipientEmail: string;
  recipientName: string;
  rangeFrom: string; // YYYY-MM-DD
  rangeUntil: string; // YYYY-MM-DD
  stats: WeeklyDigestStats;
  highlights: WeeklyDigestHighlight[];
  totalActions: number;
}

const PHASE_LABELS: Record<string, string> = {
  diagnostico: "Diagnóstico",
  estrategia: "Estrategia",
  setup: "Setup",
  lanzamiento: "Lanzamiento",
};

/**
 * Carga stats + highlights del cliente para los últimos 7 días.
 * Devuelve null si no hay actividad o si el cliente tiene
 * weekly_digest_enabled=false.
 */
export async function buildWeeklyDigest(
  admin: SupabaseClient,
  clientId: string,
): Promise<WeeklyDigestPayload | null> {
  // Resolver destinatario: el primer profile con role=client y
  // weekly_digest_enabled=true para este client_id. Si no hay user,
  // fallback a clients.contact_email.
  const { data: clientRow } = await admin
    .from("clients")
    .select("id, name, contact_email")
    .eq("id", clientId)
    .maybeSingle();
  if (!clientRow) return null;

  const { data: clientProfile } = await admin
    .from("profiles")
    .select("email, name, weekly_digest_enabled")
    .eq("role", "client")
    .eq("client_id", clientId)
    .eq("weekly_digest_enabled", true)
    .limit(1)
    .maybeSingle();

  const recipientEmail = clientProfile?.email ?? clientRow.contact_email ?? "";
  const recipientName = clientProfile?.name ?? clientRow.name;

  if (!recipientEmail || !recipientEmail.includes("@")) {
    return null;
  }

  // Si hay un user con digest desactivado y NO hay otro con activado,
  // saltamos. Si solo está el contact_email del cliente, mandamos igual
  // (porque no hay user a quien preguntarle preferencia).
  if (!clientProfile && !clientRow.contact_email) {
    return null;
  }

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - 7);
  const sinceIso = since.toISOString().slice(0, 10);
  const sinceTimestamp = `${sinceIso}T00:00:00.000Z`;

  const [
    { count: postsCount, data: posts },
    { count: campaignsCount, data: campaigns },
    { count: reportsCount, data: reports },
    { count: meetingsCount, data: meetings },
    { count: requestsCount, data: requestsResolved },
    { count: agentRunsCount },
  ] = await Promise.all([
    admin
      .from("content_posts")
      .select("network, format, brief, date", { count: "exact" })
      .eq("client_id", clientId)
      .eq("status", "published")
      .gte("date", sinceIso)
      .lte("date", todayIso)
      .order("date", { ascending: false })
      .limit(2),
    admin
      .from("production_campaigns")
      .select("title, type", { count: "exact" })
      .eq("client_id", clientId)
      .gte("start_date", sinceIso)
      .lte("start_date", todayIso)
      .order("start_date", { ascending: false })
      .limit(2),
    admin
      .from("phase_reports")
      .select("phase, approved_at", { count: "exact" })
      .eq("client_id", clientId)
      .eq("status", "approved")
      .gte("approved_at", sinceTimestamp)
      .order("approved_at", { ascending: false })
      .limit(2),
    admin
      .from("cal_events")
      .select("title, date, time", { count: "exact" })
      .eq("client_id", clientId)
      .gte("date", sinceIso)
      .lte("date", todayIso)
      .order("date", { ascending: false })
      .limit(2),
    admin
      .from("client_requests")
      .select("title, type, status", { count: "exact" })
      .eq("client_id", clientId)
      .gte("updated_at", sinceTimestamp)
      .in("status", ["done", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(2),
    admin
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("client", clientId)
      .eq("status", "success")
      .gte("created_at", sinceTimestamp),
  ]);

  const stats: WeeklyDigestStats = {
    contentPosts: postsCount ?? 0,
    campaigns: campaignsCount ?? 0,
    reports: reportsCount ?? 0,
    meetings: meetingsCount ?? 0,
    requestsResolved: requestsCount ?? 0,
    agentRuns: agentRunsCount ?? 0,
  };

  const totalActions = Object.values(stats).reduce((acc, n) => acc + n, 0);
  if (totalActions === 0) return null; // semana sin actividad → no mandar

  const highlights: WeeklyDigestHighlight[] = [];
  if (stats.reports > 0 && reports?.length) {
    highlights.push({
      label: "Reportes aprobados",
      count: stats.reports,
      examples: reports.map((r) => PHASE_LABELS[r.phase] ?? r.phase),
    });
  }
  if (stats.meetings > 0 && meetings?.length) {
    highlights.push({
      label: "Reuniones tuvimos",
      count: stats.meetings,
      examples: meetings.map((m) => m.title as string),
    });
  }
  if (stats.contentPosts > 0 && posts?.length) {
    highlights.push({
      label: "Piezas publicadas",
      count: stats.contentPosts,
      examples: posts.map(
        (p) => `${(p.network as string).toUpperCase()} · ${p.format ?? "post"}`,
      ),
    });
  }
  if (stats.campaigns > 0 && campaigns?.length) {
    highlights.push({
      label: "Campañas lanzadas",
      count: stats.campaigns,
      examples: campaigns.map((c) => c.title as string),
    });
  }
  if (stats.requestsResolved > 0 && requestsResolved?.length) {
    highlights.push({
      label: "Solicitudes resueltas",
      count: stats.requestsResolved,
      examples: requestsResolved.map((r) => r.title as string),
    });
  }

  return {
    clientId,
    clientName: clientRow.name,
    recipientEmail,
    recipientName,
    rangeFrom: sinceIso,
    rangeUntil: todayIso,
    stats,
    highlights,
    totalActions,
  };
}

/**
 * Convierte el payload en HTML listo para Resend. Sigue el estilo
 * de los otros emails transaccionales del sistema (deep-green +
 * sand acent, single-column 560px).
 */
export function renderWeeklyDigestHtml(payload: WeeklyDigestPayload): string {
  const { clientName, recipientName, stats, highlights, rangeFrom, rangeUntil } = payload;

  const firstName = recipientName.split(" ")[0] ?? recipientName;
  const portalUrl = "https://sistemadearmascostantini.com/portal";
  const rangeLabel = formatRange(rangeFrom, rangeUntil);

  const statRow = (n: number, label: string): string =>
    n > 0
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid rgba(10,26,12,0.06);">
            <strong style="color:#0a1a0c;font-size:14px;">${n}</strong>
            <span style="color:#5a6862;font-size:13px;"> ${label}</span>
          </td></tr>`
      : "";

  const highlightLine = (h: WeeklyDigestHighlight): string => {
    const examples = h.examples?.length
      ? `<span style="color:#5a6862;font-size:12px;"> — ${escapeHtml(h.examples.join(" · "))}</span>`
      : "";
    return `<li style="margin-bottom:6px;color:#0a1a0c;font-size:13px;">
      <strong>${h.count}</strong> ${escapeHtml(h.label.toLowerCase())}${examples}
    </li>`;
  };

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
                Dearmas Costantini · Tu semana
              </div>
              <h1 style="margin:14px 0 6px;font-size:22px;font-weight:700;letter-spacing:-0.015em;color:#0a1a0c;">
                Hola ${escapeHtml(firstName)} 👋
              </h1>
              <p style="margin:0;font-size:13px;color:#5a6862;">
                Resumen de lo que pasó con ${escapeHtml(clientName)} entre el ${rangeLabel}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;">
              <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8b7355;font-weight:600;margin-bottom:10px;">
                Esta semana
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${statRow(stats.reports, "reportes aprobados")}
                ${statRow(stats.meetings, "reuniones")}
                ${statRow(stats.contentPosts, "piezas publicadas")}
                ${statRow(stats.campaigns, "campañas lanzadas")}
                ${statRow(stats.requestsResolved, "solicitudes resueltas")}
                ${statRow(stats.agentRuns, "tareas IA completadas")}
              </table>
            </td>
          </tr>
          ${
            highlights.length > 0
              ? `<tr>
            <td style="padding:0 40px 24px;">
              <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8b7355;font-weight:600;margin-bottom:10px;">
                Destacado
              </div>
              <ul style="margin:0;padding:0 0 0 18px;list-style:disc;">
                ${highlights.map(highlightLine).join("")}
              </ul>
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:0 40px 32px;">
              <a href="${portalUrl}" style="display:inline-block;padding:11px 22px;background:#0a1a0c;color:#c4a882;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;border:1px solid #0a1a0c;">
                Ver el detalle en tu portal →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 40px 28px;border-top:1px solid rgba(10,26,12,0.06);background:#f5f1e9;">
              <p style="margin:0 0 6px;font-size:11px;color:#5a6862;font-style:italic;line-height:1.5;">
                Este resumen llega cada lunes con la actividad de la semana anterior.
              </p>
              <p style="margin:0;font-size:11px;color:#5a6862;line-height:1.5;">
                Si querés dejar de recibirlo, andá a tu perfil en el portal y desactivá "Resumen semanal por email".
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function formatRange(from: string, until: string): string {
  const fromDate = new Date(from + "T00:00:00Z");
  const untilDate = new Date(until + "T00:00:00Z");
  const fmt = (d: Date) =>
    d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      timeZone: "UTC",
    });
  return `${fmt(fromDate)} y el ${fmt(untilDate)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
