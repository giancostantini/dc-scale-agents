-- ============================================================
-- Migración 061: vincular distribución de dividendos con cuenta
-- ============================================================
-- Cuando un dividendo se marca como "pagado", el sistema crea un
-- movimiento de salida en la cuenta bancaria donde se debitó la
-- transferencia. Para identificar la cuenta usamos esta columna.
--
-- Si status === 'pending' la columna queda NULL (no aplica).
-- Si status === 'paid' se setea con la cuenta elegida por el
-- director al hacer el toggle.
-- ============================================================

ALTER TABLE public.dividend_distributions
  ADD COLUMN IF NOT EXISTS cuenta_id uuid
    REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dividend_distributions.cuenta_id IS
  'Cuenta bancaria desde la que se pagó el dividendo. Solo aplica cuando status=paid. Se vincula a un movimiento de salida vía marker en notes del movimiento.';

CREATE INDEX IF NOT EXISTS dividend_distributions_cuenta_idx
  ON public.dividend_distributions(cuenta_id)
  WHERE cuenta_id IS NOT NULL;
