"use client";

/**
 * ReportesView — grid de reportes financieros estilo Mercury/Ramp.
 * Reemplaza la vista clásica "Estados financieros".
 *
 * Cada card representa un tipo de reporte. Click en "Generar" llama
 * al endpoint /api/finanzas/generate-report con el reportKey, el
 * agente IA construye el reporte basado en toda la data del negocio,
 * y se muestra en un modal premium con editor + copy/download.
 */

import { useEffect, useState } from "react";
import {
  Calendar,
  BarChart3,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Users,
  BookOpen,
  Layers,
  Percent,
  DollarSign,
  Minus,
  Plus,
  Briefcase,
  Tag,
  PieChart,
  ArrowRightLeft,
  Target,
  Sliders,
  FileText,
  Copy,
  Download,
  X,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/premium/Button";
import { Modal } from "@/components/premium/Modal";
import { Field, Input } from "@/components/premium/Field";
import { cn } from "@/lib/cn";

type Category = "financiero" | "contable" | "impositivo" | "gestion";

interface ReportCard {
  key: string;
  title: string;
  description: string;
  category: Category;
  icon: React.ReactNode;
  /** Color del icono (Tailwind text-* class). */
  iconColor: string;
  /** Fondo del icono (Tailwind bg-* class). */
  iconBg: string;
}

const REPORTS: ReportCard[] = [
  {
    key: "balance_general",
    title: "Balance General",
    description: "Estado de situación financiera a una fecha determinada.",
    category: "financiero",
    icon: <Calendar className="w-5 h-5" />,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
  },
  {
    key: "estado_resultados",
    title: "Estado de Resultados",
    description: "Resumen de ingresos, costos y gastos en un período.",
    category: "financiero",
    icon: <BarChart3 className="w-5 h-5" />,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
  },
  {
    key: "flujo_caja",
    title: "Flujo de Caja",
    description: "Evolución de entradas y salidas de efectivo.",
    category: "financiero",
    icon: <ArrowLeftRight className="w-5 h-5" />,
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
  },
  {
    key: "evolucion_ingresos",
    title: "Evolución de Ingresos",
    description: "Análisis de ingresos por período y comparación.",
    category: "financiero",
    icon: <TrendingUp className="w-5 h-5" />,
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
  },
  {
    key: "evolucion_gastos",
    title: "Evolución de Gastos",
    description: "Análisis de gastos por período y categorías.",
    category: "financiero",
    icon: <TrendingDown className="w-5 h-5" />,
    iconColor: "text-red-600",
    iconBg: "bg-red-50",
  },
  {
    key: "cuentas_por_cobrar",
    title: "Cuentas por Cobrar",
    description: "Listado de clientes y saldos pendientes.",
    category: "financiero",
    icon: <Users className="w-5 h-5" />,
    iconColor: "text-violet-600",
    iconBg: "bg-violet-50",
  },
  {
    key: "cuentas_por_pagar",
    title: "Cuentas por Pagar",
    description: "Listado de proveedores y saldos pendientes.",
    category: "financiero",
    icon: <Users className="w-5 h-5" />,
    iconColor: "text-orange-600",
    iconBg: "bg-orange-50",
  },
  {
    key: "libro_diario",
    title: "Libro Diario",
    description: "Detalle de movimientos contables.",
    category: "contable",
    icon: <BookOpen className="w-5 h-5" />,
    iconColor: "text-blue-700",
    iconBg: "bg-blue-50",
  },
  {
    key: "libro_mayor",
    title: "Libro Mayor",
    description: "Movimientos agrupados por cuenta contable.",
    category: "contable",
    icon: <Layers className="w-5 h-5" />,
    iconColor: "text-slate-700",
    iconBg: "bg-slate-100",
  },
  {
    key: "iva_ventas",
    title: "IVA Ventas",
    description: "Resumen de IVA ventas por período.",
    category: "impositivo",
    icon: <Percent className="w-5 h-5" />,
    iconColor: "text-purple-600",
    iconBg: "bg-purple-50",
  },
  {
    key: "iva_compras",
    title: "IVA Compras",
    description: "Resumen de IVA compras por período.",
    category: "impositivo",
    icon: <Percent className="w-5 h-5" />,
    iconColor: "text-fuchsia-600",
    iconBg: "bg-fuchsia-50",
  },
  {
    key: "impuesto_renta",
    title: "Impuesto a la Renta",
    description: "Cálculo y resumen del impuesto a la renta.",
    category: "impositivo",
    icon: <DollarSign className="w-5 h-5" />,
    iconColor: "text-rose-600",
    iconBg: "bg-rose-50",
  },
  {
    key: "retenciones",
    title: "Retenciones",
    description: "Resumen de retenciones sufridas y practicadas.",
    category: "impositivo",
    icon: <Minus className="w-5 h-5" />,
    iconColor: "text-violet-700",
    iconBg: "bg-violet-50",
  },
  {
    key: "percepciones",
    title: "Percepciones",
    description: "Resumen de percepciones por período.",
    category: "impositivo",
    icon: <Plus className="w-5 h-5" />,
    iconColor: "text-orange-700",
    iconBg: "bg-orange-50",
  },
  {
    key: "facturacion_por_cliente",
    title: "Facturación por Cliente",
    description: "Detalle de facturación agrupada por cliente.",
    category: "gestion",
    icon: <Briefcase className="w-5 h-5" />,
    iconColor: "text-emerald-700",
    iconBg: "bg-emerald-50",
  },
  {
    key: "facturacion_por_servicio",
    title: "Facturación por Producto/Servicio",
    description: "Detalle de facturación por productos o servicios.",
    category: "gestion",
    icon: <Tag className="w-5 h-5" />,
    iconColor: "text-cyan-700",
    iconBg: "bg-cyan-50",
  },
  {
    key: "gastos_por_categoria",
    title: "Gastos por Categoría",
    description: "Análisis de gastos agrupados por categoría.",
    category: "gestion",
    icon: <PieChart className="w-5 h-5" />,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
  },
  {
    key: "comparativo_periodos",
    title: "Comparativo Períodos",
    description: "Comparación de resultados entre períodos.",
    category: "gestion",
    icon: <ArrowRightLeft className="w-5 h-5" />,
    iconColor: "text-indigo-700",
    iconBg: "bg-indigo-50",
  },
  {
    key: "presupuesto_vs_real",
    title: "Presupuesto vs Real",
    description: "Comparación entre presupuesto y valores reales.",
    category: "gestion",
    icon: <Target className="w-5 h-5" />,
    iconColor: "text-teal-700",
    iconBg: "bg-teal-50",
  },
  {
    key: "personalizado",
    title: "Personalizado",
    description: "Creá tu propio reporte personalizado.",
    category: "gestion",
    icon: <Sliders className="w-5 h-5" />,
    iconColor: "text-slate-700",
    iconBg: "bg-slate-100",
  },
];

const TABS: { key: "todos" | Category; label: string }[] = [
  { key: "todos", label: "Todos los Reportes" },
  { key: "financiero", label: "Financieros" },
  { key: "contable", label: "Contables" },
  { key: "impositivo", label: "Impositivos" },
  { key: "gestion", label: "Gestión" },
];

export default function ReportesView() {
  const [tab, setTab] = useState<"todos" | Category>("todos");
  const [activeReport, setActiveReport] = useState<ReportCard | null>(null);
  const [customModal, setCustomModal] = useState(false);
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01`;
  });
  const [periodTo, setPeriodTo] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [resultModal, setResultModal] = useState<{
    title: string;
    markdown: string;
  } | null>(null);

  const filtered =
    tab === "todos" ? REPORTS : REPORTS.filter((r) => r.category === tab);

  function startReport(report: ReportCard) {
    if (report.key === "personalizado") {
      setCustomModal(true);
      return;
    }
    setActiveReport(report);
    setInstructions("");
  }

  async function generate(report: ReportCard) {
    setGenerating(true);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");
      const res = await fetch("/api/finanzas/generate-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          reportKey: report.key,
          instructions: instructions.trim() || undefined,
          periodFrom,
          periodTo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          [data?.error, data?.detail].filter(Boolean).join(" — "),
        );
      }
      toast.success(`Reporte "${data.title}" generado`);
      setActiveReport(null);
      setCustomModal(false);
      setResultModal({ title: data.title, markdown: data.markdown });
    } catch (err) {
      const e = err as Error;
      toast.error(`Error generando reporte: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  }

  function copyResult() {
    if (!resultModal) return;
    navigator.clipboard.writeText(resultModal.markdown);
    toast.success("Reporte copiado al portapapeles");
  }

  function downloadMarkdown() {
    if (!resultModal) return;
    const blob = new Blob([resultModal.markdown], {
      type: "text/markdown;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = resultModal.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    a.download = `${safeName}-${periodFrom}_${periodTo}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink tracking-tight">
            Reportes
          </h1>
          <p className="text-sm text-ink-300 mt-1">
            Generá y descargá informes financieros y contables.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="md">
            <FileText className="w-4 h-4" />
            Reportes Personalizados
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => setCustomModal(true)}
          >
            <Plus className="w-4 h-4" />
            Nuevo Reporte
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-rule flex items-center gap-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "py-3 text-sm font-medium transition-colors relative",
              tab === t.key
                ? "text-ink"
                : "text-ink-300 hover:text-ink-500",
            )}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-ink rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((r) => (
          <ReportCardEl key={r.key} report={r} onGenerate={startReport} />
        ))}
      </div>

      {/* Modal: configurar período + generar */}
      {activeReport && (
        <Modal
          open
          onClose={() => !generating && setActiveReport(null)}
          title={`Generar: ${activeReport.title}`}
          description={activeReport.description}
          size="md"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setActiveReport(null)}
                disabled={generating}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => generate(activeReport)}
                loading={generating}
              >
                <Sparkles className="w-4 h-4" />
                Generar con IA
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Período desde" required>
                <Input
                  type="month"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  disabled={generating}
                />
              </Field>
              <Field label="Período hasta" required>
                <Input
                  type="month"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  disabled={generating}
                />
              </Field>
            </div>
            <Field
              label="Instrucciones extra (opcional)"
              hint="Cualquier ajuste o foco específico que quieras pedirle al agente."
            >
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                disabled={generating}
                placeholder='Ej: "Centrate en clientes GP", "Mostrá comparación vs mismo mes del año pasado".'
                className="w-full px-3 py-2 text-sm bg-paper border border-rule rounded-premium-sm placeholder-ink-300 text-ink focus:outline-none focus:border-ink-400 focus:shadow-ring-ink transition-all resize-y"
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* Modal: reporte personalizado (free-form) */}
      {customModal && (
        <Modal
          open
          onClose={() => !generating && setCustomModal(false)}
          title="Reporte Personalizado"
          description="Describí qué reporte querés que arme el agente. Tiene acceso a toda la data del negocio."
          size="lg"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setCustomModal(false)}
                disabled={generating}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  generate({
                    key: "personalizado",
                    title: "Reporte Personalizado",
                    description: instructions.trim(),
                    category: "gestion",
                    icon: null,
                    iconColor: "",
                    iconBg: "",
                  })
                }
                loading={generating}
                disabled={!instructions.trim()}
              >
                <Sparkles className="w-4 h-4" />
                Generar con IA
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Período desde" required>
                <Input
                  type="month"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  disabled={generating}
                />
              </Field>
              <Field label="Período hasta" required>
                <Input
                  type="month"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  disabled={generating}
                />
              </Field>
            </div>
            <Field label="Descripción del reporte" required>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={6}
                disabled={generating}
                placeholder='Ej: "Analizame la rentabilidad por cliente del primer semestre, ranking de los más rentables y de los menos rentables, con recomendación de qué hacer con cada grupo."'
                className="w-full px-3 py-2 text-sm bg-paper border border-rule rounded-premium-sm placeholder-ink-300 text-ink focus:outline-none focus:border-ink-400 focus:shadow-ring-ink transition-all resize-y"
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* Modal de resultado */}
      {resultModal && (
        <Modal
          open
          onClose={() => setResultModal(null)}
          title={resultModal.title}
          description={`Período: ${periodFrom} → ${periodTo}`}
          size="xl"
          footer={
            <>
              <Button variant="ghost" onClick={() => setResultModal(null)}>
                Cerrar
              </Button>
              <Button variant="secondary" onClick={copyResult}>
                <Copy className="w-4 h-4" />
                Copiar
              </Button>
              <Button variant="primary" onClick={downloadMarkdown}>
                <Download className="w-4 h-4" />
                Descargar .md
              </Button>
            </>
          }
        >
          <div className="prose-premium">
            <MarkdownPreview md={resultModal.markdown} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function ReportCardEl({
  report,
  onGenerate,
}: {
  report: ReportCard;
  onGenerate: (r: ReportCard) => void;
}) {
  return (
    <div className="group bg-paper border border-rule rounded-premium p-5 transition-all duration-150 hover:border-rule-strong hover:shadow-premium flex flex-col">
      <div
        className={cn(
          "w-10 h-10 rounded-premium-sm flex items-center justify-center mb-4",
          report.iconBg,
          report.iconColor,
        )}
      >
        {report.icon}
      </div>
      <div className="text-md font-semibold text-ink tracking-tight">
        {report.title}
      </div>
      <div className="text-xs text-ink-300 mt-1.5 flex-1 leading-relaxed">
        {report.description}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="mt-4 w-fit"
        onClick={() => onGenerate(report)}
      >
        <FileText className="w-3.5 h-3.5" />
        Generar
      </Button>
    </div>
  );
}

/** Render markdown muy básico (no instala lib externa) — soporta H1-H3, párrafos, listas, tablas, bold, italic. */
function MarkdownPreview({ md }: { md: string }) {
  // Render mínimo - solo escape + line breaks + bold/italic
  function esc(s: string) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function inline(s: string) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(
        /\[(.+?)\]\((.+?)\)/g,
        '<a href="$2" class="text-accent-dim underline" target="_blank">$1</a>',
      );
  }

  const html: string[] = [];
  const lines = md.split("\n");
  let inTable = false;
  let inList = false;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      if (inTable) { html.push("</tbody></table>"); inTable = false; }
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h1 class="text-2xl font-semibold text-ink mt-2 mb-4">${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      if (inTable) { html.push("</tbody></table>"); inTable = false; }
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h2 class="text-lg font-semibold text-ink mt-6 mb-2 pb-1 border-b border-rule">${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      if (inTable) { html.push("</tbody></table>"); inTable = false; }
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h3 class="text-sm font-semibold text-ink-500 mt-4 mb-1 uppercase tracking-wider">${inline(line.slice(4))}</h3>`);
    } else if (/^\|.+\|$/.test(line) && /^\|[\s\-:]+\|/.test(lines[lines.indexOf(line) + 1] ?? "")) {
      // Table header
      if (inList) { html.push("</ul>"); inList = false; }
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      html.push('<table class="w-full text-xs my-3 border-collapse"><thead><tr>');
      for (const c of cells) {
        html.push(`<th class="text-left px-3 py-2 font-semibold border-b border-rule bg-paper-100">${inline(c)}</th>`);
      }
      html.push("</tr></thead><tbody>");
      inTable = true;
    } else if (inTable && /^\|[\s\-:]+\|/.test(line)) {
      // skip separator
    } else if (inTable && /^\|.+\|$/.test(line)) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      html.push("<tr>");
      for (const c of cells) {
        html.push(`<td class="px-3 py-2 border-b border-rule-soft text-ink">${inline(c)}</td>`);
      }
      html.push("</tr>");
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (inTable) { html.push("</tbody></table>"); inTable = false; }
      if (!inList) {
        html.push('<ul class="list-disc pl-6 space-y-1 my-2 text-sm text-ink">');
        inList = true;
      }
      html.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
    } else if (line.trim() === "") {
      if (inTable) { html.push("</tbody></table>"); inTable = false; }
      if (inList) { html.push("</ul>"); inList = false; }
    } else {
      if (inTable) { html.push("</tbody></table>"); inTable = false; }
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<p class="text-sm text-ink leading-relaxed my-2">${inline(line)}</p>`);
    }
  }
  if (inTable) html.push("</tbody></table>");
  if (inList) html.push("</ul>");

  return (
    <div
      className="space-y-1"
      dangerouslySetInnerHTML={{ __html: html.join("\n") }}
    />
  );
}
