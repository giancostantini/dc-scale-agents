"use client";

import { useState } from "react";
import { generateTeamPayroll } from "@/lib/storage";

interface Props {
  month: string; // YYYY-MM
  onCreated?: () => void;
  className?: string;
}

export default function PayrollGenerateButton({
  month,
  onCreated,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    if (
      !confirm(
        `Generar expenses de nómina del mes ${month} para todos los miembros con pago fijo/mixto?\n\nEs idempotente — si ya se corrió, no duplica.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const { created, skipped, eligible } = await generateTeamPayroll(month);
      if (eligible === 0) {
        alert(
          "No hay miembros del equipo con pago fijo/mixto configurado. Revisá /equipo y seteá payment_type + payment_amount para cada uno.",
        );
      } else {
        alert(
          `Listo · ${created} creado${created === 1 ? "" : "s"} · ${skipped} ya existía${skipped === 1 ? "" : "n"} · ${eligible} miembro${eligible === 1 ? "" : "s"} elegible${eligible === 1 ? "" : "s"}.`,
        );
      }
      onCreated?.();
    } catch (err) {
      console.error("generateTeamPayroll error:", err);
      const e = err as { message?: string };
      alert(`Error generando nómina: ${e.message ?? err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={className} onClick={run} disabled={busy}>
      {busy ? "Generando…" : "+ Generar nómina del mes"}
    </button>
  );
}
