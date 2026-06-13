"use client";

/**
 * Meta · Generador de campañas con Claude (director-only).
 *
 * Flow:
 *   1. Director elige un cliente del dropdown.
 *   2. Sube N creativos (imágenes o videos) al bucket público.
 *   3. Escribe un prompt natural describiendo qué quiere lograr.
 *   4. Setea budget (diario o total) + fechas.
 *   5. "Generar con Claude" → llama a /api/meta/generate-campaign-spec.
 *      Claude devuelve un JSON spec (Campaign + AdSet + Ads).
 *   6. El spec se muestra editable en una preview.
 *   7. "Pushear a Meta" → llama a /api/meta/push-campaign que crea
 *      todo en Ads Manager (status=PAUSED siempre, para que el
 *      director revise antes de activar).
 *
 * Requisitos para que el push funcione:
 *   - env vars: META_ACCESS_TOKEN, META_PAGE_ID, META_API_VERSION (opt).
 *   - En el cliente: client.external_links.meta_ad_account_id.
 *
 * Sin esas configs, el botón "Pushear" devuelve un error claro con
 * instrucciones de qué setear.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import { getClients } from "@/lib/storage";
import { getCurrentProfile, type Profile } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import { uploadContentPreview } from "@/lib/upload";
import type { Client } from "@/lib/types";

interface Creative {
  /** ID local para asignar a un AdSet sin chocarse con el URL. */
  id: string;
  url: string;
  type: "image" | "video";
  name: string;
  description?: string;
}

type BudgetMode = "daily" | "lifetime";

interface AdSetInput {
  /** Nombre local del adset (no se manda como nombre final — Claude lo
   *  reescribe). Sirve para que el director lo identifique en la UI. */
  label: string;
  /** Lo que quiere lograr con este adset (audiencia, tono, objetivo
   *  específico, etc). Claude usa esto para generar el targeting. */
  description: string;
  /** IDs locales de los creativos asignados a este adset. Cada creative
   *  asignado se convierte en un Ad. */
  creative_ids: string[];
}

export default function MetaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClient = searchParams.get("client") ?? "";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Form inputs
  const [clientId, setClientId] = useState(preselectedClient);
  const [prompt, setPrompt] = useState("");
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [uploading, setUploading] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState("50");
  const [budgetMode, setBudgetMode] = useState<BudgetMode>("daily");
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  /** Lista de conjuntos de anuncios que el director quiere armar.
   *  Cada uno tiene su descripción + creativos asignados. Si está
   *  vacío al generar, asumimos 1 adset que recibe TODOS los
   *  creativos (compat con el flow viejo). */
  const [adsets, setAdsets] = useState<AdSetInput[]>([
    { label: "Conjunto 1", description: "", creative_ids: [] },
  ]);

  // Generated spec + push state
  const [spec, setSpec] = useState<unknown>(null);
  const [generating, setGenerating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getCurrentProfile().then((p) => {
      if (!p) {
        router.replace("/");
        return;
      }
      if (p.role !== "director") {
        router.replace("/hub");
        return;
      }
      setProfile(p);
      getClients().then((cs) => {
        setClients(cs);
        setLoading(false);
      });
    });
  }, [router]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  const adAccountId = (
    selectedClient?.external_links as { meta_ad_account_id?: string } | undefined
  )?.meta_ad_account_id;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !clientId) {
      if (!clientId) alert("Elegí un cliente primero.");
      return;
    }
    setUploading(true);
    try {
      const uploads = await Promise.all(
        Array.from(files).map(async (file) => {
          const isVideo = file.type.startsWith("video/");
          const up = await uploadContentPreview(file, `meta-ads/${clientId}`);
          // ID local único: timestamp + nombre. Va a usarse como ref
          // para asignar a un AdSet.
          const id = `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          return {
            id,
            url: up.url ?? "",
            type: (isVideo ? "video" : "image") as "image" | "video",
            name: file.name,
          };
        }),
      );
      setCreatives((prev) => [...prev, ...uploads.filter((u) => u.url)]);
    } catch (e) {
      const msg = (e as Error).message;
      const hint = msg.includes("Bucket not found")
        ? "\n\nCorré la migración 069 en Supabase para crear el bucket público."
        : "";
      alert(`No se pudieron subir los creativos: ${msg}${hint}`);
    } finally {
      setUploading(false);
    }
  }

  function removeCreative(idx: number) {
    const removed = creatives[idx];
    setCreatives((prev) => prev.filter((_, i) => i !== idx));
    // También sacarlo de cualquier adset.
    setAdsets((prev) =>
      prev.map((a) => ({
        ...a,
        creative_ids: a.creative_ids.filter((cid) => cid !== removed?.id),
      })),
    );
  }

  function addAdset() {
    setAdsets((prev) => [
      ...prev,
      {
        label: `Conjunto ${prev.length + 1}`,
        description: "",
        creative_ids: [],
      },
    ]);
  }

  function removeAdset(idx: number) {
    if (adsets.length === 1) return; // siempre al menos 1
    setAdsets((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAdset(idx: number, patch: Partial<AdSetInput>) {
    setAdsets((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  function toggleCreativeInAdset(adsetIdx: number, creativeId: string) {
    setAdsets((prev) =>
      prev.map((a, i) => {
        if (i !== adsetIdx) return a;
        const has = a.creative_ids.includes(creativeId);
        return {
          ...a,
          creative_ids: has
            ? a.creative_ids.filter((id) => id !== creativeId)
            : [...a.creative_ids, creativeId],
        };
      }),
    );
  }

  async function generate() {
    if (!clientId || !prompt.trim() || creatives.length === 0) {
      setError(
        "Necesitás elegir cliente, escribir el prompt y subir al menos un creativo.",
      );
      return;
    }
    setGenerating(true);
    setError("");
    setSpec(null);
    setPushResult(null);
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sin sesión");

      // Normalizar adsets para el backend: cada uno con su descripción
      // + las URLs de los creativos que le asignamos. Si no quedó
      // ninguno asignado a un adset, le caen TODOS los creativos
      // (default razonable — el director no tiene que dragear sí o sí).
      const adsetsForApi = adsets
        .filter((a) => a.description.trim())
        .map((a) => ({
          label: a.label,
          description: a.description.trim(),
          creatives:
            a.creative_ids.length > 0
              ? creatives.filter((c) => a.creative_ids.includes(c.id))
              : creatives,
        }));
      // Fallback: si no hay ningún adset con descripción, generamos
      // un solo adset con el prompt como descripción y todos los
      // creativos.
      const adsetsFinal =
        adsetsForApi.length > 0
          ? adsetsForApi
          : [
              {
                label: "Conjunto único",
                description: prompt.trim(),
                creatives,
              },
            ];

      const res = await fetch("/api/meta/generate-campaign-spec", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: clientId,
          prompt: prompt.trim(),
          creatives,
          adsets: adsetsFinal,
          budget: {
            amount: Number(budgetAmount),
            mode: budgetMode,
            currency: "USD",
          },
          schedule: {
            start_date: startDate,
            end_date: endDate || undefined,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          `${json.error}${json.detail ? `\n${json.detail}` : ""}`,
        );
      }
      setSpec(json.spec);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function pushToMeta(dryRun: boolean) {
    if (!spec || !clientId) return;
    setPushing(true);
    setError("");
    setPushResult(null);
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sin sesión");

      const res = await fetch("/api/meta/push-campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: clientId,
          spec,
          dry_run: dryRun,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const hint = json.hint ? `\n\n${json.hint}` : "";
        throw new Error(`${json.error}${hint}`);
      }
      setPushResult(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPushing(false);
    }
  }

  if (loading || !profile) return null;

  return (
    <>
      <Topbar showPrimary={false} />
      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "32px 28px 80px",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Beta · Director only · Meta Ads
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "var(--deep-green)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Generador de campañas Meta con Claude
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginTop: 6,
              lineHeight: 1.55,
              maxWidth: 720,
            }}
          >
            Elegí un cliente, subí los creativos, contale a Claude qué
            querés lograr y generá una campaña completa (Campaign + AdSet
            + Ads). Después podés pushearla directo a Ads Manager — todo
            queda en <strong>PAUSED</strong> para que la revises antes de
            activar.
          </p>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          {/* === Cliente === */}
          <Section label="1. Cliente">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={input}
            >
              <option value="">— Elegí cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.type === "dev" ? "(DEV)" : ""}
                </option>
              ))}
            </select>
            {selectedClient && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 6,
                }}
              >
                Ad Account ID:{" "}
                {adAccountId ? (
                  <code style={{ color: "var(--deep-green)" }}>
                    act_{adAccountId}
                  </code>
                ) : (
                  <span style={{ color: "var(--red-warn)" }}>
                    ⚠ No configurado. Cargarlo en Configuración del cliente
                    → Meta Business Suite.
                  </span>
                )}
              </div>
            )}
          </Section>

          {/* === Prompt === */}
          <Section label="2. Prompt — qué querés lograr">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej: Quiero generar tráfico al sitio para la línea de invierno. Audiencia: mujeres 25-45 en Argentina y Uruguay. Tono aspiracional. Headline corto, primary text que destaque la prenda y el descuento del 20%. CTA Shop Now."
              rows={5}
              style={{ ...input, resize: "vertical", lineHeight: 1.5 }}
            />
          </Section>

          {/* === Creativos === */}
          <Section label="3. Creativos">
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              disabled={uploading || !clientId}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
              style={{
                display: "block",
                marginBottom: 10,
                fontSize: 12,
                fontFamily: "inherit",
              }}
            />
            {uploading && (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Subiendo…
              </div>
            )}
            {creatives.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  padding: 14,
                  background: "var(--off-white)",
                  borderRadius: 6,
                }}
              >
                Subí al menos uno. Claude va a generar 1 ad por creativo.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 10,
                }}
              >
                {creatives.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      background: "var(--off-white)",
                      borderRadius: 6,
                      overflow: "hidden",
                      aspectRatio: "1 / 1",
                    }}
                  >
                    {c.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.url}
                        alt={c.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#000",
                          color: "#fff",
                          fontSize: 24,
                        }}
                      >
                        ▶
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeCreative(i)}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      ×
                    </button>
                    <div
                      style={{
                        position: "absolute",
                        bottom: 4,
                        left: 4,
                        right: 4,
                        fontSize: 9,
                        color: "#fff",
                        background: "rgba(0,0,0,0.55)",
                        padding: "2px 6px",
                        borderRadius: 3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* === Conjuntos de anuncios === */}
          <Section
            label={`4. Conjuntos de anuncios (${adsets.length})`}
          >
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              Definí cuántos AdSets querés crear y a qué audiencia
              apunta cada uno. Por cada creativo que asignes a un
              conjunto, Claude va a generar un Ad. Si dejás un conjunto
              sin creativos asignados, le caen TODOS los subidos arriba.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {adsets.map((adset, idx) => (
                <div
                  key={idx}
                  style={{
                    border: "1px solid rgba(10,26,12,0.1)",
                    borderRadius: 6,
                    padding: 14,
                    background: "var(--off-white)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <input
                      type="text"
                      value={adset.label}
                      onChange={(e) =>
                        updateAdset(idx, { label: e.target.value })
                      }
                      placeholder="Etiqueta interna"
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        fontSize: 13,
                        fontWeight: 600,
                        border: "1px solid rgba(10,26,12,0.12)",
                        borderRadius: 4,
                        fontFamily: "inherit",
                        background: "var(--white)",
                        color: "var(--deep-green)",
                        outline: "none",
                      }}
                    />
                    {adsets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAdset(idx)}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(176,75,58,0.3)",
                          color: "var(--red-warn)",
                          padding: "5px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          borderRadius: 4,
                          fontFamily: "inherit",
                        }}
                      >
                        × Eliminar
                      </button>
                    )}
                  </div>

                  <textarea
                    value={adset.description}
                    onChange={(e) =>
                      updateAdset(idx, { description: e.target.value })
                    }
                    placeholder="Ej: Mujeres 25-45 en CABA y GBA, interesadas en moda sostenible. Tono aspiracional, foco en calidad de los materiales y proceso artesanal."
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 13,
                      border: "1px solid rgba(10,26,12,0.12)",
                      borderRadius: 4,
                      fontFamily: "inherit",
                      background: "var(--white)",
                      color: "var(--deep-green)",
                      outline: "none",
                      resize: "vertical",
                      lineHeight: 1.5,
                      marginBottom: 10,
                    }}
                  />

                  {/* Asignación de creativos al adset. */}
                  {creatives.length === 0 ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      Subí creativos arriba para asignarlos.
                    </div>
                  ) : (
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "var(--sand-dark)",
                          fontWeight: 600,
                          marginBottom: 6,
                        }}
                      >
                        Creativos asignados (
                        {adset.creative_ids.length === 0
                          ? "todos"
                          : adset.creative_ids.length}
                        /{creatives.length})
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        {creatives.map((c) => {
                          const isSelected =
                            adset.creative_ids.includes(c.id) ||
                            adset.creative_ids.length === 0;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() =>
                                toggleCreativeInAdset(idx, c.id)
                              }
                              title={c.name}
                              style={{
                                position: "relative",
                                width: 56,
                                height: 56,
                                border: "2px solid",
                                borderColor: isSelected
                                  ? "var(--deep-green)"
                                  : "transparent",
                                borderRadius: 4,
                                padding: 0,
                                cursor: "pointer",
                                overflow: "hidden",
                                background: "var(--white)",
                                opacity: isSelected ? 1 : 0.4,
                              }}
                            >
                              {c.type === "image" ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={c.url}
                                  alt={c.name}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    background: "#000",
                                    color: "#fff",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 18,
                                  }}
                                >
                                  ▶
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {adset.creative_ids.length === 0 && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--text-muted)",
                            fontStyle: "italic",
                            marginTop: 4,
                          }}
                        >
                          Sin asignación específica → este conjunto
                          recibe TODOS los creativos.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addAdset}
                style={{
                  background: "transparent",
                  border: "1px dashed rgba(10,26,12,0.2)",
                  color: "var(--deep-green)",
                  padding: "10px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRadius: 4,
                  fontFamily: "inherit",
                  letterSpacing: "0.04em",
                }}
              >
                + Agregar otro conjunto de anuncios
              </button>
            </div>
          </Section>

          {/* === Budget + Schedule === */}
          <Section label="5. Budget + Schedule">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <Label>Modo</Label>
                <select
                  value={budgetMode}
                  onChange={(e) => setBudgetMode(e.target.value as BudgetMode)}
                  style={input}
                >
                  <option value="daily">Diario</option>
                  <option value="lifetime">Total (lifetime)</option>
                </select>
              </div>
              <div>
                <Label>Monto (USD)</Label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  style={input}
                />
              </div>
              <div>
                <Label>Inicio</Label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={input}
                />
              </div>
              <div>
                <Label>Fin (opcional)</Label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={input}
                />
              </div>
            </div>
          </Section>

          {/* === Generate === */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={generate}
              disabled={
                generating ||
                !clientId ||
                !prompt.trim() ||
                creatives.length === 0
              }
              style={{
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                background: "var(--deep-green)",
                color: "var(--off-white)",
                border: "none",
                borderRadius: 6,
                cursor:
                  generating ||
                  !clientId ||
                  !prompt.trim() ||
                  creatives.length === 0
                    ? "default"
                    : "pointer",
                opacity:
                  generating ||
                  !clientId ||
                  !prompt.trim() ||
                  creatives.length === 0
                    ? 0.5
                    : 1,
                fontFamily: "inherit",
              }}
            >
              {generating ? "Generando…" : "✨ Generar campaña con Claude →"}
            </button>
            {generating && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                Tarda 15-30s. Claude está armando el spec.
              </span>
            )}
          </div>

          {error && (
            <div
              style={{
                padding: 14,
                background: "rgba(176,75,58,0.08)",
                borderLeft: "3px solid var(--red-warn)",
                color: "var(--red-warn)",
                fontSize: 12,
                whiteSpace: "pre-wrap",
                borderRadius: 4,
              }}
            >
              ⚠ {error}
            </div>
          )}

          {/* === Spec preview === */}
          {spec !== null && (
            <Section label="6. Spec generado · revisá antes de pushear">
              <pre
                style={{
                  background: "#0A1A0C",
                  color: "#e8e4dc",
                  padding: 18,
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  overflowX: "auto",
                  maxHeight: 480,
                  overflowY: "auto",
                  lineHeight: 1.55,
                }}
              >
                {JSON.stringify(spec, null, 2)}
              </pre>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 14,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => pushToMeta(true)}
                  disabled={pushing}
                  style={btnSecondary}
                >
                  {pushing ? "Procesando…" : "🔍 Preview (dry-run, sin pushear)"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !confirm(
                        "Esto va a crear la campaña + adset + ads en Meta Ads Manager (en status=PAUSED). ¿Continuar?",
                      )
                    )
                      return;
                    pushToMeta(false);
                  }}
                  disabled={pushing}
                  style={btnPrimary}
                >
                  {pushing ? "Pusheando…" : "📤 Pushear a Meta Ads Manager →"}
                </button>
              </div>
            </Section>
          )}

          {/* === Push result === */}
          {pushResult !== null && (
            <Section label="7. Resultado del push">
              <pre
                style={{
                  background: "#0A1A0C",
                  color: "#9ad19c",
                  padding: 18,
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  overflowX: "auto",
                  maxHeight: 360,
                  overflowY: "auto",
                  lineHeight: 1.55,
                }}
              >
                {JSON.stringify(pushResult, null, 2)}
              </pre>
            </Section>
          )}
        </div>
      </main>
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: 8,
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        fontWeight: 600,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  border: "1px solid rgba(10,26,12,0.12)",
  borderRadius: 4,
  fontFamily: "inherit",
  background: "var(--white)",
  color: "var(--deep-green)",
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  background: "#1877F2",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  background: "transparent",
  color: "var(--deep-green)",
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
};
