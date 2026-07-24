"use client";

/**
 * Portal · Ofertas — registro de ofertas/paquetes del cliente (activas +
 * histórico). El cliente carga desde acá (mismo modal que Solicitudes) y ve el
 * registro completo. El equipo ve el mismo registro del lado interno
 * (/cliente/[id]/ofertas).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getClient } from "@/lib/storage";
import PortalHeader from "@/components/PortalHeader";
import NewRequestModal from "@/components/NewRequestModal";
import OfferRegistry from "@/components/OfferRegistry";
import type { Client } from "@/lib/types";
import portalStyles from "../portal.module.css";
import styles from "../solicitudes/solicitudes.module.css";

export default function PortalOfertasPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

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
        const c = await getClient(p.client_id);
        if (active) setClient(c ?? null);
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (loading || !profile) return null;

  const isTravel = /viaje|turismo|travel|tour/i.test(client?.sector ?? "");
  const word = isTravel ? "paquete" : "oferta";

  return (
    <>
      <PortalHeader
        client={client}
        profile={profile}
        eyebrow={isTravel ? "Paquetes" : "Ofertas"}
        showBack
      />

      <main className={portalStyles.wrap}>
        <div className={styles.head}>
          <div>
            <div className={portalStyles.heroEyebrow}>
              {isTravel ? "Tus paquetes" : "Tus ofertas"}
            </div>
            <h1 className={portalStyles.heroTitle}>
              {isTravel ? "Paquetes" : "Ofertas"}
            </h1>
            <div className={portalStyles.heroSub}>
              Registro de {word}s: las activas y todas las que cargaste. El equipo
              las ve del otro lado y las ejecuta.
            </div>
          </div>
          <div className={styles.headActions}>
            <button
              className={styles.btnSolid}
              onClick={() => setModalOpen(true)}
            >
              {isTravel ? "+ Cargar paquete" : "+ Cargar oferta"}
            </button>
          </div>
        </div>

        {profile.client_id && (
          <OfferRegistry
            key={reloadTick}
            clientId={profile.client_id}
            travel={isTravel}
          />
        )}
      </main>

      <NewRequestModal
        open={modalOpen}
        type="oferta"
        clientId={profile.client_id ?? ""}
        packageForm={isTravel}
        onClose={() => setModalOpen(false)}
        onCreated={() => setReloadTick((t) => t + 1)}
      />
    </>
  );
}
