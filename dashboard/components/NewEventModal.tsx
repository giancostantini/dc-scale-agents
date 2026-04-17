"use client";

import { useEffect, useState } from "react";
import { addEvent } from "@/lib/storage";
import { getClients } from "@/lib/storage";
import type { EventType, Client } from "@/lib/types";
import styles from "./NewClientModal.module.css";

interface NewEventModalProps {
  open: boolean;
  initialDate?: string;
  googleConnected?: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

function randomMeetSlug() {
  const pick = () =>
    Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 4).padEnd(4, "x");
  return `${pick()}-${pick()}-${pick()}`;
}

export default function NewEventModal({
  open,
  initialDate,
  googleConnected = true,
  onClose,
  onCreated,
}: NewEventModalProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("reunion");
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [generateMeet, setGenerateMeet] = useState(true);
  const [syncGoogle, setSyncGoogle] = useState(googleConnected);

  useEffect(() => {
    if (open) {
      getClients().then(setClients);
      setDate(initialDate || new Date().toISOString().slice(0, 10));
      setSyncGoogle(googleConnected);
    }
  }, [open, initialDate, googleConnected]);

  if (!open) return null;

  const canSubmit = title.trim() && date;

  async function handleSubmit() {
    if (!canSubmit) return;
    const client = clients.find((c) => c.id === clientId);
    await addEvent({
      title: title.trim(),
      type,
      date,
      time,
      duration: Number(duration),
      clientId: clientId || undefined,
      clientLabel: client?.name || (clientId === "prospect" ? "Prospecto" : clientId === "interno" ? "Interno" : "Sin cliente"),
      participants: participants.trim() || undefined,
      notes: notes.trim() || undefined,
      meetLink:
        generateMeet && (type === "reunion" || type === "dev")
          ? `meet.google.com/${randomMeetSlug()}`
          : undefined,
      synced: syncGoogle,
    });

    setTitle("");
    setNotes("");
    setParticipants("");
    onClose();
    onCreated?.();
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

        <div className={styles.eyebrow}>Calendario · Nuevo evento</div>
        <h2 className={styles.title}>Agendar evento</h2>
        <p className={styles.sub}>
          {googleConnected
            ? "Si activás la sincronización, el evento aparece también en tu Google Calendar."
            : "Google Calendar no está conectado — el evento queda solo en D&C Scale."}
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

        <div className={styles.fieldGrid3}>
          <div className={styles.field}>
            <label>Fecha</label>
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

        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: 14,
            background: "var(--off-white)",
            borderLeft: "3px solid var(--sand)",
            cursor: "pointer",
            marginBottom: 14,
          }}
        >
          <input
            type="checkbox"
            checked={generateMeet}
            onChange={(e) => setGenerateMeet(e.target.checked)}
          />
          <span style={{ fontSize: 13 }}>
            <strong>Generar link de Google Meet</strong>
            <br />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Solo se genera para reuniones y deploys.
            </span>
          </span>
        </label>

        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: 14,
            background: googleConnected ? "var(--deep-green)" : "var(--off-white)",
            color: googleConnected ? "var(--off-white)" : "var(--deep-green)",
            cursor: googleConnected ? "pointer" : "not-allowed",
            opacity: googleConnected ? 1 : 0.5,
          }}
        >
          <input
            type="checkbox"
            checked={syncGoogle && googleConnected}
            onChange={(e) => setSyncGoogle(e.target.checked)}
            disabled={!googleConnected}
          />
          <span style={{ fontSize: 13 }}>
            <strong style={{ color: googleConnected ? "var(--sand)" : "inherit" }}>
              Sincronizar con Google Calendar
            </strong>
            <br />
            <span
              style={{
                fontSize: 11,
                color: googleConnected
                  ? "rgba(232,228,220,0.6)"
                  : "var(--text-muted)",
              }}
            >
              {googleConnected
                ? "El evento se crea también en tu calendario de Google."
                : "Primero conectá Google Calendar."}
            </span>
          </span>
        </label>

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={styles.btnSolid}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Agendar →
          </button>
        </div>
      </div>
    </div>
  );
}
