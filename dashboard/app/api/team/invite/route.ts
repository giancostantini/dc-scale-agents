/**
 * POST /api/team/invite
 *
 * Crea un usuario nuevo y le manda un email de invitación. Solo
 * directores pueden llamar esta ruta.
 *
 * Cómo funciona:
 *   1. Verificamos que el caller esté autenticado y sea director
 *      (vía la anon key + JWT del request).
 *   2. Llamamos al admin API de Supabase con la SERVICE_ROLE_KEY
 *      para invitar al email. Supabase manda el mail con el link
 *      de "set password" (configurado en Authentication → URL
 *      Configuration en el dashboard).
 *   3. Cuando el invitado clickea el link y entra, el trigger
 *      `handle_new_user` ya creó su profile con role default 'team'
 *      y los datos básicos. Acá además updateamos los campos extra
 *      (position, payment, etc) que el director ya pasó al invitar.
 *
 * Requisitos en el server:
 *   - SUPABASE_SERVICE_ROLE_KEY  (NO ponerle el prefix NEXT_PUBLIC_)
 *
 * En Vercel: Settings → Environment Variables → agregar la key.
 * En local: agregarla a .env.local (ya gitignored).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function makeInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "??";
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Supabase no está configurado en el servidor." },
      { status: 500 },
    );
  }
  if (!serviceKey) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor. " +
          "Pedile al admin que la setee en Vercel y .env.local. Mientras " +
          "tanto, podés crear usuarios manualmente desde Supabase → Authentication → Users.",
      },
      { status: 500 },
    );
  }

  // ====== 1. Verificar caller es director ======
  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();

  if (!caller) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.role !== "director") {
    return NextResponse.json(
      { error: "Solo directores pueden invitar usuarios" },
      { status: 403 },
    );
  }

  // ====== 2. Validar body ======
  type InviteBody = {
    email?: string;
    name?: string;
    position?: string;
    paymentAmount?: number | string;
    paymentCurrency?: string;
    paymentType?: "fijo" | "por_proyecto" | "por_hora" | "mixto";
    startDate?: string;
    phone?: string;
  };

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim() ?? "";

  if (!email || !name) {
    return NextResponse.json(
      { error: "email y name son requeridos" },
      { status: 400 },
    );
  }

  // ====== 3. Crear el usuario con la admin API ======
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: invite, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { name },
    });

  if (inviteError) {
    return NextResponse.json(
      {
        error: inviteError.message,
        hint:
          "Si dice 'A user with this email address has already been registered', el email ya existe. " +
          "Buscá al usuario en Supabase → Authentication → Users.",
      },
      { status: 500 },
    );
  }

  // ====== 4. Update profile con los campos extra ======
  // El trigger handle_new_user ya creó el profile con defaults.
  // Acá pisamos los campos del wizard.
  const newUserId = invite.user?.id;
  if (newUserId) {
    const paymentAmt =
      typeof body.paymentAmount === "string"
        ? Number(body.paymentAmount)
        : body.paymentAmount;

    await admin
      .from("profiles")
      .update({
        name,
        initials: makeInitials(name),
        position: body.position ?? null,
        payment_amount:
          paymentAmt && !Number.isNaN(paymentAmt) ? paymentAmt : null,
        payment_currency: body.paymentCurrency ?? "USD",
        payment_type: body.paymentType ?? "fijo",
        start_date: body.startDate || null,
        phone: body.phone ?? null,
      })
      .eq("id", newUserId);
  }

  return NextResponse.json({
    success: true,
    userId: newUserId,
    message: `Invitación enviada a ${email}.`,
  });
}
