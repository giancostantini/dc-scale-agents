-- ============================================================
-- 073 — Token de Marketing API por cliente
-- ------------------------------------------------------------
-- Antes el sistema usaba un único META_ACCESS_TOKEN como env var
-- en Vercel. Eso funcionaba cuando todos los Ad Accounts vivían
-- dentro de UN solo Business Manager (típicamente el de Dearmas
-- Costantini o el de la agencia).
--
-- Cuando cada cliente tiene SU PROPIO Business Manager (caso
-- WizTrip → su BM; Glassy Waves → su BM), una sola env var no
-- alcanza. Necesitamos un token por cliente.
--
-- La columna queda en clients (no en external_links JSONB) por 2
-- razones:
--   1. external_links se lee desde el frontend en /cliente/[id]
--      vía getClient — el token es secreto y no queremos
--      filtrarlo accidentalmente.
--   2. El handler del SELECT del cliente NO incluye esta columna
--      (lo modificamos en una pasada distinta para no romper).
--      Solo el endpoint server-side de push-campaign + el endpoint
--      de set/clear leen esta columna con service role key.
--
-- NULL = el cliente no tiene token cargado → el endpoint de push
-- cae a META_ACCESS_TOKEN env var como fallback (compat con setups
-- viejos).
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT;

COMMENT ON COLUMN public.clients.meta_access_token IS
  'Token de Meta Marketing API del System User del Business Manager del cliente. NULL = fallback a META_ACCESS_TOKEN env var. Solo se lee server-side desde /api/meta/push-campaign con service role key.';
