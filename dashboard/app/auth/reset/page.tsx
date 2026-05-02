"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import { getCurrentProfile, homeForRole } from "@/lib/supabase/auth";
import Lockup from "@/components/Lockup";
import styles from "../auth.module.css";

/**
 * Después de que el usuario hace click en el link del email de reset,
 * Supabase los redirige acá con un token de recovery en la URL. La SDK
 * detecta el token automáticamente y crea una sesión temporal — el
 * usuario solo necesita ingresar la nueva contraseña.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    const supabase = getSupabase();
    // Supabase emite PASSWORD_RECOVERY al detectar el token en el hash
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setHasRecoverySession(true);
      }
    });

    // También chequeamos si ya hay sesión (puede que el token haya
    // sido procesado antes de montar este efecto)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHasRecoverySession(true);
      else setHasRecoverySession(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("La contraseña tiene que tener al menos 8 caracteres");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    const supabase = getSupabase();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(async () => {
      const profile = await getCurrentProfile();
      router.replace(homeForRole(profile));
    }, 1500);
  }

  if (hasRecoverySession === null) {
    return (
      <div className={styles.view}>
        <div className={styles.grid} />
      </div>
    );
  }

  if (hasRecoverySession === false) {
    return (
      <div className={styles.view}>
        <div className={styles.grid} />
        <div className={styles.box}>
          <div className={styles.brand}>
            <Lockup size="lg" variant="stacked" />
            <div className={styles.eyebrow}>Link inválido</div>
          </div>
          <div className={styles.card}>
            <h3>Link expirado o inválido</h3>
            <div className={styles.sub}>
              El link de reset venció o ya fue usado. Pedí uno nuevo.
            </div>
            <Link
              href="/auth/forgot"
              className={styles.btnPrimary}
              style={{ display: "block", textAlign: "center" }}
            >
              Pedir nuevo link →
            </Link>
            <div className={styles.backRow}>
              <Link href="/" className={styles.backLink}>
                ← Volver al login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <div className={styles.grid} />
      <div className={styles.box}>
        <div className={styles.brand}>
          <Lockup size="lg" variant="stacked" />
          <div className={styles.eyebrow}>Nueva contraseña</div>
        </div>

        <form className={styles.card} onSubmit={handleSubmit}>
          <h3>Setear nueva contraseña</h3>
          <div className={styles.sub}>
            Mínimo 8 caracteres. Después de guardar, te llevamos al sistema.
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Nueva contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              disabled={done}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="confirm">Confirmar contraseña</label>
            <input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={done}
            />
          </div>

          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={loading || done}
          >
            {loading ? "Guardando…" : done ? "Guardado ✓" : "Guardar contraseña →"}
          </button>

          {error && <div className={styles.errorMsg}>{error}</div>}

          {done && (
            <div className={styles.successMsg}>
              Contraseña actualizada. Redirigiéndote…
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
