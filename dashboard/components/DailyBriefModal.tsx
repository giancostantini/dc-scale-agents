"use client";

/**
 * DailyBriefModal — popup que salta una vez por día al entrar.
 *
 * Muestra un resumen MUY breve del día + las cosas pendientes según el
 * rol del viewer:
 *   · Socios (director): pendientes de CLIENTES + FINANZAS + EQUIPO.
 *   · Equipo: solo pendientes de los clientes que tienen asignados.
 *
 * Se muestra una sola vez por día (localStorage por usuario + fecha).
 * Todo el cálculo es local (sin LLM). Si ya se mostró hoy, NO hace
 * ningún fetch — sale temprano.
 */

import { useEffect, useState } from "react";
import { getCurrentProfile, type Profile } from "@/lib/supabase/auth";
import {
  getClients,
  getAllTasks,
  getPayments,
  getExpenses,
} from "@/lib/storage";
import { listAllAssignments, listProfiles } from "@/lib/team";
import { listDividendDistributions } from "@/lib/finanzas";
import { getSupabase } from "@/lib/supabase/client";
import type { DevTask } from "@/lib/types";

interface BriefData {
  firstName: string;
  isDirector: boolean;
  // Pendientes de clientes (ambos roles)
  pendingTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  topTasks: { title: string; client: string; due?: string; overdue: boolean }[];
  pendingRequests: number;
  // Solo socios
  facturasPorCobrar: number;
  egresosPendientes: number;
  dividendosPendientes: number;
  funcionalesSinPago: number;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthKey = () => new Date().toISOString().slice(0, 7);

function storageKey(userId: string) {
  return `dc:daily-brief:${userId}:${todayIso()}`;
}

export default function DailyBriefModal() {
  const [data, setData] = useState<BriefData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await getCurrentProfile();
      if (!profile || profile.role === "client") return;

      // ¿Ya se mostró hoy? Si sí, no hacemos ningún fetch.
      try {
        if (localStorage.getItem(storageKey(profile.id))) return;
      } catch {
        /* si localStorage falla, mostramos igual */
      }

      const brief = await buildBrief(profile);
      if (cancelled) return;
      setUserId(profile.id);
      setData(brief);
      setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    setVisible(false);
    // Marcar mostrado hoy para no repetir en cada navegación.
    if (userId) {
      try {
        localStorage.setItem(storageKey(userId), "1");
      } catch {
        /* ignore */
      }
    }
  }

  if (!visible || !data) return null;

  return <BriefCard data={data} onClose={dismiss} />;
}

/** Card del popup. Separada para poder cerrar marcando el localStorage. */
function BriefCard({
  data,
  onClose,
}: {
  data: BriefData;
  onClose: () => void;
}) {
  const dateLabel = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Resumen en una frase (orden por urgencia).
  const summary = (() => {
    if (data.overdueTasks > 0)
      return `Tenés ${data.overdueTasks} tarea${data.overdueTasks === 1 ? "" : "s"} vencida${data.overdueTasks === 1 ? "" : "s"} — arrancá por ahí.`;
    if (data.dueTodayTasks > 0)
      return `${data.dueTodayTasks} tarea${data.dueTodayTasks === 1 ? "" : "s"} vence${data.dueTodayTasks === 1 ? "" : "n"} hoy.`;
    if (data.pendingTasks > 0)
      return `${data.pendingTasks} tarea${data.pendingTasks === 1 ? "" : "s"} pendiente${data.pendingTasks === 1 ? "" : "s"} en tus clientes.`;
    return "Todo al día. Buen momento para adelantar trabajo.";
  })();

  const clientBullets: { icon: string; text: string }[] = [];
  if (data.pendingTasks > 0) {
    clientBullets.push({
      icon: "📋",
      text: `${data.pendingTasks} tarea${data.pendingTasks === 1 ? "" : "s"} pendiente${data.pendingTasks === 1 ? "" : "s"}${data.overdueTasks > 0 ? ` · ${data.overdueTasks} vencida${data.overdueTasks === 1 ? "" : "s"}` : ""}`,
    });
  }
  if (data.pendingRequests > 0) {
    clientBullets.push({
      icon: "💬",
      text: `${data.pendingRequests} solicitud${data.pendingRequests === 1 ? "" : "es"} de clientes sin responder`,
    });
  }

  // Bullets de finanzas + equipo (solo socios).
  const socioBullets: { icon: string; text: string }[] = [];
  if (data.isDirector) {
    const finParts: string[] = [];
    if (data.facturasPorCobrar > 0)
      finParts.push(`${data.facturasPorCobrar} factura${data.facturasPorCobrar === 1 ? "" : "s"} por cobrar`);
    if (data.egresosPendientes > 0)
      finParts.push(`${data.egresosPendientes} egreso${data.egresosPendientes === 1 ? "" : "s"} por pagar`);
    if (data.dividendosPendientes > 0)
      finParts.push(`${data.dividendosPendientes} distribución${data.dividendosPendientes === 1 ? "" : "es"} sin pagar`);
    if (finParts.length > 0)
      socioBullets.push({ icon: "💰", text: `Finanzas: ${finParts.join(" · ")}` });
    if (data.funcionalesSinPago > 0)
      socioBullets.push({
        icon: "👥",
        text: `Equipo: ${data.funcionalesSinPago} funcional${data.funcionalesSinPago === 1 ? "" : "es"} sin registrar pago este mes`,
      });
  }

  const nothingPending =
    clientBullets.length === 0 && socioBullets.length === 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,26,12,0.5)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--white)",
          borderRadius: 14,
          padding: 28,
          width: "100%",
          maxWidth: 440,
          boxShadow: "0 24px 64px rgba(10,26,12,0.32)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Resumen del día · {dateLabel}
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
            marginBottom: 10,
            color: "var(--deep-green)",
            letterSpacing: "-0.02em",
          }}
        >
          Buen día, {data.firstName}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-soft, #5A6A5E)",
            margin: 0,
            marginBottom: nothingPending ? 4 : 18,
            lineHeight: 1.5,
          }}
        >
          {summary}
        </p>

        {!nothingPending && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...clientBullets, ...socioBullets].map((b, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  background: "var(--off-white, #F5F2EC)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--deep-green)",
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontSize: 15 }}>{b.icon}</span>
                <span>{b.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Top tareas concretas (breve, máx 3) */}
        {data.topTasks.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Para hoy
            </div>
            {data.topTasks.map((t, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "6px 0",
                  borderTop: i === 0 ? "none" : "1px solid rgba(10,26,12,0.06)",
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: "var(--deep-green)", flexShrink: 1 }}>
                  {t.title}
                  <span style={{ color: "var(--text-muted, #7A8A7E)" }}>
                    {" "}
                    · {t.client}
                  </span>
                </span>
                {t.overdue && (
                  <span style={{ color: "#b04b3a", fontWeight: 600, whiteSpace: "nowrap" }}>
                    vencida
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 22,
            width: "100%",
            padding: "11px 18px",
            fontSize: 13,
            fontWeight: 700,
            background: "var(--deep-green)",
            color: "var(--off-white)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Entendido, a trabajar
        </button>
      </div>
    </div>
  );
}

/** Junta todos los pendientes según el rol. */
async function buildBrief(profile: Profile): Promise<BriefData> {
  const isDirector = profile.role === "director";
  const today = todayIso();
  const mk = monthKey();

  const [clients, allTasks, assignments] = await Promise.all([
    getClients(),
    getAllTasks(),
    listAllAssignments(),
  ]);

  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
  const mineClientIds = isDirector
    ? new Set(clients.map((c) => c.id))
    : new Set(
        assignments
          .filter((a) => a.user_id === profile.id)
          .map((a) => a.client_id),
      );

  const scopedPending = allTasks.filter(
    (t) => t.status !== "done" && mineClientIds.has(t.clientId),
  );
  const overdue = scopedPending.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = scopedPending.filter((t) => t.dueDate === today);

  // Top 3 tareas por urgencia: vencidas primero (más viejas), luego las
  // que vencen hoy, luego el resto por fecha.
  const rank = (t: DevTask) => {
    if (t.dueDate && t.dueDate < today) return 0;
    if (t.dueDate === today) return 1;
    return 2;
  };
  const topTasks = [...scopedPending]
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    })
    .slice(0, 3)
    .map((t) => ({
      title: t.title,
      client: clientNameById.get(t.clientId) ?? "—",
      due: t.dueDate,
      overdue: !!t.dueDate && t.dueDate < today,
    }));

  // Solicitudes pendientes de clientes en alcance.
  let pendingRequests = 0;
  try {
    const supabase = getSupabase();
    const { data: reqs } = await supabase
      .from("client_requests")
      .select("client_id, status")
      .in("status", ["pending", "reviewing", "in_progress"]);
    pendingRequests = ((reqs ?? []) as { client_id: string }[]).filter((r) =>
      mineClientIds.has(r.client_id),
    ).length;
  } catch {
    /* ignore */
  }

  // ---- Finanzas + equipo: solo socios ----
  let facturasPorCobrar = 0;
  let egresosPendientes = 0;
  let dividendosPendientes = 0;
  let funcionalesSinPago = 0;

  if (isDirector) {
    try {
      const [payments, expenses, dists, profiles] = await Promise.all([
        getPayments(),
        getExpenses(),
        listDividendDistributions(),
        listProfiles(),
      ]);
      // Facturas por cobrar: pendientes/vencidas del mes en curso o
      // anteriores (no las futuras).
      facturasPorCobrar = payments.filter(
        (p) =>
          p.status !== "paid" &&
          p.status !== "cancelled" &&
          p.month <= mk,
      ).length;
      // Egresos por pagar: status pendiente.
      egresosPendientes = expenses.filter((e) => e.status === "pending").length;
      // Distribuciones de dividendos sin pagar (cerradas, cualquier moneda).
      dividendosPendientes = dists.filter(
        (d) => d.status !== "paid" && d.month_key < mk,
      ).length;
      // Funcionales sin registrar pago este mes: miembros con costo
      // mensual que no tienen el egreso "Nómina · <name>" del mes.
      const paidConcepts = new Set(
        expenses
          .filter(
            (e) => e.category === "equipo" && (e.date ?? "").startsWith(mk),
          )
          .map((e) => e.concept),
      );
      funcionalesSinPago = profiles.filter(
        (p) =>
          p.role !== "client" &&
          p.payment_amount != null &&
          Number(p.payment_amount) > 0 &&
          !paidConcepts.has(`Nómina · ${p.name}`),
      ).length;
    } catch {
      /* si falla finanzas, mostramos igual la parte de clientes */
    }
  }

  return {
    firstName: profile.name.split(" ")[0] ?? profile.name,
    isDirector,
    pendingTasks: scopedPending.length,
    overdueTasks: overdue.length,
    dueTodayTasks: dueToday.length,
    topTasks,
    pendingRequests,
    facturasPorCobrar,
    egresosPendientes,
    dividendosPendientes,
    funcionalesSinPago,
  };
}
