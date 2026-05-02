-- ============================================================
-- Migración 009: Triggers de audit + notif automática al cliente
-- ============================================================
-- Razón: muchos cambios sensibles ocurren client-side directo a Supabase
-- (no pasan por /api/...). Para que el audit log los capture sin tener
-- que crear endpoints intermedios, usamos triggers SQL con SECURITY
-- DEFINER que loguean automáticamente.
--
-- También agregamos un trigger en client_requests UPDATE que crea una
-- notificación al cliente cuando el director/team cambia status o
-- escribe respuesta — antes el cliente solo veía el cambio si abría
-- el portal y refrescaba, sin aviso proactivo.
--
-- Idempotente: usa DROP IF EXISTS antes de cada CREATE TRIGGER.
-- ============================================================

-- ====== 1. Helper: traer email del actor desde auth.users ======
-- Las funciones siguientes la usan para llenar audit_log.actor_email.
CREATE OR REPLACE FUNCTION public.auth_actor_email()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, auth
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;

-- ====== 2. clients DELETE → audit_log 'client.delete' ======
CREATE OR REPLACE FUNCTION public.audit_client_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.audit_log (
    actor_id, actor_email, action, target_type, target_id, metadata
  )
  VALUES (
    auth.uid(),
    public.auth_actor_email(),
    'client.delete',
    'client',
    OLD.id,
    jsonb_build_object(
      'name', OLD.name,
      'sector', OLD.sector,
      'type', OLD.type,
      'status', OLD.status
    )
  );
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS clients_audit_delete ON public.clients;
CREATE TRIGGER clients_audit_delete
  AFTER DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_client_delete();

-- ====== 3. profiles UPDATE → audit_log 'team.update' ======
-- Solo loggeamos si cambian campos sensibles (role, position, permissions,
-- client_id, payment_*). Cambios triviales (initials, name) NO disparan
-- entrada para evitar ruido.
CREATE OR REPLACE FUNCTION public.audit_profile_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  changes jsonb := '{}'::jsonb;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    changes := changes || jsonb_build_object('role', jsonb_build_array(OLD.role, NEW.role));
  END IF;
  IF NEW.position IS DISTINCT FROM OLD.position THEN
    changes := changes || jsonb_build_object('position', jsonb_build_array(OLD.position, NEW.position));
  END IF;
  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    changes := changes || jsonb_build_object('permissions', jsonb_build_array(OLD.permissions, NEW.permissions));
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    changes := changes || jsonb_build_object('client_id', jsonb_build_array(OLD.client_id, NEW.client_id));
  END IF;
  IF NEW.payment_amount IS DISTINCT FROM OLD.payment_amount THEN
    changes := changes || jsonb_build_object('payment_amount', jsonb_build_array(OLD.payment_amount, NEW.payment_amount));
  END IF;
  IF NEW.payment_type IS DISTINCT FROM OLD.payment_type THEN
    changes := changes || jsonb_build_object('payment_type', jsonb_build_array(OLD.payment_type, NEW.payment_type));
  END IF;

  -- Si cambió algo sensible, loguear. Si solo cambió updated_at o initials, ignoramos.
  IF changes <> '{}'::jsonb THEN
    INSERT INTO public.audit_log (
      actor_id, actor_email, action, target_type, target_id, metadata
    )
    VALUES (
      auth.uid(),
      public.auth_actor_email(),
      'team.update',
      'profile',
      NEW.id::text,
      jsonb_build_object(
        'target_email', NEW.email,
        'changes', changes
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_audit_update ON public.profiles;
CREATE TRIGGER profiles_audit_update
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_update();

-- ====== 4. client_assignments → audit_log 'team.assign' / 'team.unassign' ======
CREATE OR REPLACE FUNCTION public.audit_assignment_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.audit_log (
    actor_id, actor_email, action, target_type, target_id, metadata
  )
  VALUES (
    auth.uid(),
    public.auth_actor_email(),
    'team.assign',
    'profile',
    NEW.user_id::text,
    jsonb_build_object(
      'client_id', NEW.client_id,
      'role_in_client', NEW.role_in_client,
      'since', NEW.since
    )
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS client_assignments_audit_insert ON public.client_assignments;
CREATE TRIGGER client_assignments_audit_insert
  AFTER INSERT ON public.client_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_assignment_insert();

CREATE OR REPLACE FUNCTION public.audit_assignment_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.audit_log (
    actor_id, actor_email, action, target_type, target_id, metadata
  )
  VALUES (
    auth.uid(),
    public.auth_actor_email(),
    'team.unassign',
    'profile',
    OLD.user_id::text,
    jsonb_build_object(
      'client_id', OLD.client_id,
      'role_in_client', OLD.role_in_client
    )
  );
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS client_assignments_audit_delete ON public.client_assignments;
CREATE TRIGGER client_assignments_audit_delete
  AFTER DELETE ON public.client_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_assignment_delete();

-- ====== 5. client_requests UPDATE → audit_log + notificación al cliente ======
-- Doble trigger:
--   a) audit_log 'request.update' cada vez que cambia status, assigned_to o response.
--   b) notification al cliente cuando director/team cambia status o agrega
--      respuesta. Realtime ya está suscrito a notifications, el bell del
--      portal va a levantarla al instante.
CREATE OR REPLACE FUNCTION public.audit_request_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  changes jsonb := '{}'::jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    changes := changes || jsonb_build_object('status', jsonb_build_array(OLD.status, NEW.status));
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    changes := changes || jsonb_build_object('assigned_to', jsonb_build_array(OLD.assigned_to, NEW.assigned_to));
  END IF;
  IF NEW.response IS DISTINCT FROM OLD.response THEN
    changes := changes || jsonb_build_object(
      'response_changed', true,
      'response_length', COALESCE(length(NEW.response), 0)
    );
  END IF;
  IF NEW.urgency IS DISTINCT FROM OLD.urgency THEN
    changes := changes || jsonb_build_object('urgency', jsonb_build_array(OLD.urgency, NEW.urgency));
  END IF;

  IF changes <> '{}'::jsonb THEN
    INSERT INTO public.audit_log (
      actor_id, actor_email, action, target_type, target_id, metadata
    )
    VALUES (
      auth.uid(),
      public.auth_actor_email(),
      'request.update',
      'client_request',
      NEW.id::text,
      jsonb_build_object(
        'client_id', NEW.client_id,
        'request_type', NEW.type,
        'request_title', NEW.title,
        'changes', changes
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS client_requests_audit_update ON public.client_requests;
CREATE TRIGGER client_requests_audit_update
  AFTER UPDATE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_request_update();

-- Notif al cliente cuando director/team responde o cambia status
CREATE OR REPLACE FUNCTION public.notify_client_on_request_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif_title text;
  notif_body text;
  notif_level text;
BEGIN
  -- Solo notificar si cambió status o se agregó respuesta. No notificar
  -- por cambios de assigned_to o urgency (eso es interno del equipo).
  IF (NEW.status IS DISTINCT FROM OLD.status) THEN
    -- El cliente debe enterarse: su solicitud avanzó.
    notif_level := CASE NEW.status
      WHEN 'done' THEN 'success'
      WHEN 'rejected' THEN 'warning'
      WHEN 'in_progress' THEN 'info'
      WHEN 'reviewing' THEN 'info'
      ELSE 'info'
    END;
    notif_title := CASE NEW.status
      WHEN 'reviewing' THEN 'Tu solicitud está en revisión'
      WHEN 'in_progress' THEN 'Tu solicitud está en curso'
      WHEN 'done' THEN '¡Tu solicitud fue completada!'
      WHEN 'rejected' THEN 'Tu solicitud fue rechazada'
      ELSE 'Tu solicitud cambió de estado'
    END;
    notif_body := NEW.title;
    IF NEW.response IS NOT NULL AND length(NEW.response) > 0 THEN
      notif_body := notif_body || ' — Respuesta del equipo disponible en tu portal.';
    END IF;

    INSERT INTO public.notifications (
      client, agent, level, title, body, link, read
    ) VALUES (
      NEW.client_id,
      'portal',
      notif_level,
      notif_title,
      notif_body,
      '/portal/solicitudes',
      false
    );
  ELSIF (NEW.response IS DISTINCT FROM OLD.response AND NEW.response IS NOT NULL AND length(NEW.response) > 0) THEN
    -- Status no cambió pero se agregó/actualizó la respuesta — también vale notif.
    INSERT INTO public.notifications (
      client, agent, level, title, body, link, read
    ) VALUES (
      NEW.client_id,
      'portal',
      'info',
      'El equipo respondió tu solicitud',
      NEW.title,
      '/portal/solicitudes',
      false
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS client_requests_notify_client ON public.client_requests;
CREATE TRIGGER client_requests_notify_client
  AFTER UPDATE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_on_request_change();

-- ====== Verificación ======
-- Después de aplicar la migración:
-- 1. UPDATE public.clients SET name = name WHERE id = 'wiztrip';  -- no debería crear audit (no hay cambios sensibles, pero clients no tiene trigger update — solo delete)
-- 2. Borrar un cliente de test y verificar que audit_log tiene 'client.delete'
-- 3. UPDATE public.profiles SET position = 'Test' WHERE id = '<uuid>'; → audit 'team.update'
-- 4. INSERT INTO public.client_assignments (client_id, user_id, role_in_client, since) VALUES (...); → audit 'team.assign'
-- 5. UPDATE public.client_requests SET status = 'reviewing' WHERE id = '<uuid>'; → audit 'request.update' + notification al cliente
