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
import { logAction } from "@/lib/audit";
import { generatePortalPassword } from "@/lib/portal-password";
import { emailPortalAccessCreated } from "@/lib/email";

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
    // Para role='team' (default): los campos de equipo
    role?: "team" | "client";
    position?: string;
    paymentAmount?: number | string;
    paymentCurrency?: string;
    paymentType?: "fijo" | "por_proyecto" | "por_hora" | "mixto";
    startDate?: string;
    phone?: string;
    // Para role='client'
    clientId?: string;
    // Permisos granulares (team)
    pipelineAccess?: boolean;
  };

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim() ?? "";
  const targetRole: "team" | "client" = body.role === "client" ? "client" : "team";
  const clientId = body.clientId?.trim();

  if (!email || !name) {
    return NextResponse.json(
      { error: "email y name son requeridos" },
      { status: 400 },
    );
  }
  if (targetRole === "client" && !clientId) {
    return NextResponse.json(
      { error: "Para invitar un cliente necesitás clientId." },
      { status: 400 },
    );
  }

  // ====== 3. Crear el usuario con la admin API ======
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  /**
   * Estrategia de password por tipo de usuario:
   *
   * · role='client' → generamos una contraseña aleatoria fuerte
   *   (lib/portal-password.ts), seteamos must_change_password=true
   *   en el profile, y le mandamos al cliente un email con las
   *   credenciales. Cuando entra al portal por primera vez, el
   *   middleware lo redirige a /portal/cambiar-password y no le
   *   deja navegar hasta cambiarla.
   *
   * · role='team' → seguimos con la password fija "12345678" que
   *   el director comparte por canal interno (Slack, WhatsApp), y
   *   el team member la cambia desde /perfil cuando entra. Es team
   *   nuestro, no expone secretos.
   */
  const TEAM_DEFAULT_PASSWORD = "12345678";
  const portalPassword =
    targetRole === "client" ? generatePortalPassword() : TEAM_DEFAULT_PASSWORD;

  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password: portalPassword,
      email_confirm: true,
      user_metadata: { name },
    });

  let newUserId: string | undefined;
  if (createErr) {
    const msg = createErr.message.toLowerCase();
    const isDuplicate =
      msg.includes("already been registered") ||
      msg.includes("already exists") ||
      msg.includes("duplicate key");
    if (isDuplicate) {
      return NextResponse.json(
        {
          error: createErr.message,
          hint:
            "El email ya existe en auth.users. Buscá al usuario en " +
            "Supabase → Authentication → Users. Si ya tiene cuenta, " +
            "no hace falta volver a crearlo — solo asignale rol/permisos " +
            "desde Equipo.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        error: createErr.message,
        hint:
          "Error inesperado creando el usuario. Revisá los logs del " +
          "servidor o crealo manualmente desde Supabase → Authentication → Users.",
      },
      { status: 500 },
    );
  }
  newUserId = created.user?.id;

  // ====== 4. Update profile con los campos extra ======
  // El trigger handle_new_user ya creó el profile con defaults.
  // Acá pisamos los campos del wizard.  Si vinimos del path de
  // fallback (manualInviteLink seteado), el trigger igual creó la
  // fila — `newUserId` viene de createUser.
  if (newUserId) {
    if (targetRole === "client") {
      // Cliente final: profile con role='client', client_id seteado.
      // Sin info de pago (eso es interno del equipo).
      // must_change_password=true porque la password se la generamos
      // nosotros — necesitamos que elija una propia en el primer login
      // (ver migración 072 + middleware en /portal/layout).
      await admin
        .from("profiles")
        .update({
          name,
          initials: makeInitials(name),
          role: "client",
          client_id: clientId,
          phone: body.phone ?? null,
          must_change_password: true,
        })
        .eq("id", newUserId);
    } else {
      // Team: con info de pago + permisos granulares
      const paymentAmt =
        typeof body.paymentAmount === "string"
          ? Number(body.paymentAmount)
          : body.paymentAmount;

      await admin
        .from("profiles")
        .update({
          name,
          initials: makeInitials(name),
          role: "team",
          position: body.position ?? null,
          payment_amount:
            paymentAmt && !Number.isNaN(paymentAmt) ? paymentAmt : null,
          payment_currency: body.paymentCurrency ?? "USD",
          payment_type: body.paymentType ?? "fijo",
          start_date: body.startDate || null,
          phone: body.phone ?? null,
          permissions: body.pipelineAccess
            ? { pipeline_access: true }
            : {},
        })
        .eq("id", newUserId);
    }
  }

  // ====== 5. Mandar email con credenciales (solo cliente) ======
  // El team member sigue recibiendo la contraseña por canal interno;
  // el cliente recibe un mail automático con su email + password
  // generada + aviso de que tiene que cambiarla en el primer login.
  //
  // Si el envío falla NO tiramos el endpoint — el usuario ya está
  // creado en auth.users y el director ve la password en el modal,
  // se la puede pasar manualmente.
  let emailSent = false;
  let emailError: string | null = null;
  if (targetRole === "client") {
    try {
      // Necesitamos el nombre del cliente para personalizar el
      // mail. Si no podemos leerlo, usamos un genérico.
      const { data: clientRow } = await admin
        .from("clients")
        .select("name")
        .eq("id", clientId!)
        .maybeSingle();
      await emailPortalAccessCreated({
        to: email,
        recipientName: name,
        clientName: clientRow?.name ?? "tu cuenta",
        email,
        password: portalPassword,
      });
      emailSent = true;
    } catch (e) {
      emailError = (e as Error).message;
      // No tiramos — el endpoint sigue siendo "success" porque el
      // usuario quedó creado en auth.users. El frontend muestra la
      // password al director como backup.
    }
  }

  await logAction({
    actorId: caller.id,
    actorEmail: caller.email ?? null,
    action: "team.invite",
    targetType: "profile",
    targetId: newUserId ?? email,
    metadata: {
      email,
      name,
      role: targetRole,
      clientId: clientId ?? null,
      email_sent: emailSent,
      email_error: emailError,
    },
  });

  return NextResponse.json({
    success: true,
    userId: newUserId,
    // Para team: la password fija "12345678" se le pasa por canal
    // interno. Para cliente: la generada se le mandó por mail y se
    // muestra como backup en el modal.
    defaultPassword: portalPassword,
    emailSent,
    emailError,
    message:
      targetRole === "client"
        ? emailSent
          ? `Cuenta creada y mail enviado a ${email} con las credenciales. La password queda visible acá por si necesitás pasársela por otro canal.`
          : `Cuenta creada, pero el mail falló. Pasale email y password al cliente por WhatsApp / verbalmente.`
        : `Usuario creado. Pasale el email y la contraseña por defecto al miembro — cuando entre, va a cambiarla desde su perfil.`,
  });
}
