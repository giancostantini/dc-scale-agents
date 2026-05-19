-- ============================================================
-- Migración 022: Frecuencia de contenido por cliente
-- ============================================================
-- El director define cuántas veces por semana publica el cliente
-- en cada red (ej: instagram=3, linkedin=2). El planificador
-- usa ese dato para sombrear los días "sugeridos" de cada red
-- en el calendario.
--
-- Estructura del JSONB:
-- {
--   "ig": 3,
--   "tt": 5,
--   "in": 2,
--   "fb": 1
-- }
-- Solo aparecen las redes que el cliente usa. Networks sin
-- entrada o con valor 0 = no se sugieren días.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS content_frequency jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clients.content_frequency IS
  'Frecuencia semanal de publicación por red social. Ej: {"ig":3,"in":2}. Usado por el planificador para marcar días sugeridos.';
