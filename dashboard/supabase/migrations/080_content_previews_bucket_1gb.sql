-- ============================================================
-- 080 — Subir file_size_limit del bucket content-post-previews a 1GB
-- ============================================================
-- El bucket "content-post-previews" (mig 069) tenía el file_size_limit
-- del default de Supabase (por proyecto, típicamente 50MB en free,
-- 5GB en pro). El director necesita subir creativos de video para
-- Meta Ads que pueden pesar hasta ~1GB. Subimos el límite del bucket
-- a 1073741824 bytes (1 GiB).
--
-- Además explicitamos allowed_mime_types incluyendo image/* y video/*
-- para que quede claro qué acepta este bucket (creativos de anuncios).
--
-- IMPORTANTE: además de esta migración, el "Global File Upload Size
-- Limit" del proyecto Supabase (Dashboard → Settings → Storage) debe
-- estar >= 1073741824 (1 GiB). Si el proyecto está en free plan el
-- techo es 50MB y esta migración no lo destraba — hay que estar en
-- Pro o superior.
-- ============================================================

UPDATE storage.buckets
SET
  file_size_limit = 1073741824,  -- 1 GiB en bytes
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
    'video/x-matroska'
  ]
WHERE id = 'content-post-previews';
