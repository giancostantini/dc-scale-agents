"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { getClient, getProdCampaigns } from "@/lib/storage";
import { listPhaseReports } from "@/lib/phases";
import { getDownloadUrl, formatBytes } from "@/lib/upload";
import { getCurrentProfile } from "@/lib/supabase/auth";
import LibraryUploadButton from "@/components/LibraryUploadButton";
import { updateClientExternalLinks } from "@/lib/storage";
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
  const [isDirector, setIsDirector] = useState(false);

  const refreshClient = useCallback(async () => {
    const c = await getClient(id);
    setClient(c ?? null);
  }, [id]);

  useEffect(() => {
    refreshClient();
    getProdCampaigns(id).then(setCampaigns);
    listPhaseReports(id).then(setReports);
    getCurrentProfile().then((p) =>
      setIsDirector(p?.role === "director" || p?.role === "team"),
    );
    fetch(`/api/clients/${id}/pieces?limit=100`)
      .then((r) => (r.ok ? r.json() : { pieces: [] }))
      .then((data: { pieces?: ContentPieceRow[] }) =>
        setPieces(data.pieces ?? []),
      )
      .catch(() => setPieces([]));
  }, [id, refreshClient]);

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

      {/* Acceso directo a la carpeta de OneDrive (toda la docu viva
          del cliente). El nombre interno del banner sigue siendo
          "TeamsFolderBanner" y el campo en DB es `teams_folder_url`
          por razones históricas — para evitar una migración. Visualmente
          el cliente ve "OneDrive". */}
      <TeamsFolderBanner
        client={client}
        isDirector={isDirector}
        onUpdated={refreshClient}
      />

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
        <OnboardingFolder
          client={client}
          canUpload={isDirector}
          onChange={refreshClient}
        />
      )}
      {folder === "branding" && (
        <BrandingFolder
          client={client}
          canUpload={isDirector}
          onChange={refreshClient}
        />
      )}
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
function OnboardingFolder({
  client,
  canUpload,
  onChange,
}: {
  client: Client;
  canUpload: boolean;
  onChange: () => void;
}) {
  const ob = client.onboarding;
  const items: { name: string; file: OnboardingFile | string; tag: string }[] =
    [];
  if (ob?.kickoffFile) items.push({ name: "Kickoff", file: ob.kickoffFile, tag: "Kickoff" });
  if (ob?.contractFile) items.push({ name: "Contrato", file: ob.contractFile, tag: "Contrato" });

  return (
    <FolderShell
      title="Onboarding"
      emptyMsg={canUpload ? "" : "Todavía no se cargó kickoff ni contrato."}
      uploadButtons={
        canUpload ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <LibraryUploadButton
              client={client}
              target="kickoff"
              label={ob?.kickoffFile ? "↻ Reemplazar kickoff" : "+ Subir kickoff"}
              accept=".pdf"
              onUploaded={onChange}
            />
            <LibraryUploadButton
              client={client}
              target="contract"
              label={ob?.contractFile ? "↻ Reemplazar contrato" : "+ Subir contrato"}
              accept=".pdf"
              onUploaded={onChange}
            />
          </div>
        ) : null
      }
    >
      {items.length > 0 && <FilesList files={items} />}
    </FolderShell>
  );
}

// ============ FOLDER: Branding ============
function BrandingFolder({
  client,
  canUpload,
  onChange,
}: {
  client: Client;
  canUpload: boolean;
  onChange: () => void;
}) {
  const files = client.onboarding?.brandingFiles ?? [];
  const items = files.map((f, i) => ({ name: `Branding ${i + 1}`, file: f, tag: "Branding" }));
  return (
    <FolderShell
      title="Branding"
      emptyMsg={canUpload ? "" : "No hay archivos de branding cargados."}
      uploadButtons={
        canUpload ? (
          <LibraryUploadButton
            client={client}
            target="branding"
            label={files.length > 0 ? "+ Agregar archivo" : "+ Subir branding"}
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onUploaded={onChange}
          />
        ) : null
      }
    >
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
                borderRadius: "var(--r-md)",
                boxShadow: "var(--shadow-sm)",
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
                  borderRadius: "var(--r-pill)",
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
                borderRadius: "var(--r-md)",
                boxShadow: "var(--shadow-sm)",
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
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-sm)",
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
  uploadButtons,
  children,
}: {
  title: string;
  emptyMsg: string;
  uploadButtons?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const hasUploads = uploadButtons != null;
  return (
    <div className={ui.panel} style={{ marginBottom: 24 }}>
      <div
        className={ui.panelHead}
        style={{
          flexWrap: "wrap",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        <div className={ui.panelTitle}>{title}</div>
        {uploadButtons}
      </div>
      {children}
      {!children && (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            background: "var(--off-white)",
            borderLeft: "3px solid var(--sand)",
            color: "var(--text-muted)",
            fontSize: 13,
            fontStyle: "italic",
            borderRadius: "var(--r-md)",
          }}
        >
          {emptyMsg ||
            (hasUploads
              ? "Sin archivos. Subí el primero usando los botones arriba."
              : "No hay archivos cargados.")}
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
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-sm)",
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

// ============================================================
// TeamsFolderBanner — acceso directo a la carpeta de OneDrive del
// cliente. (El nombre del componente y el campo `teams_folder_url`
// quedaron del pasado cuando usábamos Microsoft Teams para esto.
// Internamente se mantienen para no migrar; visualmente decimos
// OneDrive.) El director lo configura inline; el resto del equipo
// lo abre.
// ============================================================
function TeamsFolderBanner({
  client,
  isDirector,
  onUpdated,
}: {
  client: Client;
  isDirector: boolean;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(client.external_links?.teams_folder_url ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setUrl(client.external_links?.teams_folder_url ?? "");
  }, [client.external_links?.teams_folder_url, editing]);

  async function save() {
    setSaving(true);
    try {
      await updateClientExternalLinks(client.id, {
        teams_folder_url: url.trim() === "" ? undefined : url.trim(),
      });
      setEditing(false);
      onUpdated();
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo guardar el link de OneDrive:\n${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const configured = !!client.external_links?.teams_folder_url;

  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderLeft: configured
          ? "3px solid var(--green-ok)"
          : "3px solid var(--sand)",
        padding: 18,
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ flex: 1, minWidth: 280 }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Carpeta del cliente · OneDrive
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-soft, #5a6a5e)",
            lineHeight: 1.5,
          }}
        >
          Toda la documentación viva del cliente (contratos, briefings, archivos
          compartidos, notas de reuniones) vive en OneDrive. Click abre la carpeta
          en una pestaña nueva.
        </div>
      </div>

      {editing ? (
        <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 280 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://onedrive.live.com/... o https://...sharepoint.com/..."
            autoFocus
            disabled={saving}
            style={{
              flex: 1,
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
          <button
            onClick={save}
            disabled={saving}
            style={{
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
            onClick={() => {
              setEditing(false);
              setUrl(client.external_links?.teams_folder_url ?? "");
            }}
            disabled={saving}
            style={{
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
      ) : configured ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a
            href={client.external_links!.teams_folder_url!}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "var(--deep-green)",
              color: "var(--off-white)",
              padding: "10px 18px",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: "0.5px",
              whiteSpace: "nowrap",
            }}
          >
            Abrir carpeta OneDrive ↗
          </a>
          {isDirector && (
            <button
              onClick={() => setEditing(true)}
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
          onClick={() => setEditing(true)}
          style={{
            background: "transparent",
            border: "1px dashed rgba(10,26,12,0.25)",
            color: "var(--deep-green)",
            padding: "10px 18px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          + Configurar carpeta OneDrive
        </button>
      ) : (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontStyle: "italic",
          }}
        >
          Aún no configurada.
        </div>
      )}
    </div>
  );
}
