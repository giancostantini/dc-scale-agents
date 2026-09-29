/**
 * Tendencias del sector de un cliente para el dashboard INTERNO (equipo /
 * director). Devuelve la última corrida del agente sector-trends.
 *
 *   GET → { items, bodyMd, generatedAt, sector }
 *
 * Auth: director o team con acceso al cliente (no el cliente final — ese
 * usa /api/portal/trends).
 */

import { NextRequest } from "next/server";
import { requireClientAccess } from "@/lib/auth-guard";
import { getLatestSectorTrends } from "@/lib/sector-trends";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  if (access.role === "client") {
    return Response.json(
      { error: "Usá el portal para ver tus tendencias." },
      { status: 403 },
    );
  }

  const trends = await getLatestSectorTrends(clientId);
  return Response.json({
    items: trends?.items ?? [],
    bodyMd: trends?.bodyMd ?? null,
    generatedAt: trends?.generatedAt ?? null,
    sector: trends?.sector ?? null,
  });
}
