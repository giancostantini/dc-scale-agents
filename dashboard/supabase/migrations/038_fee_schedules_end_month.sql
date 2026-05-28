-- ============================================================
-- Migración 038: tramos de fee acotados (start_month + end_month)
-- ============================================================
-- El calendario de pago variable (client_fee_schedules de migración
-- 035) solo soportaba "desde tal mes en adelante". Ahora el director
-- también puede definir tramos cerrados:
--
--   - "Solo mayo 2026"            → start=2026-05, end=2026-05
--   - "De junio a diciembre 2026" → start=2026-06, end=2026-12
--   - "Desde mayo 2026 indefinido" → start=2026-05, end=NULL
--
-- Útil para promos limitadas, contratos por período fijo, y
-- upgrades a partir de cierto mes.
--
-- end_month NULL = vigente sin fecha de cierre (comportamiento viejo
-- 100% compatible).
-- ============================================================

ALTER TABLE public.client_fee_schedules
  ADD COLUMN IF NOT EXISTS end_month text
    CHECK (end_month IS NULL OR end_month ~ '^\d{4}-\d{2}$');

-- Validación: si end_month está, debe ser >= start_month
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_fee_schedules_end_after_start'
  ) THEN
    ALTER TABLE public.client_fee_schedules
      ADD CONSTRAINT client_fee_schedules_end_after_start
      CHECK (end_month IS NULL OR end_month >= start_month);
  END IF;
END$$;

COMMENT ON COLUMN public.client_fee_schedules.end_month IS
  'Hasta qué mes aplica este tramo (inclusive). NULL = vigente sin cierre.';
