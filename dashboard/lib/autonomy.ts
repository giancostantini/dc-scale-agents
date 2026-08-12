// ==================== AUTONOMÍA SELECTIVA (Stage 6) — SERVER ONLY ====================
// El sistema MIDE si un tipo de output se ganó la autonomía con datos y
// AVISA cuando es elegible. Jamás promueve solo: cambiar mode es un UPDATE
// que hace un director en autonomy_settings. Rollback = volver a 'gated'.

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { addMonths, currentMonthUY } from "@/lib/tesoreria";

export interface AutonomySetting {
  output_type: string;
  mode: "gated" | "auto_sampled";
  sample_rate: number;
  threshold_pct: number;
  threshold_cycles: number;
  eligible_since: string | null;
  promoted_at: string | null;
}

const DEFAULT_SETTING: Omit<AutonomySetting, "output_type"> = {
  mode: "gated",
  sample_rate: 20,
  threshold_pct: 80,
  threshold_cycles: 3,
  eligible_since: null,
  promoted_at: null,
};

/** Setting de un tipo. Si la fila no existe (mig 093 sin correr, tipo
 *  nuevo), devuelve gated — el default es SIEMPRE el camino seguro. */
export async function getAutonomySetting(outputType: string): Promise<AutonomySetting> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("autonomy_settings")
    .select("*")
    .eq("output_type", outputType)
    .maybeSingle();
  if (!data) return { output_type: outputType, ...DEFAULT_SETTING };
  return data as AutonomySetting;
}

interface CycleMetric {
  cycle: string; // YYYY-MM
  total: number;
  approved: number;
  pct: number;
}

/** Aprobación de piezas IA por mes (content_posts source=ai). Un ciclo
 *  cuenta solo si hubo volumen mínimo — 5 piezas propuestas. */
async function contentPieceCycles(months: string[]): Promise<CycleMetric[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("content_posts")
    .select("date, status")
    .eq("source", "ai")
    .gte("date", `${months[months.length - 1]}-01`);
  const byMonth = new Map<string, { total: number; approved: number }>();
  for (const p of data ?? []) {
    const mk = (p.date as string).slice(0, 7);
    const agg = byMonth.get(mk) ?? { total: 0, approved: 0 };
    agg.total++;
    if (p.status === "scheduled" || p.status === "published") agg.approved++;
    byMonth.set(mk, agg);
  }
  return months
    .map((m) => {
      const agg = byMonth.get(m) ?? { total: 0, approved: 0 };
      return {
        cycle: m,
        total: agg.total,
        approved: agg.approved,
        pct: agg.total > 0 ? Math.round((100 * agg.approved) / agg.total) : 0,
      };
    })
    .filter((c) => c.total >= 5);
}

/** Fases aprobadas "a la primera o segunda" por mes (churn bajo = el draft
 *  IA sale bien). Ciclo válido con ≥2 fases aprobadas en el mes. */
async function phaseReportCycles(months: string[]): Promise<CycleMetric[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("phase_reports")
    .select("approved_at, version, status")
    .eq("status", "approved")
    .gte("approved_at", `${months[months.length - 1]}-01`);
  const byMonth = new Map<string, { total: number; approved: number }>();
  for (const r of data ?? []) {
    if (!r.approved_at) continue;
    const mk = (r.approved_at as string).slice(0, 7);
    const agg = byMonth.get(mk) ?? { total: 0, approved: 0 };
    agg.total++;
    if ((r.version ?? 1) <= 2) agg.approved++;
    byMonth.set(mk, agg);
  }
  return months
    .map((m) => {
      const agg = byMonth.get(m) ?? { total: 0, approved: 0 };
      return {
        cycle: m,
        total: agg.total,
        approved: agg.approved,
        pct: agg.total > 0 ? Math.round((100 * agg.approved) / agg.total) : 0,
      };
    })
    .filter((c) => c.total >= 2);
}

export interface EligibilityReview {
  output_type: string;
  mode: string;
  cycles: CycleMetric[];
  eligible: boolean;
  action: "marked_eligible" | "cleared" | "regression_alert" | "none";
}

/**
 * Review semanal: computa la aprobación sostenida por tipo y actualiza
 * eligible_since + notifica. Tres salidas posibles por tipo:
 *   - se volvió elegible → notification a socios (la promoción es de ellos)
 *   - dejó de ser elegible (y sigue gated) → se limpia el flag
 *   - está PROMOVIDO y cayó del umbral → alerta de rollback
 */
export async function reviewAutonomyEligibility(): Promise<EligibilityReview[]> {
  const admin = getSupabaseAdmin();
  const current = currentMonthUY();
  // Últimos 4 meses CERRADOS (el corriente no cuenta como ciclo).
  const months = [1, 2, 3, 4].map((i) => addMonths(current, -i));

  const measures: Record<string, CycleMetric[]> = {
    content_piece: await contentPieceCycles(months),
    phase_report: await phaseReportCycles(months),
    // monthly_report: sin señal de aprobación registrada todavía (el envío
    // es manual) — no se puede medir, así que no puede ser elegible.
    monthly_report: [],
  };

  const out: EligibilityReview[] = [];

  for (const [outputType, cycles] of Object.entries(measures)) {
    const setting = await getAutonomySetting(outputType);
    const recent = cycles.slice(0, setting.threshold_cycles);
    const eligible =
      recent.length >= setting.threshold_cycles &&
      recent.every((c) => c.pct >= setting.threshold_pct);

    let action: EligibilityReview["action"] = "none";

    if (setting.mode === "gated") {
      if (eligible && !setting.eligible_since) {
        await admin
          .from("autonomy_settings")
          .update({ eligible_since: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("output_type", outputType);
        await admin.from("notifications").upsert(
          {
            client: null,
            agent: "autonomy",
            level: "info",
            title: `'${outputType}' se ganó la autonomía con datos`,
            body: `Mantuvo ≥${setting.threshold_pct}% de aprobación durante ${setting.threshold_cycles} ciclos (${recent.map((c) => `${c.cycle}: ${c.pct}%`).join(" · ")}). Es ELEGIBLE para auto-con-muestreo — la promoción la deciden ustedes:\nUPDATE autonomy_settings SET mode='auto_sampled', promoted_at=now() WHERE output_type='${outputType}';\nRollback en cualquier momento: mode='gated'.`,
            link: "/finanzas",
            to_role: "director",
            email_sent: false,
            dedup_key: `autonomy-eligible-${outputType}-${current}`,
          },
          { onConflict: "dedup_key", ignoreDuplicates: true },
        );
        action = "marked_eligible";
      } else if (!eligible && setting.eligible_since) {
        await admin
          .from("autonomy_settings")
          .update({ eligible_since: null, updated_at: new Date().toISOString() })
          .eq("output_type", outputType);
        action = "cleared";
      }
    } else if (setting.mode === "auto_sampled" && !eligible) {
      // Promovido pero la métrica cayó → alerta de rollback (el sistema
      // NO degrada solo — también eso es decisión humana).
      await admin.from("notifications").upsert(
        {
          client: null,
          agent: "autonomy",
          level: "warning",
          title: `'${outputType}' cayó del umbral de autonomía`,
          body: `Está promovido a auto-con-muestreo pero la aprobación reciente quedó abajo del ${setting.threshold_pct}% (${recent.map((c) => `${c.cycle}: ${c.pct}%`).join(" · ") || "sin ciclos con volumen"}). Considerar rollback:\nUPDATE autonomy_settings SET mode='gated' WHERE output_type='${outputType}';`,
          link: "/finanzas",
          to_role: "director",
          email_sent: false,
          dedup_key: `autonomy-regression-${outputType}-${current}`,
        },
        { onConflict: "dedup_key", ignoreDuplicates: true },
      );
      action = "regression_alert";
    }

    out.push({ output_type: outputType, mode: setting.mode, cycles: recent, eligible, action });
  }

  return out;
}
