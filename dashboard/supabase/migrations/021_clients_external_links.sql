-- ============================================================
-- Migración 021: Links externos por cliente
-- ============================================================
-- Reestructura: el sistema deja de hacer análisis interno de paid
-- media y métricas. Esos análisis se hacen afuera:
--   - Paid media → Espor.ai (un link por cliente)
--   - Métricas generales → Looker Studio (un link por cliente)
--   - Documentación viva → carpeta en Microsoft Teams
--
-- El dashboard solo guarda los URLs y los muestra como accesos
-- directos en las páginas correspondientes (Analítica para los
-- dos primeros, Biblioteca para el de Teams).
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS external_links jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Estructura esperada del JSONB:
-- {
--   "espor_ai_url":      "https://espor.ai/clients/...",
--   "looker_studio_url": "https://lookerstudio.google.com/...",
--   "teams_folder_url":  "https://teams.microsoft.com/..."
-- }
-- Todos los campos son opcionales — pueden quedar vacíos hasta que
-- el director los configure desde la UI.

COMMENT ON COLUMN public.clients.external_links IS
  'URLs externas (Espor.ai, Looker Studio, Teams folder) configurables por el director.';
