"use client";

import { use, useEffect, useState } from "react";
import ui from "@/components/ClientUI.module.css";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import RebrandbookModal from "@/components/RebrandbookModal";
import { getClient } from "@/lib/storage";
import type { Client } from "@/lib/types";

const SECTION_ORDER: Array<{ key: string; title: string; description: string }> = [
  {
    key: "positioning",
    title: "Positioning",
    description: "Statement, target, misión, visión, valores, slogan.",
  },
  {
    key: "voice-operational",
    title: "Voz Operativa",
    description: "Cómo habla la marca como plataforma. Atributos + ejemplos ✅/❌.",
  },
  {
    key: "voice-character",
    title: "Voz del Personaje",
    description: "Si hay mascot/voice estratégica diferenciada (e.g. Wizzo).",
  },
  {
    key: "voice-decision",
    title: "Decisión de Voz",
    description: "Cuándo usar voz operativa vs personaje. Tabla de decisión.",
  },
  {
    key: "visual-identity",
    title: "Identidad Visual",
    description: "Logo, paleta hex, tipografías, reglas de uso.",
  },
  {
    key: "photography",
    title: "Fotografía",
    description: "Tipología de imagen, look & feel, qué SÍ y qué NO.",
  },
  {
    key: "content-formats",
    title: "Formatos de Contenido",
    description: "Tipos de pieza con estructura. Voz dominante por formato.",
  },
  {
    key: "restrictions",
    title: "Restricciones",
    description: "Guard rails — qué NUNCA hacer.",
  },
];

export default function BrandbookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [brand, setBrand] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [archives, setArchives] = useState<
    Array<{
      stamp: string;
      fileCount: number;
      sourceUrl?: string;
      viewUrl: string;
    }>
  >([]);
  const [archivesOpen, setArchivesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getClient(id),
      fetch(`/api/clients/${id}/brand`).then((r) => r.json()),
      fetch(`/api/clients/${id}/brandbook/archives`)
        .then((r) => r.json())
        .catch(() => ({ archives: [] })),
    ])
      .then(([c, brandRes, archivesRes]) => {
        if (cancelled) return;
        setClient(c ?? null);
        if (brandRes.error) {
          setError(brandRes.error);
        } else {
          setBrand(brandRes.brand ?? {});
        }
        setArchives(archivesRes.archives ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message ?? "Error cargando brandbook");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function startEdit(key: string) {
    setEditingKey(key);
    setEditDraft(brand[key] ?? "");
  }

  async function saveEdit() {
    if (!editingKey) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${id}/brand`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `${editingKey}.md`,
          content: editDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error guardando");
      setBrand((prev) => ({ ...prev, [editingKey]: editDraft }));
      setEditingKey(null);
      setEditDraft("");
      showToast(`✓ ${editingKey}.md actualizado`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error guardando";
      showToast(`Error: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditDraft("");
  }

  const hasBrand = Object.keys(brand).length > 0;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Cliente · Brandbook</div>
          <h1>{client?.name ?? id} · Brandbook</h1>
        </div>
        {hasBrand && (
          <button
            type="button"
            onClick={() => setReprocessOpen(true)}
            style={{
              padding: "10px 18px",
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ↻ Re-procesar brandbook
          </button>
        )}
      </div>

      <p
        style={{
          maxWidth: 720,
          color: "var(--text-muted)",
          marginBottom: 28,
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        Estos son los 8 archivos que los agentes leen para entender la marca de{" "}
        <strong style={{ color: "var(--deep-green)" }}>{client?.name ?? id}</strong>.
        Editalos directo acá — el cambio se guarda en el repo y los agentes
        empiezan a usar la versión nueva en menos de 5 minutos.
      </p>

      {loading && (
        <div
          style={{ padding: 40, fontSize: 13, color: "var(--text-muted)" }}
        >
          Cargando brand/…
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            padding: 24,
            background: "rgba(176,75,58,0.08)",
            borderLeft: "3px solid var(--red-warn)",
            color: "var(--red-warn)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && !hasBrand && (
        <div className={ui.panel}>
          <div style={{ padding: 40, textAlign: "center" }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              Sin brandbook procesado
            </div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 14,
                letterSpacing: "-0.02em",
              }}
            >
              {client?.name ?? id} todavía no tiene brand/ generado
            </h2>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                maxWidth: 480,
                margin: "0 auto 24px",
                lineHeight: 1.6,
              }}
            >
              Cuando subas un brandbook (texto o PDF), los agentes van a generar
              contenido respetando la marca. Hasta entonces, operan con buenas
              prácticas genéricas del sector.
            </p>
            <button
              type="button"
              onClick={() => setReprocessOpen(true)}
              style={{
                padding: "12px 24px",
                background: "var(--deep-green)",
                color: "var(--off-white)",
                border: "none",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ↑ Cargar brandbook
            </button>
          </div>
        </div>
      )}

      {!loading && hasBrand && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {SECTION_ORDER.map(({ key, title, description }) => {
            const content = brand[key];
            if (!content) return null;
            const isEditing = editingKey === key;

            return (
              <div key={key} className={ui.panel}>
                <div className={ui.panelHead}>
                  <div>
                    <div className={ui.panelTitle}>{title}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 4,
                      }}
                    >
                      brand/{key}.md · {description}
                    </div>
                  </div>
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => startEdit(key)}
                      style={{
                        padding: "6px 14px",
                        background: "transparent",
                        color: "var(--deep-green)",
                        border: "1px solid rgba(10,26,12,0.15)",
                        fontSize: 10,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Editar
                    </button>
                  )}
                </div>

                <div style={{ padding: "8px 24px 24px" }}>
                  {isEditing ? (
                    <>
                      <textarea
                        rows={20}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        disabled={saving}
                        style={{
                          width: "100%",
                          fontFamily:
                            '"SF Mono", Menlo, Monaco, Consolas, monospace',
                          fontSize: 12,
                          lineHeight: 1.5,
                          padding: 14,
                          border: "1px solid rgba(10,26,12,0.15)",
                          background: "var(--off-white)",
                          resize: "vertical",
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          marginTop: 12,
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={saving}
                          style={{
                            padding: "8px 18px",
                            background: "transparent",
                            color: "var(--text-muted)",
                            border: "1px solid rgba(10,26,12,0.15)",
                            fontSize: 11,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            fontWeight: 600,
                            cursor: saving ? "not-allowed" : "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={saving}
                          style={{
                            padding: "8px 18px",
                            background: "var(--deep-green)",
                            color: "var(--off-white)",
                            border: "none",
                            fontSize: 11,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            fontWeight: 600,
                            cursor: saving ? "not-allowed" : "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          {saving ? "Guardando…" : "Guardar"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <MarkdownRenderer content={content} shiftHeadings />
                  )}
                </div>
              </div>
            );
          })}

          {/* Lista placeholder de archivos esperados que no están */}
          {SECTION_ORDER.some(({ key }) => !brand[key]) && (
            <div
              style={{
                padding: "16px 20px",
                background: "var(--off-white)",
                borderLeft: "3px solid var(--sand)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Archivos faltantes (sección sin contenido)
              </div>
              {SECTION_ORDER.filter(({ key }) => !brand[key]).map(
                ({ key, title }) => (
                  <div key={key} style={{ marginBottom: 4 }}>
                    • brand/{key}.md ({title})
                  </div>
                ),
              )}
              <div style={{ marginTop: 10, lineHeight: 1.6 }}>
                Re-procesá el brandbook con un texto más completo, o creá los
                archivos manualmente con el botón &quot;Editar&quot; (cuando
                aparezca).
              </div>
            </div>
          )}

          {/* Versiones anteriores (archive) */}
          {archives.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "16px 20px",
                background: "var(--off-white)",
                borderTop: "1px solid rgba(10,26,12,0.08)",
              }}
            >
              <button
                type="button"
                onClick={() => setArchivesOpen((o) => !o)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: 0,
                }}
              >
                <span>{archivesOpen ? "▾" : "▸"}</span>
                <span>
                  Ver versiones anteriores ({archives.length}{" "}
                  {archives.length === 1 ? "versión" : "versiones"} en archive)
                </span>
              </button>
              {archivesOpen && (
                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {archives.map((a) => (
                    <div
                      key={a.stamp}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        background: "var(--white)",
                        border: "1px solid rgba(10,26,12,0.08)",
                        fontSize: 12,
                      }}
                    >
                      <span
                        style={{
                          fontFamily:
                            '"SF Mono", Menlo, Monaco, Consolas, monospace',
                          fontSize: 11,
                          color: "var(--deep-green)",
                          flex: 1,
                        }}
                      >
                        {a.stamp.replace(
                          /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/,
                          "$1 · $2:$3",
                        )}{" "}
                        · {a.fileCount} archivos
                      </span>
                      <a
                        href={a.viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--text-muted)",
                          textDecoration: "underline",
                          fontSize: 11,
                        }}
                      >
                        Ver en GitHub
                      </a>
                      {a.sourceUrl && (
                        <a
                          href={a.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "var(--deep-green)",
                            textDecoration: "underline",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          Ver source original
                        </a>
                      )}
                    </div>
                  ))}
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      color: "var(--text-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    Para restaurar una versión, copiá el texto de
                    &quot;Ver source original&quot; y pegalo en
                    &quot;Re-procesar brandbook&quot;.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <RebrandbookModal
        open={reprocessOpen}
        clientId={id}
        clientName={client?.name ?? id}
        onClose={() => setReprocessOpen(false)}
        onSuccess={(msg) => {
          showToast(msg);
          setReprocessOpen(false);
          // Recargar después de 60s para que el processor haya terminado
          setTimeout(() => {
            fetch(`/api/clients/${id}/brand`)
              .then((r) => r.json())
              .then((res) => {
                if (!res.error) setBrand(res.brand ?? {});
              });
          }, 60000);
        }}
      />

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "14px 20px",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            fontSize: 12,
            letterSpacing: "0.05em",
            fontWeight: 500,
            boxShadow: "0 8px 24px rgba(10,26,12,0.2)",
            zIndex: 200,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
