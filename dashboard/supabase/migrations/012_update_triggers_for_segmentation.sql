-- ============================================================
-- Migración 012: Actualizar triggers para llenar to_role/to_user_id
-- ============================================================
-- Después de la 011 (que agregó to_role + to_user_id), los triggers
-- existentes en 009 deben llenar esos campos correctamente para que
-- la RLS pueda segmentar bien.
--
-- También crea un trigger NUEVO: notify_team_on_request_assigned →
-- notif al team cuando el director le asigna una solicitud.
-- ============================================================

-- ====== 1. Actualizar notify_client_on_request_change ======
-- (existía en 009 — ahora también llena to_role='client')

CREATE OR REPLACE FUNCTION public.notify_client_on_request_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif_title text;
  notif_body text;
  notif_level text;
BEGIN
  -- Notificar al cliente cuando cambia status o se agrega respuesta.
  IF (NEW.status IS DISTINCT FROM OLD.status) THEN
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
      client, to_role, agent, level, title, body, link, read, email_sent
    ) VALUES (
      NEW.client_id,
      'client',
      'portal',
      notif_level,
      notif_title,
      notif_body,
      '/portal/solicitudes',
      false,
      false
    );
  ELSIF (NEW.response IS DISTINCT FROM OLD.response AND NEW.response IS NOT NULL AND length(NEW.response) > 0) THEN
    INSERT INTO public.notifications (
      client, to_role, agent, level, title, body, link, read, email_sent
    ) VALUES (
      NEW.client_id,
      'client',
      'portal',
      'info',
      'El equipo respondió tu solicitud',
      NEW.title,
      '/portal/solicitudes',
      false,
      false
    );
  END IF;
  RETURN NEW;
END $$;

-- ====== 2. NUEVO trigger: notify_team_on_request_assigned ======
-- Cuando el director cambia client_requests.assigned_to a un team_member,
-- crear notif personal para ese user.

CREATE OR REPLACE FUNCTION public.notify_team_on_request_assigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo si assigned_to cambió y NO es null (asignación inicial o reasignación)
  IF (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
     AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (
      client, to_user_id, agent, level, title, body, link, read, email_sent
    ) VALUES (
      NEW.client_id,
      NEW.assigned_to,
      'requests',
      'info',
      'Te asignaron una nueva solicitud',
      NEW.title || ' — urgencia ' || NEW.urgency,
      '/cliente/' || NEW.client_id || '/solicitudes',
      false,
      false
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS client_requests_notify_assigned ON public.client_requests;
CREATE TRIGGER client_requests_notify_assigned
  AFTER UPDATE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_team_on_request_assigned();

-- ====== Verificación ======
-- 1. Cambiar status de una solicitud → notif al cliente (to_role='client')
-- 2. Asignar solicitud a un team → notif personal al team (to_user_id=...)
-- 3. SELECT id, client, title, to_role, to_user_id FROM notifications
--    ORDER BY created_at DESC LIMIT 5;
