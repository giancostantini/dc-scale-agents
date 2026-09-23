import { redirect } from "next/navigation";

/**
 * Ofertas se fusionó con Solicitudes en un solo menú (mig 102): el
 * registro de ofertas es una pestaña de /solicitudes. Esta ruta queda
 * para que los links viejos lleguen a esa pestaña.
 */
export default async function OfertasRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/cliente/${id}/solicitudes?vista=ofertas`);
}
