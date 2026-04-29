import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Service-role Supabase client for API routes and server-only code.
 * NEVER import this from a Client Component or a file marked with "use client".
 *
 * The service_role key bypasses RLS. Only use it in:
 *   - app/api/**\/route.ts
 *   - Server Actions
 *   - Route handlers that have already authenticated the caller
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    // Defensive trim — un secret pegado con whitespace al final genera errores
    // silenciosos (PGRST125 si hay slash trailing). El cliente supabase-js
    // normaliza URLs, pero mejor saneamos antes de pasarlo.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(
      /\/+$/,
      "",
    );
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
      throw new Error(
        "Supabase admin env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      );
    }
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
