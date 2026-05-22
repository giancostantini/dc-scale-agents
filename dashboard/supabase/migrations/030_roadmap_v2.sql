-- ============================================================
-- Migración 030: Roadmap v2 — eventos multi-día, pauta, mix de
-- contenido y notas de estrategia por mes.
-- ============================================================
-- Cambios:
--
-- 1. cal_events.end_date (DATE nullable) — para eventos que cubren
--    más de un día (producciones, viajes, sprints internos, batches
--    de pauta). NULL = evento de 1 día (compatible con todo lo viejo).
--
-- 2. cal_events.type: agregamos 'pauta' al check. Eso permite agendar
--    campañas de paid media corriendo en un rango de fechas, con
--    visualización propia en el calendario.
--
-- 3. clients.content_mix (JSONB) — porcentaje de contenido por tipo
--    (valor/oferta/engagement) por red. Estructura:
--      { "ig": { "valor": 60, "oferta": 25, "engagement": 15 }, ... }
--    El planificador usa esto para auto-asignar el tipo de cada
--    posteo sugerido en el calendario (chip V/O/E).
--
-- 4. clients.roadmap_month_notes (JSONB) — texto de estrategia
--    desarrollado por mes. Estructura:
--      { "2026-05": "En mayo arrancamos campaña...", ... }
--    Aparece en el PDF del roadmap como página intercalada
--    después de cada calendario de mes.
-- ============================================================

-- 1 + 2. cal_events: end_date + nuevo tipo 'pauta'
ALTER TABLE public.cal_events
  ADD COLUMN IF NOT EXISTS end_date date;

-- Drop el CHECK viejo. Postgres internamente convierte CHECK (type IN
-- (...)) a CHECK ((type = ANY (ARRAY[...]))) — por eso filtramos por
-- "type" + ("IN" o "ANY") para cazar ambas formas. Además dropeamos
-- explícitamente el nombre cal_events_type_check si ya existe, así la
-- migración es 100% safe-re-run.
ALTER TABLE public.cal_events
  DROP CONSTRAINT IF EXISTS cal_events_type_check;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.cal_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* 'type\s*(IN\s*\(|=\s*ANY)'
  LOOP
    EXECUTE format('ALTER TABLE public.cal_events DROP CONSTRAINT %I', r.conname);
  END LOOP;
END$$;

ALTER TABLE public.cal_events
  ADD CONSTRAINT cal_events_type_check
  CHECK (type IN ('reunion', 'cobro', 'reporte', 'dev', 'contenido', 'pauta'));

COMMENT ON COLUMN public.cal_events.end_date IS
  'Fecha de fin del evento (inclusive). NULL = evento de 1 solo día (= date). Usado para producciones multi-día, sprints, viajes y batches de pauta.';

-- 3. clients.content_mix
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS content_mix jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clients.content_mix IS
  'Distribución porcentual de contenido por red. Ej: {"ig":{"valor":60,"oferta":25,"engagement":15}}. Usado por el calendario para auto-asignar tipo V/O/E a los posts sugeridos.';

-- 4. clients.roadmap_month_notes
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS roadmap_month_notes jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clients.roadmap_month_notes IS
  'Texto de estrategia desarrollado por mes (markdown). Key = "YYYY-MM", value = string md. Aparece en el PDF del roadmap como página intercalada después de cada calendario mensual.';

-- Sanity: si alguien tenía 'pauta' en uso (no debería) lo dejamos pasar.
-- El CHECK ampliado lo permite. Roll-back manual:
--   ALTER TABLE cal_events DROP CONSTRAINT cal_events_type_check;
--   ALTER TABLE cal_events ADD CONSTRAINT cal_events_type_check
--     CHECK (type IN ('reunion','cobro','reporte','dev','contenido'));
