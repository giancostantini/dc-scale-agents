/**
 * GET /api/_diag/env
 *
 * Diagnóstico de env vars y smoke-tests en vivo contra Supabase, Anthropic y
 * GitHub. Reporta presencia + un preview enmascarado (nunca el valor entero) y
 * después intenta un request mínimo contra cada servicio para validar que la
 * credencial realmente funciona.
 *
 * Nunca retorna valores completos. No hace writes. Seguro de exponer siempre
 * que el dashboard esté detrás de auth en el edge/hosting layer.
 */

import { NextRequest } from "next/server";

interface EnvCheck {
  present: boolean;
  preview?: string;
  value?: string;
}

interface SmokeResult {
  ok: boolean;
  message: string;
  status?: number;
}

function mask(value: string | undefined, keep = 8): EnvCheck {
  if (!value) return { present: false };
  if (value.length <= keep + 3) return { present: true, preview: "***" };
  return { present: true, preview: `${value.slice(0, keep)}…` };
}

function plain(value: string | undefined): EnvCheck {
  if (!value) return { present: false };
  return { present: true, value };
}

async function smokeSupabase(): Promise<SmokeResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { ok: false, message: "faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" };
  }
  try {
    // trivial count-only query sobre una tabla que sabemos existe
    const res = await fetch(`${url}/rest/v1/clients?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, message: body.slice(0, 200) };
    }
    const count = res.headers.get("content-range") ?? "unknown range";
    return { ok: true, status: res.status, message: `clients reachable (${count})` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "unknown error" };
  }
}

async function smokeAnthropic(): Promise<SmokeResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, message: "ANTHROPIC_API_KEY ausente" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, message: body.slice(0, 200) };
    }
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const count = data.data?.length ?? 0;
    return { ok: true, status: res.status, message: `models endpoint ok (${count} modelos)` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "unknown error" };
  }
}

async function smokeGithub(): Promise<SmokeResult> {
  const token = process.env.GH_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) {
    return { ok: false, message: "faltan GH_DISPATCH_TOKEN / GITHUB_OWNER / GITHUB_REPO" };
  }
  try {
    // el endpoint /actions/permissions requiere actions:read — proxy válido
    // para saber si el PAT tiene scope de Actions. Si no, devuelve 403.
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/permissions`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        message: `repo ${owner}/${repo} no encontrado (o token sin acceso)`,
      };
    }
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, message: body.slice(0, 200) };
    }
    return {
      ok: true,
      status: res.status,
      message: `repo ${owner}/${repo} reachable con scope Actions`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "unknown error" };
  }
}

export async function GET(_req: NextRequest) {
  const envReport = {
    NEXT_PUBLIC_SUPABASE_URL: plain(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: mask(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ANTHROPIC_API_KEY: mask(process.env.ANTHROPIC_API_KEY),
    GH_DISPATCH_TOKEN: mask(process.env.GH_DISPATCH_TOKEN),
    GITHUB_OWNER: plain(process.env.GITHUB_OWNER),
    GITHUB_REPO: plain(process.env.GITHUB_REPO),
  };

  const [supabase, anthropic, github] = await Promise.all([
    smokeSupabase(),
    smokeAnthropic(),
    smokeGithub(),
  ]);

  const allPresent = Object.values(envReport).every((c) => c.present);
  const allSmokeOk = supabase.ok && anthropic.ok && github.ok;

  return Response.json(
    {
      ready: allPresent && allSmokeOk,
      env: envReport,
      smoke: { supabase, anthropic, github },
      notes: allPresent
        ? allSmokeOk
          ? "Todo OK. Listo para end-to-end."
          : "Env vars presentes, pero al menos un smoke test falló. Revisá 'smoke'."
        : "Faltan env vars. Revisá el campo 'env' arriba.",
    },
    { status: allPresent && allSmokeOk ? 200 : 500 },
  );
}
