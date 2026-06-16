/**
 * POST /api/portal/change-password
 *
 * Cambia la password del usuario logueado (rol=client del portal),
 * y limpia el flag must_change_password en su profile.
 *
 * Lo usa la página /portal/cambiar-password — el cliente la abre
 * automáticamente en su primer login porque el gate lo redirige
 * mientras must_change_password=true.
 *
 * Validaciones:
 *   · La password nueva debe ser de al menos 8 chars.
 *   · No puede ser la default "12345678" — esa quedó deprecada.
 *   · No verificamos la actual: el usuario YA está logueado con
 *     ella, Supabase ya la validó al hacer signIn.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase no está configurado en el servidor." },
      { status: 500 },
    );
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }

  // Verificar quién es el caller usando su token (anon client + auth
  // bearer). Si no hay user, no avanzamos.
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  let body: { newPassword?: string };
  try {
    body = (await req.json()) as { newPassword?: string };
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const newPassword = (body.newPassword ?? "").trim();
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "La contraseña tiene que tener al menos 8 caracteres." },
      { status: 400 },
    );
  }
  if (newPassword === "12345678") {
    return NextResponse.json(
      {
        error:
          "No podés usar 12345678 — esa era la contraseña genérica vieja. Elegí una propia, distinta.",
      },
      { status: 400 },
    );
  }

  // Usamos el admin client para hacer el updateUser por id. El
  // updateUser desde el callerClient también funcionaría, pero
  // usamos el admin para ser consistentes con el flow de invite.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });
  if (updErr) {
    return NextResponse.json(
      { error: updErr.message },
      { status: 500 },
    );
  }

  // Limpiamos el flag. Si esto falla NO es bloqueante: la password
  // ya fue cambiada; el peor caso es que el gate insista una vez
  // más en pedir cambio y el usuario lo cambia y queda sincronizado.
  await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  return NextResponse.json({ success: true });
}
