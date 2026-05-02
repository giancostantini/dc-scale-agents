"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { getClient, getProdCampaigns } from "@/lib/storage";
import { listPhaseReports } from "@/lib/phases";
import { getDownloadUrl, formatBytes } from "@/lib/upload";
import type {
  Client,
  ContentPieceRow,
  OnboardingFile,
  PhaseReport,
  ProductionCampaign,
} from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

type FolderKey =
  | "onboarding"
  | "branding"
  | "reportes"
  | "contenidos"
  | "campanas";

interface FolderDef {
  key: FolderKey;
  name: string;
  desc: string;
  icon: string;
}

const FOLDERS: FolderDef[] = [
  {
    key: "onboarding",
    name: "Onboarding",
    desc: "Kickoff y contrato cargados al crear el cliente",
    icon: "⚑",
  },
  {
    key: "branding",
    name: "Branding",
    desc: "Manual de marca, logos, paleta, tipografías",
    icon: "◆",
  },
  {
    key: "reportes",
    name: "Reportes",
    desc: "Diagnóstico, Estrategia, Setup y Lanzamiento generados por IA",
    icon: "▢",
  },
  {
    key: "contenidos",
    name: "Contenidos",
    desc: "Reels, posts, copies del Content Creator",
    icon: "▶",
  },
  {
    key: "campanas",
    name: "Campañas · Resultados",
    desc: "Piezas resultantes de cada campaña de producción",
    icon: "◎",
  },
];

export default function BibliotecaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<ProductionCampaign[]>([]);
  const [pieces, setPieces] = useState<ContentPieceRow[]>([]);
  const [reports, setReports] = useState<PhaseReport[]>([]);
  const [folder, setFolder] = useState<FolderKey>("onboarding");

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
    getProdCampaigns(id).then(setCampaigns);
    listPhaseReports(id).then(setReports);
    fetch(`/api/clients/${id}/pieces?limit=100`)
      .then((r) => (r.ok ? r.json() : { pieces: [] }))
      .then((data: { pieces?: ContentPieceRow[] }) =>
        setPieces(data.pieces ?? []),
      )
      .catch(() => setPieces([]));
  }, [id]);

  // Counts por folder
  const counts = useMemo(() => {
    const ob = client?.onboarding;
    return {
      onboarding:
        (ob?.kickoffFile ? 1 : 0) + (ob?.contractFile ? 1 : 0),
      branding: ob?.brandingFiles?.length ?? 0,
      reportes: reports.filter(
        (r) => r.status === "approved" || r.status === "draft",
      ).length,
      contenidos: pieces.length,
      campanas: campaigns.length,
    } as Record<FolderKey, number>;
  }, [client, reports, pieces, campaigns]);

  if (!client) return null;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Gestión · Biblioteca del cliente</div>
          <h1>Todo lo del cliente</h1>
        </div>
      </div>

      {/* Tabs / cards de folder */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${FOLDERS.length}, 1fr)`,
          gap: 8,
          marginBottom: 28,
        }}
      >
        {FOLDERS.map((f) => {
          const active = folder === f.key;
          const count = counts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFolder(f.key)}
              style={{
                padding: "16px 14px",
                background: active ? "var(--deep-green)" : "var(--white)",
                color: active ? "var(--off-white)" : "var(--deep-green)",
                border: `1px solid ${
                  active ? "var(--deep-green)" : "rgba(10,26,12,0.08)"
                }`,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  marginBottom: 6,
                  color: active ? "var(--sand)" : "var(--sand-dark)",
                }}
              >
                {f.icon}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  marginBottom: 4,
                }}
              >
                {f.name}
              </div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: active ? "var(--sand)" : "var(--text-muted)",
                  fontWeight: 600,
                }}
              >
                {count} {count === 1 ? "archivo" : "archivos"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Contenido del folder activo */}
      {folder === "onboarding" && (
        <OnboardingFolder client={client} />
      )}
      {folder === "branding" && <BrandingFolder client={client} />}
      {folder === "reportes" && (
        <ReportesFolder clientId={id} reports={reports} />
      )}
      {folder === "contenidos" && (
        <ContenidosFolder clientId={id} pieces={pieces} />
      )}
      {folder === "campanas" && (
        <CampanasFolder campaigns={campaigns} />
      )}
    </>
  );
}

// ============ FOLDER: Onboarding ============
function OnboardingFolder({ client }: { client: Client }) {
  const ob = client.onboarding;
  const items: { name: string; file: OnboardingFile | string; tag: string }[] =
    [];
  if (ob?.kickoffFile) items.push({ name: "Kickoff", file: ob.kickoffFile, tag: "Kickoff" });
  if (ob?.contractFile) items.push({ name: "Contrato", file: ob.contractFile, tag: "Contrato" });

  return (
    <FolderShell title="Onboarding" emptyMsg="Todavía no se cargó kickoff ni contrato.">
      {items.length > 0 && <FilesList files={items} />}
    </FolderShell>
  );
}

// ============ FOLDER: Branding ============
function BrandingFolder({ client }: { client: Client }) {
  const files = client.onboarding?.brandingFiles ?? [];
  const items = files.map((f, i) => ({ name: `Branding ${i + 1}`, file: f, tag: "Branding" }));
  return (
    <FolderShell title="Branding" emptyMsg="No hay archivos de branding cargados.">
      {items.length > 0 && <FilesList files={items} />}
    </FolderShell>
  );
}

// ============ FOLDER: Reportes ============
function ReportesFolder({
  clientId,
  reports,
}: {
  clientId: string;
  reports: PhaseReport[];
}) {
  const visible = reports.filter(
    (r) => r.status === "approved" || r.status === "draft",
  );

  if (visible.length === 0) {
    return (
      <FolderShell
        title="Reportes"
        emptyMsg="Todavía no hay reportes generados. Andá a Fases del negocio para generar el Diagnóstico."
      />
    );
  }

  const labelMap = {
    diagnostico: "Diagnóstico · Growth Diagnosis Plan",
    estrategia: "Estrategia · Growth Strategy Plan",
    setup: "Setup técnico",
    lanzamiento: "Lanzamiento · Growth Launch Plan",
  } as const;

  return (
    <FolderShell title="Reportes" emptyMsg="">
      <div style={{ display: "grid", gap: 8 }}>
        {visible.map((r) => {
          const isDraft = r.status === "draft";
          return (
            <Link
              key={r.id}
              href={`/cliente/${clientId}/fases/${r.phase}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 14px",
                background: isDraft
                  ? "var(--off-white)"
                  : "rgba(58,139,92,0.05)",
                border: "1px solid rgba(10,26,12,0.06)",
                borderLeft: `3px solid ${
                  isDraft ? "var(--yellow-warn)" : "var(--green-ok)"
                }`,
                textDecoration: "none",
                color: "inherit",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 22, color: "var(--sand-dark)" }}>▢</div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--deep-green)",
                  }}
                >
                  {labelMap[r.phase]}
                  {r.version > 1 && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontWeight: 400,
                      }}
                    >
                      v{r.version}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  {r.generated_at
                    ? `Generado ${new Date(r.generated_at).toLocaleString("es-AR")}`
                    : "—"}
                  {r.approved_at &&
                    ` · Aprobado ${new Date(r.approved_at).toLocaleDateString("es-AR")}`}
                </div>
              </div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  padding: "3px 8px",
                  background: isDraft ? "var(--yellow-warn)" : "var(--green-ok)",
                  color: "var(--white)",
                }}
              >
                {isDraft ? "Draft" : "Aprobado"}
              </div>
              <div style={{ color: "var(--sand-dark)" }}>→</div>
            </Link>
          );
        })}
      </div>
    </FolderShell>
  );
}

// ============ FOLDER: Contenidos ============
function ContenidosFolder({
  clientId,
  pieces,
}: {
  clientId: string;
  pieces: ContentPieceRow[];
}) {
  if (pieces.length === 0) {
    return (
      <FolderShell
        title="Contenidos"
        emptyMsg="No hay contenidos generados. Pedile al Content Creator un reel desde Agentes IA."
      >
        <div style={{ marginTop: 8 }}>
          <Link href={`/cliente/${clientId}/agentes`} className={ui.btnSolid}>
            Ir a Agentes IA →
          </Link>
        </div>
      </FolderShell>
    );
  }

  return (
    <FolderShell title="Contenidos" emptyMsg="">
      <div style={{ display: "grid", gap: 8 }}>
        {pieces.map((p) => {
          const fecha = new Date(p.created_at).toLocaleString("es-AR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 14px",
                background: "var(--white)",
                border: "1px solid rgba(10,26,12,0.08)",
              }}
            >
              <div style={{ fontSize: 22, color: "var(--sand-dark)" }}>
                {p.video_path ? "▶" : "▢"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  Pieza #{p.piece_id}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 2,
                  }}
                >
                  {p.piece_type}
                  {p.angle ? ` · ${p.angle}` : ""} · {fecha}
                </div>
              </div>
              <Link
                href={`/cliente/${clientId}/agentes`}
                className={ui.btnGhost}
                style={{ fontSize: 11 }}
              >
                Ver
              </Link>
            </div>
          );
        })}
      </div>
    </FolderShell>
  );
}

// ============ FOLDER: Campañas ============
function CampanasFolder({ campaigns }: { campaigns: ProductionCampaign[] }) {
  if (campaigns.length === 0) {
    return (
      <FolderShell
        title="Campañas · Resultados"
        emptyMsg="No hay campañas. Creá una en Campañas y los resultados aparecen acá."
      />
    );
  }
  return (
    <FolderShell title="Campañas · Resultados" emptyMsg="">
      <div style={{ display: "grid", gap: 12 }}>
        {campaigns.map((c) => (
          <div
            key={c.id}
            style={{
              padding: 18,
              background: "var(--white)",
              border: "1px solid rgba(10,26,12,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>▢ {c.title}</div>
              <span
                className={`${ui.pill} ${c.status === "active" ? ui.pillGreen : ui.pillGrey}`}
              >
                {c.status === "active" ? "En curso" : "Finalizada"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {c.resultFiles ?? 0} piezas · {c.type}
            </div>
          </div>
        ))}
      </div>
    </FolderShell>
  );
}

// ============ Helpers ============
function FolderShell({
  title,
  emptyMsg,
  children,
}: {
  title: string;
  emptyMsg: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={ui.panel} style={{ marginBottom: 24 }}>
      <div className={ui.panelHead}>
        <div className={ui.panelTitle}>{title}</div>
      </div>
      {children}
      {!children && emptyMsg && (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            background: "var(--off-white)",
            borderLeft: "3px solid var(--sand)",
            color: "var(--text-muted)",
            fontSize: 13,
            fontStyle: "italic",
          }}
        >
          {emptyMsg}
        </div>
      )}
    </div>
  );
}

function FilesList({
  files,
}: {
  files: { name: string; file: OnboardingFile | string; tag: string }[];
}) {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleDownload(path: string) {
    setDownloading(path);
    try {
      const url = await getDownloadUrl(path);
      if (!url) {
        alert("No se pudo generar el link de descarga.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {files.map((it, idx) => {
        const isObj = typeof it.file !== "string";
        const path = isObj ? (it.file as OnboardingFile).path : (it.file as string);
        const fileName = isObj
          ? (it.file as OnboardingFile).name
          : path.split("/").pop() ?? path;
        const size = isObj ? (it.file as OnboardingFile).size : undefined;
        const isLoading = downloading === path;
        return (
          <div
            key={`${idx}-${path}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "var(--white)",
              border: "1px solid rgba(10,26,12,0.08)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--deep-green)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={fileName}
              >
                {fileName}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                {it.tag}
                {size !== undefined ? ` · ${formatBytes(size)}` : ""}
              </div>
            </div>
            <button
              className={ui.btnGhost}
              disabled={isLoading}
              onClick={() => handleDownload(path)}
              style={{ flexShrink: 0 }}
            >
              {isLoading ? "Generando…" : "Descargar"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
