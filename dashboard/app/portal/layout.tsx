// Layout del portal del cliente. NO usa el Topbar normal: el cliente
// no tiene Pipeline / Calendario / Equipo / Finanzas. Tiene un header
// minimalista propio.

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
