"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addClient } from "@/lib/storage";
import { makeWizardSessionId } from "@/lib/upload";
import Dropzone from "./Dropzone";
import type {
  BudgetTier,
  ClientOnboarding,
  ClientType,
  OnboardingFile,
} from "@/lib/types";
import styles from "./NewClientModal.module.css";

// Convierte los strings de los inputs a un BudgetTier estructurado.
// Si ambos campos están vacíos devuelve undefined (no guardamos nada).
function makeBudgetTier(
  fixedStr: string,
  pctStr: string,
): BudgetTier | undefined {
  const fixed = fixedStr ? Number(fixedStr) : undefined;
  const revenuePct = pctStr ? Number(pctStr) : undefined;
  if (
    (fixed === undefined || Number.isNaN(fixed)) &&
    (revenuePct === undefined || Number.isNaN(revenuePct))
  ) {
    return undefined;
  }
  const out: BudgetTier = {};
  if (fixed !== undefined && !Number.isNaN(fixed)) out.fixed = fixed;
  if (revenuePct !== undefined && !Number.isNaN(revenuePct))
    out.revenuePct = revenuePct;
  return out;
}

interface NewClientModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const STEP_LABELS = [
  "Servicio",
  "Datos",
  "Contrato + Fees",
  "Kickoff + Branding",
  "Alcance",
  "Confirmar",
];

type ModulesState = {
  meta: boolean;
  google: boolean;
  content: boolean;
  seo: boolean;
  email: boolean;
  analytics: boolean;
  ugc: boolean;
  cro: boolean;
  reporting: boolean;
};

const DEFAULT_MODULES: ModulesState = {
  meta: true,
  google: true,
  content: true,
  seo: false,
  email: false,
  analytics: true,
  ugc: false,
  cro: false,
  reporting: false,
};

const COUNTRIES = [
  "Uruguay",
  "Argentina",
  "Chile",
  "Paraguay",
  "España",
  "México",
  "Otro",
];

const DEV_PROJECT_TYPES = [
  "Chatbot",
  "Automatización",
  "Analytics/BI",
  "RRHH",
  "CRM custom",
  "Otro",
];

export default function NewClientModal({
  open,
  onClose,
  onCreated,
}: NewClientModalProps) {
  const router = useRouter();

  // Wizard state
  const [step, setStep] = useState(1);
  const [type, setType] = useState<ClientType>("gp");

  // Step 2 — datos
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("Uruguay");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Step 3 — contrato + fees
  const [fee, setFee] = useState("");
  const [method, setMethod] = useState("Método completo");
  const [contractDuration, setContractDuration] = useState<string>("12");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [contractFile, setContractFile] = useState<string | null>(null);
  const [hasVariable, setHasVariable] = useState(false);
  const [variableTiers, setVariableTiers] = useState<string[]>([
    "15% sobre revenue growth si supera 30%",
  ]);

  // Step 3 — presupuestos (movidos acá, son contractuales)
  const [budgetMarketingFixed, setBudgetMarketingFixed] = useState("");
  const [budgetMarketingPct, setBudgetMarketingPct] = useState("");
  const [budgetProduccionFixed, setBudgetProduccionFixed] = useState("");
  const [budgetProduccionPct, setBudgetProduccionPct] = useState("");

  // Step 4 — kickoff + branding (uploads reales a Supabase Storage)
  // El wizardId es un folder único por modal-abierto. Si el usuario
  // cancela, los archivos quedan huérfanos en el bucket (cleanup
  // posterior). Se regenera en reset().
  const [wizardId, setWizardId] = useState(() => makeWizardSessionId());
  const [kickoffFile, setKickoffFile] = useState<OnboardingFile | null>(null);
  const [brandingFiles, setBrandingFiles] = useState<OnboardingFile[]>([]);

  // Step 5 — alcance
  const [modules, setModules] = useState<ModulesState>(DEFAULT_MODULES);
  const [devProjectType, setDevProjectType] = useState<string>("");

  // Confirm
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  // ============ Helpers ============

  function reset() {
    setStep(1);
    setType("gp");
    setName("");
    setSector("");
    setCountry("Uruguay");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setFee("");
    setMethod("Método completo");
    setContractDuration("12");
    setStartDate("");
    setEndDate("");
    setContractFile(null);
    setHasVariable(false);
    setVariableTiers(["15% sobre revenue growth si supera 30%"]);
    setBudgetMarketingFixed("");
    setBudgetMarketingPct("");
    setBudgetProduccionFixed("");
    setBudgetProduccionPct("");
    setWizardId(makeWizardSessionId());
    setKickoffFile(null);
    setBrandingFiles([]);
    setModules(DEFAULT_MODULES);
    setDevProjectType("");
  }

  function updateTier(idx: number, value: string) {
    setVariableTiers((prev) => prev.map((t, i) => (i === idx ? value : t)));
  }
  function addTier() {
    setVariableTiers((prev) => [...prev, ""]);
  }
  function removeTier(idx: number) {
    setVariableTiers((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  }

  function toggleModule(key: keyof ModulesState) {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Validación por paso (sólo el mínimo para avanzar; el resto es opcional)
  function canAdvance(): boolean {
    if (step === 1) return !!type;
    if (step === 2) return name.trim().length > 0 && sector.trim().length > 0;
    if (step === 3) return fee.trim() !== "" && Number(fee) > 0;
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    setStep((s) => Math.min(s + 1, STEP_LABELS.length));
  }
  function prev() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function finalize() {
    if (saving) return;
    setSaving(true);
    try {
      const onboarding: ClientOnboarding = {
        contractDuration,
        contractFile: contractFile ?? undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        feeVariableTiers: hasVariable
          ? variableTiers.map((t) => t.trim()).filter(Boolean)
          : undefined,
        kickoffFile: kickoffFile ?? undefined,
        brandingFiles: brandingFiles.length ? brandingFiles : undefined,
        budgetMarketing: makeBudgetTier(budgetMarketingFixed, budgetMarketingPct),
        budgetProduccion: makeBudgetTier(budgetProduccionFixed, budgetProduccionPct),
        devProjectType:
          type === "dev" && devProjectType ? devProjectType : undefined,
      };

      const feeVariableSummary = hasVariable
        ? variableTiers
            .map((t) => t.trim())
            .filter(Boolean)
            .join(" · ") || undefined
        : undefined;

      const newClient = await addClient({
        name: name.trim(),
        sector: sector.trim(),
        country,
        type,
        fee: Number(fee),
        method,
        contactName,
        contactEmail,
        contactPhone,
        feeVariable: feeVariableSummary,
        modules: type === "gp" ? modules : undefined,
        onboarding,
      });

      // Fire-and-forget: scaffold del vault folder en background.
      fetch("/api/clients/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: newClient.id,
          name: newClient.name,
          sector: sector.trim(),
          country,
          type,
          fee: Number(fee),
          method,
          phase: newClient.phase,
        }),
      }).catch((err) => console.error("bootstrap dispatch failed:", err));

      reset();
      onClose();
      onCreated?.();
      router.push(`/cliente/${newClient.id}`);
    } catch (err) {
      const e = err as { code?: string; message?: string; details?: string; hint?: string };
      console.error(
        "addClient error:",
        JSON.stringify(err, Object.getOwnPropertyNames(err as object)),
      );
      alert(
        `Error al crear cliente.\n${e.code ?? ""} ${e.message ?? ""}\n${e.details ?? ""}\n${e.hint ?? ""}`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>

        <div className={styles.eyebrow}>
          Onboarding de cliente · Paso {step} de {STEP_LABELS.length}
        </div>
        <h2 className={styles.title}>Nuevo cliente</h2>
        <p className={styles.sub}>
          Del contrato al kickoff. Toda la información que cargues acá alimenta
          objetivos, agentes, presupuestos y reportes.
        </p>

        {/* ===== STEP INDICATOR ===== */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${STEP_LABELS.length}, 1fr)`,
            gap: 4,
            marginBottom: 28,
            paddingBottom: 16,
            borderBottom: "1px solid rgba(10,26,12,0.08)",
          }}
        >
          {STEP_LABELS.map((label, i) => {
            const idx = i + 1;
            const active = step === idx;
            const done = step > idx;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(idx)}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${
                    active
                      ? "var(--sand)"
                      : done
                      ? "var(--sand-dark)"
                      : "transparent"
                  }`,
                  padding: "8px 4px",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: active
                    ? "var(--deep-green)"
                    : done
                    ? "var(--sand-dark)"
                    : "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "center",
                }}
              >
                {String(idx).padStart(2, "0")} · {label}
              </button>
            );
          })}
        </div>

        {/* ===== STEP 1 — SERVICIO ===== */}
        {step === 1 && (
          <>
            <div className={styles.sectionLabel}>¿Qué tipo de servicio?</div>
            <div className={styles.serviceSelector}>
              <button
                type="button"
                className={`${styles.serviceOption} ${
                  type === "gp" ? styles.serviceSelected : ""
                }`}
                onClick={() => setType("gp")}
              >
                <div className={styles.sName}>Growth Partner</div>
                <div className={styles.sDesc}>
                  Marketing digital · Ads · Contenido · SEO · Analítica. Para
                  negocios que venden online.
                </div>
              </button>
              <button
                type="button"
                className={`${styles.serviceOption} ${
                  type === "dev" ? styles.serviceSelected : ""
                }`}
                onClick={() => setType("dev")}
              >
                <div className={styles.sName}>Desarrollo</div>
                <div className={styles.sDesc}>
                  IA a medida · Chatbots · Automatización · Analytics/BI. Para
                  operaciones offline.
                </div>
              </button>
            </div>
          </>
        )}

        {/* ===== STEP 2 — DATOS ===== */}
        {step === 2 && (
          <>
            <div className={styles.field}>
              <label>Nombre del cliente</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: RealValue Propiedades"
                autoFocus
              />
            </div>
            <div className={styles.fieldGrid2}>
              <div className={styles.field}>
                <label>Sector / industria</label>
                <input
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="Real Estate · eCommerce · Salud"
                />
              </div>
              <div className={styles.field}>
                <label>País</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.sectionLabel}>
              Contacto principal del cliente
            </div>
            <div className={styles.fieldGrid3}>
              <div className={styles.field}>
                <label>Nombre</label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ej: María González"
                />
              </div>
              <div className={styles.field}>
                <label>Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contacto@empresa.com"
                />
              </div>
              <div className={styles.field}>
                <label>Teléfono</label>
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+598..."
                />
              </div>
            </div>
          </>
        )}

        {/* ===== STEP 3 — CONTRATO + FEES ===== */}
        {step === 3 && (
          <>
            <div className={styles.sectionLabel}>Fee mensual fijo</div>
            <div className={styles.fieldGrid2}>
              <div className={styles.field}>
                <label>Fee mensual (USD)</label>
                <input
                  type="number"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="3500"
                />
              </div>
              <div className={styles.field}>
                <label>Duración del contrato</label>
                <select
                  value={contractDuration}
                  onChange={(e) => setContractDuration(e.target.value)}
                >
                  <option value="6">6 meses</option>
                  <option value="12">12 meses</option>
                  <option value="18">18 meses</option>
                  <option value="24">24 meses</option>
                  <option value="open">Sin plazo fijo</option>
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label>Método / modalidad</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option>Método completo</option>
                <option>Solo Ads</option>
                <option>eCommerce full</option>
                <option>Contenido + SEO</option>
                <option>Generación de leads</option>
                <option>Personalizado</option>
              </select>
            </div>

            {/* Fee variable por tramos escalonados */}
            <div
              style={{
                marginTop: 4,
                padding: 20,
                background: "var(--off-white)",
                borderLeft: "3px solid var(--sand)",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  cursor: "pointer",
                  fontSize: 13,
                  marginBottom: hasVariable ? 18 : 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={hasVariable}
                  onChange={(e) => setHasVariable(e.target.checked)}
                  style={{ width: "auto", marginTop: 3 }}
                />
                <span>
                  <strong>Fee variable por resultados</strong>
                  <br />
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Bonus condicionado a métricas (ROAS, revenue, leads,
                    milestones). Se pueden definir tramos escalados.
                  </span>
                </span>
              </label>

              {hasVariable && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginBottom: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    Definí uno o más tramos. Si el negocio crece, suma tramos
                    extra (ej: 15% al superar 30%, 20% al superar 50%).
                  </div>

                  {variableTiers.map((tier, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 10,
                        paddingBottom: 8,
                        borderBottom: "1px solid rgba(10,26,12,0.08)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          color: "var(--sand-dark)",
                          fontWeight: 600,
                          minWidth: 56,
                        }}
                      >
                        Tramo {idx + 1}
                      </span>
                      <input
                        style={{
                          flex: 1,
                          background: "transparent",
                          border: "none",
                          borderBottom: "1px solid rgba(10,26,12,0.15)",
                          padding: "10px 0",
                          color: "var(--deep-green)",
                          fontSize: 14,
                          fontWeight: 300,
                          outline: "none",
                          fontFamily: "inherit",
                        }}
                        placeholder={
                          idx === 0
                            ? "Ej: 15% sobre revenue growth si supera 30%"
                            : idx === 1
                            ? "Ej: 20% sobre revenue growth si supera 50%"
                            : "Ej: 25% sobre revenue growth si supera 80%"
                        }
                        value={tier}
                        onChange={(e) => updateTier(idx, e.target.value)}
                      />
                      {variableTiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTier(idx)}
                          title="Quitar tramo"
                          style={{
                            width: 28,
                            height: 28,
                            border: "1px solid rgba(176,75,58,0.2)",
                            background: "transparent",
                            color: "var(--red-warn)",
                            cursor: "pointer",
                            fontSize: 14,
                            fontFamily: "inherit",
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addTier}
                    style={{
                      marginTop: 6,
                      padding: "8px 14px",
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      color: "var(--deep-green)",
                      background: "var(--white)",
                      border: "1px dashed var(--sand)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    + Agregar tramo escalado
                  </button>
                </div>
              )}
            </div>

            <div className={styles.sectionLabel}>Fechas de vigencia</div>
            <div className={styles.fieldGrid2}>
              <div className={styles.field}>
                <label>Inicio del contrato</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label>Fin del contrato</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.sectionLabel}>Contrato firmado</div>
            <div
              onClick={() =>
                setContractFile(
                  `contrato_${(name || "cliente")
                    .toLowerCase()
                    .replace(/\s+/g, "_")}.pdf`,
                )
              }
              style={{
                border: "2px dashed rgba(10,26,12,0.15)",
                padding: 28,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  color: "var(--sand-dark)",
                  marginBottom: 8,
                }}
              >
                ▢
              </div>
              {contractFile ? (
                <>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--deep-green)",
                      marginBottom: 4,
                    }}
                  >
                    ✓ {contractFile}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--sand-dark)" }}>
                    Contrato cargado · Click para reemplazar
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      marginBottom: 4,
                    }}
                  >
                    Arrastrá el PDF firmado o hacé click
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Se guarda en Biblioteca → Contratos del cliente
                  </div>
                </>
              )}
            </div>

            {/* Presupuestos (movidos del step 4 — son contractuales) */}
            <div className={styles.sectionLabel}>
              Presupuestos default del cliente
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 16,
                lineHeight: 1.5,
              }}
            >
              Cada presupuesto soporta <strong>piso fijo + % sobre revenue</strong>.
              Si el negocio escala, el presupuesto crece automáticamente con el
              revenue manteniendo el mínimo garantizado.
            </div>

            <BudgetField
              label="Presupuesto marketing (ads mensual)"
              fixed={budgetMarketingFixed}
              setFixed={setBudgetMarketingFixed}
              pct={budgetMarketingPct}
              setPct={setBudgetMarketingPct}
              fixedPlaceholder="5000"
              pctPlaceholder="10"
            />

            <BudgetField
              label="Presupuesto producción/campañas"
              fixed={budgetProduccionFixed}
              setFixed={setBudgetProduccionFixed}
              pct={budgetProduccionPct}
              setPct={setBudgetProduccionPct}
              fixedPlaceholder="1500"
              pctPlaceholder="3"
            />

            <div
              style={{
                marginTop: 20,
                padding: "14px 18px",
                background: "var(--deep-green)",
                color: "var(--off-white)",
                fontSize: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    color: "var(--sand)",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    fontWeight: 600,
                    marginBottom: 4,
                    textTransform: "uppercase",
                  }}
                >
                  Total MRR esperado
                </div>
                <div style={{ fontSize: 14 }}>
                  Fee fijo: <strong>${fee || 0}</strong>
                  {hasVariable ? " + variable estimado" : ""}
                </div>
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "var(--sand)",
                }}
              >
                ${(parseFloat(fee) || 0).toLocaleString()}/mes
              </div>
            </div>
          </>
        )}

        {/* ===== STEP 4 — KICKOFF + BRANDING ===== */}
        {step === 4 && (
          <>
            <div
              style={{
                background: "var(--deep-green)",
                color: "var(--off-white)",
                padding: 24,
                marginBottom: 24,
                borderLeft: "3px solid var(--sand)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.25em",
                  textTransform: "uppercase",
                  color: "var(--sand)",
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                ⚑ Paso crítico · Fuente de toda la información
              </div>
              <div
                style={{
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: "rgba(232,228,220,0.9)",
                }}
              >
                Subí el <strong style={{ color: "var(--sand)" }}>kickoff</strong>{" "}
                y el <strong style={{ color: "var(--sand)" }}>branding</strong>{" "}
                del cliente. Toda la info estratégica (propuesta, audiencia,
                tono, competidores, objetivos) ya vive en el kickoff — los
                agentes lo leen directo de ahí. Acá no preguntamos lo mismo
                dos veces.
              </div>
            </div>

            <div className={styles.sectionLabel}>Documento de Kickoff</div>
            <Dropzone
              folder={`${wizardId}/kickoff`}
              accept=".pdf,.doc,.docx"
              icon="▢"
              emptyTitle="Arrastrá el PDF/DOCX o hacé click"
              emptyHint="Brief del cliente, historia, situación actual, objetivos"
              files={kickoffFile ? [kickoffFile] : []}
              onAdd={(uploaded) => setKickoffFile(uploaded[0] ?? null)}
              onRemove={() => setKickoffFile(null)}
            />

            <div style={{ marginTop: 24 }}>
              <div className={styles.sectionLabel}>
                Branding completo del cliente
              </div>
              <Dropzone
                folder={`${wizardId}/branding`}
                multiple
                accept=".pdf,.zip,.png,.jpg,.jpeg,.svg,.ai,.eps"
                icon="◆"
                emptyTitle="Arrastrá los archivos o hacé click"
                emptyHint="Manual de marca, logos, paleta, tipografías, tono de voz"
                files={brandingFiles}
                onAdd={(uploaded) =>
                  setBrandingFiles((prev) => [...prev, ...uploaded])
                }
                onRemove={(path) =>
                  setBrandingFiles((prev) => prev.filter((f) => f.path !== path))
                }
              />
            </div>

            <div
              style={{
                marginTop: 24,
                padding: "16px 20px",
                background: "var(--off-white)",
                borderLeft: "3px solid var(--green-ok)",
                fontSize: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "var(--green-ok)",
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                ⚡ Al crear el cliente se hace automático:
              </div>
              <div style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
                → Kickoff y branding indexados en Biblioteca
                <br />
                → Agentes IA leen el kickoff y se alimentan de su contenido
                <br />
                → Branding disponible para todo el equipo
                <br />
                → Acceso del cliente al portal de solo lectura generado
              </div>
            </div>
          </>
        )}

        {/* ===== STEP 5 — ALCANCE ===== */}
        {step === 5 && (
          <>
            <div className={styles.sectionLabel}>
              {type === "gp"
                ? "Módulos activos de Growth Partner"
                : "Tipo de proyecto de Desarrollo"}
            </div>

            {type === "gp" ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  {(
                    [
                      ["meta", "Meta Ads"],
                      ["google", "Google Ads"],
                      ["content", "Contenido"],
                      ["seo", "SEO"],
                      ["email", "Email Marketing"],
                      ["analytics", "Analytics"],
                      ["ugc", "UGC"],
                      ["cro", "CRO"],
                      ["reporting", "Reporting"],
                    ] as [keyof ModulesState, string][]
                  ).map(([key, label]) => {
                    const on = modules[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleModule(key)}
                        style={{
                          padding: 16,
                          border: `2px solid ${
                            on ? "var(--sand)" : "rgba(10,26,12,0.1)"
                          }`,
                          background: on ? "var(--off-white)" : "var(--white)",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 500,
                          textAlign: "center",
                          fontFamily: "inherit",
                          color: "var(--deep-green)",
                        }}
                      >
                        {on ? "✓ " : ""}
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div
                  style={{
                    padding: 16,
                    background: "var(--off-white)",
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  Los agentes IA se activan automáticamente según los módulos
                  elegidos.
                </div>
              </>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                }}
              >
                {DEV_PROJECT_TYPES.map((t) => {
                  const selected = devProjectType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDevProjectType(t)}
                      style={{
                        padding: 20,
                        border: `2px solid ${
                          selected ? "var(--sand)" : "rgba(10,26,12,0.1)"
                        }`,
                        background: selected
                          ? "var(--off-white)"
                          : "var(--white)",
                        cursor: "pointer",
                        textAlign: "center",
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: "inherit",
                        color: "var(--deep-green)",
                      }}
                    >
                      {selected ? "✓ " : ""}
                      {t}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ===== STEP 6 — CONFIRMAR ===== */}
        {step === 6 && (
          <>
            <div
              style={{
                marginBottom: 16,
                padding: 24,
                borderLeft: "3px solid var(--sand)",
                background: "var(--off-white)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 600,
                  marginBottom: 14,
                }}
              >
                Resumen del onboarding
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 20,
                  fontSize: 13,
                }}
              >
                <SummaryCell label="Cliente">
                  <div>
                    <strong>{name || "(sin nombre)"}</strong> ·{" "}
                    {sector || "sin sector"} · {country}
                  </div>
                  <div
                    style={{ color: "var(--text-muted)", marginTop: 4 }}
                  >
                    Tipo: {type === "gp" ? "Growth Partner" : "Desarrollo"}
                  </div>
                </SummaryCell>

                <SummaryCell label="Contacto">
                  <div>{contactName || "(sin contacto)"}</div>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 12,
                    }}
                  >
                    {contactEmail}
                    {contactPhone ? ` · ${contactPhone}` : ""}
                  </div>
                </SummaryCell>

                <SummaryCell label="Contrato">
                  <div>
                    <strong>${fee || 0}/mes</strong>
                    {hasVariable ? " + variable" : ""}
                  </div>
                  <div
                    style={{ color: "var(--text-muted)", fontSize: 12 }}
                  >
                    {contractDuration === "open"
                      ? "Sin plazo fijo"
                      : `${contractDuration} meses`}{" "}
                    {contractFile
                      ? "· Contrato adjunto ✓"
                      : "· ⚠ Sin contrato"}
                  </div>
                  {hasVariable && variableTiers.filter((t) => t.trim()).length > 0 && (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 11,
                        marginTop: 6,
                        fontStyle: "italic",
                      }}
                    >
                      Tramos:{" "}
                      {variableTiers
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </SummaryCell>

                <SummaryCell label="Kickoff">
                  <div>
                    {kickoffFile ? "✓ Kickoff cargado" : "⚠ Sin kickoff"} ·{" "}
                    {brandingFiles.length} archivo
                    {brandingFiles.length === 1 ? "" : "s"} de branding
                  </div>
                  <div
                    style={{ color: "var(--text-muted)", fontSize: 12 }}
                  >
                    Agentes serán alimentados con esta info
                  </div>
                </SummaryCell>

                <SummaryCell label="Presupuestos">
                  <div>
                    Marketing:{" "}
                    <strong>
                      {formatBudget(budgetMarketingFixed, budgetMarketingPct)}
                    </strong>
                  </div>
                  <div>
                    Producción:{" "}
                    <strong>
                      {formatBudget(budgetProduccionFixed, budgetProduccionPct)}
                    </strong>
                  </div>
                </SummaryCell>

                <SummaryCell
                  label={
                    type === "gp" ? "Módulos activos" : "Tipo de proyecto"
                  }
                >
                  {type === "gp" ? (
                    <div>
                      {Object.entries(modules)
                        .filter(([, on]) => on)
                        .map(([k]) => k)
                        .join(" · ") || "—"}
                    </div>
                  ) : (
                    <div>{devProjectType || "—"}</div>
                  )}
                </SummaryCell>
              </div>
            </div>

            <div
              style={{
                padding: "16px 20px",
                background: "var(--deep-green)",
                color: "var(--off-white)",
                fontSize: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                Listo para activar. El cliente queda en{" "}
                <strong style={{ color: "var(--sand)" }}>
                  {type === "dev"
                    ? "Desarrollo · Sprint 1"
                    : "On-boarding · Diagnóstico"}
                </strong>
                .
              </div>
              <div
                style={{
                  color: "var(--sand)",
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                ⚡ Agentes preparados
              </div>
            </div>
          </>
        )}

        {/* ===== ACTIONS ===== */}
        <div className={styles.actions}>
          {step > 1 ? (
            <button className={styles.btnGhost} onClick={prev}>
              ← Atrás
            </button>
          ) : (
            <button className={styles.btnGhost} onClick={onClose}>
              Cancelar
            </button>
          )}

          {step < STEP_LABELS.length ? (
            <button
              className={styles.btnSolid}
              onClick={next}
              disabled={!canAdvance()}
            >
              Siguiente paso →
            </button>
          ) : (
            <button
              className={styles.btnSolid}
              onClick={finalize}
              disabled={saving}
            >
              {saving ? "Creando…" : "Crear cliente y activar →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// Input compuesto: piso fijo + % sobre revenue.
function BudgetField({
  label,
  fixed,
  setFixed,
  pct,
  setPct,
  fixedPlaceholder,
  pctPlaceholder,
}: {
  label: string;
  fixed: string;
  setFixed: (v: string) => void;
  pct: string;
  setPct: (v: string) => void;
  fixedPlaceholder?: string;
  pctPlaceholder?: string;
}) {
  return (
    <div
      style={{
        marginBottom: 18,
        padding: 16,
        background: "var(--off-white)",
        borderLeft: "3px solid var(--sand)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Mínimo fijo (USD/mes)
          </label>
          <input
            type="number"
            value={fixed}
            onChange={(e) => setFixed(e.target.value)}
            placeholder={fixedPlaceholder}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid rgba(10,26,12,0.2)",
              padding: "8px 0",
              color: "var(--deep-green)",
              fontSize: 15,
              fontWeight: 300,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            % sobre revenue
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              borderBottom: "1px solid rgba(10,26,12,0.2)",
            }}
          >
            <input
              type="number"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder={pctPlaceholder}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                padding: "8px 0",
                color: "var(--deep-green)",
                fontSize: 15,
                fontWeight: 300,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <span
              style={{
                fontSize: 14,
                color: "var(--text-muted)",
                marginLeft: 6,
              }}
            >
              %
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Formatea para el summary final ("US$5.000 + 10% revenue", "—", etc).
function formatBudget(fixedStr: string, pctStr: string): string {
  const fixed = fixedStr ? Number(fixedStr) : NaN;
  const pct = pctStr ? Number(pctStr) : NaN;
  const parts: string[] = [];
  if (!Number.isNaN(fixed)) parts.push(`US$ ${fixed.toLocaleString()}`);
  if (!Number.isNaN(pct)) parts.push(`${pct}% revenue`);
  return parts.length === 0 ? "—" : parts.join(" + ");
}
