"use client";

import { use, useState } from "react";
import ui from "@/components/ClientUI.module.css";

const FORMATS = [
  ["Reel IG", "◐"],
  ["Carrusel", "▦"],
  ["Story", "◇"],
  ["Post estático", "◉"],
  ["Email", "✉"],
  ["Landing copy", "▲"],
  ["Ad creative", "⚑"],
  ["Guion de video", "◈"],
  ["Thread LinkedIn", "▢"],
  ["Caption", "✎"],
  ["Brief campaña", "◎"],
  ["Custom", "+"],
];

export default function FabricaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: _id } = use(params);
  void _id;
  const [brief, setBrief] = useState("");
  const [format, setFormat] = useState("");

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Producción · Agente Creativo</div>
          <h1>Fábrica de contenidos</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "var(--off-white)", borderLeft: "2px solid var(--green-ok)" }}>
          <span style={{ width: 8, height: 8, background: "var(--green-ok)", borderRadius: "50%" }} />
          <span style={{ fontSize: 11, letterSpacing: "0.1em", fontWeight: 500 }}>
            Agente alimentado con el branding
          </span>
        </div>
      </div>

      <p style={{ maxWidth: 760, color: "var(--text-muted)", marginBottom: 28, fontSize: 14, lineHeight: 1.6 }}>
        Pedile al Agente Creativo cualquier pieza: copy, creatividad, brief,
        campaña, guion de video. Cuanta más información le pases, más preciso.
      </p>

      {/* Contexto */}
      <div className={ui.panel} style={{ marginBottom: 20, borderLeft: "3px solid var(--sand)" }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Contexto del agente</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Lo que lee antes de crear</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[
            { label: "Branding", value: "Cargado en biblioteca", icon: "◆" },
            { label: "Histórico", value: "Piezas publicadas previas", icon: "◇" },
            { label: "Estrategia", value: "Growth Strategy Plan", icon: "◈" },
            { label: "Referencias", value: "Ejemplos cargados manualmente", icon: "⚑" },
          ].map((c) => (
            <div key={c.label} style={{ padding: 16, background: "var(--off-white)" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600, marginBottom: 8 }}>
                {c.icon} {c.label}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Brief */}
      <div
        style={{
          background: "var(--deep-green)",
          color: "var(--off-white)",
          padding: 36,
          marginBottom: 24,
          borderLeft: "3px solid var(--sand)",
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--sand)", fontWeight: 600, marginBottom: 16 }}>
          ⚑ Nueva solicitud
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 24 }}>
          ¿Qué necesitás producir?
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 24 }}>
          {FORMATS.map((f) => (
            <button
              key={f[0]}
              onClick={() => setFormat(f[0])}
              style={{
                padding: "14px 10px",
                border: `1px solid ${format === f[0] ? "var(--sand)" : "rgba(196,168,130,0.3)"}`,
                background: format === f[0] ? "rgba(196,168,130,0.15)" : "transparent",
                color: "var(--off-white)",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 16, color: "var(--sand)" }}>{f[1]}</span>
              <span>{f[0]}</span>
            </button>
          ))}
        </div>

        <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--sand)", fontWeight: 600, marginBottom: 10 }}>
          Briefing
        </div>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          placeholder="Ej: Reel IG sobre la nueva colección primavera. Tono cercano y emocional. CTA para agendar visita."
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid rgba(196,168,130,0.25)",
            padding: 14,
            color: "var(--off-white)",
            fontSize: 14,
            outline: "none",
            resize: "vertical",
            fontFamily: "inherit",
            marginBottom: 20,
          }}
        />

        <button
          style={{
            padding: "14px 28px",
            background: "var(--sand)",
            color: "var(--deep-green)",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          disabled={!brief.trim() || !format}
        >
          Generar creativos →
        </button>
      </div>

      {/* Info adicional */}
      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Información adicional</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Contexto puntual para esta pieza</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {[
            "Producto / servicio específico",
            "Audiencia objetivo",
            "Objetivo de la pieza",
            "Palabras clave obligatorias",
          ].map((label) => (
            <div key={label}>
              <label style={{ display: "block", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600, marginBottom: 8 }}>
                {label}
              </label>
              <input
                placeholder={`${label}…`}
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
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
          Cuando conectemos Claude API, el agente genera variantes en tiempo real que podés iterar.
        </div>
      </div>
    </>
  );
}
