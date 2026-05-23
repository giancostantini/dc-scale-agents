-- ============================================================
-- Migración 028: cal_events.external_id + source (sync con Outlook)
-- ============================================================
-- Objetivo:
--   Permitir sync one-way Outlook → portal: cuando el director crea/
--   modifica/borra eventos en su calendario de Outlook, Microsoft Graph
--   envía un webhook que actualiza cal_events.
--
--   Para idempotencia y deletes, persistimos el `eventId` original que
--   viene de Microsoft Graph como `external_id` (única).
--
--   `source` distingue manuales (cargados por el equipo en /cliente/[id])
--   vs sincronizados desde Outlook (eventos automáticos).
-- ============================================================

ALTER TABLE public.cal_events
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'outlook'));

-- UNIQUE para soportar upsert idempotente desde el webhook
CREATE UNIQUE INDEX IF NOT EXISTS cal_events_external_id_uniq
  ON public.cal_events(external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON COLUMN public.cal_events.external_id IS
  'Identificador del evento en el sistema externo (Microsoft Graph eventId). NULL para eventos manuales.';
COMMENT ON COLUMN public.cal_events.source IS
  '''manual'' = cargado por el equipo en el dashboard interno · ''outlook'' = sincronizado desde el calendario del director via Microsoft Graph.';

-- ====== Verificación ======
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'cal_events'
--   AND column_name IN ('external_id', 'source');
