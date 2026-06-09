-- ============================================================
-- Migración 057: snapshots de distribución mensual de dividendos
-- ============================================================
-- Cambio conceptual: antes "Historial de Distribuciones" se computaba
-- on-the-fly cada vez que el director abría la página. Eso tenía
-- dos problemas:
--
--   1. No quedaba registro de QUÉ se distribuyó realmente cada mes.
--      Cualquier cambio retroactivo en payments/expenses recalculaba
--      el historial entero — peligroso para auditoría.
--   2. No había forma natural de "cerrar el mes" — el sistema
--      consideraba el mes en curso como una distribución más.
--
-- Esta migración persiste un SNAPSHOT por mes cerrado:
--   · month_key (PK): YYYY-MM del mes distribuido.
--   · net_profit: utilidad neta calculada al cierre del mes.
--   · *_pct: porcentajes de la config en el momento del cálculo.
--   · *_amount: montos resultantes por destino.
--   · auto_generated: true si lo creó el sistema al cargar la página
--     (lazy auto-distribution), false si fue manual.
--
-- Comportamiento esperado en la UI:
--   · Al cargar PremiumDividendos, para cada mes cerrado en el
--     período que NO tiene snapshot, se crea uno con la data actual.
--   · El botón "eliminar" del historial borra el snapshot — la
--     próxima carga lo regenera con los datos vigentes (útil si
--     después de la distribución se agregaron gastos faltantes).
--   · El mes en curso nunca tiene snapshot — sigue siendo cálculo
--     en vivo hasta que cierre.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dividend_distributions (
  month_key text PRIMARY KEY,                  -- YYYY-MM
  net_profit numeric(14,2) NOT NULL,
  partner_a_pct numeric(5,2) NOT NULL,
  partner_b_pct numeric(5,2) NOT NULL,
  inversiones_pct numeric(5,2) NOT NULL,
  back_pct numeric(5,2) NOT NULL,
  partner_a_amount numeric(14,2) NOT NULL,
  partner_b_amount numeric(14,2) NOT NULL,
  inversiones_amount numeric(14,2) NOT NULL,
  back_amount numeric(14,2) NOT NULL,
  auto_generated boolean NOT NULL DEFAULT true,
  notes text,
  generated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dividend_distributions IS
  'Snapshot mensual de distribución de dividendos. Una fila por mes cerrado.';

-- RLS: solo director
ALTER TABLE public.dividend_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dividend_distributions_all ON public.dividend_distributions;
CREATE POLICY dividend_distributions_all ON public.dividend_distributions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director'));

CREATE INDEX IF NOT EXISTS dividend_distributions_generated_at_idx
  ON public.dividend_distributions(generated_at DESC);
