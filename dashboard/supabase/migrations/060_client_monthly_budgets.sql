-- ============================================================
-- Migración 060: presupuestos mensuales por cliente (producciones + ads)
-- ============================================================
-- El dashboard del cliente GP suma dos líneas de presupuesto que el
-- director carga cada mes:
--
--   · producciones — para gastos de creativos, UGC, fotos, etc.
--   · ads          — para inversión en paid media.
--
-- Cada línea muestra: presupuesto seteado, gastado a la fecha, saldo
-- disponible y una barra de progreso. El gastado se computa desde
-- expenses (no se persiste).
--
-- Tabla: client_monthly_budgets
--   (client_id, month, kind) es la PK — un budget por (cliente, mes,
--   tipo). Editar el monto pisa la fila existente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_monthly_budgets (
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month text NOT NULL,                  -- YYYY-MM
  kind text NOT NULL CHECK (kind IN ('producciones', 'ads')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, month, kind)
);

COMMENT ON TABLE public.client_monthly_budgets IS
  'Presupuestos mensuales por cliente para producciones y ads. Se muestra en el dashboard del cliente con saldo disponible.';

ALTER TABLE public.client_monthly_budgets ENABLE ROW LEVEL SECURITY;

-- RLS: director y team con asignación al cliente
DROP POLICY IF EXISTS client_monthly_budgets_select ON public.client_monthly_budgets;
CREATE POLICY client_monthly_budgets_select ON public.client_monthly_budgets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
        AND (p.role = 'director' OR p.role = 'team')
    )
  );

DROP POLICY IF EXISTS client_monthly_budgets_write ON public.client_monthly_budgets;
CREATE POLICY client_monthly_budgets_write ON public.client_monthly_budgets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );

-- Auto-touch updated_at
DROP TRIGGER IF EXISTS client_monthly_budgets_touch_updated ON public.client_monthly_budgets;
CREATE TRIGGER client_monthly_budgets_touch_updated
  BEFORE UPDATE ON public.client_monthly_budgets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
