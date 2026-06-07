"use client";

/**
 * EditClientCoreModal — modal compacto para editar los datos que se
 * cargaron al crear el cliente.  Aparece desde /cliente/[id]/configuracion.
 *
 * Cubre los campos más comunes que se quieren corregir post-creación:
 *   · Datos básicos: nombre, sector, país, sitio web (GP).
 *   · Contacto principal (name/email/phone).
 *   · Fee mensual (GP) / costos de producción y mantenimiento (DEV).
 *   · Method, isBrandLaunch (GP), tipo de proyecto (DEV).
 *   · Cuenta bancaria default.
 *   · Distribución de dividendos.
 *
 * NO duplica el wizard completo (no incluye uploads de kickoff /
 * branding / contract files — esos vienen de Storage y editarlos
 * requiere otro flujo).  Si el director necesita reemplazar archivos,
 * lo hace desde Biblioteca o la Zona de archivos del cliente.
 */

import { useEffect, useState } from "react";
import { listCuentas, type CuentaBancaria } from "@/lib/cuentas-bancarias";
import { updateClientCore } from "@/lib/storage";
import type { Client } from "@/lib/types";

const COUNTRIES = [
  "Uruguay",
  "Argentina",
  "Chile",
  "Paraguay",
  "Bolivia",
  "Brasil",
  "Perú",
  "Colombia",
  "México",
  "España",
  "Estados Unidos",
  "Otro",
];

export default function EditClientCoreModal({
  client,
  open,
  onClose,
  onSaved,
}: {
  client: Client;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Client) => void;
}) {
  // Campos básicos
  const [name, setName] = useState(client.name);
  const [sector, setSector] = useState(() => {
    // sector viene como "Real Estate · Uruguay" — separar para edit
    const [s] = client.sector.split("·").map((x) => x.trim());
    return s ?? "";
  });
  const [country, setCountry] = useState(client.country ?? "Uruguay");
  const [websiteUrl, setWebsiteUrl] = useState(client.website_url ?? "");
  const [razonSocial, setRazonSocial] = useState(client.razon_social ?? "");
  const [rut, setRut] = useState(client.rut ?? "");
  const [method, setMethod] = useState(client.method ?? "Método completo");

  // Contacto
  const [contactName, setContactName] = useState(client.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(client.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(client.contact_phone ?? "");

  // Fees
  const [fee, setFee] = useState(String(client.fee ?? ""));
  const [devProductionCost, setDevProductionCost] = useState(
    String(client.onboarding?.devProductionCost ?? ""),
  );
  const [devMaintenanceCost, setDevMaintenanceCost] = useState(
    String(client.onboarding?.devMaintenanceCost ?? ""),
  );
  const [devProjectType, setDevProjectType] = useState(
    client.onboarding?.devProjectType ?? "",
  );
  const [devDeliveryDate, setDevDeliveryDate] = useState(
    client.onboarding?.devDeliveryDate ?? "",
  );
  const [isBrandLaunch, setIsBrandLaunch] = useState(
    !!client.onboarding?.isBrandLaunch,
  );
  const [contractDuration, setContractDuration] = useState(
    client.onboarding?.contractDuration ?? "12",
  );

  // Cuenta bancaria default
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [defaultCuentaId, setDefaultCuentaId] = useState(
    client.default_cuenta_id ?? "",
  );

  // Distribución de dividendos
  const [dividendUseDefault, setDividendUseDefault] = useState(
    !client.dividend_distribution ||
      client.dividend_distribution.use_default !== false,
  );
  const [dividendPartnerA, setDividendPartnerA] = useState(
    String(client.dividend_distribution?.partner_a_pct ?? "50"),
  );
  const [dividendPartnerB, setDividendPartnerB] = useState(
    String(client.dividend_distribution?.partner_b_pct ?? "50"),
  );
  const [dividendInversiones, setDividendInversiones] = useState(
    String(client.dividend_distribution?.inversiones_pct ?? "0"),
  );
  const [dividendBack, setDividendBack] = useState(
    String(client.dividend_distribution?.back_pct ?? "0"),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      listCuentas().then(setCuentas);
    }
  }, [open]);

  if (!open) return null;

  const isGp = client.type === "gp";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const recurringFee = isGp
        ? Number(fee) || 0
        : Number(devMaintenanceCost) || 0;

      // Merge sobre el onboarding existente — no pisamos
      // contractFile/kickoffFile/etc.
      const onboardingMerged = {
        ...(client.onboarding ?? {}),
        contractDuration,
        devProductionCost:
          !isGp && devProductionCost ? Number(devProductionCost) : undefined,
        devMaintenanceCost:
          !isGp && devMaintenanceCost ? Number(devMaintenanceCost) : undefined,
        devProjectType: !isGp ? devProjectType || undefined : undefined,
        devDeliveryDate: !isGp ? devDeliveryDate || undefined : undefined,
        isBrandLaunch: isGp ? isBrandLaunch || undefined : undefined,
      };

      const dividendDistribution = dividendUseDefault
        ? null
        : {
            use_default: false,
            partner_a_pct: Number(dividendPartnerA) || 0,
            partner_b_pct: Number(dividendPartnerB) || 0,
            inversiones_pct: Number(dividendInversiones) || 0,
            back_pct: Number(dividendBack) || 0,
          };

      const updated = await updateClientCore(client.id, {
        name: name.trim(),
        // mantenemos el "sector · país" pattern del addClient original
        sector: `${sector.trim()} · ${country}`,
        country,
        method,
        fee: recurringFee,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        website_url: isGp ? websiteUrl.trim() || null : null,
        razon_social: razonSocial.trim() || null,
        rut: rut.trim() || null,
        default_cuenta_id: defaultCuentaId || null,
        dividend_distribution: dividendDistribution,
        onboarding: onboardingMerged,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      const e = err as Error;
      setError(`No se pudo guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,26,12,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        style={{
          background: "var(--white)",
          borderRadius: 12,
          padding: 32,
          width: "100%",
          maxWidth: 720,
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
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
          Cliente · Editar creación
        </div>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            marginBottom: 4,
            color: "var(--deep-green)",
            letterSpacing: "-0.02em",
          }}
        >
          Editar {client.name}
        </h2>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginBottom: 22,
            lineHeight: 1.5,
          }}
        >
          Corregir los datos que se cargaron al crear el cliente. Los
          archivos (contrato, kickoff, branding) se editan desde Biblioteca.
        </div>

        {/* ===== Datos básicos ===== */}
        <SectionTitle>Datos</SectionTitle>
        <Row>
          <Field label="Nombre">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Sector / industria">
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="País">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={inputStyle}
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </Row>
        {isGp && (
          <Row>
            <Field label="Sitio web">
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://..."
                style={inputStyle}
              />
            </Field>
          </Row>
        )}

        {/* ===== Datos fiscales ===== */}
        <SectionTitle>Datos fiscales (para facturación)</SectionTitle>
        <Row>
          <Field label="Razón social">
            <input
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Ej: Propiedades RealValue S.A."
              style={inputStyle}
            />
          </Field>
          <Field label="RUT / NIT">
            <input
              value={rut}
              onChange={(e) => setRut(e.target.value)}
              placeholder="Ej: 215123450014"
              style={inputStyle}
            />
          </Field>
        </Row>

        {/* ===== Contacto ===== */}
        <SectionTitle>Contacto principal</SectionTitle>
        <Row>
          <Field label="Nombre">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Email">
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Teléfono">
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </Row>

        {/* ===== Contrato + fees ===== */}
        <SectionTitle>Acuerdo comercial</SectionTitle>
        <Row>
          <Field label="Método / servicio">
            <input
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Duración del contrato">
            <select
              value={contractDuration}
              onChange={(e) => setContractDuration(e.target.value)}
              style={inputStyle}
            >
              <option value="6">6 meses</option>
              <option value="12">12 meses</option>
              <option value="18">18 meses</option>
              <option value="24">24 meses</option>
              <option value="open">Sin plazo fijo</option>
            </select>
          </Field>
        </Row>

        {isGp ? (
          <>
            <Row>
              <Field label="Fee mensual (USD)">
                <input
                  type="number"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </Row>
            <Row>
              <Field label="¿Cliente en fase de lanzamiento?">
                <label
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 12px",
                    border: "1px solid rgba(10,26,12,0.15)",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isBrandLaunch}
                    onChange={(e) => setIsBrandLaunch(e.target.checked)}
                    style={{ width: "auto" }}
                  />
                  <div style={{ fontSize: 12, color: "var(--deep-green)" }}>
                    Marca nueva en proceso de lanzamiento. Activa el menú
                    Estrategia y pasos de kickoff/branding.
                  </div>
                </label>
              </Field>
            </Row>
          </>
        ) : (
          <>
            <Row>
              <Field label="Costo de producción (USD)">
                <input
                  type="number"
                  value={devProductionCost}
                  onChange={(e) => setDevProductionCost(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Mantenimiento mensual (USD)">
                <input
                  type="number"
                  value={devMaintenanceCost}
                  onChange={(e) => setDevMaintenanceCost(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </Row>
            <Row>
              <Field label="Tipo de proyecto">
                <input
                  value={devProjectType}
                  onChange={(e) => setDevProjectType(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Fecha de entrega">
                <input
                  type="date"
                  value={devDeliveryDate}
                  onChange={(e) => setDevDeliveryDate(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </Row>
          </>
        )}

        <Row>
          <Field label="Cuenta bancaria default para cobros">
            <select
              value={defaultCuentaId}
              onChange={(e) => setDefaultCuentaId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Sin cuenta default —</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.account_name} · {c.bank_name} · {c.currency}
                </option>
              ))}
            </select>
          </Field>
        </Row>

        {/* ===== Dividendos ===== */}
        <SectionTitle>Distribución de dividendos</SectionTitle>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          Si dejás el default, se usan los porcentajes globales configurados
          en Finanzas. Si elegís personalizado, los porcentajes acá aplican
          solo a este cliente.
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              border: `1px solid ${dividendUseDefault ? "var(--sand-dark)" : "rgba(10,26,12,0.12)"}`,
              background: dividendUseDefault ? "rgba(196,168,130,0.1)" : "var(--white)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="edit_dividend_mode"
              checked={dividendUseDefault}
              onChange={() => setDividendUseDefault(true)}
              style={{ width: "auto" }}
            />
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              Usar la distribución por defecto (global de Finanzas)
            </div>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              border: `1px solid ${!dividendUseDefault ? "var(--sand-dark)" : "rgba(10,26,12,0.12)"}`,
              background: !dividendUseDefault ? "rgba(196,168,130,0.1)" : "var(--white)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="edit_dividend_mode"
              checked={!dividendUseDefault}
              onChange={() => setDividendUseDefault(false)}
              style={{ width: "auto" }}
            />
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              Distribución específica para este cliente
            </div>
          </label>
        </div>

        {!dividendUseDefault && (
          <div
            style={{
              padding: 14,
              background: "var(--off-white)",
              border: "1px solid rgba(196,168,130,0.3)",
              borderRadius: 6,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <PctInput
              label="Socio A (%)"
              value={dividendPartnerA}
              onChange={setDividendPartnerA}
            />
            <PctInput
              label="Socio B (%)"
              value={dividendPartnerB}
              onChange={setDividendPartnerB}
            />
            <PctInput
              label="Inversiones (%)"
              value={dividendInversiones}
              onChange={setDividendInversiones}
            />
            <PctInput
              label="Back / reservas (%)"
              value={dividendBack}
              onChange={setDividendBack}
            />
            {(() => {
              const sum =
                (Number(dividendPartnerA) || 0) +
                (Number(dividendPartnerB) || 0) +
                (Number(dividendInversiones) || 0) +
                (Number(dividendBack) || 0);
              const ok = Math.abs(sum - 100) < 0.01;
              return (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: "6px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    background: ok ? "rgba(47,125,79,0.1)" : "rgba(176,75,58,0.08)",
                    color: ok ? "var(--green-ok)" : "#B91C1C",
                    border: `1px solid ${ok ? "rgba(47,125,79,0.25)" : "rgba(176,75,58,0.25)"}`,
                    borderRadius: 4,
                  }}
                >
                  Total: {sum.toFixed(2)}% {ok ? "✓" : "— debería sumar 100"}
                </div>
              );
            })()}
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "rgba(176,75,58,0.08)",
              border: "1px solid rgba(176,75,58,0.25)",
              color: "#B91C1C",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Acciones */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 24,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "10px 18px",
              fontSize: 12,
              fontWeight: 600,
              background: "transparent",
              border: "1px solid rgba(10,26,12,0.15)",
              color: "var(--deep-green)",
              borderRadius: 6,
              cursor: saving ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: saving ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "10px 22px",
              fontSize: 12,
              fontWeight: 700,
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              borderRadius: 6,
              cursor: saving ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Helpers ============

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--sand-dark)",
        fontWeight: 700,
        marginTop: 22,
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: "1px solid rgba(10,26,12,0.05)",
      }}
    >
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          display: "block",
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function PctInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </Field>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13,
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: 4,
  background: "var(--white)",
  color: "var(--deep-green)",
  fontFamily: "inherit",
  outline: "none",
};
