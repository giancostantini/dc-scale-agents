-- ============================================================
-- Migración 011: Notifications con segmentación por rol/usuario
-- ============================================================
-- Bug previo: la tabla `notifications` solo tenía `client text` como
-- destinatario, sin distinción de a quién es la notif. Resultado: el
-- bell del director y team mostraba notifs del cliente ("Tu solicitud
-- está en curso"), y el cliente no podía ver SUS notifs filtradas.
--
-- Esta migración:
--   1. Agrega `to_user_id uuid` (notif a un user específico)
--   2. Agrega `to_role text` (notif a todo un rol con filtro de cliente)
--   3. Agrega `email_sent boolean` (flag para evitar email duplicado)
--   4. Habilita RLS con policy de SELECT/UPDATE/INSERT por rol
--   5. Backfill de filas existentes con valores razonables
-- ============================================================

-- ====== 1. Crear tabla si no existe (defensa: el schema.sql original
--          la creaba via DROP CASCADE pero algunas instancias de
--          Supabase pueden tenerla con shape distinto) ======

CREATE TABLE IF NOT EXISTS public.notifications (
  id bigserial PRIMARY KEY,
  client text REFERENCES public.clients(id) ON DELETE CASCADE,
  agent text,
  level text NOT NULL DEFAULT 'info'
    CHECK (level IN ('info', 'success', 'warning', 'error')),
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ====== 2. Agregar columnas de segmentación ======

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS to_user_id uuid
    REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS to_role text
    CHECK (to_role IS NULL OR to_role IN ('director', 'team', 'client')),
  ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false;

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS notifications_to_user_idx
  ON public.notifications(to_user_id);
CREATE INDEX IF NOT EXISTS notifications_to_role_client_idx
  ON public.notifications(to_role, client);
CREATE INDEX IF NOT EXISTS notifications_email_sent_idx
  ON public.notifications(email_sent, created_at)
  WHERE email_sent = false;
CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications(created_at DESC);

-- ====== 3. Backfill de filas existentes ======
-- Las filas creadas antes de esta migración no tienen to_role.
-- Heurística según `agent` y `title`:

-- Agente 'portal' + title con "Tu solicitud" → para el cliente
UPDATE public.notifications
SET to_role = 'client'
WHERE to_role IS NULL
  AND agent = 'portal'
  AND (title ILIKE 'Tu solicitud%' OR title ILIKE '%cambió de estado%' OR title ILIKE 'El equipo respondió%');

-- Agente 'portal' + title con "Nueva oferta/acción del cliente" → para el team
UPDATE public.notifications
SET to_role = 'team'
WHERE to_role IS NULL
  AND agent = 'portal'
  AND (title ILIKE 'Nueva oferta%' OR title ILIKE 'Nueva acción%');

-- Agente 'phases' + title con "Reporte" approved → para el cliente
UPDATE public.notifications
SET to_role = 'client'
WHERE to_role IS NULL
  AND agent = 'phases'
  AND title ILIKE '%aprobado%';

-- Agentes IA (content-creator, brandbook-processor, etc.) → para el team
-- (los directores + team asignado al cliente son quienes deben enterarse)
UPDATE public.notifications
SET to_role = 'team'
WHERE to_role IS NULL
  AND agent IS NOT NULL
  AND agent NOT IN ('portal', 'phases');

-- Resto (sin agent o sin match): default a 'team'
UPDATE public.notifications
SET to_role = 'team'
WHERE to_role IS NULL;

-- ====== 4. RLS ======

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: cada user ve solo sus notifs según rol
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    -- Personalizada: dirigida específicamente a este user
    to_user_id = auth.uid()
    -- Director ve notifs de rol director, o sin rol (broadcast interno)
    OR (
      auth_role() = 'director'
      AND (to_role = 'director' OR to_role = 'team' OR to_role IS NULL)
    )
    -- Team ve notifs de rol team con cliente al que está asignado
    OR (
      auth_role() = 'team'
      AND to_role = 'team'
      AND (client IS NULL OR has_client_assignment(client))
    )
    -- Cliente ve notifs de rol client con su client_id
    OR (
      auth_role() = 'client'
      AND to_role = 'client'
      AND auth_client_id() = client
    )
  );

-- UPDATE: solo el dueño de la notif puede marcarla como read
-- (cualquier user con SELECT puede UPDATE su read=true)
DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    to_user_id = auth.uid()
    OR (
      auth_role() = 'director'
      AND (to_role = 'director' OR to_role = 'team' OR to_role IS NULL)
    )
    OR (
      auth_role() = 'team'
      AND to_role = 'team'
      AND (client IS NULL OR has_client_assignment(client))
    )
    OR (
      auth_role() = 'client'
      AND to_role = 'client'
      AND auth_client_id() = client
    )
  )
  WITH CHECK (true);

-- INSERT: cualquier authenticated puede insertar (los endpoints lo hacen
-- via service role que bypassea RLS, pero igual permitimos para
-- triggers SQL que corren con SECURITY DEFINER)
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ====== Verificación ======
-- SELECT id, client, agent, level, title, to_role, to_user_id, email_sent
-- FROM public.notifications ORDER BY created_at DESC LIMIT 10;
