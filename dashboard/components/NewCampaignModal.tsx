"use client";

import { useState } from "react";
import { addCampaign } from "@/lib/storage";
import type { CampaignCTA, Seniority } from "@/lib/types";
import styles from "./NewClientModal.module.css";

interface NewCampaignModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const COUNTRY_OPTIONS = [
  "Uruguay", "Argentina", "Chile", "Paraguay",
  "Brasil", "Colombia", "México", "España",
  "Estados Unidos", "Otro",
];

const SENIORITY_OPTIONS: { value: Seniority; label: string }[] = [
  { value: "founder",  label: "Founder" },
  { value: "c_suite",  label: "C-suite (CEO, CMO, CFO…)" },
  { value: "vp",       label: "VP" },
  { value: "head",     label: "Head of…" },
  { value: "director", label: "Director" },
  { value: "manager",  label: "Manager" },
  { value: "senior",   label: "Senior" },
  { value: "entry",    label: "Entry / Junior" },
];

const COMPANY_SIZE_PRESETS = [
  { label: "1-10",      min: 1,    max: 10 },
  { label: "11-50",     min: 11,   max: 50 },
  { label: "51-200",    min: 51,   max: 200 },
  { label: "201-1000",  min: 201,  max: 1000 },
  { label: "1001+",     min: 1001, max: 999999 },
];

const REVENUE_RANGES = [
  "< $500k USD/año",
  "$500k - $2M USD/año",
  "$2M - $10M USD/año",
  "$10M - $50M USD/año",
  "$50M+ USD/año",
];

const CHANNEL_OPTIONS = ["LinkedIn", "Email", "Cold call"];

export default function NewCampaignModal({
  open,
  onClose,
  onCreated,
}: NewCampaignModalProps) {
  // Básico
  const [name, setName] = useState("");
  const [status] = useState<"active" | "paused">("active");

  // Geografía
  const [countries, setCountries] = useState<string[]>(["Uruguay"]);
  const [regionsInput, setRegionsInput] = useState("");
  const [citiesInput, setCitiesInput] = useState("");

  // Empresa
  const [industriesInput, setIndustriesInput] = useState("");
  const [companySizeMin, setCompanySizeMin] = useState<number | undefined>(11);
  const [companySizeMax, setCompanySizeMax] = useState<number | undefined>(200);
  const [revenueRange, setRevenueRange] = useState(REVENUE_RANGES[1]);
  const [buyingSignalsInput, setBuyingSignalsInput] = useState("");
  const [excludedInput, setExcludedInput] = useState("");

  // Persona
  const [rolesInput, setRolesInput] = useState("");
  const [seniorities, setSeniorities] = useState<Seniority[]>([
    "c_suite", "founder",
  ]);

  // Messaging
  const [cta, setCta] = useState<CampaignCTA>("calendly");
  const [ctaUrl, setCtaUrl] = useState("");
  const [messageTone, setMessageTone] = useState("Directo, cercano, sin jerga");
  const [valueAngle, setValueAngle] = useState("");

  // Volume
  const [dailyVolume, setDailyVolume] = useState(30);
  const [followUps, setFollowUps] = useState(3);
  const [channels, setChannels] = useState<string[]>(["LinkedIn", "Email"]);

  // UI step
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const canSubmit =
    name.trim() &&
    countries.length > 0 &&
    industriesInput.trim() &&
    rolesInput.trim();

  function toggleInArray<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  }

  function parseList(input: string): string[] {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function pickSize(preset: { min: number; max: number }) {
    setCompanySizeMin(preset.min);
    setCompanySizeMax(preset.max);
  }

  async function handleSubmit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      await addCampaign({
        name: name.trim(),
        status,

        countries,
        regions: parseList(regionsInput),
        cities: parseList(citiesInput),

        industries: parseList(industriesInput),
        companySizeMin,
        companySizeMax,
        revenueRange,
        buyingSignals: parseList(buyingSignalsInput),
        excludedCompanies: parseList(excludedInput),

        roles: parseList(rolesInput),
        seniorities,

        cta,
        ctaUrl: ctaUrl.trim() || undefined,
        messageTone,
        valueAngle: valueAngle.trim() || undefined,

        dailyVolume,
        followUps,
        channels,

        // compat (derivados en addCampaign)
        country: countries[0] || "",
        demographics: "",
        clientType: "",
      });

      // Reset
      setName("");
      setRegionsInput("");
      setCitiesInput("");
      setIndustriesInput("");
      setBuyingSignalsInput("");
      setExcludedInput("");
      setRolesInput("");
      setValueAngle("");
      setCtaUrl("");
      setStep(1);
      onClose();
      onCreated?.();
    } catch (err) {
      console.error(err);
      alert("Error al crear campaña. Revisá la consola.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal} style={{ maxWidth: 760 }}>
        <button className={styles.close} onClick={onClose}>×</button>

        <div className={styles.eyebrow}>
          Campaña de prospección · Paso {step} de 3
        </div>
        <h2 className={styles.title}>Definir ICP</h2>
        <p className={styles.sub}>
          El agente va a buscar leads que matcheen este perfil en LinkedIn y Apollo,
          luego los contactará automáticamente por los canales elegidos.
        </p>

        {/* Step indicator */}
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 24,
            borderBottom: "1px solid rgba(10,26,12,0.08)",
          }}
        >
          {["Geografía + Empresa", "Persona + Mensaje", "Envío"].map((t, i) => (
            <div
              key={t}
              onClick={() => setStep(i + 1)}
              style={{
                flex: 1,
                padding: "12px 8px",
                borderBottom: `2px solid ${
                  step === i + 1 ? "var(--sand)" : "transparent"
                }`,
                marginBottom: -1,
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: step === i + 1 ? "var(--deep-green)" : "var(--text-muted)",
                fontWeight: 600,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              0{i + 1} · {t}
            </div>
          ))}
        </div>

        {/* PASO 1: Geografía + Empresa */}
        {step === 1 && (
          <>
            <div className={styles.field}>
              <label>Nombre interno de la campaña</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Retailers eCommerce UY · Q2 2026"
                autoFocus
              />
            </div>

            <div className={styles.sectionLabel}>Geografía</div>

            <div className={styles.field}>
              <label>Países (elegí uno o varios)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {COUNTRY_OPTIONS.map((c) => {
                  const active = countries.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCountries(toggleInArray(countries, c))}
                      style={{
                        padding: "8px 14px",
                        border: `2px solid ${
                          active ? "var(--sand)" : "rgba(10,26,12,0.1)"
                        }`,
                        background: active ? "var(--off-white)" : "var(--white)",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "var(--deep-green)",
                      }}
                    >
                      {active ? "✓ " : ""}
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.fieldGrid2}>
              <div className={styles.field}>
                <label>Departamentos / Regiones (opcional)</label>
                <input
                  value={regionsInput}
                  onChange={(e) => setRegionsInput(e.target.value)}
                  placeholder="Montevideo, Canelones, Maldonado"
                />
              </div>
              <div className={styles.field}>
                <label>Ciudades específicas (opcional)</label>
                <input
                  value={citiesInput}
                  onChange={(e) => setCitiesInput(e.target.value)}
                  placeholder="Montevideo, Punta del Este"
                />
              </div>
            </div>

            <div className={styles.sectionLabel}>Empresa objetivo</div>

            <div className={styles.field}>
              <label>Industria / vertical (separadas por coma)</label>
              <input
                value={industriesInput}
                onChange={(e) => setIndustriesInput(e.target.value)}
                placeholder="eCommerce, Retail, Real Estate, SaaS B2B"
              />
            </div>

            <div className={styles.field}>
              <label>Tamaño de empresa (empleados)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {COMPANY_SIZE_PRESETS.map((p) => {
                  const active =
                    companySizeMin === p.min && companySizeMax === p.max;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => pickSize(p)}
                      style={{
                        padding: "8px 14px",
                        border: `2px solid ${
                          active ? "var(--sand)" : "rgba(10,26,12,0.1)"
                        }`,
                        background: active ? "var(--off-white)" : "var(--white)",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "var(--deep-green)",
                      }}
                    >
                      {active ? "✓ " : ""}
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                <span>O manual:</span>
                <input
                  type="number"
                  value={companySizeMin ?? ""}
                  onChange={(e) =>
                    setCompanySizeMin(Number(e.target.value) || undefined)
                  }
                  placeholder="min"
                  style={{
                    width: 80,
                    border: "1px solid rgba(10,26,12,0.15)",
                    padding: "6px 8px",
                    fontSize: 13,
                  }}
                />
                <span>a</span>
                <input
                  type="number"
                  value={companySizeMax ?? ""}
                  onChange={(e) =>
                    setCompanySizeMax(Number(e.target.value) || undefined)
                  }
                  placeholder="max"
                  style={{
                    width: 80,
                    border: "1px solid rgba(10,26,12,0.15)",
                    padding: "6px 8px",
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label>Facturación aproximada</label>
              <select
                value={revenueRange}
                onChange={(e) => setRevenueRange(e.target.value)}
              >
                {REVENUE_RANGES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label>Señales de compra (opcional, coma)</label>
              <input
                value={buyingSignalsInput}
                onChange={(e) => setBuyingSignalsInput(e.target.value)}
                placeholder="Contratan marketing, levantaron inversión, abrieron nuevo mercado"
              />
            </div>

            <div className={styles.field}>
              <label>Empresas a excluir (opcional, coma)</label>
              <input
                value={excludedInput}
                onChange={(e) => setExcludedInput(e.target.value)}
                placeholder="Competencia directa, clientes actuales…"
              />
            </div>
          </>
        )}

        {/* PASO 2: Persona + Mensaje */}
        {step === 2 && (
          <>
            <div className={styles.sectionLabel}>
              Contacto / decisor dentro de la empresa
            </div>

            <div className={styles.field}>
              <label>Roles / cargos (separados por coma)</label>
              <input
                value={rolesInput}
                onChange={(e) => setRolesInput(e.target.value)}
                placeholder="CEO, Founder, CMO, Head of Growth, Director de Marketing"
              />
            </div>

            <div className={styles.field}>
              <label>Seniority (elegí uno o varios)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SENIORITY_OPTIONS.map((s) => {
                  const active = seniorities.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() =>
                        setSeniorities(toggleInArray(seniorities, s.value))
                      }
                      style={{
                        padding: "8px 14px",
                        border: `2px solid ${
                          active ? "var(--sand)" : "rgba(10,26,12,0.1)"
                        }`,
                        background: active ? "var(--off-white)" : "var(--white)",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "var(--deep-green)",
                      }}
                    >
                      {active ? "✓ " : ""}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.sectionLabel}>Estrategia de mensaje</div>

            <div className={styles.field}>
              <label>¿Qué acción querés que haga el prospecto?</label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                {[
                  {
                    value: "calendly" as CampaignCTA,
                    label: "Agendar en Calendly",
                    desc: "Link directo al calendario",
                  },
                  {
                    value: "landing" as CampaignCTA,
                    label: "Ir a landing page",
                    desc: "CTA a una página con más info",
                  },
                  {
                    value: "custom" as CampaignCTA,
                    label: "Otro",
                    desc: "Definís vos la acción",
                  },
                ].map((opt) => {
                  const active = cta === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCta(opt.value)}
                      style={{
                        padding: 16,
                        border: `2px solid ${
                          active ? "var(--sand)" : "rgba(10,26,12,0.1)"
                        }`,
                        background: active ? "var(--off-white)" : "var(--white)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {opt.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.field}>
              <label>
                {cta === "calendly"
                  ? "Link de Calendly"
                  : cta === "landing"
                  ? "URL de la landing page"
                  : "URL o instrucción"}
              </label>
              <input
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder={
                  cta === "calendly"
                    ? "https://calendly.com/federico-dyc/30min"
                    : cta === "landing"
                    ? "https://dearmascostantini.com/growth"
                    : "URL o instrucción"
                }
              />
            </div>

            <div className={styles.field}>
              <label>Tono de los mensajes</label>
              <input
                value={messageTone}
                onChange={(e) => setMessageTone(e.target.value)}
                placeholder="Directo, cercano, sin jerga"
              />
            </div>

            <div className={styles.field}>
              <label>Ángulo de valor / gancho principal</label>
              <textarea
                rows={3}
                value={valueAngle}
                onChange={(e) => setValueAngle(e.target.value)}
                placeholder="Ej: Trabajamos con 2 retailers de tu sector y les subimos ROAS de 2.1x a 4.5x. No somos agencia, nos asociamos — skin in the game."
                style={{ resize: "vertical" }}
              />
            </div>
          </>
        )}

        {/* PASO 3: Envío */}
        {step === 3 && (
          <>
            <div className={styles.sectionLabel}>Canales de contacto</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              {CHANNEL_OPTIONS.map((ch) => {
                const active = channels.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannels(toggleInArray(channels, ch))}
                    style={{
                      padding: "10px 16px",
                      border: `2px solid ${
                        active ? "var(--sand)" : "rgba(10,26,12,0.1)"
                      }`,
                      background: active ? "var(--off-white)" : "var(--white)",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "var(--deep-green)",
                    }}
                  >
                    {active ? "✓ " : ""}
                    {ch}
                  </button>
                );
              })}
            </div>

            <div className={styles.sectionLabel}>Volumen y follow-ups</div>
            <div className={styles.fieldGrid2}>
              <div className={styles.field}>
                <label>Contactos por día</label>
                <select
                  value={dailyVolume}
                  onChange={(e) => setDailyVolume(Number(e.target.value))}
                >
                  <option value={15}>15 / día (warm-up)</option>
                  <option value={30}>30 / día (safe)</option>
                  <option value={50}>50 / día</option>
                  <option value={80}>80 / día (agresivo)</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Follow-ups automáticos</label>
                <select
                  value={followUps}
                  onChange={(e) => setFollowUps(Number(e.target.value))}
                >
                  <option value={0}>Sin follow-up</option>
                  <option value={2}>2 intentos · 7 días entre cada uno</option>
                  <option value={3}>3 intentos · 4 días entre cada uno</option>
                  <option value={5}>5 intentos · 3 días entre cada uno</option>
                </select>
              </div>
            </div>

            <div
              style={{
                marginTop: 24,
                padding: 20,
                background: "var(--deep-green)",
                color: "var(--off-white)",
                borderLeft: "3px solid var(--sand)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--sand)",
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                Resumen del ICP
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(232,228,220,0.9)" }}>
                <strong>Geografía:</strong> {countries.join(", ") || "—"}
                {parseList(regionsInput).length > 0 &&
                  ` · Regiones: ${parseList(regionsInput).join(", ")}`}
                <br />
                <strong>Empresa:</strong> {industriesInput || "—"}
                {companySizeMin && companySizeMax &&
                  ` · ${companySizeMin}-${companySizeMax} empleados`}
                <br />
                <strong>Decisor:</strong> {rolesInput || "—"}
                {seniorities.length > 0 && ` · ${seniorities.length} niveles`}
                <br />
                <strong>CTA:</strong>{" "}
                {cta === "calendly"
                  ? "Agendar Calendly"
                  : cta === "landing"
                  ? "Ir a landing"
                  : "Custom"}
                <br />
                <strong>Canales:</strong> {channels.join(" + ") || "—"} · {dailyVolume}/día
                · {followUps} follow-ups
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 14,
                background: "var(--off-white)",
                borderLeft: "3px solid var(--yellow-warn)",
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: "var(--deep-green)" }}>⏳ Próximo paso:</strong>{" "}
              Una vez creada la campaña, el agente empieza a buscar leads.
              Por ahora la búsqueda real con Apollo está pendiente (Fase 3).
              Lo que sí ya funciona: queda guardada con todo el ICP listo para
              consumir cuando conectemos la API.
            </div>
          </>
        )}

        {/* Navegación */}
        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>
            Cancelar
          </button>
          {step > 1 && (
            <button className={styles.btnGhost} onClick={() => setStep(step - 1)}>
              ← Atrás
            </button>
          )}
          {step < 3 ? (
            <button
              className={styles.btnSolid}
              onClick={() => setStep(step + 1)}
              disabled={
                step === 1 &&
                (!name.trim() ||
                  countries.length === 0 ||
                  !industriesInput.trim())
              }
            >
              Siguiente →
            </button>
          ) : (
            <button
              className={styles.btnSolid}
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
            >
              {saving ? "Creando…" : "Lanzar campaña →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
