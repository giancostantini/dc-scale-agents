-- ============================================================
-- Migración 034: día del mes de cobro del funcional
-- ============================================================
-- Cada miembro del equipo tiene una fecha del mes en la que se le
-- liquida el pago (ej: día 5, día 10, día 28). El sidebar de
-- Funcionales del director muestra próximos pagos y un calendario
-- de cobros.
--
-- Valores válidos: 1-31. NULL = sin día configurado (default).
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_day smallint
    CHECK (payment_day IS NULL OR (payment_day BETWEEN 1 AND 31));

COMMENT ON COLUMN public.profiles.payment_day IS
  'Día del mes en que se le paga al funcional (1-31). NULL = sin día configurado.';
