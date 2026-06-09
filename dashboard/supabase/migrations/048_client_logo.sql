-- ============================================================
-- Migración 048: logo del cliente
-- ============================================================
-- Cada cliente puede tener una imagen de logo (URL pública).
-- Se renderiza en el home, en los cards y en el header del cliente.
-- Fallback: las iniciales (como hasta ahora).
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.clients.logo_url IS
  'URL pública del logo del cliente. NULL = mostrar iniciales como fallback.';
