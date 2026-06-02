-- ============================================================
-- Migración 053: sitio web del cliente
-- ============================================================
-- Sumamos `clients.website_url` para que los agentes (asistente
-- creativo, generador de estrategia, brandbook processor) tengan
-- contexto adicional sobre el cliente.
--
-- Se carga en el wizard al crear un cliente GP (es opcional). Para
-- DEV no aplica.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS website_url text;

COMMENT ON COLUMN public.clients.website_url IS
  'URL del sitio web principal del cliente. Usada como contexto adicional para los agentes (asistente creativo, estrategia).';
