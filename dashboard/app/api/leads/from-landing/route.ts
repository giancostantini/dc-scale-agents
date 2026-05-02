/**
 * POST /api/leads/from-landing
 *
 * Recibe los datos del modal pre-booking de la landing pública
 * (dearmascostantini.com) y crea un lead en la columna `prospecto`
 * del pipeline.
 *
 * Seguridad:
 *   - Valida el header `Origin` contra una whitelist de dominios.
 *   - Rate-limits en memoria por IP (5 req / hora).
 *   - Sin secret hardcoded en el JS de la landing (sería público).
 *
 * Idempotencia:
 *   - Si en la última hora ya existe un lead con el mismo email/empresa,
 *     no duplicamos — actualizamos su `note` y meeting_booked queda como esté.
 *
 * Campos creados en `public.leads`:
 *   - name, company desde el body
 *   - sector = '—', type = 'gp', value = 0
 *   - stage = 'prospecto', source = 'manual', meeting_booked = false
 *   - note = `${reason}\n\nEmail: ${email}\nOrigen: landing pública`
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const ALLOWED_ORIGINS = new Set([
  "https://dearmascostantini.com",
  "https://www.dearmascostantini.com",
  "http://localhost:3000",
  "http://localhost:8080",
]);

// Rate limit en memoria. Se resetea con cada cold start, suficiente para
// frenar abuso casual desde un solo IP. Para algo más serio movemos a Supabase.
const rateMap = new Map<string, { count: number; firstSeen: number }>();
const WINDOW_MS = 60 * 60 * 1000; // 1 hora
const MAX_PER_WINDOW = 5;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.firstSeen > WINDOW_MS) {
    rateMap.set(ip, { count: 1, firstSeen: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  // 1. Origin whitelist
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return Response.json(
      { ok: false, error: "origin_not_allowed" },
      { status: 403, headers: corsHeaders(origin) },
    );
  }

  // 2. Rate limit
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return Response.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: corsHeaders(origin) },
    );
  }

  // 3. Parse + validate body
  let body: { name?: string; email?: string; company?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_json" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const company = body.company?.trim() ?? "";
  const reason = body.reason?.trim() ?? "";

  if (!name || !email || !company || !reason) {
    return Response.json(
      { ok: false, error: "missing_fields" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  // Email basic shape check (no validamos MX, solo evita basura obvia)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json(
      { ok: false, error: "invalid_email" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  // Truncar a tamaños razonables para no escribir basura gigante
  const safe = (s: string, max: number) => s.slice(0, max);
  const noteText =
    `${safe(reason, 1500)}\n\n` +
    `Email: ${safe(email, 200)}\n` +
    `Origen: landing pública (dearmascostantini.com)`;

  // 4. Insertar en Supabase
  try {
    const supabase = getSupabaseAdmin();

    // Idempotencia simple: si ya existe un lead con la misma empresa+email
    // creado en la última hora, lo updateamos en vez de duplicar.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: existing, error: searchErr } = await supabase
      .from("leads")
      .select("id, note")
      .eq("company", safe(company, 200))
      .ilike("note", `%${email}%`)
      .gte("created_at", oneHourAgo)
      .limit(1)
      .maybeSingle();

    if (searchErr) {
      console.error("[from-landing] search error:", searchErr);
    }

    if (existing) {
      const { error: updErr } = await supabase
        .from("leads")
        .update({ note: `${noteText}\n\n[duplicado: ${new Date().toISOString()}]` })
        .eq("id", existing.id);

      if (updErr) {
        console.error("[from-landing] update error:", updErr);
        return Response.json(
          { ok: false, error: "db_update_failed" },
          { status: 500, headers: corsHeaders(origin) },
        );
      }

      return Response.json(
        { ok: true, leadId: existing.id, deduped: true },
        { status: 200, headers: corsHeaders(origin) },
      );
    }

    const { data, error } = await supabase
      .from("leads")
      .insert({
        name: safe(name, 200),
        company: safe(company, 200),
        sector: "—",
        type: "gp",
        value: 0,
        stage: "prospecto",
        source: "manual",
        note: noteText,
        meeting_booked: false,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[from-landing] insert error:", error);
      return Response.json(
        { ok: false, error: "db_insert_failed", detail: error.message },
        { status: 500, headers: corsHeaders(origin) },
      );
    }

    return Response.json(
      { ok: true, leadId: data.id },
      { status: 201, headers: corsHeaders(origin) },
    );
  } catch (err) {
    console.error("[from-landing] unexpected error:", err);
    return Response.json(
      { ok: false, error: "internal_error" },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}
