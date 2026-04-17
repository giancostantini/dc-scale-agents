"use client";

import { use } from "react";
import ui from "@/components/ClientUI.module.css";

const AGENTS = [
  { name: "Agente Creativo", desc: "Genera copy, creatividades y piezas visuales alineadas con la marca del cliente." },
  { name: "Agente Ads", desc: "Optimiza campañas, sugiere ajustes de puja, audiencias y creativos." },
  { name: "Agente SEO", desc: "Research de keywords, briefs de contenido, auditorías técnicas." },
  { name: "Agente Email", desc: "Flows, secuencias y copy de newsletters con segmentación." },
  { name: "Agente Social", desc: "Calendario editorial, captions, hooks por red social." },
  { name: "Agente Analytics", desc: "Análisis en lenguaje natural. Consultas rápidas e insights del mes." },
];

export default function AgentesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: _id } = use(params);
  void _id;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Operación · Agentes IA</div>
          <h1>Agentes del cliente</h1>
        </div>
      </div>

      <p style={{ maxWidth: 640, color: "var(--text-muted)", marginBottom: 28, fontSize: 14, lineHeight: 1.6 }}>
        Los agentes se alimentan de los archivos del cliente (kickoff, branding,
        histórico) y se activan automáticamente según los módulos contratados.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {AGENTS.map((a) => (
          <div
            key={a.name}
            style={{
              background: "var(--deep-green)",
              color: "var(--off-white)",
              padding: 24,
              borderTop: "2px solid var(--sand)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 8 }}>
              {a.name}
            </div>
            <div style={{ fontSize: 12, color: "rgba(232,228,220,0.65)", lineHeight: 1.5, marginBottom: 16 }}>
              {a.desc}
            </div>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--sand)", fontWeight: 600, borderTop: "1px solid rgba(196,168,130,0.2)", paddingTop: 14 }}>
              Abrir chat →
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: 20, background: "var(--off-white)", borderLeft: "3px solid var(--sand)", fontSize: 13, color: "var(--text-muted)" }}>
        <strong style={{ color: "var(--deep-green)" }}>Próximo paso:</strong> conectar
        estos agentes al API de Claude. La UI ya está lista; solo falta el backend de chat + RAG.
      </div>
    </>
  );
}
