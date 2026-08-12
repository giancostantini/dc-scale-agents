-- 090: Stage 2b · Ingestión orgánica por pieza + idempotencia de outputs
--
-- Dos cosas independientes que cierran el Stage 2 (roadmap, puntos 2 y 3):
--
-- A. ORGÁNICO — content_posts.metrics (mig 089) se llena solo:
--    1. clients.meta_ig_user_id / meta_page_id — el IG business account y
--       la página de FB del cliente (el TOKEN sigue siendo el de agencia,
--       env META_SYSTEM_USER_TOKEN — mismo System User, permisos extra:
--       pages_read_engagement + instagram_basic + instagram_manage_insights).
--    2. organic_posts — lo que Meta dice que se publicó (media + insights),
--       con link a la pieza del planner cuando el matcher las cruza.
--    Esto despierta a social-media-metrics con datos reales → hooks
--    ganadores dejan de ser estimaciones.
--
-- B. IDEMPOTENCIA — dedup_key en notifications y agent_outputs:
--    un re-run del mismo agente/cron con la misma clave NO duplica la notif
--    ni el output (índice único parcial + upsert ignore desde los libs).

-- ====== A1. IDs de Meta por cliente ======
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS meta_ig_user_id text,
  ADD COLUMN IF NOT EXISTS meta_page_id text;

COMMENT ON COLUMN public.clients.meta_ig_user_id IS
  'Instagram Business Account ID del cliente (ingestión orgánica, mig 090). NULL = sin ingestión.';
COMMENT ON COLUMN public.clients.meta_page_id IS
  'Facebook Page ID del cliente (reservado para insights de FB). NULL = sin ingestión.';

-- ====== A2. Posts orgánicos ingestados ======
CREATE TABLE IF NOT EXISTS public.organic_posts (
  id bigserial PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  network text NOT NULL DEFAULT 'ig',
  media_id text NOT NULL UNIQUE,
  published_at timestamptz,
  caption text,
  permalink text,
  media_type text,
  like_count integer,
  comments_count integer,
  -- Insights de la API: {reach, saved, shares, views, ...} — lo que la
  -- media soporte según su tipo.
  metrics jsonb,
  -- Pieza del planner a la que corresponde (matcher: red + fecha ±2 días).
  matched_post_id uuid REFERENCES public.content_posts(id) ON DELETE SET NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organic_client_published
  ON public.organic_posts (client_id, published_at DESC);

ALTER TABLE public.organic_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organic_posts_select ON public.organic_posts;
CREATE POLICY organic_posts_select ON public.organic_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('director', 'team')
    )
  );

COMMENT ON TABLE public.organic_posts IS
  'Media orgánica de IG por cliente + insights (Stage 2b). La escribe /api/cron/organic-insights.';

-- ====== B. Idempotencia: dedup_key ======
ALTER TABLE IF EXISTS public.notifications
  ADD COLUMN IF NOT EXISTS dedup_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup
  ON public.notifications (dedup_key)
  WHERE dedup_key IS NOT NULL;
COMMENT ON COLUMN public.notifications.dedup_key IS
  'Clave de idempotencia opcional. Mismo dedup_key = la notif no se duplica (índice único parcial).';

ALTER TABLE IF EXISTS public.agent_outputs
  ADD COLUMN IF NOT EXISTS dedup_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_outputs_dedup
  ON public.agent_outputs (dedup_key)
  WHERE dedup_key IS NOT NULL;
COMMENT ON COLUMN public.agent_outputs.dedup_key IS
  'Clave de idempotencia opcional. Un re-run con la misma clave no duplica el output.';
