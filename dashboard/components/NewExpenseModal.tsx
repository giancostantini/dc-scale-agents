"use client";

import { useEffect, useState } from "react";
import { addExpense, getClients } from "@/lib/storage";
import type { ExpenseCategory, Client } from "@/lib/types";
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
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    if (open) getClients().then(setClients);
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
    });
    setConcept("");
    setAmount("");
    onClose();
    onCreated?.();
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal} style={{ maxWidth: 560 }}>
        <button className={styles.close} onClick={onClose}>×</button>

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
            <label>Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Categoría</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              <option value="equipo">Equipo (sueldos)</option>
              <option value="tools">Tools / Software</option>
              <option value="ia">IA (Claude, APIs)</option>
              <option value="produccion">Producción (UGC, fotos…)</option>
              <option value="otros">Otros</option>
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

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
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
