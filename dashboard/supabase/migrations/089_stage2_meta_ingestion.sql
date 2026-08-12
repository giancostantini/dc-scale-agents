-- 089: Stage 2a · Ingestión Meta Insights + trazabilidad + tasa de aprobación
--
-- El gap #1 de la auditoría: hoy las métricas de pauta se cargan A MANO
-- (kpis.paid_media vía /paid-media) y los reportes dependen de eso. Esta
-- migración crea la infraestructura para que un cron diario las traiga solo:
--
--   1. clients.meta_ad_account_id — la cuenta publicitaria del cliente
--      (formato "act_123..." o solo el número). Se edita en la ficha.
--      El TOKEN es de agencia (System User del Business Manager) y vive en
--      la env var META_SYSTEM_USER_TOKEN de Vercel — nunca en la DB.
--   2. paid_media_daily — una fila por cliente+día+plataforma con las
--      métricas de la cuenta (spend, clicks, conversiones, roas, raw).
--   3. content_posts.metrics — métricas orgánicas por pieza (jsonb; las
--      llenará la fase 2b con page tokens; la columna queda lista).
--   4. content_posts.origin_run_id — trazabilidad: qué corrida de agente
--      generó la pieza (roadmap Stage 2, punto 5). Sin FK porque el DDL de
--      agent_runs no está versionado (hallazgo de auditoría) — es bigint.
--   5. Vista content_ai_approval — "¿qué % de lo que propone la IA se
--      publica?" por cliente y mes (roadmap Stage 2, punto 4).

-- ====== 1. Ad account por cliente ======
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS meta_ad_account_id text;

COMMENT ON COLUMN public.clients.meta_ad_account_id IS
  'ID de la cuenta publicitaria de Meta (act_XXXX o número). NULL = sin ingestión de pauta. El token es de agencia (env META_SYSTEM_USER_TOKEN).';

-- ====== 2. Métricas de pauta diarias ======
CREATE TABLE IF NOT EXISTS public.paid_media_daily (
  id bigserial PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  platform text NOT NULL DEFAULT 'meta',
  spend numeric(14, 2) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  ctr numeric(8, 4),
  cpc numeric(10, 4),
  cpm numeric(10, 4),
  conversions numeric(12, 2),
  conversion_value numeric(14, 2),
  roas numeric(10, 4),
  -- Respuesta cruda de la API para no perder nada (actions, breakdowns).
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, date, platform)
);

CREATE INDEX IF NOT EXISTS idx_pmd_client_date ON public.paid_media_daily (client_id, date DESC);

ALTER TABLE public.paid_media_daily ENABLE ROW LEVEL SECURITY;

-- Lectura: director + team (la CM trabaja con performance). Escritura:
-- solo el cron con service role (sin policy de INSERT/UPDATE).
DROP POLICY IF EXISTS paid_media_daily_select ON public.paid_media_daily;
CREATE POLICY paid_media_daily_select ON public.paid_media_daily
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('director', 'team')
    )
  );

COMMENT ON TABLE public.paid_media_daily IS
  'Métricas de pauta por cliente+día (Stage 2a). Las escribe /api/cron/meta-insights.';

-- ====== 3/4. Métricas por pieza + trazabilidad ======
ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS metrics jsonb,
  ADD COLUMN IF NOT EXISTS origin_run_id bigint;

COMMENT ON COLUMN public.content_posts.metrics IS
  'Métricas orgánicas de la pieza publicada (reach, likes, saves…). Las llenará la ingestión orgánica (Stage 2b).';
COMMENT ON COLUMN public.content_posts.origin_run_id IS
  'agent_runs.id de la corrida que generó la pieza (source=ai). Trazabilidad propuesta→publicación.';

-- ====== 5. Tasa de aprobación de contenido IA ======
-- security_invoker: respeta el RLS de content_posts del que consulta.
CREATE OR REPLACE VIEW public.content_ai_approval
  WITH (security_invoker = true) AS
SELECT
  client_id,
  to_char(date, 'YYYY-MM') AS month,
  count(*) AS proposed,
  count(*) FILTER (WHERE status IN ('scheduled', 'published')) AS approved,
  round(
    100.0 * count(*) FILTER (WHERE status IN ('scheduled', 'published')) / count(*),
    1
  ) AS approval_pct
FROM public.content_posts
WHERE source = 'ai'
GROUP BY client_id, to_char(date, 'YYYY-MM');

COMMENT ON VIEW public.content_ai_approval IS
  '% de piezas propuestas por IA que llegan a scheduled/published, por cliente y mes. Métrica gate para H2 (doc 17).';
