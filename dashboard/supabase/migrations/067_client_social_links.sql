-- ============================================================
-- 067 — Links de redes sociales del cliente
-- ------------------------------------------------------------
-- Guardamos los URLs públicos del perfil del cliente en cada red.
-- Con esto, el preview del feed en /contenido:
--   1. Linkea el avatar + handle al perfil real (abre en pestaña nueva).
--   2. Extrae el handle del URL para mostrarlo en el header.
--   3. Da una sensación más nativa de cada red (sabemos que el
--      cliente tiene cuenta en IG/TT/FB/LinkedIn cuando hay URL).
--
-- Shape esperado:
--   { "ig": "https://instagram.com/...", "fb": "...",
--     "tt": "...", "in": "..." }
--
-- Todos los campos opcionales — un cliente puede tener solo IG.
-- ============================================================

ALTER TABLE clients
ADD COLUMN social_links JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN clients.social_links IS
  'URLs públicas del perfil del cliente en cada red. Keys: ig (Instagram), fb (Facebook), tt (TikTok), in (LinkedIn). Valor: URL completo. Se usan para linkear el avatar/handle del preview feed al perfil real.';
