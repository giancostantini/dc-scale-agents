-- ============================================================
-- 070 — Agregar tipo "recomendacion" a client_requests
-- ------------------------------------------------------------
-- Hasta acá el CHECK de client_requests.type aceptaba solo
-- ('oferta', 'accion'). Las "recomendaciones" del cliente sobre
-- piezas específicas de contenido (las que carga desde la nueva
-- vista /portal/agenda) las modelamos como un tercer tipo del
-- mismo inbox — comparten título/descripción/estado/asignación
-- y solo se distinguen por la metadata.
--
-- Metadata esperada para type='recomendacion':
--   { post_id: uuid, post_code: 'C-XXXX', post_idea_excerpt: text }
--
-- Drop + re-create del CHECK porque no se puede ALTER un CHECK
-- en Postgres — hay que sacarlo y volverlo a agregar.
-- ============================================================

ALTER TABLE public.client_requests
DROP CONSTRAINT IF EXISTS client_requests_type_check;

ALTER TABLE public.client_requests
ADD CONSTRAINT client_requests_type_check
  CHECK (type IN ('oferta', 'accion', 'recomendacion'));

-- Index opcional para filtros por tipo en la vista global del GP.
CREATE INDEX IF NOT EXISTS client_requests_type_idx
  ON public.client_requests(type);
