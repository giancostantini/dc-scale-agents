-- ============================================================
-- Migración 043: Pipeline — cotización desglosada por tipo de lead
-- + referido nombre.
-- ============================================================
--
-- Hasta ahora `value` era un único número (USD/mes). El director
-- pidió que la cotización se desglose según el tipo de servicio:
--
--   · Growth Partner: fee_mensual (recurrente) + bono (success fee)
--   · IA / Desarrollo: costo_produccion (one-time) + costo_mantenimiento
--     (recurrente mensual)
--
-- Además, si el lead viene por referido, registramos el nombre de
-- quien lo refirió (`referrer_name`).
--
-- El campo legacy `value` se mantiene como número rápido para los
-- KPIs (= fee_mensual del GP o costo_mantenimiento del IA — el
-- recurrente mensual). El frontend lo deriva al guardar.
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fee_mensual numeric(14,2),
  ADD COLUMN IF NOT EXISTS bono numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_produccion numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_mantenimiento numeric(14,2),
  ADD COLUMN IF NOT EXISTS referrer_name text;

COMMENT ON COLUMN public.leads.fee_mensual IS
  'Growth Partner: fee mensual recurrente en USD.';
COMMENT ON COLUMN public.leads.bono IS
  'Growth Partner: bono / success fee asociado al cumplimiento.';
COMMENT ON COLUMN public.leads.costo_produccion IS
  'IA / Desarrollo: costo one-time de producción / setup en USD.';
COMMENT ON COLUMN public.leads.costo_mantenimiento IS
  'IA / Desarrollo: costo mensual recurrente de mantenimiento.';
COMMENT ON COLUMN public.leads.referrer_name IS
  'Nombre del referidor si source=referido.';
