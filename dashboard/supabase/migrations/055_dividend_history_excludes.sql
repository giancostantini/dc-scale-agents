-- ============================================================
-- Migración 055: meses excluidos del historial de dividendos
-- ============================================================
-- El "Historial de Distribuciones" se computa cada vez desde
-- payments + expenses + manual_revenues (no hay tabla de distribución
-- per se). El director quiere poder "eliminar" una distribución
-- puntual del listado — típicamente cuando un mes tuvo ingresos
-- accidentales que no van a dividendos, o cuando quiere ocultar
-- un mes con valores raros.
--
-- En vez de borrar los datos transaccionales (riesgo de perder info),
-- guardamos los meses excluidos en esta tabla. La UI los filtra al
-- mostrar el historial; los KPIs se recalculan sin esos meses.
--
-- Reintegrar un mes es agregarlo o sacarlo de esta tabla.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dividend_history_excludes (
  month_key text PRIMARY KEY,                  -- YYYY-MM
  reason text,                                 -- nota opcional del director
  excluded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  excluded_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dividend_history_excludes IS
  'Meses ocultados del historial de Distribución de dividendos. Director-only.';

-- RLS: solo director
ALTER TABLE public.dividend_history_excludes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dividend_history_excludes_all ON public.dividend_history_excludes;
CREATE POLICY dividend_history_excludes_all ON public.dividend_history_excludes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director'));
