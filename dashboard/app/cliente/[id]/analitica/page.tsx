"use client";

/**
 * Página de Analítica del cliente.
 *
 * Filosofía: el dashboard ya no hace análisis interno de paid media
 * ni métricas. Esos análisis viven afuera:
 *   - Paid media → Espor.ai (link configurable por cliente)
 *   - Métricas generales → Looker Studio (link configurable por cliente)
 *
 * El sistema solo guarda los URLs y los muestra como accesos directos.
 * Acá también vive el agente de analítica que (cuando esté integrado)
 * consume el Looker Studio para responder preguntas de negocio en
 * lenguaje natural.
 */

import { use, useEffect, useState } from "react";
import ui from "@/components/ClientUI.module.css";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getClient, updateClientExternalLinks } from "@/lib/storage";
import type { Client } from "@/lib/types";

export default function AnaliticaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<"espor" | "looker" | null>(null);
  const [esporUrl, setEsporUrl] = useState("");
  const [lookerUrl, setLookerUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getClient(id), getCurrentProfile()]).then(([c, p]) => {
      if (cancelled) return;
      setClient(c ?? null);
      setIsDirector(p?.role === "director");
      setEsporUrl(c?.external_links?.espor_ai_url ?? "");
      setLookerUrl(c?.external_links?.looker_studio_url ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [id, reloadFlag]);

  async function saveLink(field: "espor_ai_url" | "looker_studio_url", value: string) {
    setSaving(true);
    try {
      const cleaned = value.trim();
      await updateClientExternalLinks(id, {
        [field]: cleaned === "" ? undefined : cleaned,
      });
      setEditing(null);
      setReloadFlag((f) => f + 1);
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo guardar el link:\n${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const esporConfigured = !!client?.external_links?.espor_ai_url;
  const lookerConfigured = !!client?.external_links?.looker_studio_url;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Analítica · Accesos y agente</div>
          <h1>Analítica del cliente</h1>
        </div>
      </div>

      {/* Atajos a herramientas externas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {/* ESPOR.AI */}
        <ShortcutCard
          eyebrow="Paid Media"
          title="Espor.ai"
          description="Análisis de campañas y performance de paid media. Click para abrir el dashboard del cliente en una pestaña nueva."
          configured={esporConfigured}
          url={client?.external_links?.espor_ai_url}
          isDirector={isDirector}
          isEditing={editing === "espor"}
          inputValue={esporUrl}
          setInputValue={setEsporUrl}
          onStartEdit={() => setEditing("espor")}
          onCancel={() => {
            setEditing(null);
            setEsporUrl(client?.external_links?.espor_ai_url ?? "");
          }}
          onSave={() => saveLink("espor_ai_url", esporUrl)}
          saving={saving}
          placeholder="https://espor.ai/clients/..."
        />

        {/* LOOKER STUDIO */}
        <ShortcutCard
          eyebrow="Métricas generales"
          title="Looker Studio"
          description="Dashboard con métricas del negocio (tráfico, conversiones, ventas, etc). Es la fuente del agente de analítica de abajo."
          configured={lookerConfigured}
          url={client?.external_links?.looker_studio_url}
          isDirector={isDirector}
          isEditing={editing === "looker"}
          inputValue={lookerUrl}
          setInputValue={setLookerUrl}
          onStartEdit={() => setEditing("looker")}
          onCancel={() => {
            setEditing(null);
            setLookerUrl(client?.external_links?.looker_studio_url ?? "");
          }}
          onSave={() => saveLink("looker_studio_url", lookerUrl)}
          saving={saving}
          placeholder="https://lookerstudio.google.com/..."
        />
      </div>

      {/* Agente de Analytics */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Consultá al Agente Analytics</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Lenguaje natural · Se nutre del Looker Studio
          </div>
        </div>

        {!lookerConfigured && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(196,168,130,0.1)",
              border: "1px solid rgba(196,168,130,0.3)",
              fontSize: 12,
              color: "var(--text-soft, #5a6a5e)",
              marginBottom: 18,
              lineHeight: 1.5,
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <strong style={{ color: "var(--deep-green)" }}>
              ⚠ Configurá el link de Looker Studio arriba
            </strong>
            <br />
            El agente lee los datos del Looker para responder preguntas. Sin
            esa fuente, las respuestas son genéricas.
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
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
          <label
            style={{
              display: "block",
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
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
              borderRadius: "var(--r-md)",
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 8,
              fontStyle: "italic",
            }}
          >
            La integración del agente con Looker Studio se conecta cuando
            terminamos el wiring del Looker API.
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// ShortcutCard — tarjeta de acceso directo a herramienta externa
// ============================================================
function ShortcutCard({
  eyebrow,
  title,
  description,
  configured,
  url,
  isDirector,
  isEditing,
  inputValue,
  setInputValue,
  onStartEdit,
  onCancel,
  onSave,
  saving,
  placeholder,
}: {
  eyebrow: string;
  title: string;
  description: string;
  configured: boolean;
  url?: string;
  isDirector: boolean;
  isEditing: boolean;
  inputValue: string;
  setInputValue: (v: string) => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  placeholder: string;
}) {
  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderLeft: configured ? "3px solid var(--green-ok)" : "3px solid var(--sand)",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--deep-green)",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-soft, #5a6a5e)",
          lineHeight: 1.5,
          minHeight: 60,
        }}
      >
        {description}
      </div>

      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
            disabled={saving}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid rgba(10,26,12,0.15)",
              background: "var(--white)",
              color: "var(--deep-green)",
              fontSize: 12,
              outline: "none",
              fontFamily: "inherit",
              borderRadius: "var(--r-md)",
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                flex: 1,
                background: "var(--deep-green)",
                color: "var(--off-white)",
                border: "none",
                padding: "9px 14px",
                fontSize: 11,
                fontWeight: 600,
                cursor: saving ? "default" : "pointer",
                letterSpacing: "0.5px",
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              style={{
                flex: 1,
                background: "transparent",
                border: "1px solid rgba(10,26,12,0.15)",
                color: "var(--deep-green)",
                padding: "9px 14px",
                fontSize: 11,
                fontWeight: 500,
                cursor: saving ? "default" : "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : configured && url ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              background: "var(--deep-green)",
              color: "var(--off-white)",
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              textAlign: "center",
              letterSpacing: "0.5px",
              display: "block",
            }}
          >
            Abrir {title} ↗
          </a>
          {isDirector && (
            <button
              onClick={onStartEdit}
              title="Editar URL"
              style={{
                background: "transparent",
                border: "1px solid rgba(10,26,12,0.15)",
                color: "var(--deep-green)",
                padding: "10px 14px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              ✎
            </button>
          )}
        </div>
      ) : isDirector ? (
        <button
          onClick={onStartEdit}
          style={{
            background: "transparent",
            border: "1px dashed rgba(10,26,12,0.25)",
            color: "var(--deep-green)",
            padding: "10px 14px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + Configurar URL de {title}
        </button>
      ) : (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontStyle: "italic",
            padding: "8px 0",
          }}
        >
          Aún no configurado. Pedile al director que cargue el URL.
        </div>
      )}
    </div>
  );
}
