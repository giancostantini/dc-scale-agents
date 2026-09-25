"use client";

/**
 * OfferRegistry — registro de ofertas de un cliente (activas + histórico).
 *
 * Reusado por el portal del cliente (/portal/ofertas) y por el
 * dashboard interno del equipo (/cliente/[id]/solicitudes, pestaña "Registro de ofertas"). Lee client_requests
 * (type='oferta') vía RLS con listRequestsForClient, así que el mismo componente
 * sirve para ambos: el cliente ve las suyas, el equipo las del cliente asignado.
 *
 * Muestra las ACTIVAS arriba y el HISTÓRICO (completadas / cerradas) abajo, sin
 * colapsar — es un registro. Renderiza los campos de paquete (destino, precio,
 * tier, disponibilidad) + los bullets de detalle.
 *
 * Edición: solo si el caller pasa `onEdit` (el portal del cliente) y solo en las
 * activas. Si la oferta se editó, las dos vistas muestran "Paquete editado · fecha"
 * (metadata.editedAt, lo escribe PATCH /api/portal/requests/[id]).
 */

import { useEffect, useState } from "react";
import {
  listRequestsForClient,
  requestStatusLabel,
  requestStatusColor,
} from "@/lib/requests";
import type { ClientRequest, ClientRequestStatus } from "@/lib/types";

const ACTIVE_STATUSES: ClientRequestStatus[] = [
  "pending",
  "reviewing",
  "in_progress",
];

export default function OfferRegistry({
  clientId,
  travel,
  onEdit,
}: {
  clientId: string;
  travel?: boolean;
  /** Si viene, las ofertas activas muestran "Editar". */
  onEdit?: (offer: ClientRequest) => void;
}) {
  const [offers, setOffers] = useState<ClientRequest[] | null>(null);

  useEffect(() => {
    let active = true;
    listRequestsForClient(clientId).then((list) => {
      if (active) setOffers(list.filter((r) => r.type === "oferta"));
    });
    return () => {
      active = false;
    };
  }, [clientId]);

  if (offers === null) {
    return (
      <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>
        Cargando…
      </div>
    );
  }

  const word = travel ? "paquete" : "oferta";
  const activos = offers.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const cerrados = offers.filter((o) => !ACTIVE_STATUSES.includes(o.status));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <RegistrySection
        title={`Activas · ${activos.length}`}
        empty={`No hay ${word}s activas ahora.`}
        offers={activos}
        word={word}
        onEdit={onEdit}
      />
      <RegistrySection
        title={`Histórico · ${cerrados.length}`}
        empty={`Todavía no hay ${word}s en el histórico.`}
        offers={cerrados}
        word={word}
        muted
      />
    </div>
  );
}

function RegistrySection({
  title,
  empty,
  offers,
  word,
  muted,
  onEdit,
}: {
  title: string;
  empty: string;
  offers: ClientRequest[];
  word: string;
  muted?: boolean;
  onEdit?: (offer: ClientRequest) => void;
}) {
  return (
    <section>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 700,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {offers.length === 0 ? (
        <div
          style={{
            padding: 20,
            background: "var(--off-white)",
            borderLeft: "3px solid var(--sand)",
            borderRadius: "var(--r-md)",
            fontSize: 13,
            fontStyle: "italic",
            color: "var(--text-muted)",
          }}
        >
          {empty}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            opacity: muted ? 0.78 : 1,
          }}
        >
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} word={word} onEdit={onEdit} />
          ))}
        </div>
      )}
    </section>
  );
}

function OfferCard({
  offer,
  word,
  onEdit,
}: {
  offer: ClientRequest;
  word: string;
  onEdit?: (offer: ClientRequest) => void;
}) {
  const m = offer.metadata as Record<string, unknown>;
  const editedAt = typeof m.editedAt === "string" ? new Date(m.editedAt) : null;
  const items: { label: string; value: string }[] = [];
  if (m.destino) items.push({ label: "Destino", value: String(m.destino) });
  if (m.precio != null)
    items.push({
      label: "Precio",
      value: `${m.precio}${m.precioNota ? ` · ${m.precioNota}` : ""}`,
    });
  if (m.tier)
    items.push({ label: "Tipo", value: m.tier === "high" ? "High" : "Low" });
  if (m.startDate)
    items.push({ label: "Disponible desde", value: String(m.startDate) });
  if (m.endDate)
    items.push({ label: "Disponible hasta", value: String(m.endDate) });
  // Legacy (ofertas viejas del form genérico)
  if (m.discountPct != null)
    items.push({ label: "Descuento", value: `${m.discountPct}%` });
  if (m.product) items.push({ label: "Producto", value: String(m.product) });

  const details = Array.isArray(m.details)
    ? (m.details as unknown[]).map(String).filter(Boolean)
    : [];

  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-md)",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div>
          <div
            style={{ fontSize: 15, fontWeight: 700, color: "var(--deep-green)" }}
          >
            {offer.title}
          </div>
          <div
            style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}
          >
            Cargada el{" "}
            {new Date(offer.submitted_at).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </div>
          {editedAt && !Number.isNaN(editedAt.getTime()) && (
            <div
              style={{
                display: "inline-block",
                marginTop: 6,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--sand-dark)",
                background: "rgba(196,168,130,0.16)",
                borderRadius: "var(--r-pill)",
              }}
            >
              {word === "paquete" ? "Paquete editado" : "Oferta editada"} ·{" "}
              {editedAt.toLocaleString("es-AR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(offer)}
              style={{
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: "var(--deep-green)",
                background: "transparent",
                border: "1px solid rgba(10,26,12,0.2)",
                borderRadius: "var(--r-pill)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Editar
            </button>
          )}
        <span
          style={{
            padding: "3px 10px",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "var(--white)",
            background: requestStatusColor(offer.status),
            borderRadius: "var(--r-pill)",
            whiteSpace: "nowrap",
          }}
        >
          {requestStatusLabel(offer.status)}
        </span>
        </div>
      </div>

      {offer.description && (
        <div
          style={{
            fontSize: 13,
            color: "var(--deep-green)",
            lineHeight: 1.6,
            marginBottom: 10,
            whiteSpace: "pre-wrap",
          }}
        >
          {offer.description}
        </div>
      )}

      {items.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            padding: 12,
            background: "var(--off-white)",
            borderRadius: "var(--r-sm)",
          }}
        >
          {items.map((it) => (
            <div key={it.label}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                {it.label}
              </div>
              <div style={{ fontSize: 12, color: "var(--deep-green)" }}>
                {it.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {details.length > 0 && (
        <ul
          style={{
            margin: "10px 0 0",
            paddingLeft: 18,
            fontSize: 12,
            color: "var(--deep-green)",
            lineHeight: 1.6,
          }}
        >
          {details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}

      {offer.response && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: "rgba(74,124,89,0.08)",
            borderLeft: "3px solid var(--deep-green)",
            borderRadius: "0 var(--r-sm) var(--r-sm) 0",
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 2,
            }}
          >
            Respuesta del equipo
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--deep-green)",
              lineHeight: 1.5,
            }}
          >
            {offer.response}
          </div>
        </div>
      )}
    </div>
  );
}
