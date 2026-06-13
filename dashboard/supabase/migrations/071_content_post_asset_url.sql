-- ============================================================
-- 071 — Link al archivo (OneDrive / Drive) por pieza de contenido
-- ------------------------------------------------------------
-- Agregamos `asset_url` a content_posts. Es un campo de texto
-- libre donde el GP pega el link a OneDrive (o Drive) en el que
-- vive el creative real de esa idea.
--
-- Es distinto de image_url:
--   · image_url  → URL pública de la imagen de PREVIEW en Supabase
--                  Storage (la que se ve en la grilla del feed).
--   · asset_url  → Link externo al ARCHIVO final (mp4, psd, raw,
--                  carpeta de OneDrive, etc). Solo lo usa el GP
--                  como atajo — no lo procesamos ni lo embebemos.
--
-- NULL = todavía no se subió a OneDrive. Cuando hay valor, la
-- tabla muestra un mini-icono 📎 en la fila y el editor expandido
-- muestra el input + un link "Abrir en pestaña nueva ↗".
-- ============================================================

ALTER TABLE content_posts
ADD COLUMN asset_url TEXT;

COMMENT ON COLUMN content_posts.asset_url IS
  'Link externo (OneDrive / Drive) al archivo final del creative. Distinto de image_url (preview en Supabase Storage). NULL = todavía no se subió.';
