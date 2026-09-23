import { redirect } from "next/navigation";

/**
 * Analítica se eliminó (mig 102, dashboard simplificado): Looker Studio
 * se abre desde los botones del dashboard del cliente (el link se carga
 * en Configuración). El bloque "Agente Analytics" nunca se conectó. Esta
 * ruta queda solo para que los links viejos no den 404.
 */
export default async function AnaliticaRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/cliente/${id}`);
}
