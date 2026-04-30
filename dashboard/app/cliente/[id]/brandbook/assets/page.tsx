"use client";

import { use, useEffect, useState } from "react";
import ui from "@/components/ClientUI.module.css";
import CategoryUploader from "@/components/CategoryUploader";
import { getClient } from "@/lib/storage";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  FIXED_SUBCATEGORIES,
  type AssetCategory,
} from "@/lib/asset-upload";
import type { Client } from "@/lib/types";

interface AssetEntry {
  filename: string;
  size?: number;
  path: string;
}

type AssetsByCategory = Record<AssetCategory, Record<string, AssetEntry[]>>;

const EMPTY_ASSETS: AssetsByCategory = {
  logo: {},
  mascot: {},
  curvas: {},
  ilustraciones: {},
  tipografias: {},
  "key-visuals": {},
  "brand-book": {},
};

export default function AssetsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [assets, setAssets] = useState<AssetsByCategory>(EMPTY_ASSETS);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AssetCategory>("logo");

  function refreshAssets() {
    return fetch(`/api/clients/${id}/assets/manifest`)
      .then((r) => r.json())
      .then((res) => {
        if (res.assets) {
          // Merge con EMPTY_ASSETS para asegurar que todas las categorías existen
          const merged = { ...EMPTY_ASSETS };
          for (const cat of CATEGORIES) {
            merged[cat] = res.assets[cat] ?? {};
          }
          setAssets(merged);
        }
      });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getClient(id), refreshAssets()])
      .then(([c]) => {
        if (cancelled) return;
        setClient(c ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
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

  // Total para el header
  let totalCount = 0;
  for (const cat of CATEGORIES) {
    for (const sub of Object.values(assets[cat] ?? {})) {
      totalCount += sub.length;
    }
  }

  function categoryCount(cat: AssetCategory): number {
    return Object.values(assets[cat] ?? {}).reduce(
      (acc, sub) => acc + sub.length,
      0,
    );
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Cliente · Brandbook · Asset Library</div>
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
        Cargá los assets visuales operativos del cliente — los archivos que los
        agentes usan al generar contenido (logos, mascot/personaje, ilustraciones,
        tipografías, etc.). Cuando subas o borres algo, click{" "}
        <strong style={{ color: "var(--deep-green)" }}>Regenerar manifest</strong>{" "}
        arriba para que los agentes lo vean en su próxima ejecución.
      </p>

      <p
        style={{
          maxWidth: 720,
          color: "var(--text-muted)",
          fontSize: 12,
          marginBottom: 28,
        }}
      >
        Total cargado: <strong>{totalCount}</strong> assets
      </p>

      {/* TABS */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          borderBottom: "1px solid rgba(10,26,12,0.1)",
          flexWrap: "wrap",
        }}
      >
        {CATEGORIES.map((cat) => {
          const active = activeTab === cat;
          const count = categoryCount(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveTab(cat)}
              style={{
                padding: "12px 16px",
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
              {CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {loading && (
        <div style={{ padding: 40, fontSize: 13, color: "var(--text-muted)" }}>
          Cargando assets…
        </div>
      )}

      {!loading && (
        <CategoryUploader
          clientId={id}
          category={activeTab}
          fixedSubcategories={FIXED_SUBCATEGORIES[activeTab] ?? null}
          subcategoryFiles={assets[activeTab] ?? {}}
          description={CATEGORY_DESCRIPTIONS[activeTab]}
          onChanged={() => {
            // Refrescar todo el árbol después de upload/delete
            refreshAssets();
          }}
          onToast={showToast}
        />
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
