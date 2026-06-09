-- ============================================================
-- Migración 056: día de débito para egresos fijos mensuales
-- ============================================================
-- Para egresos con recurrence='monthly_fixed' (típicamente
-- suscripciones SaaS, retainers, tarjeta de crédito), agregamos el
-- día del mes en el que se debita el pago. Eso permite al UI
-- mostrar el "status efectivo" del mes en curso sin necesidad de
-- que el director marque a mano:
--
--   · Si hoy.día < payment_day  → pendiente (todavía no se cobró)
--   · Si hoy.día ≥ payment_day  → pagado    (ya se debitó)
--
-- En meses pasados se asume pagado (compromiso ya cumplido). En
-- meses futuros se asume pendiente. La columna es opcional — si
-- está NULL, se cae al status manual del master record (default
-- "pending" para monthly_fixed).
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_day smallint
    CHECK (payment_day IS NULL OR (payment_day BETWEEN 1 AND 31));

COMMENT ON COLUMN public.expenses.payment_day IS
  'Día del mes (1-31) en que se debita un egreso fijo mensual. Si está seteado, el status del mes en curso se deriva automáticamente: pending si hoy < payment_day, paid si hoy >= payment_day.';
