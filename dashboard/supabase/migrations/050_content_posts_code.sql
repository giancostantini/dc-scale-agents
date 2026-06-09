-- ============================================================
-- Migración 050: código persistente en content_posts
-- ============================================================
-- Hasta ahora el código visible "C-XXXX" del listado de Contenido
-- se calculaba en el cliente como índice dentro del array ordenado
-- por created_at. Eso tiene dos problemas:
--   1. Al borrar una pieza, las posteriores se renumeran.
--   2. Al insertar una pieza con fecha pasada, podía pisarse con la
--      numeración existente (dependiendo de cómo se ordene).
--
-- Esta migración:
--   · Agrega la columna `code` INTEGER a content_posts.
--   · Hace backfill: para cada cliente, asigna 1..N por orden de
--     created_at.
--   · Crea un trigger BEFORE INSERT que, si NEW.code es NULL,
--     completa con (max(code) por client_id) + 1.
--   · Constraint UNIQUE (client_id, code) para detectar colisiones
--     (defensa contra inserciones concurrentes — improbable en
--     nuestro caso, pero barato).
--   · Índice (client_id, code) para que la búsqueda de max sea
--     instantánea.
-- ============================================================

ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS code integer;

-- Backfill de los posts existentes: code = posición por client_id
-- ordenado por created_at.
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY client_id
           ORDER BY created_at NULLS LAST, id
         ) AS rn
  FROM public.content_posts
)
UPDATE public.content_posts cp
SET code = n.rn
FROM numbered n
WHERE cp.id = n.id
  AND cp.code IS NULL;

-- Trigger: si en un INSERT viene code = NULL, lo asigna como
-- max(code) + 1 dentro del mismo client_id.
CREATE OR REPLACE FUNCTION public.assign_content_post_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.code IS NULL THEN
    SELECT COALESCE(MAX(code), 0) + 1
      INTO NEW.code
      FROM public.content_posts
      WHERE client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_content_post_code ON public.content_posts;
CREATE TRIGGER trg_assign_content_post_code
  BEFORE INSERT ON public.content_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_content_post_code();

-- Constraint + índice
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_posts_client_code
  ON public.content_posts (client_id, code);
