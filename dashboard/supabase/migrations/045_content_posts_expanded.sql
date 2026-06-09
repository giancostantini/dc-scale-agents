-- ============================================================
-- Migración 045: ampliar content_posts con campos editables
-- (idea separada del brief, cta, assigned_to, influencer) +
-- formats ugc/anuncio.
-- ============================================================
--
-- Cambios:
--   1. Nuevas columnas opcionales:
--        - idea           text  → la idea central de la pieza
--        - cta            text  → call-to-action (para anuncios)
--        - assigned_to    uuid  → FK profiles.id, quién la produce
--        - influencer     text  → nombre del influencer (UGC)
--   2. Extender CHECK de format para aceptar 'ugc' y 'anuncio'.
--   3. Hacer `time` nullable: no toda pieza necesita hora específica.
--
-- Idempotente: usa IF NOT EXISTS / DROP IF EXISTS.
-- ============================================================

ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS idea text,
  ADD COLUMN IF NOT EXISTS cta text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS influencer text;

CREATE INDEX IF NOT EXISTS content_posts_assigned_to_idx
  ON public.content_posts(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- Hacer time nullable (idempotente — si ya es nullable, no-op)
ALTER TABLE public.content_posts
  ALTER COLUMN time DROP NOT NULL;

-- Reescribir el CHECK de format para aceptar ugc + anuncio
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.content_posts'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%format%'
  LOOP
    EXECUTE format('ALTER TABLE public.content_posts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.content_posts
  ADD CONSTRAINT content_posts_format_check
  CHECK (format IN ('reel','post','carrusel','story','ugc','anuncio'));

COMMENT ON COLUMN public.content_posts.idea IS
  'Idea central de la pieza, separada del brief operativo.';
COMMENT ON COLUMN public.content_posts.cta IS
  'Call-to-action (típicamente para format=anuncio).';
COMMENT ON COLUMN public.content_posts.assigned_to IS
  'Miembro del equipo (profiles.id) responsable de producir la pieza.';
COMMENT ON COLUMN public.content_posts.influencer IS
  'Nombre del influencer asignado cuando format=ugc.';
