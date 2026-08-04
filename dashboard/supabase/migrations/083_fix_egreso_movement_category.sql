-- ============================================================
-- 083 — Corregir categoría "egreso" en movimientos bancarios
-- ------------------------------------------------------------
-- Los movimientos que el sistema creaba automáticamente al pagar un
-- egreso o marcar un dividendo como pagado usaban category = 'egreso',
-- que NO es una categoría válida (MovimientoCategoria solo tiene
-- ingreso/pago/gasto/impuestos/transferencia/comision/otro).
--
-- Efecto: el movimiento se creaba y afectaba el saldo, pero en la
-- tabla de la cuenta salía con la etiqueta en blanco y se escondía al
-- filtrar por categoría. El código ya se corrigió (egreso→gasto para
-- gastos, egreso→pago para dividendos); esta migración arregla los
-- movimientos que ya estaban guardados.
--
-- Se distinguen por el marker en notes:
--   · [auto-dividend:...] → pago (distribución a socios)
--   · resto de los 'egreso' (gastos, incluido [auto-expense:...]) → gasto
-- ============================================================

UPDATE public.cuenta_movimientos
  SET category = 'pago'
  WHERE category = 'egreso'
    AND notes LIKE '%auto-dividend%';

UPDATE public.cuenta_movimientos
  SET category = 'gasto'
  WHERE category = 'egreso';
