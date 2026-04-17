"use client";

import { use, useState } from "react";
import ui from "@/components/ClientUI.module.css";

export default function AnaliticaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: _id } = use(params);
  const [query, setQuery] = useState("");
  void _id;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Analítica · Agente integrado</div>
          <h1>Insights del cliente</h1>
        </div>
        <button className={ui.btnSolid}>+ Generar reporte custom</button>
      </div>

      {/* Reporte diario */}
      <div
        style={{
          background: "var(--deep-green)",
          color: "var(--off-white)",
          padding: 36,
          marginBottom: 24,
          borderLeft: "3px solid var(--sand)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--sand)", fontWeight: 600, marginBottom: 10 }}>
              Reporte diario · Automático
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Análisis del día
            </div>
            <div style={{ fontSize: 12, color: "rgba(232,228,220,0.55)", marginTop: 6 }}>
              {new Date().toLocaleDateString("es-UY", { day: "numeric", month: "long", year: "numeric" })} · Se generará cuando Google Analytics esté conectado
            </div>
          </div>
          <button style={{ padding: "8px 14px", fontSize: 11, fontWeight: 500, color: "var(--off-white)", border: "1px solid rgba(196,168,130,0.3)", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>
            ↓ Descargar PDF
          </button>
        </div>

        <div style={{ fontSize: 14, color: "rgba(232,228,220,0.75)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--sand)" }}>Resumen del agente:</strong>{" "}
          Una vez conectado GA4, Meta Ads y Google Ads, el agente genera un resumen diario
          automático con recuperación de tráfico, conversiones, CAC, ROAS y las acciones
          ejecutadas por el equipo.
        </div>
      </div>

      {/* Inputs clave de mejora */}
      <div className={ui.panel} style={{ marginBottom: 24, borderLeft: "3px solid var(--sand)" }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>⚡ Inputs clave de mejora</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Basado en métricas del negocio</div>
        </div>
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Los inputs de mejora aparecen automáticamente cuando hay suficiente data.
          Conectá las plataformas y esperá 7 días de tracking para las primeras recomendaciones.
        </div>
      </div>

      {/* Chat */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Consultá al Agente Analytics</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Lenguaje natural · Respuesta inmediata</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          {[
            "¿Qué canal generó más conversiones esta semana?",
            "¿Cuál es la campaña con mejor ROAS?",
            "Compará este mes con el anterior",
            "¿Qué producto convierte mejor?",
            "Sugerí 3 acciones para bajar CAC",
          ].map((q) => (
            <button
              key={q}
              onClick={() => setQuery(q)}
              className={ui.btnGhost}
              style={{ fontSize: 11 }}
            >
              {q}
            </button>
          ))}
        </div>
        <div>
          <label style={{ display: "block", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600, marginBottom: 8 }}>
            Consulta libre
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej: ¿Por qué bajó la conversión la semana pasada?"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid rgba(10,26,12,0.15)",
              background: "var(--white)",
              color: "var(--deep-green)",
              fontFamily: "inherit",
              fontSize: 13,
              outline: "none",
            }}
          />
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, fontStyle: "italic" }}>
            El agente se conecta al API de Claude cuando hagamos la integración.
          </div>
        </div>
      </div>

      {/* Generador de reportes */}
      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Generador de reportes custom</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Eligí qué incluir y el agente lo arma
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            "Performance semanal",
            "Reporte mensual cliente",
            "Análisis campaña específica",
            "Deep dive por canal",
            "Cohortes de usuarios",
            "Funnel completo",
            "LTV / CAC",
            "Forecast próximo mes",
          ].map((r) => (
            <div
              key={r}
              style={{
                padding: 18,
                border: "1px solid rgba(10,26,12,0.08)",
                cursor: "pointer",
                fontSize: 13,
                textAlign: "center",
                fontWeight: 500,
                background: "var(--white)",
              }}
            >
              {r}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
