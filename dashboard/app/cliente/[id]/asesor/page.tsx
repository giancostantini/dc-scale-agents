"use client";

/**
 * /cliente/[id]/asesor — la oficina del Asesor IA del cliente (vista
 * equipo/director). Es un chat con el asesor + dos accesos rápidos:
 * "Oportunidades" y "Tendencias del sector", que le piden esas cosas al
 * asesor en la misma conversación.
 */

import { use, useEffect, useState } from "react";
import { getClient } from "@/lib/storage";
import ContentConsultantPanel from "@/components/ContentConsultantPanel";
import ui from "@/components/ClientUI.module.css";
import type { Client } from "@/lib/types";

export default function AsesorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
  }, [id]);

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Asesor IA · {client?.name ?? ""}</div>
          <h1>Asesor</h1>
        </div>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--text-muted)",
          marginTop: -6,
          marginBottom: 20,
          lineHeight: 1.5,
          maxWidth: 720,
        }}
      >
        Conversá con el asesor de IA de {client?.name ?? "el cliente"}. Usá los
        botones para pedirle las oportunidades o las tendencias del sector, o
        escribile directamente.
      </p>

      <ContentConsultantPanel
        clientId={id}
        clientName={client?.name}
        quickPrompts={[
          {
            label: "💡 Oportunidades",
            prompt:
              "Dame las oportunidades más relevantes para este cliente ahora: campañas, ofertas o acciones concretas que convenga activar, con un porqué breve de cada una.",
          },
          {
            label: "📈 Tendencias del sector",
            prompt:
              "Resumime las tendencias actuales del sector de este cliente: qué está funcionando en contenido, tráfico y ventas, y cómo lo podríamos aprovechar.",
          },
        ]}
      />
    </>
  );
}
