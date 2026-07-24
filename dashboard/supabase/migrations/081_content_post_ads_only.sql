-- ============================================================
-- 081 — Piezas exclusivas de Publicidad
-- ------------------------------------------------------------
-- Hay anuncios que se pautan pero NO se publican en el perfil de
-- ninguna red. Hoy toda pieza tiene que declarar al menos una red, así
-- que esos anuncios terminaban ensuciando la Tabla y la Vista feed
-- (que simula la grilla del perfil) con contenido que nunca va a
-- aparecer ahí.
--
-- `ads_only = true` marca esas piezas: solo se ven en la pestaña
-- Publicidad.
--
-- Por qué una columna nueva y no `networks = '{}'`:
-- las piezas que crea el Asistente Creativo se insertan escribiendo
-- solo `network` (el guardado en lote no toca `networks`), así que ya
-- tienen el array vacío y dependen del fallback a la red singular.
-- Usar "array vacío" como marca de "sin redes" las rompería a todas.
-- ============================================================

ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS ads_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.content_posts.ads_only IS
  'true = pieza exclusiva de Publicidad: se pauta pero no se publica en el perfil de ninguna red. Se excluye de la Tabla y de la Vista feed. Solo aplica con format=anuncio.';

-- Filtro habitual: la vista Publicidad pide format=anuncio, y Tabla y
-- feed piden ads_only = false.
CREATE INDEX IF NOT EXISTS content_posts_ads_only_idx
  ON public.content_posts(client_id)
  WHERE ads_only = true;
