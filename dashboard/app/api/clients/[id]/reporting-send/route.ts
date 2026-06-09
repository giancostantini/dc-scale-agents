/**
 * POST /api/clients/[id]/reporting-send
 *
 * Envía un reporte generado por el reporting agent al cliente vía
 * email. El frontend genera el reporte primero, lo edita si
 * necesita, y después envía.
 *
 * Body:
 *   to: string[]      // emails destinatarios
 *   subject: string
 *   markdown: string  // el cuerpo del reporte en markdown
 *
 * Solo director. Convierte el markdown a HTML simple antes de enviar.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "Servidor no configurado." }, { status: 500 });
  }
  const { id: clientId } = await params;

  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) return Response.json({ error: "Sin sesión" }, { status: 401 });
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) return Response.json({ error: "No autenticado" }, { status: 401 });
  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json({ error: "Solo directores." }, { status: 403 });
  }

  let body: { to?: string[]; subject?: string; markdown?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const { to, subject, markdown } = body;
  if (!Array.isArray(to) || to.length === 0) {
    return Response.json({ error: "Sin destinatarios" }, { status: 400 });
  }
  if (!subject || !markdown) {
    return Response.json(
      { error: "Faltan subject o markdown" },
      { status: 400 },
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: client } = await admin
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .maybeSingle();

  // Conversión simple md → HTML (lo justo para emails básicos).
  // Cabeceras, párrafos, listas, bold, italic, links.
  const html = markdownToEmailHtml(markdown, client?.name ?? "Cliente");

  try {
    const result = await sendEmail({
      to,
      subject,
      html,
      replyTo: caller.email ?? undefined,
    });
    return Response.json({ success: true, emailId: result.id });
  } catch (err) {
    const e = err as Error;
    console.error("[reporting-send] sendEmail error:", e);
    return Response.json(
      { error: "No se pudo enviar el email.", detail: e.message },
      { status: 500 },
    );
  }
}

/** Conversor markdown → HTML minimalista para emails. */
function markdownToEmailHtml(md: string, clientName: string): string {
  // Escape básico de HTML
  function esc(s: string) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  // Convertir inline
  function inline(s: string) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(
        /\[(.+?)\]\((.+?)\)/g,
        '<a href="$2" style="color:#9b8259;text-decoration:underline;">$1</a>',
      );
  }

  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(
        `<h1 style="font-size:22px;color:#0a1a0c;margin:24px 0 12px;">${inline(line.slice(2))}</h1>`,
      );
    } else if (line.startsWith("## ")) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(
        `<h2 style="font-size:18px;color:#0a1a0c;margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(10,26,12,0.08);">${inline(line.slice(3))}</h2>`,
      );
    } else if (line.startsWith("### ")) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(
        `<h3 style="font-size:14px;color:#9b8259;letter-spacing:0.1em;text-transform:uppercase;margin:16px 0 6px;">${inline(line.slice(4))}</h3>`,
      );
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul style="padding-left:20px;color:#0a1a0c;line-height:1.6;">');
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
    } else if (line.trim() === "") {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(
        `<p style="font-size:14px;line-height:1.6;color:#0a1a0c;margin:0 0 12px;">${inline(line)}</p>`,
      );
    }
  }
  if (inList) out.push("</ul>");

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
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid rgba(10,26,12,0.08);max-width:640px;">
          <tr>
            <td style="padding:32px 40px;">
              <div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#9b8259;font-weight:600;margin-bottom:20px;">
                Dearmas Costantini · Reporte
              </div>
              ${out.join("\n")}
              <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(10,26,12,0.06);font-size:11px;color:#7a8a7e;">
                Reporte generado por el equipo de D&C para ${esc(clientName)}.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
