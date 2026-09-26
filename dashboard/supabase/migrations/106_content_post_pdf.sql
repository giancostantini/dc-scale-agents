-- ============================================================
-- 106 — content_posts.pdf_url: adjuntar un PDF a la pieza
-- ============================================================
-- Además de la imagen de preview (image_url, mig 064) y el link externo
-- OneDrive/Drive (asset_url, mig 071), una pieza puede tener un PDF
-- adjunto (brief, guion, arte en PDF, etc.). Se sube al mismo bucket
-- público content-post-previews (que acepta cualquier tipo desde la
-- mig 105).
-- ============================================================

ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS pdf_url text;

COMMENT ON COLUMN public.content_posts.pdf_url IS
  'URL pública de un PDF adjunto a la pieza (bucket content-post-previews). NULL = sin PDF.';
