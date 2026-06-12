-- ============================================================
-- 066 — Clasificaciones editoriales custom por cliente
-- ------------------------------------------------------------
-- Hasta acá la clasificación de cada pieza era un enum fijo
-- (valor | conversion | aspiracional) con un CHECK en
-- content_posts.classification. Ahora cada cliente puede definir
-- SU PROPIO catálogo de clasificaciones — con su propio nombre y
-- color — y las piezas referencian un id de ese catálogo.
--
-- Cambios:
--   1. clients.content_classifications jsonb — array de
--      { id, label, color } con las clasificaciones del cliente.
--   2. Drop del CHECK en content_posts.classification — ahora
--      acepta cualquier string que matchee un id del catálogo del
--      cliente. La validación se hace en la UI (el dropdown solo
--      muestra los del cliente). No agregamos FK porque queremos
--      poder renombrar/borrar clasificaciones sin romper posts
--      históricos: si el id ya no existe en el catálogo, en la UI
--      cae al fallback "sin clasificar".
--   3. Backfill: a cada cliente existente le seedeamos los 3
--      defaults (valor/conversion/aspiracional) con los colores
--      que tenían en código.
-- ============================================================

ALTER TABLE clients
ADD COLUMN content_classifications JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN clients.content_classifications IS
  'Catálogo de clasificaciones editoriales del cliente. Array de { id, label, color }. NULL/[] = usar defaults (valor/conversion/aspiracional).';

-- Drop del CHECK en content_posts.classification — el catálogo
-- ahora vive en clients.content_classifications, no en un enum fijo.
ALTER TABLE content_posts
DROP CONSTRAINT IF EXISTS content_posts_classification_check;

-- Backfill: a todos los clientes existentes les damos los 3 defaults
-- históricos, para que los posts ya clasificados sigan resolviendo
-- bien sus labels/colores.
UPDATE clients
SET content_classifications = '[
  {"id": "valor",        "label": "Valor",        "color": "#2f7d4f"},
  {"id": "conversion",   "label": "Conversión",   "color": "#b04b3a"},
  {"id": "aspiracional", "label": "Aspiracional", "color": "#9b8259"}
]'::jsonb
WHERE content_classifications = '[]'::jsonb
   OR content_classifications IS NULL;
