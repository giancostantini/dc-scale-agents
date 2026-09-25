-- ============================================================
-- 105 — bucket content-post-previews acepta cualquier tipo de archivo
-- ============================================================
-- El bucket se reusa para los ADJUNTOS DE TAREAS (PDF, foto, lo que sea),
-- además de los creativos de contenido. La migración 080 lo había
-- restringido a image/* y video/*, así que los PDF de tareas se
-- rechazaban server-side ("mime type not supported").
--
-- Acá:
--   · allowed_mime_types = NULL → acepta CUALQUIER tipo (PDF, docs, etc.).
--   · file_size_limit = 1 GiB (por si la 080 no se corrió en esta base).
--
-- NOTA: el "Global File Upload Size Limit" del proyecto (Dashboard →
-- Settings → Storage) debe ser >= al archivo más grande que se suba.
-- En free plan el techo del proyecto es 50MB; para archivos más grandes
-- hay que estar en Pro. Los PDF de tareas normalmente entran holgados.
-- ============================================================

UPDATE storage.buckets
SET
  file_size_limit = 1073741824,  -- 1 GiB
  allowed_mime_types = NULL       -- cualquier tipo
WHERE id = 'content-post-previews';
