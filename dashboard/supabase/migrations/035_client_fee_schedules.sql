-- ============================================================
-- Migración 035: calendario de pago variable por cliente
-- ============================================================
-- El fee de un cliente puede no ser fijo en el tiempo. Ejemplo:
--   - Primeros 2 meses: USD 250
--   - Meses 3-N: USD 960
-- También sirve para ajustes contractuales a mitad del período.
--
-- Modelo: cada cliente tiene 0+ "fee schedule entries". Cada entry
-- aplica desde un mes determinado. El fee VIGENTE para un mes M es
-- la entry con start_month más cercano <= M.
--
-- Estructura:
--   client_id, start_month (YYYY-MM), amount, currency, notes
--
-- Si NO hay entries, se usa el client.fee del contrato (back-compat).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_fee_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  /** Mes desde el cual aplica este fee. Formato YYYY-MM. */
  start_month text NOT NULL CHECK (start_month ~ '^\d{4}-\d{2}$'),
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  /** Un cliente no puede tener 2 entries con el mismo start_month. */
  UNIQUE (client_id, start_month)
);

CREATE INDEX IF NOT EXISTS client_fee_schedules_client_idx
  ON public.client_fee_schedules(client_id, start_month);

DROP TRIGGER IF EXISTS client_fee_schedules_touch_updated ON public.client_fee_schedules;
CREATE TRIGGER client_fee_schedules_touch_updated
  BEFORE UPDATE ON public.client_fee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS: solo director
ALTER TABLE public.client_fee_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_fee_schedules_all ON public.client_fee_schedules;
CREATE POLICY client_fee_schedules_all ON public.client_fee_schedules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director'));

COMMENT ON TABLE public.client_fee_schedules IS
  'Calendario de pago variable por cliente. Si un cliente tiene 1+ entries, el fee efectivo de un mes M es el de la entry con start_month <= M más reciente. Si no hay entries, fallback a client.fee.';
