"use client";

/**
 * Paid Media · accesos y generador de campañas Meta scopeado al cliente.
 *
 * Acá viven 2 cosas:
 *   1. Atajo a Espor.ai (link configurable por cliente — antes vivía
 *      en /analitica pero se movió para que Paid Media tenga su propio
 *      menú propio en el sidebar).
 *   2. CTA al generador de campañas Meta con Claude (la página global
 *      vive en /meta; acá la abrimos pre-seleccionando este cliente).
 *
 * Acceso: director y team. Team puede abrir Espor.ai; ejecutar el
 * generador es director-only en la página /meta.
 *
 * NOTA: una versión anterior de esta página mostraba métricas
 * agregadas de Meta/Google/TikTok/Email leyendo client.kpis.paid_media.
 * No estaba linkeada desde el sidebar (era trabajo en progreso) y la
 * reemplazamos por este flow que es lo que el director realmente
 * usa hoy. Si en el futuro queremos volver a mostrar métricas
 * agregadas, podemos sumarlas como sección abajo.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getClient, updateClientExternalLinks } from "@/lib/storage";
import type { Client } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

export default function PaidMediaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [editingEspor, setEditingEspor] = useState(false);
  const [esporUrl, setEsporUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getClient(id), getCurrentProfile()]).then(([c, p]) => {
      if (cancelled) return;
      setClient(c ?? null);
      setIsDirector(p?.role === "director");
      setEsporUrl(c?.external_links?.espor_ai_url ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [id, reloadFlag]);

  async function saveEsporUrl() {
    setSaving(true);
    try {
      const cleaned = esporUrl.trim();
      await updateClientExternalLinks(id, {
        espor_ai_url: cleaned === "" ? undefined : cleaned,
      });
      setEditingEspor(false);
      setReloadFlag((f) => f + 1);
    } catch (err) {
      alert(`No se pudo guardar el link:\n${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!client) return null;

  const esporConfigured = !!client.external_links?.espor_ai_url;
  const adAccountConfigured = !!client.external_links?.meta_ad_account_id;
  const pageIdConfigured = !!client.external_links?.meta_page_id;

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Cliente · Paid Media</div>
          <h1>Paid Media</h1>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 6,
            }}
          >
            Análisis de campañas en Espor.ai y generador de campañas
            nuevas con Claude.
          </div>
        </div>
      </div>

      {/* ============== ESPOR.AI ==============
          Atajo al dashboard de Espor.ai del cliente. */}
      <div
        style={{
          background: "var(--white)",
          border: "1px solid rgba(10,26,12,0.08)",
          borderLeft: esporConfigured
            ? "3px solid var(--green-ok)"
            : "3px solid var(--sand)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-sm)",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
          }}
        >
          Análisis de performance
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--deep-green)",
            letterSpacing: "-0.02em",
          }}
        >
          Espor.ai
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-soft, #5a6a5e)",
            lineHeight: 1.5,
          }}
        >
          Análisis de campañas y performance de paid media del cliente.
          Click para abrir el dashboard en una pestaña nueva.
        </div>

        {editingEspor ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              value={esporUrl}
              onChange={(e) => setEsporUrl(e.target.value)}
              placeholder="https://espor.ai/clients/..."
              autoFocus
              disabled={saving}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid rgba(10,26,12,0.15)",
                background: "var(--white)",
                color: "var(--deep-green)",
                fontSize: 12,
                outline: "none",
                fontFamily: "inherit",
                borderRadius: "var(--r-md)",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={saveEsporUrl}
                disabled={saving}
                style={{
                  flex: 1,
                  background: "var(--deep-green)",
                  color: "var(--off-white)",
                  border: "none",
                  padding: "9px 14px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: saving ? "default" : "pointer",
                  letterSpacing: "0.5px",
                  opacity: saving ? 0.5 : 1,
                  borderRadius: 4,
                }}
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button
                onClick={() => {
                  setEditingEspor(false);
                  setEsporUrl(client.external_links?.espor_ai_url ?? "");
                }}
                disabled={saving}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid rgba(10,26,12,0.15)",
                  color: "var(--deep-green)",
                  padding: "9px 14px",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: saving ? "default" : "pointer",
                  borderRadius: 4,
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : esporConfigured ? (
          <div style={{ display: "flex", gap: 10 }}>
            <a
              href={client.external_links!.espor_ai_url!}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                background: "var(--deep-green)",
                color: "var(--off-white)",
                padding: "11px 16px",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textDecoration: "none",
                textAlign: "center",
                borderRadius: 4,
              }}
            >
              Abrir Espor.ai →
            </a>
            {isDirector && (
              <button
                onClick={() => setEditingEspor(true)}
                style={{
                  padding: "10px 14px",
                  background: "transparent",
                  border: "1px solid rgba(10,26,12,0.15)",
                  color: "var(--deep-green)",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  borderRadius: 4,
                  fontFamily: "inherit",
                }}
              >
                Editar
              </button>
            )}
          </div>
        ) : isDirector ? (
          <button
            onClick={() => setEditingEspor(true)}
            style={{
              background: "var(--off-white)",
              color: "var(--deep-green)",
              border: "1px dashed rgba(10,26,12,0.2)",
              padding: "11px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.5px",
              borderRadius: 4,
              fontFamily: "inherit",
            }}
          >
            + Configurar link de Espor.ai
          </button>
        ) : (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontStyle: "italic",
              padding: "10px 0",
            }}
          >
            El director todavía no configuró el link de Espor.ai del cliente.
          </div>
        )}
      </div>

      {/* ============== GENERADOR META ==============
          CTA al generador de campañas. Linkea a /meta con
          ?client=<id> para que la página global preseleccione este
          cliente. */}
      <div
        style={{
          background: "var(--white)",
          border: "1px solid rgba(10,26,12,0.08)",
          borderLeft:
            adAccountConfigured && pageIdConfigured
              ? "3px solid var(--green-ok)"
              : "3px solid var(--sand)",
          padding: 24,
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-sm)",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Generador con IA · Beta
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--deep-green)",
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          Generar campaña en Meta con Claude
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-soft, #5a6a5e)",
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          Subí los creativos, contale a Claude qué querés lograr, definí
          cuántos conjuntos de anuncios necesitás (y a qué audiencia
          apunta cada uno) y generá la campaña completa lista para
          pushear a Meta Ads Manager.
        </div>

        {(!adAccountConfigured || !pageIdConfigured) && isDirector && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(196,168,130,0.1)",
              border: "1px solid rgba(196,168,130,0.3)",
              fontSize: 12,
              color: "var(--text-soft, #5a6a5e)",
              marginBottom: 16,
              lineHeight: 1.5,
              borderRadius: "var(--r-md)",
            }}
          >
            <strong style={{ color: "var(--deep-green)" }}>
              ⚠ Falta configurar Meta del cliente
            </strong>
            <br />
            Para pushear campañas a Meta hace falta:
            <ul
              style={{
                margin: "6px 0 8px 0",
                padding: "0 0 0 18px",
                fontSize: 12,
              }}
            >
              <li
                style={{
                  color: adAccountConfigured
                    ? "var(--green-ok)"
                    : "var(--deep-green)",
                }}
              >
                {adAccountConfigured ? "✓" : "○"} Ad Account ID
              </li>
              <li
                style={{
                  color: pageIdConfigured
                    ? "var(--green-ok)"
                    : "var(--deep-green)",
                }}
              >
                {pageIdConfigured ? "✓" : "○"} Facebook Page ID
              </li>
            </ul>
            Cargalo en{" "}
            <button
              onClick={() => router.push(`/cliente/${id}/configuracion`)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--deep-green)",
                fontWeight: 600,
                textDecoration: "underline",
                cursor: "pointer",
                fontSize: 12,
                padding: 0,
                fontFamily: "inherit",
              }}
            >
              Configuración → Meta Business Suite
            </button>
            .
          </div>
        )}

        {isDirector ? (
          <button
            onClick={() => router.push(`/meta?client=${id}`)}
            style={{
              background:
                "linear-gradient(135deg, #1877F2 0%, #166FE5 100%)",
              color: "#fff",
              border: "none",
              padding: "12px 20px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderRadius: 4,
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                background: "rgba(255,255,255,0.18)",
                width: 24,
                height: 24,
                borderRadius: 4,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontFamily: "system-ui, sans-serif",
              }}
            >
              M
            </span>
            Abrir generador →
          </button>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontStyle: "italic",
              padding: "10px 0",
            }}
          >
            Solo el director ejecuta el generador. Si necesitás una
            campaña nueva, mandale un pedido vía Solicitudes.
          </div>
        )}
      </div>
    </>
  );
}
