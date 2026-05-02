"use client";

import { useState } from "react";
import { getDownloadUrl, formatBytes } from "@/lib/upload";
import AssetViewer from "@/components/AssetViewer";
import type { ClientOnboarding, OnboardingFile } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

function isPreviewable(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (
    ext === "pdf" ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)
  );
}

interface Props {
  onboarding?: ClientOnboarding;
}

interface FileEntry {
  group: "Contrato" | "Kickoff" | "Branding";
  file: OnboardingFile | string;
}

function flatten(onboarding?: ClientOnboarding): FileEntry[] {
  if (!onboarding) return [];
  const out: FileEntry[] = [];
  if (onboarding.contractFile) {
    out.push({ group: "Contrato", file: onboarding.contractFile });
  }
  if (onboarding.kickoffFile) {
    out.push({ group: "Kickoff", file: onboarding.kickoffFile });
  }
  if (onboarding.brandingFiles?.length) {
    for (const f of onboarding.brandingFiles) {
      out.push({ group: "Branding", file: f });
    }
  }
  return out;
}

function describe(file: OnboardingFile | string): {
  path: string;
  name: string;
  size?: number;
} {
  if (typeof file === "string") {
    return { path: file, name: file.split("/").pop() || file };
  }
  return { path: file.path, name: file.name, size: file.size };
}

export default function OnboardingFilesPanel({ onboarding }: Props) {
  const entries = flatten(onboarding);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ path: string; name: string } | null>(
    null,
  );

  if (entries.length === 0) return null;

  const handleDownload = async (path: string) => {
    setDownloading(path);
    try {
      const url = await getDownloadUrl(path);
      if (!url) {
        alert("No se pudo generar el link de descarga. ¿El archivo existe en el bucket?");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(null);
    }
  };

  // Agrupar por group para renderizar secciones.
  const byGroup = entries.reduce<Record<string, FileEntry[]>>((acc, e) => {
    (acc[e.group] ??= []).push(e);
    return acc;
  }, {});
  const groupOrder: Array<"Contrato" | "Kickoff" | "Branding"> = [
    "Contrato",
    "Kickoff",
    "Branding",
  ];

  return (
    <div className={ui.panel} style={{ marginBottom: 24 }}>
      <div className={ui.panelHead}>
        <div className={ui.panelTitle}>Archivos de onboarding</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Subidos en el wizard de alta del cliente
        </div>
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        {groupOrder.map((g) => {
          const items = byGroup[g];
          if (!items || items.length === 0) return null;
          return (
            <div key={g}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                {g}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {items.map((entry, idx) => {
                  const { path, name, size } = describe(entry.file);
                  const isLoading = downloading === path;
                  return (
                    <div
                      key={`${g}-${idx}-${path}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 14px",
                        border: "1px solid rgba(10,26,12,0.08)",
                        background: "var(--white)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--deep-green)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={name}
                        >
                          {name}
                        </div>
                        {size !== undefined && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--text-muted)",
                              marginTop: 2,
                            }}
                          >
                            {formatBytes(size)}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {isPreviewable(name) && (
                          <button
                            className={ui.btnGhost}
                            onClick={() => setViewing({ path, name })}
                          >
                            Ver
                          </button>
                        )}
                        <button
                          className={ui.btnGhost}
                          disabled={isLoading}
                          onClick={() => handleDownload(path)}
                        >
                          {isLoading ? "Generando…" : "Descargar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <AssetViewer
        key={viewing?.path ?? "closed"}
        open={viewing !== null}
        path={viewing?.path ?? null}
        name={viewing?.name ?? ""}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
