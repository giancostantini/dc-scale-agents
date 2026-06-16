"use client";

/**
 * Cambio obligatorio de contraseña en el primer login del portal del
 * cliente. El gate de /portal/layout (vía PortalPasswordGate) redirige
 * acá automáticamente cuando profile.must_change_password=true. Una
 * vez completada con éxito, redirige al home del portal.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/auth";

export default function PortalChangePasswordPage() {
  const router = useRouter();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [profileName, setProfileName] = useState("");

  useEffect(() => {
    let cancelled = false;
    getCurrentProfile().then((p) => {
      if (cancelled) return;
      if (!p) {
        router.replace("/login");
        return;
      }
      // Si ya cambió la pwd (must_change_password=false), no
      // tiene nada que hacer acá → al home del portal.
      if (!p.must_change_password) {
        router.replace("/portal");
        return;
      }
      setProfileName(p.name);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit() {
    setError("");
    if (pwd.length < 8) {
      setError("La contraseña tiene que tener al menos 8 caracteres.");
      return;
    }
    if (pwd !== pwd2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (pwd === "12345678") {
      setError(
        "Elegí una contraseña propia — 12345678 era la default vieja.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const supabase = getSupabase();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setError("Sesión expirada. Volvé a iniciar sesión.");
        return;
      }
      const res = await fetch("/api/portal/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: pwd }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "No se pudo cambiar la contraseña.");
        return;
      }
      // Refrescamos la sesión para que el token nuevo viaje con la
      // pwd ya rotada y mandamos al portal.
      router.replace("/portal");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--off-white)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--white)",
          border: "1px solid rgba(10,26,12,0.08)",
          padding: 32,
          boxShadow: "var(--shadow-sm)",
          borderRadius: "var(--r-md)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Portal · Primer login
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--deep-green)",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Elegí tu contraseña
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            lineHeight: 1.5,
            marginTop: 8,
            marginBottom: 24,
          }}
        >
          {profileName ? `Hola ${profileName.split(" ")[0]}, ` : ""}la
          contraseña que recibiste por mail era temporal. Elegí ahora
          una propia para seguir.
        </p>

        <Label>Nueva contraseña</Label>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="al menos 8 caracteres"
          autoFocus
          disabled={submitting}
          style={inputStyle}
        />

        <Label>Repetí la contraseña</Label>
        <input
          type="password"
          value={pwd2}
          onChange={(e) => setPwd2(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={submitting}
          style={inputStyle}
        />

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              background: "rgba(176,75,58,0.1)",
              borderLeft: "3px solid var(--red-warn)",
              color: "var(--red-warn)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting || pwd.length < 8 || pwd !== pwd2}
          style={{
            marginTop: 20,
            width: "100%",
            padding: "12px 16px",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor:
              submitting || pwd.length < 8 || pwd !== pwd2
                ? "default"
                : "pointer",
            opacity:
              submitting || pwd.length < 8 || pwd !== pwd2 ? 0.5 : 1,
            borderRadius: 4,
            fontFamily: "inherit",
          }}
        >
          {submitting ? "Guardando…" : "Guardar y entrar"}
        </button>

        <div
          style={{
            marginTop: 16,
            fontSize: 11,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          Una vez guardada, vas a entrar directo al portal de tu
          empresa. Esta pantalla solo aparece la primera vez.
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        fontWeight: 600,
        marginTop: 12,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--white)",
  color: "var(--deep-green)",
  outline: "none",
};
