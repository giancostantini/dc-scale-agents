"use client";

import { useEffect, useState } from "react";
import { addExpense, getClients } from "@/lib/storage";
import type {
  ExpenseCategory,
  ExpenseRecurrence,
  Client,
} from "@/lib/types";
import styles from "./NewClientModal.module.css";

interface NewExpenseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function NewExpenseModal({
  open,
  onClose,
  onCreated,
}: NewExpenseModalProps) {
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("equipo");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [assignedTo, setAssignedTo] = useState("Interno");
  /** "one_time" o "monthly_fixed" — define si el costo se repite cada mes. */
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>("one_time");
  /** Si recurrence='monthly_fixed' y se setea, el costo se contabiliza hasta esta fecha. */
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  /** Si el egreso se imputa al presupuesto MKT de un cliente GP. "" = no imputado. */
  const [mktBudgetClientId, setMktBudgetClientId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    if (open) {
      getClients().then(setClients);
      // Reset
      setRecurrence("one_time");
      setRecurrenceEndDate("");
      setMktBudgetClientId("");
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = concept.trim() && Number(amount) > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    await addExpense({
      concept: concept.trim(),
      amount: Number(amount),
      category,
      date,
      assignedTo,
      recurrence,
      recurrenceEndDate:
        recurrence === "monthly_fixed" && recurrenceEndDate
          ? recurrenceEndDate
          : null,
      mktBudgetClientId: mktBudgetClientId || null,
    });
    setConcept("");
    setAmount("");
    setRecurrence("one_time");
    setRecurrenceEndDate("");
    setMktBudgetClientId("");
    onClose();
    onCreated?.();
  }

  // Solo clientes GP pueden tener presupuesto MKT — filtramos para no
  // mostrar Dev en el selector
  const gpClients = clients.filter((c) => c.type === "gp");

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={styles.modal}
        style={{ maxWidth: 600, maxHeight: "92vh", overflowY: "auto" }}
      >
        <button className={styles.close} onClick={onClose}>
          ×
        </button>

        <div className={styles.eyebrow}>Finanzas · Registrar egreso</div>
        <h2 className={styles.title}>Nuevo egreso</h2>
        <p className={styles.sub}>
          Registrá un gasto. Si lo asignás a un cliente, impacta en su rentabilidad.
        </p>

        <div className={styles.field}>
          <label>Concepto</label>
          <input
            placeholder="Ej: Sueldo Laura · Abril"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Monto (USD)</label>
            <input
              type="number"
              placeholder="2200"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>{recurrence === "monthly_fixed" ? "Fecha de inicio" : "Fecha"}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Tipo de recurrencia */}
        <div
          className={styles.field}
          style={{
            background: "var(--off-white)",
            padding: 14,
            borderLeft: "3px solid var(--sand)",
            marginBottom: 14,
          }}
        >
          <label style={{ marginBottom: 8 }}>Tipo de egreso</label>
          <div style={{ display: "flex", gap: 16 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                value="one_time"
                checked={recurrence === "one_time"}
                onChange={() => setRecurrence("one_time")}
              />
              <strong>Único pago</strong>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                value="monthly_fixed"
                checked={recurrence === "monthly_fixed"}
                onChange={() => setRecurrence("monthly_fixed")}
              />
              <strong>Fijo mensual</strong>
            </label>
          </div>
          {recurrence === "monthly_fixed" && (
            <div style={{ marginTop: 10 }}>
              <label
                style={{
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Hasta (opcional)
              </label>
              <input
                type="date"
                value={recurrenceEndDate}
                onChange={(e) => setRecurrenceEndDate(e.target.value)}
                min={date}
                placeholder="vigente"
                style={{ width: "100%" }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 4,
                }}
              >
                {recurrenceEndDate
                  ? `Se contabiliza cada mes desde ${date} hasta ${recurrenceEndDate}.`
                  : "Dejá vacío si el costo es vigente sin fin definido."}
              </div>
            </div>
          )}
        </div>

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Categoría</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              <option value="equipo">Funcionales (sueldos / contractors)</option>
              <option value="tools">Tools / Software</option>
              <option value="ia">IA (Claude, APIs)</option>
              <option value="produccion">Producción (UGC, fotos…)</option>
              <option value="impuestos">Impuestos</option>
              <option value="mkt_interno">Mkt interno (D&C)</option>
              <option value="otros">Varios</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Asignado a</label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="Interno">Interno / Compartido</option>
              {clients.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Imputar contra presupuesto MKT de un cliente GP */}
        {gpClients.length > 0 && (
          <div className={styles.field}>
            <label>
              Imputar al presupuesto MKT de un cliente{" "}
              <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                (opcional)
              </span>
            </label>
            <select
              value={mktBudgetClientId}
              onChange={(e) => setMktBudgetClientId(e.target.value)}
            >
              <option value="">— No imputar a MKT —</option>
              {gpClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              Si lo seleccionás, este egreso descuenta del presupuesto MKT de
              ese cliente (visible en el menú Mkt Clientes).
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={styles.btnSolid}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Registrar egreso →
          </button>
        </div>
      </div>
    </div>
  );
}
