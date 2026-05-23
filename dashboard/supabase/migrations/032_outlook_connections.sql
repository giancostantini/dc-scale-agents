-- ============================================================
-- Migración 032: outlook_connections (per-user OAuth)
-- ============================================================
-- Objetivo:
--   Reemplaza outlook_subscriptions (single global subscription para el
--   director, ya descartado). Ahora cada usuario del sistema (cliente,
--   team o director) conecta su propia cuenta de Outlook vía OAuth
--   delegated y guarda sus tokens acá.
--
--   El refresh_token está cifrado con AES-256-GCM antes de guardar
--   (env var OUTLOOK_TOKEN_ENCRYPTION_KEY). El access_token también
--   se cifra por consistencia, aunque dura solo 1h.
--
-- Comportamiento de sync:
--   - Cliente (role=client) conecta su Outlook → cada evento de su
--     calendario se sincroniza a cal_events con owner_user_id=su uid.
--     Los ve en /portal/calendario.
--   - Director/team conecta su Outlook → cada evento se sincroniza
--     con owner_user_id=su uid. Los ve en /calendario interno.
--   - Webhooks identifican al user por subscription_id (UNIQUE).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.outlook_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identidad del usuario en Microsoft (capturada en el OAuth callback)
  ms_user_id TEXT NOT NULL,       -- ObjectId en Azure AD ("oid" claim)
  ms_email TEXT NOT NULL,         -- email del mailbox conectado

  -- Tokens cifrados (AES-256-GCM, formato "iv:authTag:ciphertext" hex)
  refresh_token_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,

  -- Scopes concedidos (para auditar si Microsoft cambió permisos)
  scope TEXT NOT NULL,

  -- Subscription de Microsoft Graph (TTL ~3 días para events)
  subscription_id TEXT UNIQUE,
  subscription_expires_at TIMESTAMPTZ,

  -- Estado operativo
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,                -- null si OK; mensaje si falló refresh/sub
  last_error_at TIMESTAMPTZ
);

COMMENT ON TABLE public.outlook_connections IS
  'Conexión OAuth de cada usuario con su Outlook. Una sola conexión activa por usuario (UNIQUE user_id). El webhook usa subscription_id para identificar al dueño.';
COMMENT ON COLUMN public.outlook_connections.ms_user_id IS
  'ObjectId del usuario en Azure AD. Lo usamos como path en /users/{id}/events si hace falta refetch, aunque normalmente usamos /me con el token delegated.';
COMMENT ON COLUMN public.outlook_connections.refresh_token_encrypted IS
  'Refresh token AES-256-GCM encrypted. Vive ~90 días o hasta que el user revoque. Necesario para obtener nuevos access tokens sin interacción.';
COMMENT ON COLUMN public.outlook_connections.subscription_id IS
  'Microsoft Graph subscription ID. NULL si todavía no se creó la subscription (entre el OAuth callback y el setup async). UNIQUE para que el webhook pueda hacer reverse lookup.';

CREATE INDEX IF NOT EXISTS outlook_connections_subscription_expires_idx
  ON public.outlook_connections(subscription_expires_at)
  WHERE subscription_id IS NOT NULL;

-- ====== RLS ======
ALTER TABLE public.outlook_connections ENABLE ROW LEVEL SECURITY;

-- Cada user ve y maneja solo su propia conexión. Las escrituras las hace
-- el endpoint con service role; estas policies son para reads desde el
-- frontend con anon key + Bearer del user (status endpoint).
DROP POLICY IF EXISTS outlook_connections_self_select ON public.outlook_connections;
CREATE POLICY outlook_connections_self_select ON public.outlook_connections
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS outlook_connections_self_delete ON public.outlook_connections;
CREATE POLICY outlook_connections_self_delete ON public.outlook_connections
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE: solo service role (endpoints internos). No policy → bloqueado
-- para authenticated, que es lo que queremos. Los tokens NUNCA tocan al cliente.

-- ====== Verificación ======
-- 1. Tabla + UNIQUE:
--    \d outlook_connections
-- 2. RLS:
--    SELECT relrowsecurity FROM pg_class WHERE relname='outlook_connections'; → true
-- 3. Self-access:
--    Como user A: SELECT * FROM outlook_connections; → solo filas con user_id=A.
