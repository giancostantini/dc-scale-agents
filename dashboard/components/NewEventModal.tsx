"use client";

import { useEffect, useState } from "react";
import { addEvent, updateEvent } from "@/lib/storage";
import { getClients } from "@/lib/storage";
import type { EventType, Client, CalEvent } from "@/lib/types";
import styles from "./NewClientModal.module.css";

interface NewEventModalProps {
  open: boolean;
  initialDate?: string;
  /** Si se pasa, el evento se asigna automáticamente a ese cliente y
   *  el selector de cliente NO se muestra — el modal asume que ya
   *  estás dentro del dashboard de ese cliente y todos los eventos
   *  que creés desde acá pertenecen a él.
   *
   *  Si NO se pasa (caso /calendario global), el selector de cliente
   *  aparece para que elijas. */
  initialClientId?: string;
  /** Modo edición: si se pasa, el modal abre con todos los campos
   *  pre-cargados del evento existente y al guardar hace UPDATE en
   *  vez de INSERT. Para entrar en modo edición pasar este prop;
   *  null/undefined → modo creación normal. */
  editEvent?: CalEvent | null;
  onClose: () => void;
  onCreated?: () => void;
}

export default function NewEventModal({
  open,
  initialDate,
  initialClientId,
  editEvent,
  onClose,
  onCreated,
}: NewEventModalProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("reunion");
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [date, setDate] = useState("");
  /** Fecha de fin opcional. Si está, el evento es multi-día. */
  const [endDate, setEndDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isEditMode = !!editEvent;
  // El selector de cliente solo aparece cuando NO se pasó initialClientId
  // (caso /calendario global). Adentro del dashboard de un cliente el
  // evento se asigna en automático.
  const hideClientSelector = !!initialClientId;

  useEffect(() => {
    if (open) {
      // Solo necesitamos cargar la lista de clientes si vamos a mostrar
      // el selector. Cuando initialClientId está seteado, el evento se
      // asigna directo sin pedirle datos al servidor.
      if (!initialClientId) {
        getClients().then(setClients);
      }
      if (editEvent) {
        // Modo edición: pre-cargar todo del evento existente
        setTitle(editEvent.title);
        setType(editEvent.type);
        setDate(editEvent.date);
        setEndDate(editEvent.end_date ?? "");
        setTime(editEvent.time);
        setDuration(String(editEvent.duration));
        setClientId(editEvent.clientId ?? "");
        setParticipants(editEvent.participants ?? "");
        setNotes(editEvent.notes ?? "");
      } else {
        // Modo creación: defaults
        setTitle("");
        setType("reunion");
        setDate(initialDate || new Date().toISOString().slice(0, 10));
        setEndDate("");
        setTime("10:00");
        setDuration("60");
        setParticipants("");
        setNotes("");
        // Auto-asignar al cliente del contexto si vino por prop.
        setClientId(initialClientId ?? "");
      }
    }
  }, [open, initialDate, initialClientId, editEvent]);

  if (!open) return null;

  // Validación: si hay endDate, debe ser >= date.
  const endDateInvalid = endDate !== "" && endDate < date;
  const canSubmit = title.trim() !== "" && date !== "" && !endDateInvalid;

  async function handleSubmit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      // Resolver el label del cliente:
      //   - Si hideClientSelector: usamos initialClientId y buscamos el
      //     nombre. Si no se cargó la lista de clientes (caso normal en
      //     dashboards de cliente), el label se completa con el id como
      //     fallback — el componente que consume el evento ya resuelve
      //     el nombre desde la DB.
      //   - Si no: el director eligió desde el selector.
      const client = clients.find((c) => c.id === clientId);
      const effectiveEndDate =
        endDate && endDate !== date ? endDate : null;
      const clientLabel =
        client?.name ||
        (clientId === "prospect"
          ? "Prospecto"
          : clientId === "interno"
            ? "Interno"
            : editEvent?.clientLabel || "Sin cliente");

      if (isEditMode && editEvent) {
        await updateEvent(editEvent.id, {
          title: title.trim(),
          type,
          date,
          end_date: effectiveEndDate,
          time,
          duration: Number(duration),
          clientId: clientId || undefined,
          clientLabel,
          participants: participants.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        await addEvent({
          title: title.trim(),
          type,
          date,
          end_date: effectiveEndDate,
          time,
          duration: Number(duration),
          clientId: clientId || undefined,
          clientLabel,
          participants: participants.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }

      onClose();
      onCreated?.();
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo guardar:\n${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal} style={{ maxWidth: 620 }}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>

        <div className={styles.eyebrow}>
          Calendario · {isEditMode ? "Editar evento" : "Nuevo evento"}
        </div>
        <h2 className={styles.title}>
          {isEditMode ? "Editar evento" : "Agendar evento"}
        </h2>
        <p className={styles.sub}>
          Agendá reuniones, cobros, producciones y deadlines del equipo.
          {hideClientSelector
            ? " El evento queda asignado automáticamente a este cliente."
            : ""}
        </p>

        <div className={styles.field}>
          <label>Título</label>
          <input
            placeholder="Ej: Kickoff con cliente nuevo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        {/* Cuando hay initialClientId (modal abierto desde el dashboard
            de un cliente), no mostramos el selector — el evento se
            asigna en automático a ese cliente. El selector solo
            aparece en el /calendario global. */}
        {hideClientSelector ? (
          <div className={styles.field}>
            <label>Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EventType)}
            >
              <option value="reunion">Reunión</option>
              <option value="cobro">Cobro</option>
              <option value="reporte">Reporte</option>
              <option value="dev">Desarrollo / Deploy</option>
              <option value="contenido">Contenido</option>
              <option value="pauta">Pauta publicitaria</option>
            </select>
          </div>
        ) : (
          <div className={styles.fieldGrid2}>
            <div className={styles.field}>
              <label>Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as EventType)}
              >
                <option value="reunion">Reunión</option>
                <option value="cobro">Cobro</option>
                <option value="reporte">Reporte</option>
                <option value="dev">Desarrollo / Deploy</option>
                <option value="contenido">Contenido</option>
                <option value="pauta">Pauta publicitaria</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Cliente</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Sin cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="prospect">Prospecto</option>
                <option value="interno">Interno</option>
              </select>
            </div>
          </div>
        )}

        <div className={styles.fieldGrid3}>
          <div className={styles.field}>
            <label>Fecha {endDate ? "(desde)" : ""}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Hora</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Duración</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hora</option>
              <option value="90">1:30 hs</option>
              <option value="120">2 hs</option>
            </select>
          </div>
        </div>

        {/* Bloque de evento multi-día — producciones, sprints, batches
            de pauta. Si endDate está vacío, es un evento de 1 día. */}
        <div
          className={styles.field}
          style={{
            background: "var(--off-white)",
            padding: 14,
            borderLeft: "3px solid var(--sand)",
            marginBottom: 14,
          }}
        >
          <label style={{ marginBottom: 6 }}>
            ¿Abarca más de un día? <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opcional)</span>
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="date"
              value={endDate}
              min={date}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ flex: 1 }}
              placeholder="Fecha de fin"
            />
            {endDate && (
              <button
                type="button"
                onClick={() => setEndDate("")}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(10,26,12,0.15)",
                  color: "var(--deep-green)",
                  padding: "6px 12px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  borderRadius: "var(--r-sm)",
                }}
              >
                Limpiar
              </button>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
            {!endDate
              ? "Dejá vacío si el evento es de un solo día. Para pauta o producciones largas, marcá el día de fin."
              : endDateInvalid
                ? <span style={{ color: "var(--red-warn)" }}>⚠ La fecha de fin tiene que ser igual o posterior a la de inicio.</span>
                : `Evento multi-día: ${date} → ${endDate}.`}
          </div>
        </div>

        <div className={styles.field}>
          <label>Participantes</label>
          <input
            placeholder="emails separados por coma"
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Notas</label>
          <textarea
            rows={2}
            placeholder="Agenda, temas, preparación…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Las opciones "Generar link de Google Meet" y "Sincronizar
            con Google Calendar" se sacaron del modal — no las usábamos
            en la operación real del equipo. Si en el futuro queremos
            volver a meter sync de Google Calendar, hay que rearmar el
            checkbox + el flag synced en addEvent/updateEvent. */}

        <div className={styles.actions}>
          <button
            className={styles.btnGhost}
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className={styles.btnSolid}
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
          >
            {saving
              ? "Guardando…"
              : isEditMode
                ? "Guardar cambios"
                : "Agendar →"}
          </button>
        </div>
      </div>
    </div>
  );
}
