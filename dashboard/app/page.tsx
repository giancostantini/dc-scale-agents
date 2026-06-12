"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signIn,
  hasSession,
  getCurrentProfile,
  homeForRole,
} from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import Lockup from "@/components/Lockup";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  // Step-up de 2FA: si el user tiene un factor verificado, se le pide el código.
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  // Si ya hay sesión, redirigir según rol (director/team → /hub, client → /portal)
  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        setChecking(false);
        return;
      }
      const profile = await getCurrentProfile();
      router.replace(homeForRole(profile));
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Completá email y contraseña");
      return;
    }

    setLoading(true);
    const { error: authError } = await signIn(email, password);

    if (authError) {
      setLoading(false);
      setError(
        authError.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos"
          : authError.message,
      );
      return;
    }

    // ¿Tiene 2FA? Si hay un factor verificado, exigimos el código (step-up a
    // AAL2) antes de entrar. Si no tiene factor, pasa directo (no lockea a
    // quien todavía no enroló).
    const { data: aal } =
      await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
      const { data: facs } = await getSupabase().auth.mfa.listFactors();
      const totp = (facs?.totp ?? []).find((f) => f.status === "verified");
      if (totp) {
        setMfaFactorId(totp.id);
        setNeedsMfa(true);
        setLoading(false);
        return;
      }
    }

    // Redirigir al home correcto según rol
    const profile = await getCurrentProfile();
    setLoading(false);
    router.push(homeForRole(profile));
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = getSupabase();
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
      factorId: mfaFactorId,
    });
    if (chErr || !ch) {
      setLoading(false);
      setError(chErr?.message ?? "Error generando el desafío.");
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: ch.id,
      code: mfaCode.trim(),
    });
    if (vErr) {
      setLoading(false);
      setError("Código incorrecto. Probá de nuevo.");
      return;
    }
    const profile = await getCurrentProfile();
    setLoading(false);
    router.push(homeForRole(profile));
  }

  if (checking) {
    return (
      <div className={styles.loginView}>
        <div className={styles.loginGrid} />
      </div>
    );
  }

  if (needsMfa) {
    return (
      <div className={styles.loginView}>
        <div className={styles.loginGrid} />
        <div className={styles.loginBox}>
          <div className={styles.loginBrand}>
            <Lockup size="lg" variant="stacked" />
            <div className={styles.desc}>Verificación en dos pasos</div>
          </div>
          <form className={styles.loginCard} onSubmit={handleMfa}>
            <h3>Código de verificación</h3>
            <div className={styles.sub}>
              Ingresá el código de 6 dígitos de tu app de autenticación.
            </div>
            <div className={styles.field}>
              <label htmlFor="mfa">Código</label>
              <input
                id="mfa"
                inputMode="numeric"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                autoFocus
                style={{ letterSpacing: "0.3em", fontFamily: "monospace" }}
              />
            </div>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={loading || mfaCode.length !== 6}
            >
              {loading ? "Verificando…" : "Verificar →"}
            </button>
            {error && <div className={styles.errorMsg}>{error}</div>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.loginView}>
      <div className={styles.loginGrid} />
      <div className={styles.loginBox}>
        <div className={styles.loginBrand}>
          <Lockup size="lg" variant="stacked" />
          <div className={styles.desc}>Business Growth Partners · LATAM</div>
          <div className={styles.descSecondary}>Scale · Sistema de Gestión</div>
        </div>

        <form className={styles.loginCard} onSubmit={handleSubmit}>
          <h3>Iniciar sesión</h3>
          <div className={styles.sub}>Accedé con tu cuenta para continuar</div>

          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={loading}
          >
            {loading ? "Ingresando…" : "Ingresar →"}
          </button>

          {error && <div className={styles.errorMsg}>{error}</div>}

          <div className={styles.forgotRow}>
            <Link href="/auth/forgot" className={styles.forgotLink}>
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <div className={styles.loginHint}>
            Acceso restringido al equipo de Dearmas & Costantini.
          </div>
        </form>
      </div>
    </div>
  );
}
