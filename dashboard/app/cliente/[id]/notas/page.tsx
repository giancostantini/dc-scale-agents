"use client";

import { use, useCallback, useEffect, useState } from "react";
import { getNotes, addNote, deleteNote } from "@/lib/storage";
import { getCurrentProfile } from "@/lib/supabase/auth";
import type { ClientNote } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

export default function NotasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");

  const refresh = useCallback(() => {
    getNotes(id).then(setNotes);
  }, [id]);

  useEffect(() => {
    refresh();
    getCurrentProfile().then((p) => {
      if (p) setAuthor(p.name);
    });
  }, [refresh]);

  async function save() {
    if (!title.trim() || !content.trim()) return;
    await addNote({ clientId: id, author, title: title.trim(), content: content.trim() });
    setTitle("");
    setContent("");
    setShow(false);
    refresh();
  }

  async function remove(noteId: string) {
    if (!confirm("¿Eliminar esta nota?")) return;
    await deleteNote(noteId);
    refresh();
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Operación · Notas internas del equipo</div>
          <h1>Notas del cliente</h1>
        </div>
        <button className={ui.btnSolid} onClick={() => setShow(true)}>
          + Nueva nota
        </button>
      </div>

      {show && (
        <div className={ui.panel} style={{ marginBottom: 20, borderLeft: "3px solid var(--sand)" }}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>Nueva nota · de {author}</div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Título / contexto</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Reunión con el cliente · ajustes de estrategia"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Contenido</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Escribí la nota…"
              style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
            />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className={ui.btnGhost} onClick={() => setShow(false)}>
              Cancelar
            </button>
            <button className={ui.btnSolid} onClick={save}>
              Guardar nota →
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div className={ui.empty}>
          <div className={ui.emptyIcon}>✎</div>
          <div className={ui.emptyTitle}>Sin notas todavía</div>
          <div className={ui.emptyDesc}>
            Apuntá observaciones del equipo sobre el cliente: reuniones, insights,
            cambios de estrategia, feedback del cliente.
          </div>
          <button className={ui.btnSolid} onClick={() => setShow(true)}>
            + Primera nota
          </button>
        </div>
      ) : (
        <div className={ui.panel}>
          {notes.map((n) => (
            <div key={n.id} style={{ padding: "20px 0", borderBottom: "1px solid rgba(10,26,12,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--forest)", color: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                    {n.author.charAt(0)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{n.author}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {new Date(n.createdAt).toLocaleString("es-UY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 600 }}>
                    {n.title}
                  </div>
                  <button
                    onClick={() => remove(n.id)}
                    style={{ color: "var(--red-warn)", fontSize: 14, background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{n.content}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--sand-dark)",
  fontWeight: 600,
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--white)",
  color: "var(--deep-green)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
};
