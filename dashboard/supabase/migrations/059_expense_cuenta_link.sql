-- ============================================================
-- Migración 059: vincular egreso con cuenta bancaria
-- ============================================================
-- Cuando un egreso se paga con tarjeta de débito/crédito,
-- transferencia, cheque o MP, queremos asociarlo a una cuenta
-- bancaria específica.  Eso permite que el sistema cree
-- automáticamente un movimiento de salida en esa cuenta y el saldo
-- baje en tiempo real.
--
-- Para egresos en efectivo o cripto, la columna queda NULL (no
-- aplica un débito bancario).
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS cuenta_id uuid
    REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_cuenta_idx
  ON public.expenses(cuenta_id)
  WHERE cuenta_id IS NOT NULL;

COMMENT ON COLUMN public.expenses.cuenta_id IS
  'Cuenta bancaria desde la que se debita el egreso. NULL para egresos en efectivo / no bancarios. Cuando está seteada, el sistema crea automáticamente un movimiento de egreso en esa cuenta.';
