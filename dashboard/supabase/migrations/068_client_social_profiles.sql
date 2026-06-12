-- ============================================================
-- 068 — Perfil "visual" del cliente por red social
-- ------------------------------------------------------------
-- Para que el preview del feed (/contenido → Vista feed) parezca
-- realmente el perfil del cliente, necesitamos los datos que un
-- visitante vería al entrar a la cuenta:
--   - bio: descripción/headline
--   - followers: cantidad de seguidores
--   - following: cantidad siguiendo
--
-- Por red. Por ejemplo IG y TT suelen tener números distintos.
-- Todo opcional — si el cliente no carga nada, mostramos el handle
-- y listo (sin números fake).
--
-- Shape:
--   { "ig": {"bio": "...", "followers": 12345, "following": 200},
--     "fb": {...}, "tt": {...}, "in": {...} }
--
-- NO usamos OAuth con Meta/TikTok para traer estos datos auto —
-- requeriría aprobación de Meta Business y tiene rate limits.
-- El director los carga manualmente al setup-ear el cliente, y
-- los actualiza cuando quiere.
-- ============================================================

ALTER TABLE clients
ADD COLUMN social_profiles JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN clients.social_profiles IS
  'Datos "visuales" del perfil del cliente por red — bio/followers/following. Se usan SOLO para que el preview del feed se vea como el perfil real. No persistimos otras métricas (likes/views) acá; eso vive en analytics si lo necesitamos.';
