-- ============================================================
-- 063 — Clasificación de cada pieza de contenido
-- ------------------------------------------------------------
-- Agregamos a content_posts una columna `classification` que
-- categoriza la pieza en uno de tres grupos editoriales:
--
--   - valor:        contenido educativo / informativo / expertise.
--   - conversion:   contenido comercial / promo / CTA directo.
--   - aspiracional: contenido inspiracional / lifestyle / brand.
--
-- Es un campo opcional (NULL = sin clasificar todavía). Cuando
-- está seteado, lo usamos en el menú Contenido del cliente para:
--   1. Mostrar un chip color-coded en la tabla y en el preview IG.
--   2. Filtrar la vista por categoría.
--
-- El CHECK garantiza que solo se acepten esos 3 valores (o NULL).
-- ============================================================

ALTER TABLE content_posts
ADD COLUMN classification TEXT
  CHECK (
    classification IS NULL
    OR classification IN ('valor', 'conversion', 'aspiracional')
  );

COMMENT ON COLUMN content_posts.classification IS
  'Clasificación editorial: valor (educativo), conversion (comercial), aspiracional (brand/lifestyle). NULL = sin clasificar.';

-- Index opcional para filtros — barato, content_posts no es enorme.
CREATE INDEX IF NOT EXISTS content_posts_classification_idx
  ON content_posts (client_id, classification)
  WHERE classification IS NOT NULL;
