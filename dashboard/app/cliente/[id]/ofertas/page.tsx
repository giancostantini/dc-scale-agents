"use client";

/**
 * Cliente · Ofertas — registro (interno) de las ofertas/paquetes que cargó el
 * cliente. Es la misma info que ve el cliente en su portal (/portal/ofertas),
 * pero del lado del equipo: activas + histórico, como registro. Read-only —
 * la gestión de estado sigue en Solicitudes.
 */

import { use, useEffect, useState } from "react";
import { getClient } from "@/lib/storage";
import OfferRegistry from "@/components/OfferRegistry";
import type { Client } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

export default function ClienteOfertasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
  }, [id]);

  const isTravel = /viaje|turismo|travel|tour/i.test(client?.sector ?? "");
  const noun = isTravel ? "paquetes" : "ofertas";

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>
            Cliente · {isTravel ? "Paquetes" : "Ofertas"}
          </div>
          <h1>{isTravel ? "Paquetes cargados" : "Ofertas cargadas"}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
            Registro de {noun} que cargó el cliente — activas e histórico. La
            gestión de estado se hace en <strong>Solicitudes</strong>.
          </div>
        </div>
      </div>

      <OfferRegistry clientId={id} travel={isTravel} />
    </>
  );
}
