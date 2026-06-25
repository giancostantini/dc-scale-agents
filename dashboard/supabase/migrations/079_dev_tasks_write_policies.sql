-- ============================================================
-- 079 — Policies de escritura para dev_tasks (fix: marcar tarea hecha)
--
-- Bug: dev_tasks tiene RLS habilitado (schema.sql) pero la migración 007
-- solo creó dev_tasks_select. Sin policies de UPDATE/INSERT/DELETE, RLS
-- DENIEGA toda escritura para TODOS los roles (incluido el director):
-- marcar una tarea como hecha hacía un update directo que afectaba 0 filas
-- en silencio. Acá agregamos las policies faltantes, espejando el SELECT:
-- director global; team solo si está asignado al cliente. El cliente nunca
-- escribe dev_tasks (no hay policy para role='client').
-- ============================================================

DROP POLICY IF EXISTS dev_tasks_update ON public.dev_tasks;
CREATE POLICY dev_tasks_update ON public.dev_tasks
  FOR UPDATE TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  )
  WITH CHECK (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  );

DROP POLICY IF EXISTS dev_tasks_insert ON public.dev_tasks;
CREATE POLICY dev_tasks_insert ON public.dev_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  );

DROP POLICY IF EXISTS dev_tasks_delete ON public.dev_tasks;
CREATE POLICY dev_tasks_delete ON public.dev_tasks
  FOR DELETE TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  );

-- Verificación:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'dev_tasks';
--   → dev_tasks_select (SELECT), dev_tasks_update (UPDATE),
--     dev_tasks_insert (INSERT), dev_tasks_delete (DELETE)
