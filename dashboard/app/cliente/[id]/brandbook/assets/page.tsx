"use client";

import { use, useEffect, useState } from "react";
import ui from "@/components/ClientUI.module.css";
import AssetSlot from "@/components/AssetSlot";
import FreeFormAssetUploader from "@/components/FreeFormAssetUploader";
import { getClient } from "@/lib/storage";
import {
  WIZZO_EXPRESSIONS,
  MASCOT_STYLES,
  LOGO_VARIANTS,
  LOGO_COLOR_VARIANTS,
  buildCanonicalName,
  buildAssetPath,
  type AssetCategory,
} from "@/lib/asset-upload";
import { getSupabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/types";

interface AssetFile {
  name: string;
  size?: number;
  path: string;
}

interface AssetMap {
  logo: AssetFile[];
  mascot: AssetFile[];
  patterns: AssetFile[];
  inspiration: AssetFile[];
}

export default function AssetsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [assets, setAssets] = useState<AssetMap>({
    logo: [],
    mascot: [],
    patterns: [],
    inspiration: [],
  });
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AssetCategory>("logo");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getClient(id),
      fetch(`/api/clients/${id}/assets/manifest`).then((r) => r.json()),
    ])
      .then(([c, res]) => {
        if (cancelled) return;
        setClient(c ?? null);
        if (res.assets) {
          setAssets({
            logo: (res.assets.logo ?? []).map((f: { name: string; metadata?: { size?: number } }) => ({
              name: f.name,
              size: f.metadata?.size,
              path: `${id}/logo/${f.name}`,
            })),
            mascot: (res.assets.mascot ?? []).map((f: { name: string; metadata?: { size?: number } }) => ({
              name: f.name,
              size: f.metadata?.size,
              path: `${id}/mascot/${f.name}`,
            })),
            patterns: (res.assets.patterns ?? []).map((f: { name: string; metadata?: { size?: number } }) => ({
              name: f.name,
              size: f.metadata?.size,
              path: `${id}/patterns/${f.name}`,
            })),
            inspiration: (res.assets.inspiration ?? []).map((f: { name: string; metadata?: { size?: number } }) => ({
              name: f.name,
              size: f.metadata?.size,
              path: `${id}/inspiration/${f.name}`,
            })),
          });
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function fileNameFor(canonicalName: string, category: AssetCategory): string | null {
    const list = assets[category];
    const match = list.find((f) => f.name.startsWith(canonicalName + "."));
    return match ? match.name : null;
  }

  async function handleSlotUpload(
    category: AssetCategory,
    canonicalName: string,
    file: File,
  ) {
    const supabase = getSupabase();
    const ext = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "bin";
    const path = `${id}/${category}/${canonicalName}.${ext}`;

    const { error } = await supabase.storage
      .from("client-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      showToast(`Error: ${error.message}`);
      return;
    }
    setAssets((prev) => ({
      ...prev,
      [category]: [
        ...prev[category].filter((f) => !f.name.startsWith(canonicalName + ".")),
        { name: `${canonicalName}.${ext}`, size: file.size, path },
      ],
    }));
    showToast(`✓ ${canonicalName} subido`);
  }

  async function handleSlotDelete(category: AssetCategory, fileName: string) {
    if (!confirm(`¿Borrar ${fileName}?`)) return;
    const path = `${id}/${category}/${fileName}`;
    const supabase = getSupabase();
    const { error } = await supabase.storage.from("client-assets").remove([path]);
    if (error) {
      showToast(`Error: ${error.message}`);
      return;
    }
    setAssets((prev) => ({
      ...prev,
      [category]: prev[category].filter((f) => f.name !== fileName),
    }));
    showToast(`✓ ${fileName} borrado`);
  }

  async function regenerateManifest() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/clients/${id}/assets/manifest`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "regenerate failed");
      showToast(
        `✓ Manifest regenerado (${data.assetsTotal} assets) y commiteado al repo. Los agentes lo verán en <5 min.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error regenerando";
      showToast(`Error: ${msg}`);
    } finally {
      setRegenerating(false);
    }
  }

  const totalAssets =
    assets.logo.length +
    assets.mascot.length +
    assets.patterns.length +
    assets.inspiration.length;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Cliente · Brandbook · Assets</div>
          <h1>{client?.name ?? id} · Asset Library</h1>
        </div>
        <button
          type="button"
          onClick={regenerateManifest}
          disabled={regenerating}
          style={{
            padding: "10px 18px",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            border: "none",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
            cursor: regenerating ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {regenerating ? "Regenerando…" : "↻ Regenerar manifest"}
        </button>
      </div>

      <p
        style={{
          maxWidth: 720,
          color: "var(--text-muted)",
          marginBottom: 12,
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        Acá viven los assets visuales que los agentes usan al generar contenido:
        logos, expresiones del mascot/personaje, patrones y referencias del brandbook.
        Cuando subís o borrás algo, click <strong style={{ color: "var(--deep-green)" }}>Regenerar manifest</strong> arriba
        para que los agentes lo vean en su próxima ejecución.
      </p>

      <p
        style={{
          maxWidth: 720,
          color: "var(--text-muted)",
          fontSize: 12,
          marginBottom: 28,
        }}
      >
        Total cargado: <strong>{totalAssets}</strong> assets · Logo: {assets.logo.length} ·
        Mascot: {assets.mascot.length} · Patterns: {assets.patterns.length} ·
        Inspiration: {assets.inspiration.length}
      </p>

      {/* TABS */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 24,
          borderBottom: "1px solid rgba(10,26,12,0.1)",
          paddingBottom: 0,
        }}
      >
        {(["logo", "mascot", "patterns", "inspiration"] as const).map((cat) => {
          const labels = {
            logo: "Logo",
            mascot: "Mascot / Personaje",
            patterns: "Patrones",
            inspiration: "Inspiración",
          };
          const counts = {
            logo: assets.logo.length,
            mascot: assets.mascot.length,
            patterns: assets.patterns.length,
            inspiration: assets.inspiration.length,
          };
          const active = activeTab === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveTab(cat)}
              style={{
                padding: "12px 18px",
                background: "transparent",
                color: active ? "var(--deep-green)" : "var(--text-muted)",
                border: "none",
                borderBottom: active
                  ? "2px solid var(--deep-green)"
                  : "2px solid transparent",
                fontSize: 12,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {labels[cat]} ({counts[cat]})
            </button>
          );
        })}
      </div>

      {loading && (
        <div style={{ padding: 40, fontSize: 13, color: "var(--text-muted)" }}>
          Cargando assets…
        </div>
      )}

      {/* LOGO TAB */}
      {!loading && activeTab === "logo" && (
        <div className={ui.panel}>
          <div className={ui.panelHead}>
            <div>
              <div className={ui.panelTitle}>Logo · variantes oficiales</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                3 variantes (logotipo / isotipo / logotipo+tagline) × 3 versiones cromáticas (color / blanco / negro) = 9 slots
              </div>
            </div>
          </div>
          <div
            style={{
              padding: "16px 24px 24px",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            {LOGO_VARIANTS.flatMap((variant) =>
              LOGO_COLOR_VARIANTS.map((color) => {
                const canonical = buildCanonicalName({
                  category: "logo",
                  variant: variant.key,
                  colorVariant: color.key,
                });
                const fileName = fileNameFor(canonical, "logo");
                return (
                  <AssetSlot
                    key={canonical}
                    canonicalName={canonical}
                    label={`${variant.label} · ${color.label}`}
                    fileName={fileName}
                    accept="image/svg+xml,image/png,image/jpeg"
                    onUpload={(file) => handleSlotUpload("logo", canonical, file)}
                    onDelete={
                      fileName
                        ? () => handleSlotDelete("logo", fileName)
                        : undefined
                    }
                  />
                );
              }),
            )}
          </div>
        </div>
      )}

      {/* MASCOT TAB */}
      {!loading && activeTab === "mascot" && (
        <div className={ui.panel}>
          <div className={ui.panelHead}>
            <div>
              <div className={ui.panelTitle}>Mascot · 8 expresiones × 3 estilos</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Para WizTrip: Wizzo. Subí cada combinación expresión + estilo. El agente elige cuál usar según el momento emocional del frame.
              </div>
            </div>
          </div>
          <div style={{ padding: "16px 24px 24px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px repeat(3, 1fr)",
                gap: 8,
                marginBottom: 8,
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "var(--sand-dark)",
              }}
            >
              <div>Expresión</div>
              {MASCOT_STYLES.map((s) => (
                <div key={s.key} style={{ textAlign: "center" }}>
                  {s.label}
                </div>
              ))}
            </div>
            {WIZZO_EXPRESSIONS.map((expr) => (
              <div
                key={expr.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px repeat(3, 1fr)",
                  gap: 8,
                  marginBottom: 8,
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--deep-green)",
                  }}
                >
                  {expr.label}
                </div>
                {MASCOT_STYLES.map((style) => {
                  // mascot name: hardcoded "wizzo" for WizTrip; for other clients
                  // future: read from client config or the first part of an existing canonical name
                  const mascotName = "wizzo";
                  const canonical = buildCanonicalName({
                    category: "mascot",
                    mascotName,
                    style: style.key,
                    expression: expr.key,
                  });
                  const fileName = fileNameFor(canonical, "mascot");
                  return (
                    <AssetSlot
                      key={canonical}
                      canonicalName={canonical}
                      label={style.label}
                      compact
                      fileName={fileName}
                      accept="image/svg+xml,image/png"
                      onUpload={(file) =>
                        handleSlotUpload("mascot", canonical, file)
                      }
                      onDelete={
                        fileName
                          ? () => handleSlotDelete("mascot", fileName)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PATTERNS TAB */}
      {!loading && activeTab === "patterns" && (
        <div className={ui.panel}>
          <div className={ui.panelHead}>
            <div>
              <div className={ui.panelTitle}>Patrones gráficos</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Curvas, ornamentos, formas derivadas del logo. Preferentemente SVG.
              </div>
            </div>
          </div>
          <div style={{ padding: "16px 24px 24px" }}>
            <FreeFormAssetUploader
              clientId={id}
              category="patterns"
              files={assets.patterns}
              onUploaded={(file) => {
                setAssets((prev) => ({
                  ...prev,
                  patterns: [...prev.patterns, file],
                }));
                showToast(`✓ ${file.name} subido`);
              }}
              onDeleted={(name) => {
                setAssets((prev) => ({
                  ...prev,
                  patterns: prev.patterns.filter((f) => f.name !== name),
                }));
                showToast(`✓ ${name} borrado`);
              }}
            />
          </div>
        </div>
      )}

      {/* INSPIRATION TAB */}
      {!loading && activeTab === "inspiration" && (
        <div className={ui.panel}>
          <div className={ui.panelHead}>
            <div>
              <div className={ui.panelTitle}>Inspiración / referencias</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Mockups del brandbook, ejemplos de posteo, capturas de competencia. Los agentes los usan como referencia compositiva.
              </div>
            </div>
          </div>
          <div style={{ padding: "16px 24px 24px" }}>
            <FreeFormAssetUploader
              clientId={id}
              category="inspiration"
              files={assets.inspiration}
              onUploaded={(file) => {
                setAssets((prev) => ({
                  ...prev,
                  inspiration: [...prev.inspiration, file],
                }));
                showToast(`✓ ${file.name} subido`);
              }}
              onDeleted={(name) => {
                setAssets((prev) => ({
                  ...prev,
                  inspiration: prev.inspiration.filter((f) => f.name !== name),
                }));
                showToast(`✓ ${name} borrado`);
              }}
            />
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "14px 20px",
            background: toast.startsWith("Error")
              ? "var(--red-warn)"
              : "var(--deep-green)",
            color: "var(--off-white)",
            fontSize: 12,
            letterSpacing: "0.05em",
            fontWeight: 500,
            boxShadow: "0 8px 24px rgba(10,26,12,0.2)",
            zIndex: 200,
            maxWidth: 480,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
