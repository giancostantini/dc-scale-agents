"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import ReportReviewPanel from "@/components/ReportReviewPanel";
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
  const [client, setClient] = useState<Client | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");

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

      // Si el director subió un PDF para esta versión, lo servimos
      // tal cual (canónico). No re-renderizamos desde markdown.
      if (report.pdf_path) {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("Sin sesión");

        const res = await fetch(
          `/api/phases/uploaded-pdf?clientId=${encodeURIComponent(id)}&phase=${key}&version=${report.version}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.signedUrl) {
          throw new Error(
            data?.error ?? `No se pudo obtener el PDF (HTTP ${res.status})`,
          );
        }

        // Descargar el blob desde la signed URL y forzar download local
        const pdfRes = await fetch(data.signedUrl);
        if (!pdfRes.ok) {
          throw new Error(`No se pudo bajar el PDF (HTTP ${pdfRes.status})`);
        }
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        // Nombre limpio tipo "Growth Diagnosis Plan WIZTRIP.pdf"
        a.download = `${meta?.reportName ?? phaseLabel} ${client.name}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }

      // Sin PDF subido: renderizamos desde el markdown (flujo original).
      // Lazy-load — react-pdf no entra en SSR
      const { pdf } = await import("@react-pdf/renderer");
      const PhaseReportPdf = (
        await import("@/components/PhaseReportPdf")
      ).default;

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
      a.download = `${meta?.reportName ?? phaseLabel} ${client.name}.pdf`;
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
      // Si hay PDF subido, antes de aprobar lo "sellamos" reemplazando
      // la palabra "Borrador" por "Aprobado" en la carátula. El resto
      // del diseño queda intacto. Si "Borrador" no aparece en el PDF,
      // stampApproved devuelve el blob original sin modificar.
      if (report?.pdf_path) {
        try {
          const supabase = getSupabase();
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) throw new Error("Sin sesión");

          // 1) Bajar PDF actual vía signed URL
          const sigRes = await fetch(
            `/api/phases/uploaded-pdf?clientId=${encodeURIComponent(id)}&phase=${phaseKey}&version=${report.version}`,
            { headers: { Authorization: `Bearer ${session.access_token}` } },
          );
          const sigData = await sigRes.json();
          if (!sigRes.ok || !sigData?.signedUrl) {
            throw new Error(sigData?.error ?? "No se pudo bajar el PDF actual.");
          }
          const pdfBlob = await fetch(sigData.signedUrl).then((r) => r.blob());

          // 2) Sellar — reemplazar "Borrador" por "Aprobado"
          const { stampApproved } = await import("@/lib/pdf-stamp-approved");
          const stampedBlob = await stampApproved(pdfBlob);

          // 3) Si el blob cambió de tamaño (=hubo modificación), re-subir.
          //    Si no, skip — "Borrador" no aparecía en el PDF.
          if (stampedBlob.size !== pdfBlob.size) {
            const fd = new FormData();
            fd.append("clientId", id);
            fd.append("phase", phaseKey);
            fd.append(
              "file",
              new File([stampedBlob], "approved.pdf", { type: "application/pdf" }),
            );
            const repRes = await fetch("/api/phases/replace-pdf", {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: fd,
            });
            if (!repRes.ok) {
              const e = await repRes.json().catch(() => ({}));
              console.warn(
                "[approve] no se pudo sellar el PDF, sigo aprobando:",
                e?.error,
              );
            }
          }
        } catch (stampErr) {
          // No bloqueamos la aprobación por un error de sellado —
          // logueamos y seguimos.
          console.warn("[approve] sellado del PDF falló:", stampErr);
        }
      }

      // 4) Aprobar normalmente
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

  async function unapprove() {
    if (busy) return;
    // Warning explícito si hay fases posteriores que cascadearán
    const warning =
      `¿Deshacer la aprobación de ${meta.reportName}?\n\n` +
      `El reporte vuelve a estado "draft" y se conserva el contenido. ` +
      `Si hay fases POSTERIORES aprobadas (basadas en esta), también ` +
      `volverán a draft automáticamente — no podés tener Estrategia ` +
      `aprobada sobre un Diagnóstico no aprobado.\n\n` +
      `¿Continuar?`;
    if (!confirm(warning)) return;
    setBusy(true);
    try {
      const result = (await callPhaseEndpoint("/api/phases/unapprove", {
        clientId: id,
        phase: phaseKey,
      })) as { cascaded?: number };
      const cascaded = result?.cascaded ?? 0;
      if (cascaded > 0) {
        alert(
          `Listo. También se revirtieron ${cascaded} fase${
            cascaded === 1 ? "" : "s"
          } posterior${cascaded === 1 ? "" : "es"} a draft.`,
        );
      }
      setReloadFlag((f) => f + 1);
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo deshacer:\n${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // ============================================================
  // applyAnalysisChanges
  // ============================================================
  // Toma el texto del análisis crítico generado por el agente y lo
  // usa como feedback para regenerar el reporte. Aprovecha el "modo
  // edición" del generate (preserva verbatim lo no tocado, solo
  // ajusta lo señalado por el análisis).
  async function applyAnalysisChanges(reviewText: string) {
    if (busy) return;
    if (
      !confirm(
        `¿Aplicar los cambios sugeridos por el análisis al reporte?\n\n` +
          `El agente va a tomar el análisis como feedback y regenerar la ` +
          `versión preservando lo que está bien y ajustando solo lo señalado. ` +
          `Cuando termine, se descarga automáticamente el PDF con los cambios ` +
          `(renderizado desde el contenido nuevo — si tenías un PDF custom subido, ` +
          `ese sigue intacto como canónico; el auto-download usa el diseño base ` +
          `del sistema).`,
      )
    )
      return;

    // Wrap del análisis como instrucción de feedback. El generate
    // endpoint detecta `feedback` + reporte previo y entra en modo
    // edición, así que solo cambia lo que el análisis pide.
    const wrappedFeedback =
      `Aplicar los cambios sugeridos por el siguiente análisis crítico ` +
      `interno del reporte. Atendé puntualmente los "huecos / debilidades" ` +
      `y la "sugerencia accionable". Preservá verbatim todo lo que el ` +
      `análisis NO toque.\n\n` +
      `=== ANÁLISIS ===\n\n${reviewText}\n\n=== FIN ANÁLISIS ===`;

    setBusy(true);
    try {
      // Paso 1: guardar feedback (marca como changes_requested)
      await callPhaseEndpoint("/api/phases/request-changes", {
        clientId: id,
        phase: phaseKey,
        feedback: wrappedFeedback,
      });
    } catch (err) {
      const e = err as Error;
      alert(
        `No se pudo guardar el feedback del análisis:\n\n${e.message}`,
      );
      setBusy(false);
      throw err;
    }

    let genResult: { contentMd?: string; version?: number } = {};
    try {
      // Paso 2: regenerar con el feedback. El endpoint devuelve
      // {success, version, contentMd, ...}
      genResult = (await callPhaseEndpoint("/api/phases/generate", {
        clientId: id,
        phase: phaseKey,
        feedback: wrappedFeedback,
      })) as { contentMd?: string; version?: number };
      setReloadFlag((f) => f + 1);
    } catch (err) {
      const e = err as Error;
      setReloadFlag((f) => f + 1);
      alert(
        `El feedback del análisis se guardó pero la regeneración falló:\n\n${e.message}\n\n` +
          `Volvé a clickear "Aplicar cambios del análisis" para reintentar.`,
      );
      setBusy(false);
      throw err;
    }

    // Paso 3: auto-descarga del PDF actualizado, renderizado desde
    // el contenido nuevo. NO usamos el pdf_path (que es el PDF custom
    // subido) porque ese no refleja los cambios; usamos el render
    // automático desde el content_md fresco que devolvió el generate.
    try {
      if (!genResult.contentMd || !client) {
        throw new Error(
          "El endpoint generate no devolvió contentMd — no se puede renderizar el PDF.",
        );
      }

      const phaseLabel =
        key === "diagnostico"
          ? "Diagnóstico"
          : key === "estrategia"
          ? "Estrategia"
          : key === "setup"
          ? "Setup"
          : "Lanzamiento";

      // Cargar logo (best-effort, igual que en downloadPdf)
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
        } catch {
          // Sigue sin logo
        }
      }

      const { pdf } = await import("@react-pdf/renderer");
      const PhaseReportPdf = (await import("@/components/PhaseReportPdf"))
        .default;
      const newVersion = genResult.version ?? (report?.version ?? 1) + 1;

      const blob = await pdf(
        <PhaseReportPdf
          phaseLabel={phaseLabel}
          reportName={meta?.reportName ?? phaseLabel}
          clientName={client.name}
          clientLogoUrl={logoDataUrl ?? undefined}
          generatedAt={new Date().toISOString()}
          approvedAt={null}
          version={newVersion}
          contentMd={genResult.contentMd}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${meta?.reportName ?? phaseLabel} ${client.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (downloadErr) {
      // El feedback ya se aplicó — solo falló la descarga. No es crítico.
      console.warn("[applyAnalysisChanges] auto-download falló:", downloadErr);
      alert(
        `Los cambios se aplicaron correctamente, pero la descarga automática ` +
          `del PDF falló. Bajalo manualmente desde "↓ Descargar PDF".`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitUpload() {
    if (uploading) return;
    if (!uploadFile) {
      alert("Elegí un archivo primero.");
      return;
    }
    setUploading(true);
    setUploadStatus("Preparando…");
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const fd = new FormData();
      fd.append("clientId", id);
      fd.append("phase", key);
      fd.append("file", uploadFile);

      // Si es PDF, extraemos texto en el cliente con pdfjs antes de
      // subir. El servidor guarda el PDF tal cual + el texto como
      // content_md (para que los agentes puedan leerlo después).
      const ext = uploadFile.name.toLowerCase().split(".").pop() ?? "";
      if (ext === "pdf") {
        setUploadStatus("Extrayendo texto del PDF…");
        const { extractPdfText } = await import("@/lib/pdf-extract");
        const text = await extractPdfText(uploadFile, (msg) =>
          setUploadStatus(msg),
        );
        if (!text || text.trim().length < 50) {
          throw new Error(
            "El PDF parece no tener capa de texto (¿es un escaneo?). " +
              "Abrilo en Word/Docs y re-exportá para que tenga texto.",
          );
        }
        fd.append("extractedText", text);
      }

      setUploadStatus("Subiendo al servidor…");
      const res = await fetch("/api/phases/upload-report", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      // Éxito: cerrar modal, limpiar y refrescar
      setUploadFile(null);
      setUploadOpen(false);
      setUploadStatus("");
      setReloadFlag((f) => f + 1);
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo subir el reporte:\n\n${e.message}`);
    } finally {
      setUploading(false);
      setUploadStatus("");
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

          {/* Confirmar (cuando hay draft) */}
          {isDraft && (
            <button
              className={ui.btnSolid}
              onClick={approve}
              disabled={busy}
              style={{ background: "var(--green-ok)" }}
            >
              ✓ Confirmar y desbloquear siguiente fase
            </button>
          )}

          {/* Deshacer aprobación — solo cuando la fase está aprobada */}
          {isApproved && (
            <button
              className={ui.btnGhost}
              onClick={unapprove}
              disabled={busy}
              style={{
                borderColor: "rgba(176, 75, 58, 0.35)",
                color: "var(--red-warn)",
                fontWeight: 600,
              }}
              title="Devolver esta fase (y las posteriores aprobadas) a draft para reconstruirla"
            >
              {busy ? "Deshaciendo…" : "↶ Deshacer aprobación"}
            </button>
          )}

          {/* Descargar PDF */}
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

          {/* Subir reporte editado afuera (Word/Docs/MD) */}
          {status !== "approved" && (
            <button
              className={ui.btnGhost}
              onClick={() => setUploadOpen(true)}
              style={{
                borderColor: "rgba(10,26,12,0.18)",
                color: "var(--deep-green)",
                fontSize: 12,
              }}
            >
              ↑ Subir reporte editado
            </button>
          )}
        </div>
      )}


      {/* Modal de subir reporte editado */}
      {uploadOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !uploading) {
              setUploadOpen(false);
              setUploadFile(null);
            }
          }}
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
              maxWidth: 560,
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
              Subir reporte editado
            </div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: 8,
              }}
            >
              Reemplazar este reporte con tu versión
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              Subí el <strong>PDF</strong> del reporte ya armado y editado.
              Queda canónico: cuando vos o el cliente descarguen el reporte,
              se sirve este PDF tal cual — sin re-renderizar. La versión
              anterior se archiva en el historial. El reporte queda como{" "}
              <strong>draft</strong> esperando confirmación.
            </p>

            {/* Formatos soportados */}
            <div
              style={{
                background: "var(--ivory)",
                border: "1px solid rgba(10,26,12,0.08)",
                padding: 12,
                marginBottom: 20,
                fontSize: 12,
                color: "var(--text-soft)",
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: "var(--deep-green)" }}>
                Formatos aceptados:
              </strong>
              <br />
              <code style={{ fontSize: 11 }}>.pdf</code> — recomendado.
              Queda guardado como el reporte oficial.
              <br />
              <code style={{ fontSize: 11 }}>.md</code> /{" "}
              <code style={{ fontSize: 11 }}>.txt</code> — texto plano (para
              casos donde solo querés actualizar contenido y dejar que el
              sistema re-renderice).
              <br />
              <span
                style={{ color: "var(--text-muted)", fontStyle: "italic" }}
              >
                Si el PDF es un escaneo sin capa de texto, los agentes no
                lo van a poder leer para regenerar después.
              </span>
            </div>

            {/* File input */}
            <label
              style={{
                display: "block",
                border: "2px dashed rgba(10,26,12,0.18)",
                padding: 24,
                textAlign: "center",
                cursor: "pointer",
                marginBottom: 24,
                background: uploadFile ? "rgba(196,168,130,0.08)" : "transparent",
                transition: "background 0.15s",
              }}
            >
              <input
                type="file"
                accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                disabled={uploading}
                style={{ display: "none" }}
              />
              {uploadFile ? (
                <>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--deep-green)",
                      marginBottom: 4,
                    }}
                  >
                    {uploadFile.name}
                  </div>
                  <div
                    style={{ fontSize: 11, color: "var(--text-muted)" }}
                  >
                    {(uploadFile.size / 1024).toFixed(1)} KB · Click para cambiar
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--deep-green)",
                      marginBottom: 4,
                    }}
                  >
                    Elegir archivo
                  </div>
                  <div
                    style={{ fontSize: 11, color: "var(--text-muted)" }}
                  >
                    .pdf (recomendado), .md o .txt — máx 50 MB
                  </div>
                </>
              )}
            </label>

            {/* Status text durante el upload */}
            {uploading && uploadStatus && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--sand-dark)",
                  marginBottom: 16,
                  textAlign: "center",
                  fontStyle: "italic",
                }}
              >
                {uploadStatus}
              </div>
            )}

            {/* Acciones */}
            <div
              style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}
            >
              <button
                className={ui.btnGhost}
                onClick={() => {
                  setUploadOpen(false);
                  setUploadFile(null);
                  setUploadStatus("");
                }}
                disabled={uploading}
              >
                Cancelar
              </button>
              <button
                className={ui.btnSolid}
                onClick={submitUpload}
                disabled={uploading || !uploadFile}
              >
                {uploading ? "Procesando…" : "Subir reporte"}
              </button>
            </div>
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
          <ReportReviewPanel
            clientId={id}
            phaseKey={key}
            contentMd={report.content_md}
            reviewMd={report.review_md}
            canApplyChanges={!isApproved && !isGenerating}
            onReviewUpdated={(newReview) =>
              setReport((prev) =>
                prev ? { ...prev, review_md: newReview } : prev,
              )
            }
            onApplyChanges={applyAnalysisChanges}
          />
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
