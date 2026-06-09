-- ============================================================
-- Migración 039: tax_id en clients (CUIT / RUT / NIT)
-- ============================================================
-- La vista "Clientes" en Finanzas necesita mostrar el identificador
-- fiscal de cada cliente (CUIT en Argentina, RUT en Uruguay, NIT,
-- etc). Como D&C opera en LATAM y España, usamos un nombre genérico
-- "tax_id" que sirve para cualquier identificador fiscal.
--
-- Nullable porque hay clientes existentes sin el dato cargado.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tax_id text;

COMMENT ON COLUMN public.clients.tax_id IS
  'Identificador fiscal (CUIT en AR, RUT en UY, NIT en CO, etc).';
