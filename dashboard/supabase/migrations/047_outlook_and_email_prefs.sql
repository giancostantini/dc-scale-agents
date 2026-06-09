-- ============================================================
-- Migración 047: integración Outlook + preferencias de email
-- granulares por evento.
-- ============================================================
--
-- 1. Preferencias de email por evento (transaccionales):
--    Cada miembro del equipo decide qué tipos de eventos le mandan
--    notif por mail. Defaults = todo activado (opt-in).
--
-- 2. Conexión Outlook (Microsoft Graph):
--    Cada miembro puede conectar su cuenta de Outlook personal.
--    Guardamos access_token, refresh_token, expires_at, email
--    (texto, para mostrar en UI). El access_token vive ~1h, el
--    refresh_token se rota cuando lo usamos.
--    NOTA: para producción seria los tokens deberían ir encriptados
--    o en un secret store. Esta versión los guarda en plano para
--    iterar rápido — funciona en small-team y se puede endurecer
--    después.
-- ============================================================

ALTER TABLE public.profiles
  -- Toggles de email por tipo de evento
  ADD COLUMN IF NOT EXISTS email_on_new_request boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_on_task_assigned boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_on_client_assigned boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_on_payment_received boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_on_content_approved boolean NOT NULL DEFAULT true,
  -- Outlook (Microsoft Graph)
  ADD COLUMN IF NOT EXISTS outlook_access_token text,
  ADD COLUMN IF NOT EXISTS outlook_refresh_token text,
  ADD COLUMN IF NOT EXISTS outlook_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS outlook_email text,
  ADD COLUMN IF NOT EXISTS outlook_connected_at timestamptz;

COMMENT ON COLUMN public.profiles.email_on_new_request IS
  'Recibir email cuando un cliente sube una nueva solicitud al portal.';
COMMENT ON COLUMN public.profiles.email_on_task_assigned IS
  'Recibir email cuando me asignan una tarea.';
COMMENT ON COLUMN public.profiles.email_on_client_assigned IS
  'Recibir email cuando me asignan a un cliente.';
COMMENT ON COLUMN public.profiles.email_on_payment_received IS
  'Director: recibir email cuando una factura se marca como pagada.';
COMMENT ON COLUMN public.profiles.email_on_content_approved IS
  'Recibir email cuando una idea de contenido se aprueba (y pasa al calendario).';
COMMENT ON COLUMN public.profiles.outlook_email IS
  'Email de Outlook conectado. Visible al usuario en /perfil.';
COMMENT ON COLUMN public.profiles.outlook_access_token IS
  'Microsoft Graph access_token (TTL ~1h). Se refresca con refresh_token.';
COMMENT ON COLUMN public.profiles.outlook_refresh_token IS
  'Microsoft Graph refresh_token (long-lived). Se rota en cada refresh.';
