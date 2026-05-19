-- ============================================================
-- Migración 026: outlook_subscriptions
-- ============================================================
-- Objetivo:
--   Persistir las subscriptions activas de Microsoft Graph para
--   poder renovarlas antes de que expiren (TTL máximo para events
--   es ~3 días según docs de Graph). Un GHA cron renueva las que
--   están a <2 días de vencer.
--
--   Solo el director (vía service role / GHA) accede a esta tabla;
--   los clientes nunca la ven, así que RLS solo permite service role
--   (default cuando no hay policies).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.outlook_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  subscription_id TEXT NOT NULL UNIQUE,
  resource TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  client_state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.outlook_subscriptions IS
  'Subscriptions activas a Microsoft Graph para sync de calendario. Cada fila representa una subscription que escucha cambios en /users/{director}/events. El cron diario renueva las que vencen pronto.';
COMMENT ON COLUMN public.outlook_subscriptions.subscription_id IS
  'ID que devuelve Microsoft Graph al crear la subscription. Necesario para PATCH (renovar) y DELETE.';
COMMENT ON COLUMN public.outlook_subscriptions.client_state IS
  'String secreto que Microsoft Graph nos rebota en cada notificación — lo validamos para descartar requests falsas.';

CREATE INDEX IF NOT EXISTS outlook_subscriptions_expires_at_idx
  ON public.outlook_subscriptions(expires_at);

-- RLS habilitado pero sin policies → solo service role bypassa (correcto
-- para esta tabla de infra).
ALTER TABLE public.outlook_subscriptions ENABLE ROW LEVEL SECURITY;

-- ====== Verificación ======
-- SELECT relrowsecurity FROM pg_class
-- WHERE relname = 'outlook_subscriptions';
-- → true
