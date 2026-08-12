-- 088: FIN-3 · Cierre mensual + proyección (doc 16, F-E)
--
-- El cierre de un mes = números 100% deterministas (queries sobre payments/
-- expenses/manual_revenues/exchange_rates) + narrativa ejecutiva redactada
-- por IA a partir de ESOS números (nunca inventa — el prompt le pasa el JSON).
--
-- Ciclo de vida (gate YELLOW, doc 12):
--   draft  → lo genera el cron (día 2 del mes) o el director a demanda.
--   final  → lo marcan los socios cuando lo revisaron. La IA JAMÁS
--            declara el cierre sola; un cierre final no se regenera.
--
-- La proyección 60-90 días NO se persiste: se calcula en vivo en la vista
-- (lib/tesoreria.proyeccionMeses) — persistirla sería congelar un pronóstico.

CREATE TABLE IF NOT EXISTS public.monthly_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE,           -- YYYY-MM del mes CERRADO
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  -- Números deterministas del cierre (shape: lib/cierre-types.ts CierreData).
  data jsonb NOT NULL,
  -- Narrativa ejecutiva (markdown) generada por IA sobre `data`.
  narrative_md text,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  finalized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.monthly_closes ENABLE ROW LEVEL SECURITY;

-- Solo directores (info financiera completa). El cron escribe con service role.
DROP POLICY IF EXISTS monthly_closes_all ON public.monthly_closes;
CREATE POLICY monthly_closes_all ON public.monthly_closes
  FOR ALL TO authenticated
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

COMMENT ON TABLE public.monthly_closes IS
  'Cierres mensuales (FIN-3): números deterministas + narrativa IA. draft hasta que los socios lo marcan final.';
