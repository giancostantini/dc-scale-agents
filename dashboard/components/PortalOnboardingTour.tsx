"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/auth";

interface Step {
  title: string;
  body: string;
  cta?: string;
}

const STEPS: Step[] = [
  {
    title: "Bienvenido a tu portal",
    body: "Acá vas a ver el estado real de tu negocio: KPIs del mes, objetivos del trimestre, próximas reuniones, contenido publicado y tu historial de pagos. Todo se actualiza solo a medida que el equipo trabaja.",
  },
  {
    title: "Reportes de fases",
    body: "Cada vez que completemos una fase del proyecto (diagnóstico, estrategia, setup, lanzamiento) vas a recibir un resumen ejecutivo acá. El detalle interno queda con el equipo; lo que ves es lo que importa para vos.",
  },
  {
    title: "Solicitudes",
    body: "¿Una promo nueva? ¿Una idea para probar? Cargala desde Solicitudes y nuestro equipo la revisa, la asigna y te responde dentro del portal. Sin emails que se pierden.",
    cta: "Ir a solicitudes",
  },
  {
    title: "Consultor IA",
    body: "Tenés acceso a un consultor IA con contexto completo de tu cuenta. Preguntale lo que quieras: estado de campañas, estrategia, próximos pasos. Si pedís cambios concretos, te redirige al account lead.",
    cta: "Probar el consultor",
  },
];

interface Props {
  profile: Profile;
  onClose: () => void;
}

/**
 * Tour de bienvenida que se muestra una sola vez al cliente la primera
 * vez que entra al portal. Marca `permissions.tour_seen = true` cuando
 * lo cierra para no volver a mostrarlo.
 */
export default function PortalOnboardingTour({ profile, onClose }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  const handleClose = useCallback(async () => {
    const supabase = getSupabase();
    const newPermissions = {
      ...(profile.permissions ?? {}),
      tour_seen: true,
    };
    await supabase
      .from("profiles")
      .update({ permissions: newPermissions })
      .eq("id", profile.id);
    onClose();
  }, [profile.id, profile.permissions, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight" && !isLast) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, isLast, handleClose]);

  const current = STEPS[step];

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 26, 12, 0.85)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "var(--white)",
          maxWidth: 520,
          width: "100%",
          padding: 40,
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          Paso {step + 1} de {STEPS.length}
        </div>

        <h2
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--deep-green)",
            marginBottom: 16,
            lineHeight: 1.2,
          }}
        >
          {current.title}
        </h2>

        <p
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--text-muted)",
            marginBottom: 32,
          }}
        >
          {current.body}
        </p>

        {/* Indicadores de paso */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 28,
          }}
        >
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 3,
                flex: 1,
                background:
                  i <= step ? "var(--sand-dark)" : "var(--off-white)",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            onClick={handleClose}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 500,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Saltar tour
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                style={{
                  padding: "12px 20px",
                  background: "transparent",
                  border: "1px solid rgba(10,26,12,0.15)",
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "var(--deep-green)",
                  cursor: "pointer",
                }}
              >
                ← Atrás
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) handleClose();
                else setStep(step + 1);
              }}
              style={{
                padding: "12px 24px",
                background: "var(--deep-green)",
                color: "var(--off-white)",
                border: "none",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {isLast ? "Empezar →" : "Siguiente →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
