"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import { getClient } from "@/lib/storage";
import { getDownloadUrl } from "@/lib/upload";
import { getPhaseReport, phaseStatusLabel, phaseStatusColor } from "@/lib/phases";
import type { Client, OnboardingFile, PhaseKey, PhaseReport } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"];

function pickClientLogo(client: Client | null): OnboardingFile | string | null {
  if (!client) return null;
  const branding = client.onboarding?.brandingFiles ?? [];
  for (const f of branding) {
    const name = typeof f === "string" ? f : f.name;
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (IMAGE_EXTS.includes(ext)) return f;
  }
  return null;
}

function getPath(f: OnboardingFile | string): string {
  return typeof f === "string" ? f : f.path;
}

type FaseKey = PhaseKey | "kickoff";

const PHASE_TITLES: Record<FaseKey, { title: string; reportName: string; subtitle: string }> = {
  kickoff: {
    title: "Kickoff · Fuente de verdad",
    reportName: "Documentos del kickoff",
    subtitle:
      "Acá se cargan todos los inputs del cliente: kickoff document, branding, datos del negocio. De acá salen los reportes de las fases siguientes.",
  },
  diagnostico: {
    title: "Diagnóstico · Growth Diagnosis Plan",
    reportName: "Growth Diagnosis Plan",
    subtitle:
      "Auditoría del negocio. Benchmark de competidores. Análisis de activos digitales existentes. Identificación de oportunidades.",
  },
  estrategia: {
    title: "Estrategia · Growth Strategy Plan",
    reportName: "Growth Strategy Plan",
    subtitle:
      "Definición de buyer personas, posicionamiento, plan de medios, KPIs objetivo y roadmap táctico.",
  },
  setup: {
    title: "Setup técnico",
    reportName: "Checklist técnico",
    subtitle:
      "Configuración de tracking, pixel, cuentas de ads, CRM, integraciones, alimentación de agentes IA.",
  },
  lanzamiento: {
    title: "Lanzamiento · Growth Launch Plan",
    reportName: "Cronograma de activación",
    subtitle:
      "Cronograma día por día de los primeros 30 días operativos.",
  },
};

const PHASE_ORDER_INDEX: Record<FaseKey, number> = {
  kickoff: 0,
  diagnostico: 1,
  estrategia: 2,
  setup: 3,
  lanzamiento: 4,
};

export default function FaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; fase: string }>;
}) {
  const { id, fase } = use(params);
  const router = useRouter();

  const key = fase as FaseKey;
  const meta = PHASE_TITLES[key];

  const [report, setReport] = useState<PhaseReport | null | undefined>(undefined);
  const [isDirector, setIsDirector] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadFlag, setReloadFlag] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const profile = await getCurrentProfile();
      if (cancelled) return;
      setIsDirector(profile?.role === "director");
      const c = await getClient(id);
      if (cancelled) return;
      setClient(c ?? null);
      // Resolver el logo del cliente (signed URL — Claude PDF lo embebe)
      const logo = pickClientLogo(c ?? null);
      if (logo) {
        const u = await getDownloadUrl(getPath(logo));
        if (!cancelled) setLogoUrl(u);
      }
      if (key === "kickoff") {
        setReport(null);
        return;
      }
      const r = await getPhaseReport(id, key as PhaseKey);
      if (cancelled) return;
      setReport(r);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, key, reloadFlag]);

  async function downloadPdf() {
    if (!report || !report.content_md || !client) return;
    setDownloadingPdf(true);
    try {
      // Lazy-load — react-pdf no entra en SSR
      const { pdf } = await import("@react-pdf/renderer");
      const PhaseReportPdf = (
        await import("@/components/PhaseReportPdf")
      ).default;

      const phaseLabel =
        key === "diagnostico"
          ? "Diagnóstico"
          : key === "estrategia"
          ? "Estrategia"
          : key === "setup"
          ? "Setup"
          : key === "lanzamiento"
          ? "Lanzamiento"
          : "Reporte";

      // Convertir el logo del cliente a data URL antes de pasarlo al
      // PDF — evita CORS al embeber. Si falla (red, archivo borrado),
      // seguimos sin logo en lugar de romper la generación entera.
      let logoDataUrl: string | null = null;
      if (logoUrl) {
        try {
          const imgRes = await fetch(logoUrl);
          if (imgRes.ok) {
            const blobImg = await imgRes.blob();
            logoDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blobImg);
            });
          }
        } catch (e) {
          console.warn("[downloadPdf] no se pudo cargar el logo, sigue sin él:", e);
        }
      }

      const blob = await pdf(
        <PhaseReportPdf
          phaseLabel={phaseLabel}
          reportName={meta?.reportName ?? phaseLabel}
          clientName={client.name}
          clientLogoUrl={logoDataUrl ?? undefined}
          generatedAt={report.generated_at}
          approvedAt={report.approved_at}
          version={report.version}
          contentMd={report.content_md}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${phaseLabel}_${client.name.replace(/\s+/g, "_")}_v${report.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("downloadPdf error:", err);
      const e = err as Error;
      alert(
        `No se pudo generar el PDF.\n\n${e.message ?? "Error desconocido"}\n\nAbrí la consola (F12) y mandame el error.`,
      );
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function downloadPptx() {
    if (!report || !report.content_md || !client) return;
    setDownloadingPptx(true);
    try {
      const phaseLabel =
        key === "diagnostico"
          ? "Diagnóstico"
          : key === "estrategia"
          ? "Estrategia"
          : key === "setup"
          ? "Setup"
          : key === "lanzamiento"
          ? "Lanzamiento"
          : "Reporte";

      // Convertir el logo del cliente a data URL (mismo flujo que el PDF)
      let logoDataUrl: string | null = null;
      if (logoUrl) {
        try {
          const imgRes = await fetch(logoUrl);
          if (imgRes.ok) {
            const blobImg = await imgRes.blob();
            logoDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blobImg);
            });
          }
        } catch (e) {
          console.warn("[downloadPptx] no se pudo cargar el logo, sigue sin él:", e);
        }
      }

      // Lazy import — pptxgenjs es ~700 KB, fuera del bundle inicial
      const { buildPhaseReportPptx } = await import(
        "@/lib/phase-report-pptx"
      );

      const blob = await buildPhaseReportPptx({
        phaseLabel,
        reportName: meta?.reportName ?? phaseLabel,
        clientName: client.name,
        clientLogoDataUrl: logoDataUrl,
        generatedAt: report.generated_at,
        approvedAt: report.approved_at,
        version: report.version,
        contentMd: report.content_md,
        isBrandLaunch: client.onboarding?.isBrandLaunch === true,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${phaseLabel}_${client.name.replace(/\s+/g, "_")}_v${report.version}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("downloadPptx error:", err);
      const e = err as Error;
      alert(
        `No se pudo generar la presentación.\n\n${e.message ?? "Error desconocido"}\n\nAbrí la consola (F12) y mandame el error.`,
      );
    } finally {
      setDownloadingPptx(false);
    }
  }

  // Polling cuando está generando
  useEffect(() => {
    if (report?.status !== "generating") return;
    const interval = setInterval(() => setReloadFlag((f) => f + 1), 5000);
    return () => clearInterval(interval);
  }, [report?.status]);

  if (!meta) {
    return (
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Fase no encontrada</div>
          <h1>404</h1>
        </div>
        <button
          className={ui.btnSolid}
          onClick={() => router.push(`/cliente/${id}/fases`)}
        >
          ← Volver a fases
        </button>
      </div>
    );
  }

  // ===== Kickoff: vista especial sin generador =====
  if (key === "kickoff") {
    return (
      <>
        <Header
          eyebrow="Fase 00 · Kickoff"
          title={meta.title}
          subtitle={meta.subtitle}
          onBack={() => router.push(`/cliente/${id}/fases`)}
        />
        <div
          className={ui.panel}
          style={{ borderLeft: "3px solid var(--sand)" }}
        >
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>Documentos cargados</div>
          </div>
          <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Andá a <strong>Biblioteca → carpeta Onboarding</strong> para ver
            los archivos del kickoff y el branding cargados en el wizard de
            creación. El agente del Diagnóstico los lee automáticamente cuando
            generás esa fase.
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button
              className={ui.btnSolid}
              onClick={() => router.push(`/cliente/${id}/biblioteca`)}
            >
              Ir a Biblioteca →
            </button>
            <button
              className={ui.btnGhost}
              onClick={() => router.push(`/cliente/${id}/fases`)}
            >
              ← Volver a fases
            </button>
          </div>
        </div>
      </>
    );
  }

  // ===== Fases con reporte =====
  const phaseKey = key as PhaseKey;
  const idxPhase = PHASE_ORDER_INDEX[phaseKey];
  const status = report?.status ?? "pending";
  const isApproved = status === "approved";
  const isDraft = status === "draft";
  const isGenerating = status === "generating";
  const isChangesRequested = status === "changes_requested";
  const hasContent = report?.content_md && report.content_md.length > 0;

  // ===== Acciones =====

  async function callPhaseEndpoint(
    endpoint: string,
    body: Record<string, unknown>,
  ) {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Sin sesión");

    // Network-level failure ("Failed to fetch") es un TypeError que tira
    // fetch() antes de tener Response. Lo reescribimos con contexto para
    // que en el alert se vea qué endpoint murió y por qué (offline,
    // función timeoutada, deploy en curso, etc).
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (netErr) {
      const cause = netErr instanceof Error ? netErr.message : String(netErr);
      console.error("[callPhaseEndpoint] network error", endpoint, netErr);
      throw new Error(
        `Red caída o función no respondió (${endpoint}): ${cause}. ` +
          `Probá de nuevo; si persiste, revisá Network tab.`,
      );
    }

    // Si el body no es JSON parseable (HTML 404, página de error de Vercel,
    // respuesta vacía por timeout) damos un mensaje claro con el status.
    let data: {
      error?: unknown;
      detail?: unknown;
      extra?: unknown;
      hint?: unknown;
    } = {};
    try {
      data = await res.json();
    } catch {
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status} ${res.statusText} (${endpoint}) — respuesta sin JSON.`,
        );
      }
      // 2xx sin body: lo tratamos como éxito vacío.
      return {};
    }

    if (!res.ok) {
      // Concatenar error + detail para que el usuario vea TODO en el alert.
      const parts = [data?.error, data?.detail, data?.extra, data?.hint]
        .filter(Boolean)
        .map((p) => String(p));
      const msg = parts.length > 0 ? parts.join("\n— ") : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function generate(feedback?: string) {
    if (busy) return;
    setBusy(true);
    try {
      // Marca optimista de "generating" para UI inmediata
      setReport((prev) => ({
        ...(prev ?? ({} as PhaseReport)),
        status: "generating",
      }));
      await callPhaseEndpoint("/api/phases/generate", {
        clientId: id,
        phase: phaseKey,
        feedback,
      });
      setReloadFlag((f) => f + 1);
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo generar el reporte:\n${e.message}`);
      setReloadFlag((f) => f + 1);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (busy) return;
    if (!confirm(`Confirmar el reporte de ${meta.reportName}?\n\nUna vez aprobado se desbloquea la siguiente fase.`)) return;
    setBusy(true);
    try {
      await callPhaseEndpoint("/api/phases/approve", {
        clientId: id,
        phase: phaseKey,
      });
      setReloadFlag((f) => f + 1);
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo aprobar:\n${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitChangesRequest() {
    if (busy) return;
    if (!feedbackText.trim()) {
      alert("Escribí qué cambios querés.");
      return;
    }
    setBusy(true);

    // Paso 1: guardar el feedback (marca como changes_requested).
    // Si falla, abortamos antes de regenerar — al menos el feedback
    // no se pierde porque ni se llegó a guardar en el draft anterior.
    try {
      await callPhaseEndpoint("/api/phases/request-changes", {
        clientId: id,
        phase: phaseKey,
        feedback: feedbackText.trim(),
      });
    } catch (err) {
      const e = err as Error;
      alert(
        `No se pudo guardar el feedback:\n\n${e.message}\n\n` +
          `El reporte sigue en su estado anterior. Probá de nuevo en unos segundos.`,
      );
      setBusy(false);
      return;
    }

    // Paso 2: regenerar con el feedback como contexto.
    // Si esto falla (rate limit, créditos, etc), el feedback ya quedó
    // guardado — el director puede reintentar con "Regenerar con feedback"
    // sin tener que reescribirlo.
    try {
      await callPhaseEndpoint("/api/phases/generate", {
        clientId: id,
        phase: phaseKey,
        feedback: feedbackText.trim(),
      });
      // Éxito en ambos pasos — limpiamos y cerramos el modal.
      setFeedbackText("");
      setFeedbackOpen(false);
      setReloadFlag((f) => f + 1);
    } catch (err) {
      const e = err as Error;
      // El feedback YA está guardado; falla solo la regeneración.
      // Cerramos el modal pero refrescamos para mostrar el banner
      // de "changes_requested" con el feedback persistido.
      setFeedbackText("");
      setFeedbackOpen(false);
      setReloadFlag((f) => f + 1);
      alert(
        `Tu feedback se guardó, pero la regeneración falló:\n\n${e.message}\n\n` +
          `Click en "Regenerar con feedback" cuando quieras reintentar (no hace falta reescribirlo).`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header
        eyebrow={`Fase 0${idxPhase} · ${meta.reportName}`}
        title={meta.title}
        subtitle={meta.subtitle}
        onBack={() => router.push(`/cliente/${id}/fases`)}
      />

      {/* Status banner */}
      <StatusBanner
        status={status}
        version={report?.version ?? 1}
        generatedAt={report?.generated_at}
        isDirector={isDirector}
      />

      {/* Acciones (director) */}
      {isDirector && !isGenerating && (
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          {/* Generar (cuando aún no hay reporte o está pending) */}
          {(!report || status === "pending") && (
            <button
              className={ui.btnSolid}
              onClick={() => generate()}
              disabled={busy}
            >
              {busy ? "Generando…" : `⚡ Generar ${meta.reportName}`}
            </button>
          )}

          {/* Confirmar / Proponer cambios (cuando hay draft) */}
          {isDraft && (
            <>
              <button
                className={ui.btnSolid}
                onClick={approve}
                disabled={busy}
                style={{ background: "var(--green-ok)" }}
              >
                ✓ Confirmar y desbloquear siguiente fase
              </button>
              <button
                className={ui.btnGhost}
                onClick={() => setFeedbackOpen(true)}
                disabled={busy}
              >
                ↻ Proponer cambios
              </button>
            </>
          )}

          {/* Regenerar tras cambios solicitados */}
          {isChangesRequested && (
            <button
              className={ui.btnSolid}
              onClick={() => generate(report?.feedback ?? undefined)}
              disabled={busy}
            >
              {busy ? "Regenerando…" : "↻ Regenerar con feedback"}
            </button>
          )}

          {/* Re-generar desde cero (cualquier estado distinto a generating) */}
          {hasContent && status !== "approved" && (
            <button
              className={ui.btnGhost}
              onClick={() => {
                if (
                  confirm(
                    "¿Regenerar el reporte desde cero, ignorando cambios actuales?",
                  )
                ) {
                  generate();
                }
              }}
              disabled={busy}
              style={{ fontSize: 11 }}
            >
              Regenerar desde cero
            </button>
          )}

          {/* Descargar PDF — al lado de los demás botones de acción */}
          {hasContent && (
            <button
              className={ui.btnGhost}
              onClick={downloadPdf}
              disabled={downloadingPdf}
              style={{
                borderColor: "var(--sand)",
                color: "var(--deep-green)",
                fontWeight: 600,
              }}
            >
              {downloadingPdf ? "Generando PDF…" : "↓ Descargar PDF"}
            </button>
          )}

          {/* Descargar PPT — para presentar al cliente */}
          {hasContent && (
            <button
              className={ui.btnGhost}
              onClick={downloadPptx}
              disabled={downloadingPptx}
              style={{
                borderColor: "var(--sand)",
                color: "var(--deep-green)",
                fontWeight: 600,
              }}
            >
              {downloadingPptx
                ? "Generando PPT…"
                : "↓ Descargar PPT (10 slides)"}
            </button>
          )}
        </div>
      )}

      {/* Modal de feedback */}
      {feedbackOpen && (
        <div
          onClick={(e) =>
            e.target === e.currentTarget && setFeedbackOpen(false)
          }
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,26,12,0.6)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 40,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--white)",
              maxWidth: 620,
              width: "100%",
              padding: 36,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              Proponer cambios al reporte
            </div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: 8,
              }}
            >
              ¿Qué te gustaría que ajuste?
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              Sé específico. El agente toma este feedback y regenera el
              reporte aplicando los cambios.
            </p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={6}
              autoFocus
              placeholder="Ej: La sección de competidores tiene que enfocarse en empresas LATAM, no globales. El benchmark táctico que armaste para el sector está bien pero falta incluir TikTok como canal a explorar."
              style={{
                width: "100%",
                background: "var(--ivory)",
                border: "1px solid rgba(10,26,12,0.12)",
                padding: 14,
                color: "var(--deep-green)",
                fontSize: 14,
                fontWeight: 300,
                outline: "none",
                fontFamily: "inherit",
                resize: "vertical",
                marginBottom: 20,
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                className={ui.btnGhost}
                onClick={() => {
                  setFeedbackOpen(false);
                  setFeedbackText("");
                }}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className={ui.btnSolid}
                onClick={submitChangesRequest}
                disabled={busy}
              >
                {busy ? "Regenerando…" : "Enviar y regenerar →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback histórico (si hay) */}
      {report?.feedback && status === "changes_requested" && (
        <div
          style={{
            padding: "14px 18px",
            background: "rgba(176,75,58,0.06)",
            borderLeft: "3px solid var(--red-warn)",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--red-warn)",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Cambios solicitados
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--deep-green)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {report.feedback}
          </div>
        </div>
      )}

      {/* Contenido del reporte */}
      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>{meta.reportName}</div>
          {report?.usage ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Generado · {(report.usage as { input?: number }).input ?? 0}
              t input · {(report.usage as { output?: number }).output ?? 0}t
              output
            </div>
          ) : null}
        </div>

        {isGenerating ? (
          <div
            style={{
              padding: 64,
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <div
              style={{
                fontSize: 32,
                color: "var(--sand)",
                marginBottom: 12,
              }}
            >
              ⏳
            </div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              Generando con Claude…
            </div>
            <div style={{ fontSize: 12 }}>
              Esto tarda 30-60 segundos. La página se actualiza sola.
            </div>
          </div>
        ) : !hasContent ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              background: "var(--off-white)",
              borderLeft: "3px solid var(--sand)",
            }}
          >
            {status === "pending"
              ? `Listo para generar el ${meta.reportName}.${
                  isDirector ? " Click en el botón de arriba." : ""
                }`
              : "Sin contenido todavía."}
          </div>
        ) : (
          <MarkdownRenderer content={report.content_md ?? ""} shiftHeadings />
        )}
      </div>
    </>
  );
}

function Header({
  eyebrow,
  title,
  subtitle,
  onBack,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>{eyebrow}</div>
          <h1>{title}</h1>
        </div>
        <button className={ui.btnSolid} onClick={onBack}>
          ← Volver a fases
        </button>
      </div>
      <div
        style={{
          background: "var(--deep-green)",
          color: "var(--off-white)",
          padding: 24,
          marginBottom: 24,
          borderLeft: "3px solid var(--sand)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--sand)",
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          ▢ Qué incluye esta fase
        </div>
        <div
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "rgba(232,228,220,0.9)",
          }}
        >
          {subtitle}
        </div>
      </div>
    </>
  );
}

function StatusBanner({
  status,
  version,
  generatedAt,
  isDirector,
}: {
  status: string;
  version: number;
  generatedAt?: string | null;
  isDirector: boolean;
}) {
  const color = phaseStatusColor(status as PhaseReport["status"]);
  const label = phaseStatusLabel(status as PhaseReport["status"]);

  return (
    <div
      style={{
        padding: "12px 18px",
        background: "var(--off-white)",
        borderLeft: `3px solid ${color}`,
        marginBottom: 16,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color,
            fontWeight: 700,
          }}
        >
          ● {label}
        </span>
        {version > 1 && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Versión {version}
          </span>
        )}
        {generatedAt && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Última generación · {new Date(generatedAt).toLocaleString("es-AR")}
          </span>
        )}
      </div>
      {!isDirector && status !== "approved" && (
        <span
          style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}
        >
          Solo el director puede aprobar o pedir cambios.
        </span>
      )}
    </div>
  );
}
