import { redirect } from "next/navigation";

/**
 * Paid Media se eliminó (mig 102, dashboard simplificado): la pauta se
 * mira en Espor.ai y el generador de campañas Meta se abre desde los
 * botones del dashboard del cliente (el link de Espor.ai se carga en
 * Configuración). Esta ruta queda solo para que los links viejos no den
 * 404.
 */
export default async function PaidMediaRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/cliente/${id}`);
}
