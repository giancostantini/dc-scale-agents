"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import Lockup from "@/components/Lockup";
import styles from "../auth.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Ingresá tu email");
      return;
    }

    setLoading(true);
    const supabase = getSupabase();
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/reset`
        : undefined;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo },
    );
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className={styles.view}>
      <div className={styles.grid} />
      <div className={styles.box}>
        <div className={styles.brand}>
          <Lockup size="lg" variant="stacked" />
          <div className={styles.eyebrow}>Recuperar acceso</div>
        </div>

        <form className={styles.card} onSubmit={handleSubmit}>
          <h3>Olvidaste tu contraseña</h3>
          <div className={styles.sub}>
            Ingresá tu email y te mandamos un link para resetearla.
          </div>

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
              disabled={sent}
            />
          </div>

          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={loading || sent}
          >
            {loading ? "Enviando…" : sent ? "Mail enviado ✓" : "Enviar link →"}
          </button>

          {error && <div className={styles.errorMsg}>{error}</div>}

          {sent && (
            <div className={styles.successMsg}>
              Revisá tu casilla. Si el email existe en el sistema, te llega un
              link para resetear la contraseña en unos minutos.
            </div>
          )}

          <div className={styles.backRow}>
            <Link href="/" className={styles.backLink}>
              ← Volver al login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
