-- ============================================================
-- Migración 058: estado editable en dividend_distributions
-- ============================================================
-- Hasta ahora el "Estado" del Historial de Distribuciones se
-- derivaba en runtime: "pagada" si el mes ya cerró, "pendiente" si
-- todavía está en curso. Eso no permite distinguir:
--   · Mes cerrado pero el director NO transfirió todavía
--     (pagada=false, pendiente=true).
--   · Mes en curso al que el director ya marcó pagado por
--     adelantado (raro pero válido).
--
-- Agregamos `status` con default 'pending'. Cuando el director hace
-- click en el pill del historial, alterna entre 'paid' y 'pending'.
-- ============================================================

ALTER TABLE public.dividend_distributions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('paid', 'pending'));

COMMENT ON COLUMN public.dividend_distributions.status IS
  'Estado de la distribución: pending (default) o paid. Editable desde el pill del Historial.';

-- Backfill: meses pasados ya cerrados → "paid" como default histórico.
-- Calcula el month_key del mes actual y marca los anteriores como pagados.
UPDATE public.dividend_distributions
SET status = 'paid'
WHERE status = 'pending'
  AND month_key < TO_CHAR(CURRENT_DATE, 'YYYY-MM');
