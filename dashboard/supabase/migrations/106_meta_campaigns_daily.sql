-- ================================================================
-- 106 · Campañas de Meta por día (portal del cliente + interno)
-- ================================================================
-- paid_media_daily (089) guarda el total de la CUENTA por día. Para mostrar
-- qué campañas están corriendo y cómo rinde cada una hace falta el nivel
-- campaña. Lo llena /api/cron/meta-insights (mismo token de agencia,
-- META_SYSTEM_USER_TOKEN) en la misma corrida.
--
-- Lectura: director + team. El CLIENTE no lee esta tabla directo (tiene
-- inversión y costos): el portal la consume por /api/portal/campaigns, que
-- devuelve solo resultados (decisión de Gian, 2026-09-26).
--
-- Aplicar a mano en el SQL editor de Supabase. Idempotente.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.meta_campaigns_daily (
  id bigserial PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL DEFAULT '',
  -- effective_status de Meta al momento de la corrida (ACTIVE, PAUSED,
  -- CAMPAIGN_PAUSED, ARCHIVED…). Se actualiza en todas las filas recientes.
  effective_status text,
  objective text,
  spend numeric(14, 2) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  reach bigint,
  clicks bigint NOT NULL DEFAULT 0,
  ctr numeric(8, 4),
  cpc numeric(10, 4),
  -- Resultado principal: compras si hay, si no leads, si no mensajes.
  results numeric(12, 2),
  result_type text,
  conversion_value numeric(14, 2),
  roas numeric(10, 4),
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, date, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_mcd_client_date
  ON public.meta_campaigns_daily (client_id, date DESC);

ALTER TABLE public.meta_campaigns_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_campaigns_daily_select ON public.meta_campaigns_daily;
CREATE POLICY meta_campaigns_daily_select ON public.meta_campaigns_daily
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('director', 'team')
    )
  );

COMMENT ON TABLE public.meta_campaigns_daily IS
  'Métricas de Meta por cliente+día+campaña. Las escribe /api/cron/meta-insights. El portal las lee por /api/portal/campaigns (sin inversión).';

-- Verificación:
--   SELECT client_id, date, campaign_name, effective_status, results, result_type
--   FROM public.meta_campaigns_daily ORDER BY date DESC LIMIT 20;
