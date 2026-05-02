"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import {
  listRequestsForClient,
  requestStatusLabel,
  requestStatusColor,
} from "@/lib/requests";
import Lockup from "@/components/Lockup";
import NewRequestModal from "@/components/NewRequestModal";
import type { ClientRequest, ClientRequestType } from "@/lib/types";
import portalStyles from "../portal.module.css";
import styles from "./solicitudes.module.css";

export default function PortalSolicitudesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{
    open: boolean;
    type: ClientRequestType;
  }>({ open: false, type: "oferta" });

  async function refresh(p: Profile) {
    if (!p.client_id) return;
    const list = await listRequestsForClient(p.client_id);
    setRequests(list);
  }

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!p || p.role !== "client") {
        router.replace(p?.role === "client" ? "/portal" : "/hub");
        return;
      }
      setProfile(p);
      if (p.client_id) await refresh(p);
      setLoading(false);
    });
  }, [router]);

  if (loading || !profile) return null;

  const ofertas = requests.filter((r) => r.type === "oferta");
  const acciones = requests.filter((r) => r.type === "accion");

  function openNew(type: ClientRequestType) {
    setModal({ open: true, type });
  }

  return (
    <>
      <header className={portalStyles.header}>
        <div className={portalStyles.headerLeft}>
          <Lockup size="sm" />
        </div>
        <div className={portalStyles.headerCenter}>
          <div className={portalStyles.eyebrow}>Solicitudes</div>
        </div>
        <div className={portalStyles.headerRight}>
          <Link href="/portal" className={portalStyles.btnGhost}>
            ← Portal
          </Link>
        </div>
      </header>

      <main className={portalStyles.wrap}>
        <div className={styles.head}>
          <div>
            <div className={portalStyles.heroEyebrow}>Tus solicitudes</div>
            <h1 className={portalStyles.heroTitle}>Solicitudes</h1>
            <div className={portalStyles.heroSub}>
              Cargá ofertas comerciales (promociones / descuentos) o acciones
              libres (ideas, pedidos, mejoras). Nuestro equipo las revisa,
              te responde y las ejecuta.
            </div>
          </div>
          <div className={styles.headActions}>
            <button
              className={styles.btnSolid}
              onClick={() => openNew("oferta")}
            >
              + Nueva oferta
            </button>
            <button
              className={styles.btnSolid}
              onClick={() => openNew("accion")}
              style={{ background: "var(--sand-dark)" }}
            >
              + Nueva acción
            </button>
          </div>
        </div>

        <Section
          title={`Ofertas comerciales · ${ofertas.length}`}
          empty="Todavía no cargaste ofertas. Una oferta es una promoción específica con fecha, descuento y producto."
          requests={ofertas}
        />

        <Section
          title={`Acciones · ${acciones.length}`}
          empty="No tenés acciones cargadas. Una acción es una idea o pedido libre que querés que ejecutemos."
          requests={acciones}
        />
      </main>

      <NewRequestModal
        open={modal.open}
        type={modal.type}
        clientId={profile.client_id ?? ""}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        onCreated={() => {
          if (profile) refresh(profile);
        }}
      />
    </>
  );
}

function Section({
  title,
  empty,
  requests,
}: {
  title: string;
  empty: string;
  requests: ClientRequest[];
}) {
  return (
    <section className={portalStyles.section}>
      <div className={portalStyles.sectionLabel}>{title}</div>
      {requests.length === 0 ? (
        <div className={styles.empty}>{empty}</div>
      ) : (
        <div className={styles.list}>
          {requests.map((r) => (
            <RequestCard key={r.id} req={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function RequestCard({ req }: { req: ClientRequest }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <div className={styles.cardTitle}>{req.title}</div>
          <div className={styles.cardDate}>
            Enviada el{" "}
            {new Date(req.submitted_at).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
            {req.urgency === "alta" && (
              <span className={styles.urgentTag}> · URGENTE</span>
            )}
          </div>
        </div>
        <div
          className={styles.statusBadge}
          style={{ background: requestStatusColor(req.status) }}
        >
          {requestStatusLabel(req.status)}
        </div>
      </div>

      {req.description && (
        <div className={styles.cardDesc}>{req.description}</div>
      )}

      {/* Metadata específica por tipo */}
      {req.type === "oferta" && (
        <OfertaMeta meta={req.metadata as Record<string, unknown>} />
      )}
      {req.type === "accion" && (
        <AccionMeta meta={req.metadata as Record<string, unknown>} />
      )}

      {/* Respuesta del equipo si la hay */}
      {req.response && (
        <div className={styles.responseBox}>
          <div className={styles.responseLabel}>Respuesta del equipo</div>
          <div className={styles.responseText}>{req.response}</div>
        </div>
      )}
    </div>
  );
}

function OfertaMeta({ meta }: { meta: Record<string, unknown> }) {
  const items: { label: string; value: string }[] = [];
  if (meta.startDate) items.push({ label: "Inicio", value: String(meta.startDate) });
  if (meta.endDate) items.push({ label: "Fin", value: String(meta.endDate) });
  if (meta.discountPct != null)
    items.push({ label: "Descuento", value: `${meta.discountPct}%` });
  if (meta.product) items.push({ label: "Producto", value: String(meta.product) });
  if (items.length === 0) return null;
  return (
    <div className={styles.metaGrid}>
      {items.map((it) => (
        <div key={it.label} className={styles.metaItem}>
          <span className={styles.metaLabel}>{it.label}</span>
          <span className={styles.metaValue}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function AccionMeta({ meta }: { meta: Record<string, unknown> }) {
  const items: { label: string; value: string }[] = [];
  if (meta.area) items.push({ label: "Área", value: String(meta.area) });
  if (meta.desiredDate)
    items.push({ label: "Fecha deseada", value: String(meta.desiredDate) });
  if (items.length === 0) return null;
  return (
    <div className={styles.metaGrid}>
      {items.map((it) => (
        <div key={it.label} className={styles.metaItem}>
          <span className={styles.metaLabel}>{it.label}</span>
          <span className={styles.metaValue}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}
