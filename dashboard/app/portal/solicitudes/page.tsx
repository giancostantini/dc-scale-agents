"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { getClient } from "@/lib/storage";
import PortalHeader from "@/components/PortalHeader";
import NewRequestModal from "@/components/NewRequestModal";
import type { Client, ClientRequest, ClientRequestType } from "@/lib/types";
import portalStyles from "../portal.module.css";
import styles from "./solicitudes.module.css";

export default function PortalSolicitudesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
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
    let active = true;
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!active) return;
      if (!p || p.role !== "client") {
        router.replace(p?.role === "client" ? "/portal" : "/hub");
        return;
      }
      setProfile(p);
      if (p.client_id) {
        const [c] = await Promise.all([
          getClient(p.client_id),
          refresh(p),
        ]);
        if (active) setClient(c ?? null);
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (loading || !profile) return null;

  const ofertas = requests.filter((r) => r.type === "oferta");
  const acciones = requests.filter((r) => r.type === "accion");
  // Clientes de viajes → form estructurado de "paquete" para las ofertas.
  const isTravel = /viaje|turismo|travel|tour/i.test(client?.sector ?? "");

  function openNew(type: ClientRequestType) {
    setModal({ open: true, type });
  }

  return (
    <>
      <PortalHeader
        client={client}
        profile={profile}
        eyebrow="Solicitudes"
        showBack
      />

      <main className={portalStyles.wrap}>
        <div className={styles.head}>
          <div>
            <div className={portalStyles.heroEyebrow}>Tus solicitudes</div>
            <h1 className={portalStyles.heroTitle}>Solicitudes</h1>
            <div className={portalStyles.heroSub}>
              {isTravel
                ? "Cargá tus paquetes (destino, precio, disponibilidad, detalles) o acciones libres (ideas, pedidos). Nuestro equipo los revisa, te responde y los ejecuta."
                : "Cargá ofertas comerciales (promociones / descuentos) o acciones libres (ideas, pedidos, mejoras). Nuestro equipo las revisa, te responde y las ejecuta."}
            </div>
          </div>
          <div className={styles.headActions}>
            <button
              className={styles.btnSolid}
              onClick={() => openNew("oferta")}
            >
              {isTravel ? "+ Cargar paquete" : "+ Nueva oferta"}
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
          title={`${isTravel ? "Paquetes" : "Ofertas comerciales"} · ${ofertas.length}`}
          empty={
            isTravel
              ? "Todavía no cargaste paquetes. Usá + Cargar paquete para agregar el primero (destino, precio, disponibilidad y detalles)."
              : "Todavía no cargaste ofertas. Una oferta es una promoción específica con fecha, descuento y producto."
          }
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
        packageForm={isTravel}
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
  // Paquete (form nuevo)
  if (meta.destino) items.push({ label: "Destino", value: String(meta.destino) });
  if (meta.precio != null)
    items.push({
      label: "Precio",
      value: `${meta.precio}${meta.precioNota ? ` · ${meta.precioNota}` : ""}`,
    });
  if (meta.tier)
    items.push({ label: "Tipo", value: meta.tier === "high" ? "High" : "Low" });
  if (meta.startDate)
    items.push({ label: "Disponible desde", value: String(meta.startDate) });
  if (meta.endDate)
    items.push({ label: "Disponible hasta", value: String(meta.endDate) });
  // Legacy (ofertas viejas)
  if (meta.discountPct != null)
    items.push({ label: "Descuento", value: `${meta.discountPct}%` });
  if (meta.product) items.push({ label: "Producto", value: String(meta.product) });

  const details = Array.isArray(meta.details)
    ? (meta.details as unknown[]).map(String).filter(Boolean)
    : [];

  if (items.length === 0 && details.length === 0) return null;
  return (
    <>
      {items.length > 0 && (
        <div className={styles.metaGrid}>
          {items.map((it) => (
            <div key={it.label} className={styles.metaItem}>
              <span className={styles.metaLabel}>{it.label}</span>
              <span className={styles.metaValue}>{it.value}</span>
            </div>
          ))}
        </div>
      )}
      {details.length > 0 && (
        <ul
          style={{
            margin: "10px 0 0",
            paddingLeft: 18,
            fontSize: 13,
            color: "var(--deep-green)",
            lineHeight: 1.6,
          }}
        >
          {details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </>
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
