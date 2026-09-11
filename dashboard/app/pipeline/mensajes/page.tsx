"use client";

/**
 * /pipeline/mensajes — la cola de aprobación del outbound.
 *
 * Acá está el gate humano: la IA redactó, vos decidís. Nada salió todavía.
 *   · Email    → "Aprobar y enviar" lo manda por el remitente de outbound.
 *   · LinkedIn → "Copiar y marcar enviado": el texto va al portapapeles y
 *     vos lo pegás. Automatizar mensajes de LinkedIn viola sus términos y
 *     arriesga la cuenta, así que no se hace.
 *
 * Vive en su propia ruta y no dentro de /pipeline porque esa página ya
 * pasa las 2000 líneas y esto tiene su propio ciclo (editar, aprobar en
 * lote, marcar respuestas).
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import {
  getOutreachMessages,
  updateOutreachBody,
  discardOutreachMessage,
  markOutreachReplied,
} from "@/lib/storage";
import { getSupabase } from "@/lib/supabase/client";
import {
  hasSession,
  getCurrentProfile,
  hasPipelineAccess,
  type Profile,
} from "@/lib/supabase/auth";
import type { OutreachMessage, OutreachStatus } from "@/lib/types";
import styles from "./mensajes.module.css";

type Filtro = "pendientes" | "sent" | "discarded";

const FILTROS: Array<{ key: Filtro; label: string }> = [
  { key: "pendientes", label: "Por aprobar" },
  { key: "sent", label: "Enviados" },
  { key: "discarded", label: "Descartados" },
];

export default function MensajesPage() {
  return (
    <Suspense fallback={null}>
      <MensajesInner />
    </Suspense>
  );
}

function MensajesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadFilter = searchParams.get("lead");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async (f: Filtro) => {
    setLoading(true);
    const rows = await getOutreachMessages({
      status: f === "pendientes" ? "pendientes" : (f as OutreachStatus),
    });
    setMessages(rows);
    setSelected(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!hasPipelineAccess(p)) {
        router.replace("/hub");
        return;
      }
      setProfile(p);
      setAuthChecked(true);
    });
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    refresh(filtro);
  }, [authChecked, filtro, refresh]);

  function valueOf(m: OutreachMessage) {
    return drafts[m.id] ?? { subject: m.subject ?? "", body: m.body };
  }

  function setDraft(m: OutreachMessage, patch: { subject?: string; body?: string }) {
    setDrafts((prev) => ({
      ...prev,
      [m.id]: { ...valueOf(m), ...patch },
    }));
  }

  async function saveIfDirty(m: OutreachMessage) {
    const d = drafts[m.id];
    if (!d) return;
    if (d.body === m.body && (d.subject || null) === m.subject) return;
    await updateOutreachBody(m.id, {
      body: d.body,
      subject: m.channel === "email" ? d.subject || null : null,
    });
  }

  /** Aprobar = enviar (email) o registrar el envío manual (LinkedIn). */
  async function approve(ids: string[]) {
    if (ids.length === 0) return;
    setSending(true);
    setFeedback(null);
    try {
      // Guardar ediciones pendientes antes de mandar.
      for (const id of ids) {
        const m = messages.find((x) => x.id === id);
        if (m) await saveIfDirty(m);
      }
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as {
        sent?: number;
        failed?: number;
        results?: Array<{ id: string; ok: boolean; error?: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const primerError = data.results?.find((r) => !r.ok)?.error;
      setFeedback(
        `${data.sent ?? 0} listo(s)${data.failed ? ` · ${data.failed} con problema: ${primerError ?? ""}` : ""}`,
      );
      setDrafts({});
      await refresh(filtro);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  async function copyAndSend(m: OutreachMessage) {
    const d = valueOf(m);
    try {
      await navigator.clipboard.writeText(d.body);
    } catch {
      /* si el navegador lo bloquea, igual registramos el envío */
    }
    await approve([m.id]);
  }

  if (!authChecked || !profile) return null;

  const visibles = leadFilter
    ? messages.filter((m) => m.leadId === leadFilter)
    : messages;
  const pendientesSeleccionables = visibles.filter(
    (m) => m.status === "draft" || m.status === "failed",
  );

  return (
    <>
      <Topbar showPrimary={false} searchPlaceholder="Buscar prospectos…" />
      <div className={styles.wrap}>
        <div className={styles.head}>
          <div>
            <div className={styles.eyebrow}>CRM · Outbound</div>
            <h1 className={styles.title}>Mensajes por aprobar</h1>
          </div>
          <Link href="/pipeline" className={styles.btn} style={{ textDecoration: "none" }}>
            ← Volver al pipeline
          </Link>
        </div>

        <p className={styles.sub}>
          La IA redactó estos primeros contactos con el ICP de cada campaña.
          Nada se envió todavía: revisá, editá lo que quieras y aprobá. Los
          de email salen por el remitente de outbound; los de LinkedIn se
          copian y los pegás vos (automatizarlos viola los términos de
          LinkedIn).
        </p>

        {leadFilter && (
          <div className={styles.notice}>
            Mostrando solo los mensajes de un prospecto.{" "}
            <button
              className={styles.btnGhost}
              style={{ padding: 0, textDecoration: "underline", cursor: "pointer" }}
              onClick={() => router.push("/pipeline/mensajes")}
            >
              Ver todos
            </button>
          </div>
        )}

        <div className={styles.toolbar}>
          {FILTROS.map((f) => (
            <button
              key={f.key}
              className={`${styles.filter} ${filtro === f.key ? styles.filterActive : ""}`}
              onClick={() => setFiltro(f.key)}
            >
              {f.label}
            </button>
          ))}

          {pendientesSeleccionables.length > 0 && (
            <div className={styles.bulkBar}>
              <button
                className={styles.btnGhost}
                onClick={() =>
                  setSelected(
                    selected.size === pendientesSeleccionables.length
                      ? new Set()
                      : new Set(pendientesSeleccionables.map((m) => m.id)),
                  )
                }
              >
                {selected.size === pendientesSeleccionables.length
                  ? "Deseleccionar todo"
                  : "Seleccionar todo"}
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={selected.size === 0 || sending}
                onClick={() => approve([...selected])}
              >
                {sending
                  ? "Procesando…"
                  : `Aprobar ${selected.size || ""} seleccionado(s)`}
              </button>
            </div>
          )}
        </div>

        {feedback && <div className={styles.notice}>{feedback}</div>}

        {loading ? null : visibles.length === 0 ? (
          <div className={styles.empty}>
            {filtro === "pendientes" ? (
              <>
                No hay mensajes esperando.
                <br />
                Se generan solos después de que el Prospector carga leads los
                lunes. Si recién aplicaste la migración 100, esperá la próxima
                corrida (o disparala a mano desde GitHub Actions).
              </>
            ) : (
              "Nada por acá todavía."
            )}
          </div>
        ) : (
          visibles.map((m) => {
            const d = valueOf(m);
            const editable = m.status === "draft" || m.status === "failed";
            return (
              <div key={m.id} className={styles.card}>
                <div className={styles.cardHead}>
                  {editable && (
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(m.id);
                        else next.delete(m.id);
                        setSelected(next);
                      }}
                      style={{ marginTop: 4 }}
                    />
                  )}
                  <div className={styles.lead}>
                    <div className={styles.leadName}>
                      {m.leadCompany ?? "(empresa)"}
                    </div>
                    <div className={styles.leadMeta}>
                      {m.leadName}
                      {m.campaignName ? ` · campaña: ${m.campaignName}` : ""}
                      {m.toEmail ? ` · ${m.toEmail}` : ""}
                    </div>
                  </div>
                  <span
                    className={`${styles.chip} ${
                      m.channel === "email" ? styles.chipEmail : styles.chipLinkedin
                    }`}
                  >
                    {m.channel === "email" ? "✉ Email" : "in LinkedIn"}
                  </span>
                  {m.status === "sent" && (
                    <span className={`${styles.chip} ${styles.chipSent}`}>
                      {m.repliedAt ? "✓ respondió" : "enviado"}
                    </span>
                  )}
                  {m.status === "failed" && (
                    <span className={`${styles.chip} ${styles.chipFailed}`}>
                      no salió
                    </span>
                  )}
                </div>

                {m.channel === "email" && (
                  <input
                    className={styles.subject}
                    value={d.subject}
                    placeholder="Asunto"
                    disabled={!editable}
                    onChange={(e) => setDraft(m, { subject: e.target.value })}
                    onBlur={() => saveIfDirty(m)}
                  />
                )}
                <textarea
                  className={styles.body}
                  value={d.body}
                  disabled={!editable}
                  onChange={(e) => setDraft(m, { body: e.target.value })}
                  onBlur={() => saveIfDirty(m)}
                />

                {m.error && (
                  <div className={styles.errorLine}>⚠ {m.error}</div>
                )}

                <div className={styles.actions}>
                  {editable && m.channel === "email" && (
                    <button
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      disabled={sending}
                      onClick={() => approve([m.id])}
                    >
                      ✅ Aprobar y enviar
                    </button>
                  )}
                  {editable && m.channel === "linkedin" && (
                    <button
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      disabled={sending}
                      onClick={() => copyAndSend(m)}
                    >
                      Copiar y marcar enviado
                    </button>
                  )}
                  {editable && (
                    <button
                      className={styles.btnGhost}
                      onClick={async () => {
                        if (!confirm("¿Descartar este mensaje? No se vuelve a generar."))
                          return;
                        await discardOutreachMessage(m.id);
                        refresh(filtro);
                      }}
                    >
                      Descartar
                    </button>
                  )}
                  {m.status === "sent" && !m.repliedAt && (
                    <button
                      className={styles.btn}
                      onClick={async () => {
                        await markOutreachReplied(m.id);
                        refresh(filtro);
                      }}
                    >
                      Marcar que respondió
                    </button>
                  )}
                  <Link
                    href={`/pipeline`}
                    className={styles.btnGhost}
                    style={{ textDecoration: "none", marginLeft: "auto" }}
                  >
                    Ver en el pipeline →
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
