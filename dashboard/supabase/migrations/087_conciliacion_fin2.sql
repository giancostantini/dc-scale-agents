-- 087: FIN-2 · Conciliación de extractos bancarios (doc 16, F-D)
--
-- El dolor: cargar movimientos a mano y cuadrarlos contra lo registrado.
-- El flujo: el director sube el CSV del banco en Finanzas → Conciliación:
--   1. Las líneas del extracto se guardan acá (bank_statements + lines).
--   2. Matching DETERMINÍSTICO contra cuenta_movimientos de esa cuenta:
--      exacto (mismo importe, fecha ±3 días) → conciliado automático;
--      cercano (importe exacto fecha corrida, o importe ~2% p.ej. comisión)
--      → sugerido con score, cola "a confirmar" (gate YELLOW);
--      sin candidato → bandeja: crear el movimiento desde la línea o ignorar.
--   3. Crear movimiento desde línea usa el flujo normal (trigger de saldo).
--
-- Sin IA en esta fase (regla anti-teatro del doc 16: job determinístico
-- donde alcanza). El scoring es heurístico y explicable (reasons[]).
--
-- Solo el director ve y opera (info financiera).

CREATE TABLE IF NOT EXISTS public.bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_bancarias(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  line_count integer NOT NULL DEFAULT 0,
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id bigserial PRIMARY KEY,
  statement_id uuid NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  -- Denormalizado para consultar la bandeja por cuenta sin join.
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_bancarias(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  description text NOT NULL DEFAULT '',
  -- Importe con signo: > 0 entrada (crédito), < 0 salida (débito).
  amount numeric(14, 2) NOT NULL,
  -- Saldo de la cuenta después de la línea, si el banco lo exporta.
  saldo numeric(14, 2),
  status text NOT NULL DEFAULT 'unmatched' CHECK (
    status IN ('matched_auto', 'matched_confirmed', 'suggested', 'unmatched', 'ignored')
  ),
  matched_movimiento_id uuid REFERENCES public.cuenta_movimientos(id) ON DELETE SET NULL,
  -- Candidato propuesto por el matcher: {movimiento_id, score, reasons: []}.
  suggestion jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsl_statement ON public.bank_statement_lines (statement_id);
CREATE INDEX IF NOT EXISTS idx_bsl_cuenta_status ON public.bank_statement_lines (cuenta_id, status);
CREATE INDEX IF NOT EXISTS idx_bsl_matched_mov ON public.bank_statement_lines (matched_movimiento_id);

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;

-- Director: todo. (Mismo criterio que cuentas_bancarias para escritura;
-- lectura también restringida a director porque es detalle bancario.)
DROP POLICY IF EXISTS bank_statements_all ON public.bank_statements;
CREATE POLICY bank_statements_all ON public.bank_statements
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

DROP POLICY IF EXISTS bank_statement_lines_all ON public.bank_statement_lines;
CREATE POLICY bank_statement_lines_all ON public.bank_statement_lines
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

COMMENT ON TABLE public.bank_statements IS
  'Extractos bancarios importados (FIN-2). Un archivo CSV = una fila.';
COMMENT ON TABLE public.bank_statement_lines IS
  'Líneas del extracto con su estado de conciliación contra cuenta_movimientos.';
