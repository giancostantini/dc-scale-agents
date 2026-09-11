// ==================== CÓMO SE LEE UN LEAD (client-safe) ====================
// Un lead puede venir de tres lados y cada uno llena `name` distinto:
//   · agente nuevo   → job_title = "Community Manager", name = "Buscan: …"
//   · agente viejo   → job_title NULL, el puesto embebido en name
//   · manual/landing → name = la persona, sin datos de aviso
// Estos dos helpers dejan que la card y la ficha usen los mismos slots sin
// ramas por origen.

import type { Lead } from "@/lib/types";

/** El puesto del aviso, o null si el lead no vino de uno. */
export function jobOffer(lead: Lead): string | null {
  if (lead.jobTitle?.trim()) return lead.jobTitle.trim();
  const m = /^\s*buscan:\s*(.+)$/i.exec(lead.name ?? "");
  return m ? m[1].trim() : null;
}

/** Segunda línea de la card: el puesto si es un aviso, la persona si no. */
export function cardSubject(lead: Lead): string | null {
  const offer = jobOffer(lead);
  if (offer) return `Buscan: ${offer}`;
  return lead.name?.trim() || null;
}
