-- ============================================================
-- 064 — Imagen de preview por pieza de contenido
-- ------------------------------------------------------------
-- Agregamos a content_posts una columna `image_url` con la URL
-- pública del archivo en Supabase Storage. Se usa SOLO para el
-- preview visual del feed (vista perfil tipo IG) y el modal de
-- detalle. No es el creative final que se publica — eso vive en
-- Drive / OneDrive — pero permite ver cómo queda la cuadrícula
-- antes de aprobar el contenido.
--
-- Bucket: client-onboarding (el mismo que se usa para
-- kickoff/branding), con folder content-posts/<clientId>/.
-- Path en DB = path completo en el bucket; URL = públicaURL.
--
-- Optional. NULL = sin imagen, se renderiza tile color-coded.
-- ============================================================

ALTER TABLE content_posts
ADD COLUMN image_url TEXT;

COMMENT ON COLUMN content_posts.image_url IS
  'URL pública de la imagen de preview de la pieza en Supabase Storage. Solo para visualización del feed, no es el creative final.';
