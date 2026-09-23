-- ============================================================
-- Migración 102: Calendario de contenido — piezas planificadas +
-- seguimiento de lo que se sube.
-- ============================================================
--
-- El calendario del cliente pasa a ser el centro del contenido de
-- los clientes growth. El "asistente creativo" (una función
-- determinística, sin IA) carga en qué día hay contenido, en qué red,
-- de qué formato y con qué intención, según la frecuencia y el mix
-- del cliente. Cada una de esas piezas es una FILA real: sin fila no
-- hay seguimiento (no se puede contar qué se subió ni qué está
-- atrasado).
--
-- Estados de una pieza en el calendario:
--   planned   → Pendiente: el asistente la cargó, nadie la preparó.
--   scheduled → Preparado: la CM cargó descripción (+ foto).
--   published → Subido: se publicó en la red (dispara pieza.publicada).
--   draft     → piezas IA viejas del módulo Contenido; el calendario
--               las muestra como Pendiente.
--
-- Cambios:
--   1. CHECK de status: suma 'planned'.
--   2. content_type: intención de la pieza (valor/oferta/engagement).
--      Columna nueva y NO `classification`: esa guarda ids del
--      catálogo editorial por cliente (mig 066) y mezclarlas mostraría
--      "sin clasificar" en la vista vieja de Contenido.
--   3. published_at: cuándo se marcó como subida (permite ver
--      "subida tarde").
--
-- Idempotente. Sin backfill.
-- ============================================================

-- 1. status: reescribir el CHECK para aceptar 'planned'.
--    Mismo patrón que la mig 045 con format: dropear toda CHECK cuya
--    definición mencione status (en content_posts es solo esa — las
--    otras son network, format, source y content_type, ninguna dice
--    "status") y recrearla con nombre fijo.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.content_posts'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.content_posts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.content_posts
  ADD CONSTRAINT content_posts_status_check
  CHECK (status IN ('planned', 'draft', 'scheduled', 'published'));

-- 2 y 3. Columnas nuevas.
ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.content_posts
  DROP CONSTRAINT IF EXISTS content_posts_content_type_check;
ALTER TABLE public.content_posts
  ADD CONSTRAINT content_posts_content_type_check
  CHECK (content_type IS NULL OR content_type IN ('valor', 'oferta', 'engagement'));

COMMENT ON COLUMN public.content_posts.status IS
  'planned = pendiente (cargada por el asistente del calendario) · draft = pieza IA vieja sin aprobar · scheduled = preparada (descripción + foto) · published = subida a la red. Ver migración 102.';
COMMENT ON COLUMN public.content_posts.content_type IS
  'Intención de la pieza: valor / oferta / engagement. La asigna el asistente del calendario según clients.content_mix. NULL en piezas viejas.';
COMMENT ON COLUMN public.content_posts.published_at IS
  'Momento en que alguien la marcó como subida en el calendario. NULL si no está subida o si es anterior a la migración 102.';
