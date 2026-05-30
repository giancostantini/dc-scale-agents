"use client";

/**
 * Facturación del cliente — vista por-cliente de todos los comprobantes
 * que se le emitieron (los payments que viven en la tabla).
 *
 * Es la contraparte de Finanzas → Facturación pero scopeada a un solo
 * cliente: el director abre la ficha del cliente, va a "Facturación" y
 * ve TODAS las facturas que se emitieron desde el módulo central. Toda
 * factura creada en /finanzas (página "Nueva factura") aparece acá
 * automáticamente porque ambas vistas leen `payments` filtrando por
 * client_id.
 *
 * Director-only: si el viewer no es director redirige al dashboard del
 * cliente porque payments es información financiera sensible.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  effectiveFeeForMonth,
  getClient,
  getPayments,
  listFeeSchedulesForClient,
  setPaymentStatus,
} from "@/lib/storage";
import { getCurrentProfile } from "@/lib/supabase/auth";
import type {
  Client,
  ClientFeeSchedule,
  InvoicePayment,
} from "@/lib/types";
import ui from "@/components/ClientUI.module.css";
import { toast } from "sonner";
import { Toaster } from "@/components/premium/Toaster";

const MONTHS_LONG_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function formatUsd(n: number) {
  return `USD ${Math.round(n).toLocaleString("es-AR")}`;
}

function lastDayOfMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

type EstadoFactura = "pagada" | "pendiente" | "vencida" | "anulada";

function statusToEstado(p: InvoicePayment): EstadoFactura {
  const now = new Date().toISOString().slice(0, 7);
  if (p.status === "paid") return "pagada";
  if (p.status === "late") return "vencida";
  if (p.month < now) return "vencida";
  return "pendiente";
}

const estadoConfig: Record<EstadoFactura, { label: string; classes: string }> = {
  pagada: { label: "Pagada", classes: "bg-emerald-50 text-emerald-700" },
  pendiente: { label: "Pendiente", classes: "bg-amber-50 text-amber-700" },
  vencida: { label: "Vencida", classes: "bg-red-50 text-red-700" },
  anulada: { label: "Anulada", classes: "bg-slate-100 text-slate-600" },
};

export default function ClienteFacturacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null | undefined>(undefined);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [feeSchedules, setFeeSchedules] = useState<ClientFeeSchedule[]>([]);
  const [isDirector, setIsDirector] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    Promise.all([
      getClient(id),
      getPayments(),
      listFeeSchedulesForClient(id),
      getCurrentProfile(),
    ]).then(([c, p, fs, profile]) => {
      setClient(c ?? null);
      // Solo facturas del cliente en cuestión
      setPayments(p.filter((pp) => pp.clientId === id));
      setFeeSchedules(fs);
      setIsDirector(profile?.role === "director");
      setLoading(false);
    });
  }

  useEffect(() => {
    refresh();
  }, [id]);

  // Guard: solo directores ven facturación
  useEffect(() => {
    if (isDirector === false) {
      router.replace(`/cliente/${id}`);
    }
  }, [isDirector, id, router]);

  if (client === undefined || isDirector === null) return null;
  if (client === null) return null;
  if (!isDirector) return null;

  // ===== Comprobantes ordenados desc por fecha =====
  const comprobantes = payments
    .map((p, idx) => {
      const importe =
        p.amountOverride ?? effectiveFeeForMonth(feeSchedules, p.clientId, p.month) ?? client.fee;
      const [y, m] = p.month.split("-").map(Number);
      return {
        payment: p,
        number: `FAC 0001-${String(idx + 1).padStart(8, "0")}`,
        fecha: `${p.month}-01`,
        vencimiento: lastDayOfMonth(p.month),
        concepto: `Honorarios - ${MONTHS_LONG_ES[m - 1]} ${y}`,
        importe,
        estado: statusToEstado(p),
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  // ===== Stats =====
  const total = comprobantes.reduce((s, c) => s + c.importe, 0);
  const cobrado = comprobantes.filter((c) => c.estado === "pagada").reduce((s, c) => s + c.importe, 0);
  const pendiente = comprobantes.filter((c) => c.estado === "pendiente" || c.estado === "vencida").reduce((s, c) => s + c.importe, 0);

  async function markPaid(mk: string) {
    try {
      await setPaymentStatus(id, mk, "paid");
      toast.success("Factura marcada como pagada");
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    }
  }

  return (
    <>
      <Toaster />
      <div className={ui.panel} style={{ marginBottom: 20 }}>
        <div className={ui.panelHead}>
          <div>
            <div className={ui.panelTitle}>Facturación de {client.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Todos los comprobantes emitidos a este cliente
            </div>
          </div>
          <button
            className={ui.panelAction}
            onClick={() => router.push("/finanzas")}
          >
            Ir a Facturación general →
          </button>
        </div>

        {/* KPIs simples */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginTop: 16,
          }}
        >
          <KpiTile label="Facturación total" value={formatUsd(total)} sub={`${comprobantes.length} comprobantes`} />
          <KpiTile label="Cobrado" value={formatUsd(cobrado)} sub="Pagado por el cliente" accent="ok" />
          <KpiTile label="Saldo pendiente" value={formatUsd(pendiente)} sub="Pendiente + vencido" accent={pendiente > 0 ? "warn" : undefined} />
        </div>
      </div>

      <div className={ui.panel}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Comprobantes emitidos</div>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Cargando…
          </div>
        ) : comprobantes.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Todavía no hay facturas emitidas para este cliente. Cuando crees
            una desde <strong>Finanzas → Facturación</strong>, va a aparecer
            acá automáticamente.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(10,26,12,0.08)" }}>
                  <th style={thStyle}>Comprobante</th>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>Concepto</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Importe</th>
                  <th style={thStyle}>Estado</th>
                  <th style={thStyle}>Vencimiento</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {comprobantes.map((c) => (
                  <tr key={c.payment.month} style={{ borderBottom: "1px solid rgba(10,26,12,0.05)" }}>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>{c.number}</td>
                    <td style={tdStyle}>{c.fecha}</td>
                    <td style={tdStyle}>{c.concepto}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{formatUsd(c.importe)}</td>
                    <td style={tdStyle}>
                      <span
                        className={estadoConfig[c.estado].classes}
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {estadoConfig[c.estado].label}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: "var(--text-muted)" }}>{c.vencimiento}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {c.estado !== "pagada" && (
                        <button
                          onClick={() => markPaid(c.payment.month)}
                          style={{
                            padding: "4px 10px",
                            background: "transparent",
                            border: "1px solid rgba(10,26,12,0.12)",
                            borderRadius: 6,
                            fontSize: 11,
                            cursor: "pointer",
                            color: "var(--deep-green)",
                          }}
                        >
                          Marcar pagada
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
const tdStyle: React.CSSProperties = {
  padding: "12px",
  fontSize: 13,
  color: "var(--deep-green)",
};

function KpiTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "ok" | "warn";
}) {
  const color =
    accent === "ok"
      ? "var(--green-ok)"
      : accent === "warn"
        ? "var(--red-warn)"
        : "var(--deep-green)";
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "rgba(10,26,12,0.02)",
        border: "1px solid rgba(10,26,12,0.06)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}
