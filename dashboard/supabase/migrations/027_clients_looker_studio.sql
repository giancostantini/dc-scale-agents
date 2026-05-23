-- ============================================================
-- Migración 027: clients.looker_studio_url
-- ============================================================
-- Objetivo:
--   El portal del cliente reemplaza los KPI charts internos (recharts
--   con data mock o desactualizada) por un link directo al dashboard
--   real de Looker Studio que arma el equipo por cliente.
--
--   Cada cliente tiene su propio dashboard (URL pública con permisos
--   compartidos al email del cliente). Esta columna almacena la URL
--   para que el componente <LookerStudioCard /> la renderice.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS looker_studio_url TEXT;

COMMENT ON COLUMN public.clients.looker_studio_url IS
  'URL pública del dashboard Looker Studio del cliente. NULL = aún no se configuró; el portal muestra estado "preparando".';

-- ====== Verificación ======
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'clients'
--   AND column_name = 'looker_studio_url';
