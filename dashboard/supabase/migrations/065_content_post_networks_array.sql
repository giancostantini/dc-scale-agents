-- ============================================================
-- 065 — Multi-red por pieza de contenido
-- ------------------------------------------------------------
-- Hasta acá, cada pieza de content_posts tenía UNA sola red en
-- la columna `network`. Si queríamos publicar el mismo contenido
-- en IG + FB, había que crear dos filas distintas con códigos
-- C-XXXX diferentes — engorroso y desconecta el "mismo creative
-- en dos redes" en el dashboard.
--
-- Ahora agregamos `networks text[]` para soportar N redes por
-- pieza. La columna `network` la dejamos como "primary" / fallback
-- por compatibilidad: storage.ts la sigue leyendo y al insertar
-- escribe ambas (network = networks[0]). En el futuro se podría
-- droppear, pero por ahora no la tocamos para no romper código
-- que todavía la mira.
--
-- Filtrado: un post pertenece a una red X si X ∈ networks
--   (o, fallback de back-compat, si networks está vacío y network=X).
-- ============================================================

ALTER TABLE content_posts
ADD COLUMN networks TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: para todos los posts existentes, llenamos networks con
-- la red singular que ya tenían.
UPDATE content_posts
SET networks = ARRAY[network]
WHERE networks = '{}'::text[]
  AND network IS NOT NULL;

COMMENT ON COLUMN content_posts.networks IS
  'Redes donde se publica la pieza (multi-red). Array de strings: ig, tt, in, fb. La columna `network` queda como primary/fallback para back-compat.';

-- Index para filtros tipo `network = ANY(networks)`.
CREATE INDEX IF NOT EXISTS content_posts_networks_gin_idx
  ON content_posts USING GIN (networks);
