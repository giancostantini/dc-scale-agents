-- ============================================================
-- Migración 014: Cliente puede gestionar sus propias integraciones
--                + cache de "welcome" del Consultor IA por día
-- ============================================================
-- Objetivo:
--   1. Permitir que role='client' lea/edite SUS PROPIAS integraciones
--      (hasta ahora solo director/team — migration 007).
--   2. Capturar credenciales/IDs (Pixel ID, Customer ID de Google, etc.)
--      en columna `credentials jsonb` además del flag `status`.
--   3. Cachear el mensaje de bienvenida del Consultor IA al portal del
--      cliente — evita llamar a Claude en cada reload del dashboard.
--   4. Audit log automático cuando el cliente carga/edita credenciales.
--
-- Idempotente: usa IF NOT EXISTS / DROP+CREATE para policies y triggers.
-- ============================================================

-- ====== 1. Ampliar tabla integrations ======

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

COMMENT ON COLUMN public.integrations.credentials IS
  'Shape libre por integración. Ej. meta_pixel: {"pixel_id": "123"}. Ver lib/integration-tutorials.ts.';
COMMENT ON COLUMN public.integrations.submitted_by IS
  'Usuario que cargó/actualizó las credenciales por última vez.';

-- ====== 2. RLS: cliente accede a SUS integraciones ======
-- Director y team-asignado siguen igual. Agregamos rama para client.

DROP POLICY IF EXISTS integrations_select ON public.integrations;
CREATE POLICY integrations_select ON public.integrations
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

DROP POLICY IF EXISTS integrations_insert ON public.integrations;
CREATE POLICY integrations_insert ON public.integrations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_role() IN ('director', 'team')
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

DROP POLICY IF EXISTS integrations_update ON public.integrations;
CREATE POLICY integrations_update ON public.integrations
  FOR UPDATE TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  )
  WITH CHECK (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

DROP POLICY IF EXISTS integrations_delete ON public.integrations;
CREATE POLICY integrations_delete ON public.integrations
  FOR DELETE TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  );

-- ====== 3. Trigger: audit + notif al team cuando cliente carga credenciales ======

CREATE OR REPLACE FUNCTION public.audit_integration_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  changed_credentials boolean := (NEW.credentials IS DISTINCT FROM OLD.credentials);
  changed_status      boolean := (NEW.status IS DISTINCT FROM OLD.status);
  actor_role          text;
BEGIN
  IF NOT (changed_credentials OR changed_status) THEN
    RETURN NEW;
  END IF;

  actor_role := public.auth_role();

  -- Audit log: siempre que cambia credentials o status
  INSERT INTO public.audit_log (
    actor_id, actor_email, action, target_type, target_id, metadata
  )
  VALUES (
    auth.uid(),
    public.auth_actor_email(),
    'client.integration_updated',
    'integration',
    NEW.client_id || '/' || NEW.key,
    jsonb_build_object(
      'client_id', NEW.client_id,
      'key', NEW.key,
      'name', NEW.name,
      'status_from', OLD.status,
      'status_to', NEW.status,
      'credentials_changed', changed_credentials,
      'actor_role', actor_role
    )
  );

  -- Notif al equipo solo si fue el cliente quien cambió algo
  -- (cuando lo cambia director/team es ruido).
  IF actor_role = 'client' AND changed_credentials THEN
    INSERT INTO public.notifications (
      client, agent, level, title, body, link, read, to_role
    ) VALUES (
      NEW.client_id,
      'portal',
      'info',
      'Cliente cargó credenciales: ' || NEW.name,
      'El cliente actualizó la integración ' || NEW.name || '. Revisá en /cliente/' || NEW.client_id || '/integraciones',
      '/cliente/' || NEW.client_id || '/integraciones',
      false,
      'team'
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS integrations_audit_update ON public.integrations;
CREATE TRIGGER integrations_audit_update
  AFTER UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.audit_integration_update();

-- ====== 4. Tabla consultant_welcomes (cache del welcome del Consultor) ======

CREATE TABLE IF NOT EXISTS public.consultant_welcomes (
  client_id text PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  content_md text NOT NULL,
  data_signature text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.consultant_welcomes IS
  'Cache del mensaje de bienvenida del Consultor IA por cliente. Se invalida si cambia data_signature (hash de KPIs+reports+events) o si pasaron >24h.';
COMMENT ON COLUMN public.consultant_welcomes.data_signature IS
  'Hash sha256 corto de clients.kpis + count(phase_reports approved) + count(cal_events upcoming). Cambia → cache invalidado.';

CREATE INDEX IF NOT EXISTS consultant_welcomes_generated_at_idx
  ON public.consultant_welcomes(generated_at DESC);

ALTER TABLE public.consultant_welcomes ENABLE ROW LEVEL SECURITY;

-- SELECT: director, team-asignado, o el propio cliente
DROP POLICY IF EXISTS consultant_welcomes_select ON public.consultant_welcomes;
CREATE POLICY consultant_welcomes_select ON public.consultant_welcomes
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

-- INSERT/UPDATE: solo backend con service role los hace en la práctica,
-- pero permitimos al authenticated por si alguna vez lo movemos a cliente.
DROP POLICY IF EXISTS consultant_welcomes_insert ON public.consultant_welcomes;
CREATE POLICY consultant_welcomes_insert ON public.consultant_welcomes
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS consultant_welcomes_update ON public.consultant_welcomes;
CREATE POLICY consultant_welcomes_update ON public.consultant_welcomes
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS consultant_welcomes_delete ON public.consultant_welcomes;
CREATE POLICY consultant_welcomes_delete ON public.consultant_welcomes
  FOR DELETE TO authenticated
  USING (true);

-- ====== 5. Triggers de invalidación ======
-- Cuando phase_reports pasa a 'approved', borrar welcome de ese cliente.
-- Cuando clients.kpis cambia, idem.
-- Failsafe adicional al chequeo de data_signature en el endpoint.

CREATE OR REPLACE FUNCTION public.invalidate_welcome_on_phase_approve()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    DELETE FROM public.consultant_welcomes WHERE client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS phase_reports_invalidate_welcome ON public.phase_reports;
CREATE TRIGGER phase_reports_invalidate_welcome
  AFTER UPDATE ON public.phase_reports
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_welcome_on_phase_approve();

CREATE OR REPLACE FUNCTION public.invalidate_welcome_on_kpi_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kpis IS DISTINCT FROM OLD.kpis THEN
    DELETE FROM public.consultant_welcomes WHERE client_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS clients_invalidate_welcome ON public.clients;
CREATE TRIGGER clients_invalidate_welcome
  AFTER UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_welcome_on_kpi_change();

-- ====== Verificación (correr en Supabase SQL Editor) ======
-- 1. Columnas nuevas en integrations:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='integrations'
--      AND column_name IN ('credentials','submitted_by','submitted_at');
--
-- 2. Tabla consultant_welcomes:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='consultant_welcomes';
--
-- 3. Triggers:
--    SELECT trigger_name FROM information_schema.triggers
--    WHERE trigger_schema='public' AND trigger_name IN (
--      'integrations_audit_update',
--      'phase_reports_invalidate_welcome',
--      'clients_invalidate_welcome'
--    );
--
-- 4. Como role=client, SELECT * FROM integrations WHERE client_id = '<su client>'
--    → debe devolver filas (antes de esta migración devolvía 0).
-- 5. Como cliente, UPDATE integrations SET credentials='{"pixel_id":"X"}' WHERE client_id='<su>' AND key='meta_pixel';
--    → debería funcionar y disparar audit_log + notification al team.
-- 6. Como director, SELECT action FROM audit_log WHERE action='client.integration_updated';
--    → debe haber 1 fila.
