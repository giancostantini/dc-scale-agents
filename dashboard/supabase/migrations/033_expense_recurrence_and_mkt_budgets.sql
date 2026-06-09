-- ============================================================
-- Migración 033: tipo de egreso (fijo/único) + budget de marketing
-- por cliente
-- ============================================================
--
-- 1. expenses.recurrence: 'one_time' o 'monthly_fixed'.
--    Default 'one_time' para no romper egresos viejos.
--    Los 'monthly_fixed' representan costos que se repiten cada mes
--    (suscripciones SaaS, retainers, etc) — no son una sola línea,
--    son un compromiso mensual.
--
-- 2. expenses.recurrence_end_date: opcional. Si está, el costo fijo
--    mensual se contabiliza hasta esa fecha. NULL = vigente.
--
-- 3. expenses.mkt_budget_client_id: si el egreso es contra el
--    presupuesto de marketing de un cliente específico (GP), se
--    asocia acá. Reusa la FK a clients.
--
-- 4. client_mkt_budgets: tabla nueva con el presupuesto mensual de
--    marketing que cada cliente otorga. Estructura singleton por
--    cliente — se reemplaza al editar (no historial todavía).
-- ============================================================

-- 1+2+3. expenses extras
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'one_time'
    CHECK (recurrence IN ('one_time', 'monthly_fixed'));

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurrence_end_date date;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS mkt_budget_client_id text
    REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_mkt_budget_idx
  ON public.expenses(mkt_budget_client_id)
  WHERE mkt_budget_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS expenses_recurrence_idx
  ON public.expenses(recurrence)
  WHERE recurrence = 'monthly_fixed';

COMMENT ON COLUMN public.expenses.recurrence IS
  '"one_time" = pago único (default). "monthly_fixed" = se repite cada mes desde date hasta recurrence_end_date (o vigente si NULL).';

COMMENT ON COLUMN public.expenses.mkt_budget_client_id IS
  'Si el egreso se carga contra el presupuesto de marketing de un cliente, su id va acá. NULL para egresos corporativos.';

-- 4. client_mkt_budgets
CREATE TABLE IF NOT EXISTS public.client_mkt_budgets (
  client_id text PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  monthly_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS client_mkt_budgets_touch_updated ON public.client_mkt_budgets;
CREATE TRIGGER client_mkt_budgets_touch_updated
  BEFORE UPDATE ON public.client_mkt_budgets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS: solo director ve/edita
ALTER TABLE public.client_mkt_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_mkt_budgets_all ON public.client_mkt_budgets;
CREATE POLICY client_mkt_budgets_all ON public.client_mkt_budgets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director'));

COMMENT ON TABLE public.client_mkt_budgets IS
  'Presupuesto MENSUAL de marketing que otorga cada cliente (GP). Es un compromiso recurrente — la barra de progreso en el menú Mkt Clientes muestra cuánto se gastó vs cuánto está disponible.';
