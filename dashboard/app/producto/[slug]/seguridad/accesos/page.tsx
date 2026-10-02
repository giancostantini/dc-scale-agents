"use client";

/**
 * /producto/[slug]/seguridad/accesos — SEGURIDAD: métricas de accesos e
 * inicios de sesión (logins, fallidos, bloqueos, sesiones, IPs, dispositivos).
 * Datos DEMO deterministas.
 */

import { use, useMemo } from "react";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import { appMeta, securityStats } from "@/lib/backoffice-demo";
import { BoHead, KpiGrid } from "@/components/backoffice/BackofficeUI";

export default function AccesosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const p = PRODUCT_BY_SLUG[slug];
  const sec = useMemo(() => securityStats(slug), [slug]);

  if (!p) return null;
  const meta = appMeta(slug);

  return (
    <>
      <BoHead eyebrow={`${meta.name} · backoffice`} title="Accesos" accent={p.accent} />

      <KpiGrid
        items={[
          { label: "Inicios de sesión", value: sec.logins.toLocaleString("es-UY"), accent: "#1F9D55" },
          { label: "Intentos fallidos", value: sec.fallidos.toLocaleString("es-UY"), accent: sec.fallidos > 0 ? "#C98A1A" : undefined },
          { label: "Usuarios bloqueados", value: sec.bloqueados.toLocaleString("es-UY"), accent: sec.bloqueados > 0 ? "#b04b3a" : undefined },
          { label: "Sesiones activas", value: sec.sesionesActivas.toLocaleString("es-UY"), accent: p.accent },
          { label: "IPs", value: sec.ips.toLocaleString("es-UY") },
          { label: "Dispositivos", value: sec.dispositivos.toLocaleString("es-UY") },
        ]}
        min={180}
      />
    </>
  );
}
