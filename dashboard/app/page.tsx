"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, hasSession } from "@/lib/supabase/auth";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Si ya hay sesión, redirigir al hub
  useEffect(() => {
    hasSession().then((has) => {
      if (has) router.replace("/hub");
      else setChecking(false);
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
    setLoading(false);

    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos"
          : authError.message,
      );
      return;
    }

    router.push("/hub");
  }

  if (checking) {
    return (
      <div className={styles.loginView}>
        <div className={styles.loginGrid} />
      </div>
    );
  }

  return (
    <div className={styles.loginView}>
      <div className={styles.loginGrid} />
      <div className={styles.loginBox}>
        <div className={styles.loginBrand}>
          <div className={styles.logo}>
            Dearmas <span className="amp">&</span>
            <span className={styles.logoSoft}>Costantini</span>
          </div>
          <div className={styles.desc}>Scale · Sistema de Gestión</div>
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

          <div className={styles.loginHint}>
            Acceso restringido al equipo de D<span className="amp">&</span>C.
          </div>
        </form>
      </div>
    </div>
  );
}
