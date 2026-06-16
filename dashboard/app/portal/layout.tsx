// Layout del portal del cliente. NO usa el Topbar normal: el cliente
// no tiene Pipeline / Calendario / Equipo / Finanzas. Tiene un header
// minimalista propio.
//
// Envolvemos children en PortalPasswordGate — el componente cliente
// chequea must_change_password y, si está activo, redirige a
// /portal/cambiar-password antes de mostrar nada. Ver migración 072.

import PortalPasswordGate from "@/components/PortalPasswordGate";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalPasswordGate>{children}</PortalPasswordGate>;
}
