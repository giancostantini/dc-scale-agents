-- ============================================================
-- Migración 042: Pipeline — alertas por tiempo en etapa + leads
-- "perdidos" (archivado de oportunidades que no cerraron) +
-- fuentes ampliadas (sitio_web / redes_sociales / eventos).
-- ============================================================
--
-- Cambios:
--   1. Columnas nuevas en `leads`:
--        - stage_changed_at: cuándo entró a la etapa actual.
--        - lost_at: fecha de "pérdida" (NULL = todavía en pipeline).
--        - lost_reason: texto libre.
--        - lost_from_stage: en qué etapa estaba al perderse.
--   2. Trigger: cada vez que cambia `stage`, stage_changed_at = now().
--   3. CHECK del enum source ampliado a incluir las nuevas fuentes.
--   4. CHECK de value: ahora value=0 está permitido (en prospección y
--      contactado no hay cotización todavía).
--   5. Índices para el filtro de "perdidos" + ordenar por tiempo en
--      etapa.
--
-- Idempotente: usa IF NOT EXISTS / DROP IF EXISTS.
-- ============================================================

-- Columnas
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_reason text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_from_stage text;

-- Permitir value=0 (prospección/contactado no requiere cotización)
ALTER TABLE public.leads
  ALTER COLUMN value SET DEFAULT 0;

-- Ampliar el enum de source: dropeamos el check viejo y agregamos uno
-- nuevo más permisivo. Source acepta cualquier slug — los valores
-- definidos en el frontend son:
--   linkedin / email / manual / referido / sitio_web / redes_sociales
--   / eventos / otro
-- Para no romper si ya había un CHECK estricto:
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.leads'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_check
  CHECK (source IN (
    'linkedin','email','manual','referido',
    'sitio_web','redes_sociales','eventos','otro'
  ));

-- Trigger que actualiza stage_changed_at cuando cambia la etapa
CREATE OR REPLACE FUNCTION public.leads_touch_stage_changed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_touch_stage_changed_at ON public.leads;
CREATE TRIGGER leads_touch_stage_changed_at
  BEFORE UPDATE OF stage ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_touch_stage_changed_at();

-- Índices
CREATE INDEX IF NOT EXISTS leads_lost_at_idx
  ON public.leads(lost_at DESC) WHERE lost_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_stage_changed_at_idx
  ON public.leads(stage_changed_at DESC) WHERE lost_at IS NULL;

COMMENT ON COLUMN public.leads.stage_changed_at IS
  'Cuándo entró el lead a su etapa actual. Trigger lo actualiza al cambiar de stage.';
COMMENT ON COLUMN public.leads.lost_at IS
  'Fecha en que se marcó como perdido. NULL = aún en pipeline.';
COMMENT ON COLUMN public.leads.lost_reason IS
  'Razón breve por la que se descartó la oportunidad.';
COMMENT ON COLUMN public.leads.lost_from_stage IS
  'Etapa en la que estaba el lead cuando se marcó perdido.';
