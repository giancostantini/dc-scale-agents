-- ============================================================
-- Migración 041: cuentas bancarias + movimientos
-- ============================================================
-- Nuevo módulo Finanzas → Cuentas Bancarias. Modela:
--
--   - cuentas_bancarias: una fila por cada cuenta bancaria de la
--     empresa (banco, nombre de cuenta, últimos 4 dígitos, moneda,
--     saldo actual).
--   - cuenta_movimientos: cada movimiento (ingreso/salida) afecta el
--     saldo de la cuenta. Categorías típicas: ingreso, pago, gasto,
--     impuestos, transferencia, comision, otro.
--
-- Recalculo de saldo:
--   - El saldo current_balance se mantiene en la fila de la cuenta y
--     se actualiza con un trigger AFTER INSERT/UPDATE/DELETE sobre
--     cuenta_movimientos. El frontend lee directamente
--     cuentas_bancarias.current_balance — no recalcula.
--
-- RLS: director full access, team SELECT only (es información
-- financiera sensible).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cuentas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** Slug para el ícono del banco (ej "nacion", "santander", "bbva",
   *  "brou", "itau", "mercado_pago", "mp"). */
  bank_slug text NOT NULL DEFAULT 'otro',
  /** Nombre comercial del banco como se va a mostrar. */
  bank_name text NOT NULL,
  /** Alias/nombre interno de la cuenta. */
  account_name text NOT NULL DEFAULT '',
  /** Últimos 4 dígitos del número de cuenta — visual ".... 1234". */
  last4 text NOT NULL DEFAULT '0000',
  /** Moneda: ARS / UYU / USD / EUR / BRL. */
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('ARS','UYU','USD','EUR','BRL')),
  /** Saldo actual mantenido por trigger. */
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cuentas_bancarias_active_idx
  ON public.cuentas_bancarias(is_active, currency);

DROP TRIGGER IF EXISTS cuentas_bancarias_touch_updated
  ON public.cuentas_bancarias;
CREATE TRIGGER cuentas_bancarias_touch_updated
  BEFORE UPDATE ON public.cuentas_bancarias
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.cuentas_bancarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cuentas_bancarias_select ON public.cuentas_bancarias;
DROP POLICY IF EXISTS cuentas_bancarias_insert ON public.cuentas_bancarias;
DROP POLICY IF EXISTS cuentas_bancarias_update ON public.cuentas_bancarias;
DROP POLICY IF EXISTS cuentas_bancarias_delete ON public.cuentas_bancarias;

CREATE POLICY cuentas_bancarias_select ON public.cuentas_bancarias
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('director','team')
    )
  );
CREATE POLICY cuentas_bancarias_insert ON public.cuentas_bancarias
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );
CREATE POLICY cuentas_bancarias_update ON public.cuentas_bancarias
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );
CREATE POLICY cuentas_bancarias_delete ON public.cuentas_bancarias
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

-- ============================================================
-- Movimientos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cuenta_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_bancarias(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL DEFAULT '',
  /** Categoría libre: ingreso/pago/gasto/impuestos/transferencia/comision/otro */
  category text NOT NULL DEFAULT 'otro',
  /** Monto positivo de entrada (cuando es ingreso). */
  entry_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (entry_amount >= 0),
  /** Monto positivo de salida (cuando es pago/gasto). */
  exit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (exit_amount >= 0),
  /** Documento adjunto en finanzas_documents (opcional). */
  comprobante_id uuid REFERENCES public.finanzas_documents(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    -- una fila tiene entrada > 0 O salida > 0, no ambas, no ninguna
    (entry_amount > 0 AND exit_amount = 0) OR
    (entry_amount = 0 AND exit_amount > 0)
  )
);

CREATE INDEX IF NOT EXISTS cuenta_movimientos_cuenta_fecha_idx
  ON public.cuenta_movimientos(cuenta_id, fecha DESC);

CREATE INDEX IF NOT EXISTS cuenta_movimientos_fecha_idx
  ON public.cuenta_movimientos(fecha DESC);

DROP TRIGGER IF EXISTS cuenta_movimientos_touch_updated
  ON public.cuenta_movimientos;
CREATE TRIGGER cuenta_movimientos_touch_updated
  BEFORE UPDATE ON public.cuenta_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Trigger que recalcula el current_balance de la cuenta cada vez
-- que se inserta, modifica o borra un movimiento.
CREATE OR REPLACE FUNCTION public.cuenta_recalc_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target := OLD.cuenta_id;
  ELSE
    target := NEW.cuenta_id;
  END IF;
  UPDATE public.cuentas_bancarias
     SET current_balance = COALESCE((
         SELECT SUM(entry_amount) - SUM(exit_amount)
           FROM public.cuenta_movimientos
          WHERE cuenta_id = target
       ), 0)
   WHERE id = target;
  -- Si fue UPDATE y cambió cuenta_id, actualizar también la cuenta vieja
  IF TG_OP = 'UPDATE' AND OLD.cuenta_id IS DISTINCT FROM NEW.cuenta_id THEN
    UPDATE public.cuentas_bancarias
       SET current_balance = COALESCE((
           SELECT SUM(entry_amount) - SUM(exit_amount)
             FROM public.cuenta_movimientos
            WHERE cuenta_id = OLD.cuenta_id
         ), 0)
     WHERE id = OLD.cuenta_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS cuenta_movimientos_recalc
  ON public.cuenta_movimientos;
CREATE TRIGGER cuenta_movimientos_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.cuenta_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.cuenta_recalc_balance();

ALTER TABLE public.cuenta_movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cuenta_movimientos_select ON public.cuenta_movimientos;
DROP POLICY IF EXISTS cuenta_movimientos_insert ON public.cuenta_movimientos;
DROP POLICY IF EXISTS cuenta_movimientos_update ON public.cuenta_movimientos;
DROP POLICY IF EXISTS cuenta_movimientos_delete ON public.cuenta_movimientos;

CREATE POLICY cuenta_movimientos_select ON public.cuenta_movimientos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('director','team')
    )
  );
CREATE POLICY cuenta_movimientos_insert ON public.cuenta_movimientos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );
CREATE POLICY cuenta_movimientos_update ON public.cuenta_movimientos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );
CREATE POLICY cuenta_movimientos_delete ON public.cuenta_movimientos
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

COMMENT ON TABLE public.cuentas_bancarias IS
  'Cuentas bancarias de la empresa (1 fila por cuenta). Saldo se mantiene por trigger sobre cuenta_movimientos.';
COMMENT ON TABLE public.cuenta_movimientos IS
  'Movimientos (entrada/salida) por cuenta bancaria. Trigger recalcula cuentas_bancarias.current_balance.';
