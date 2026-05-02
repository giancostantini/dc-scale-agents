/**
 * Audit log helpers · server-only
 *
 * Llamar desde endpoints sensibles después de la acción exitosa para registrar
 * qué hizo quién. Las escrituras pasan por service role (bypassea RLS); las
 * lecturas las controla la policy de la tabla (solo director).
 *
 * NUNCA importar este file desde un Client Component.
 */

import { getSupabaseAdmin } from "./supabase/server";

export type AuditAction =
  | "team.invite"
  | "team.update"
  | "team.assign"
  | "team.unassign"
  | "client.create"
  | "client.delete"
  | "client.update"
  | "phase.generate"
  | "phase.approve"
  | "phase.request_changes"
  | "request.update"
  | "agent.dispatch"
  | "kpis.update"
  | "payroll.generate";

export type AuditTargetType =
  | "profile"
  | "client"
  | "phase_report"
  | "client_request"
  | "agent_run"
  | "expense"
  | "kpis";

export interface AuditLogInput {
  actorId: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Registra una acción en el audit log. Fire-and-forget, never throws —
 * si falla, lo logueamos por consola pero no rompemos el endpoint que lo
 * llamó (la acción primaria ya pasó).
 */
export async function logAction(input: AuditLogInput): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("audit_log").insert({
      actor_id: input.actorId,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.warn("[audit.logAction] insert failed:", error.message);
    }
  } catch (err) {
    console.warn(
      "[audit.logAction] unexpected error:",
      err instanceof Error ? err.message : err,
    );
  }
}
