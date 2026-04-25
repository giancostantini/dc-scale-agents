"use client";

import ui from "./ClientUI.module.css";

interface ScaffoldingStateProps {
  clientName: string;
  status: "running" | "error";
  errorMessage?: string | null;
}

/**
 * Estado intermedio que aparece cuando el bootstrap de un cliente nuevo
 * todavía no terminó. Reemplaza el grid de agentes hasta que la última
 * `agent_runs` con agent='client-bootstrap' pase a status='success'.
 *
 * Si Realtime está conectado, este componente desaparece automáticamente
 * cuando el run cambia de estado (sin reload manual).
 */
export default function ScaffoldingState({
  clientName,
  status,
  errorMessage,
}: ScaffoldingStateProps) {
  const isError = status === "error";

  return (
    <div className={ui.panel} style={{ marginTop: 24 }}>
      <div
        style={{
          padding: "60px 40px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        {!isError && (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "3px solid rgba(10,26,12,0.1)",
              borderTopColor: "var(--deep-green)",
              animation: "scaffolding-spin 1s linear infinite",
            }}
            aria-hidden
          />
        )}

        {isError && (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(220,80,60,0.1)",
              color: "rgb(220,80,60)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 700,
            }}
            aria-hidden
          >
            !
          </div>
        )}

        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
          }}
        >
          {isError ? "Bootstrap falló" : "Armando vault"}
        </div>

        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            margin: 0,
            maxWidth: 520,
          }}
        >
          {isError
            ? `No pudimos completar el setup de ${clientName}`
            : `Preparando los agentes para ${clientName}`}
        </h2>

        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 14,
            maxWidth: 480,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {isError
            ? errorMessage ??
              "El workflow de scaffold devolvió error. Revisá los logs de GitHub Actions o reintentá creando el cliente otra vez."
            : "Estamos creando la vault del cliente y registrando los agentes. Esto suele tardar 30-60 segundos. La pantalla se actualiza sola cuando termina."}
        </p>
      </div>

      <style jsx>{`
        @keyframes scaffolding-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
