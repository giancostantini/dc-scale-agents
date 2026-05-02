-- ============================================================
-- Migración 008: Audit log de acciones del director (y team)
-- ============================================================
-- Objetivo: trazabilidad de acciones sensibles para revisar después
-- "quién aprobó qué", "quién eliminó tal cliente", "quién invitó".
--
-- Idempotente: usa IF NOT EXISTS / DROP + CREATE para policies.
--
-- Convenciones de `action`:
--   team.invite             — crear team o cliente desde dashboard
--   team.update             — modificar profile/permissions
--   team.assign             — asignar team a cliente
--   client.create           — crear cliente (wizard)
--   client.delete           — eliminar cliente
--   phase.approve           — aprobar phase report
--   phase.request_changes   — pedir cambios sobre phase report
--   phase.generate          — disparar generación
--   request.update          — cambiar status/asignar/responder solicitud
--   agent.dispatch          — disparar agente IA desde dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,                         -- snapshot, en caso que el user se borre después
  action text NOT NULL,
  target_type text,                         -- 'profile' | 'client' | 'phase_report' | 'request' | 'agent_run' | ...
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx
  ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS audit_log_created_idx
  ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx
  ON public.audit_log(target_type, target_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Solo director puede leer. Los inserts vienen del backend con service_role
-- que bypassea RLS, así que no hace falta WITH CHECK abierto — pero igual
-- lo dejamos así para que un endpoint con anon key pueda escribir si decidimos
-- moverlo en el futuro. El actor_id ya viene del JWT, no del body.
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.auth_role() = 'director');

DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ====== Verificación ======
-- SELECT * FROM public.audit_log ORDER BY created_at DESC LIMIT 5;
