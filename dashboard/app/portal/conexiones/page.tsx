"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getClient, getIntegrations, saveIntegrations } from "@/lib/storage";
import { DEFAULT_INTEGRATIONS, INTEGRATION_GROUPS } from "@/lib/integrations-defaults";
import { isFullyDocumented } from "@/lib/integration-tutorials";
import PortalHeader from "@/components/PortalHeader";
import ConnectIntegrationModal from "@/components/ConnectIntegrationModal";
import type { Client, Integration } from "@/lib/types";
import portalStyles from "../portal.module.css";
import styles from "./conexiones.module.css";

export default function PortalConexionesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{
    open: boolean;
    integration: Integration | null;
  }>({ open: false, integration: null });

  useEffect(() => {
    let active = true;
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!active) return;
      if (!p) {
        router.replace("/");
        return;
      }
      if (p.role !== "client") {
        router.replace("/hub");
        return;
      }
      if (!p.client_id) {
        setProfile(p);
        setLoading(false);
        return;
      }

      setProfile(p);
      const c = await getClient(p.client_id);
      if (!active) return;
      setClient(c ?? null);

      // Cargar integraciones — si no existen, hacer seed con DEFAULT_INTEGRATIONS
      const existing = await getIntegrations(p.client_id);
      if (!active) return;
      if (existing.length === 0) {
        const seeded = DEFAULT_INTEGRATIONS.map((i) => ({
          ...i,
          clientId: p.client_id!,
        }));
        await saveIntegrations(p.client_id, seeded);
        const refreshed = await getIntegrations(p.client_id);
        if (active) setIntegrations(refreshed);
      } else {
        setIntegrations(existing);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  async function refreshIntegrations() {
    if (!profile?.client_id) return;
    const updated = await getIntegrations(profile.client_id);
    setIntegrations(updated);
  }

  if (loading) return null;

  if (profile && !profile.client_id) {
    return (
      <main className={portalStyles.errorWrap}>
        <div className={portalStyles.errorBox}>
          <h2 className={portalStyles.errorTitle}>
            Tu cuenta no está vinculada a una empresa
          </h2>
          <p className={portalStyles.errorBody}>
            Avisale a tu account lead en D&C para que termine de configurar tu acceso.
          </p>
        </div>
      </main>
    );
  }

  if (!profile || !client) return null;

  const connected = integrations.filter((i) => i.status === "connected").length;
  const pending = integrations.filter((i) => i.status !== "connected").length;
  const total = integrations.length;
  const groups = INTEGRATION_GROUPS.filter((g) =>
    integrations.some((i) => i.group === g),
  );

  const stateLabel =
    connected === 0 ? "Sin configurar" : connected < 5 ? "En progreso" : "Operativo";
  const stateColor =
    connected === 0
      ? "var(--text-muted)"
      : connected < 5
        ? "var(--yellow-warn)"
        : "var(--green-ok)";

  return (
    <>
      <PortalHeader
        client={client}
        profile={profile}
        eyebrow="Conexiones"
        showBack
      />

      <main className={portalStyles.wrap}>
        <section className={styles.heroBlock}>
          <div className={styles.heroEyebrow}>Configuración · Herramientas</div>
          <h1 className={styles.heroTitle}>Tus conexiones</h1>
          <p className={styles.heroSub}>
            Conectá tus herramientas para que el equipo y el agente IA tengan
            data real de tu negocio. Cada conexión incluye un paso a paso.
          </p>
        </section>

        <section className={styles.kpiRow}>
          <div className={styles.kpiCell}>
            <div className={styles.kpiLabel}>Conectadas</div>
            <div
              className={styles.kpiValue}
              style={{ color: "var(--green-ok)" }}
            >
              {connected}
              <span className={styles.kpiUnit}>/ {total}</span>
            </div>
          </div>
          <div className={styles.kpiCell}>
            <div className={styles.kpiLabel}>Pendientes</div>
            <div className={styles.kpiValue}>{pending}</div>
          </div>
          <div className={styles.kpiCell}>
            <div className={styles.kpiLabel}>Estado general</div>
            <div className={styles.kpiState} style={{ color: stateColor }}>
              {stateLabel}
            </div>
          </div>
        </section>

        {groups.map((g) => {
          const items = integrations.filter((i) => i.group === g);
          const gConnected = items.filter((i) => i.status === "connected").length;
          return (
            <section key={g} className={styles.groupSection}>
              <header className={styles.groupHeader}>
                <h2 className={styles.groupName}>{g}</h2>
                <div className={styles.groupCount}>
                  {gConnected} / {items.length} conectadas
                </div>
              </header>

              <div className={styles.cardGrid}>
                {items.map((i) => (
                  <IntegrationCard
                    key={i.key}
                    integration={i}
                    onConnect={() =>
                      setModal({ open: true, integration: i })
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}

        <aside className={styles.helpBlock}>
          <div className={styles.helpEyebrow}>¿Necesitás otra herramienta?</div>
          <div className={styles.helpTitle}>
            Cualquier servicio con API se puede integrar
          </div>
          <p className={styles.helpBody}>
            Si trabajás con un CRM, plataforma de pagos o herramienta interna
            que no aparece acá, hablalo con tu account lead. La conectamos
            vía n8n o construímos un conector dedicado según el caso.
          </p>
        </aside>
      </main>

      <ConnectIntegrationModal
        open={modal.open}
        integrationKey={modal.integration?.key ?? ""}
        integrationName={modal.integration?.name ?? ""}
        existingCredentials={modal.integration?.credentials ?? {}}
        onClose={() => setModal({ open: false, integration: null })}
        onSaved={() => {
          refreshIntegrations();
        }}
      />
    </>
  );
}

function IntegrationCard({
  integration,
  onConnect,
}: {
  integration: Integration;
  onConnect: () => void;
}) {
  const isConnected = integration.status === "connected";
  const documented = isFullyDocumented(integration.key);

  return (
    <article
      className={`${styles.card} ${isConnected ? styles.cardConnected : ""}`}
    >
      <div className={styles.cardLeft}>
        <div className={styles.cardName}>
          {integration.name}
          {!documented && (
            <span className={styles.previewTag} title="Próximamente">
              Manual
            </span>
          )}
        </div>
        <div className={styles.cardStatus}>
          {isConnected ? (
            <>
              <span className={styles.dotConnected} />
              <span className={styles.statusLabel}>Conectada</span>
              {integration.submittedAt && (
                <span className={styles.statusMeta}>
                  · actualizado{" "}
                  {new Date(integration.submittedAt).toLocaleDateString(
                    "es-AR",
                    { day: "2-digit", month: "short" },
                  )}
                </span>
              )}
            </>
          ) : (
            <>
              <span className={styles.dotPending} />
              <span className={styles.statusLabel}>Sin conectar</span>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        className={isConnected ? styles.btnEdit : styles.btnConnect}
        onClick={onConnect}
      >
        {isConnected ? "Editar" : "Conectar"}
      </button>
    </article>
  );
}
