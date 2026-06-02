-- ============================================================
-- Migración 052: distribución de dividendos por cliente
-- ============================================================
-- Hasta ahora la distribución de dividendos era una sola config
-- global (tabla `dividend_config` singleton: % a Partner A, % a
-- Partner B, % a Inversiones, % a Back). Algunos clientes en
-- realidad tienen acuerdos comerciales diferentes (ej participaciones
-- distintas entre socios para un cliente puntual).
--
-- Esta migración agrega `clients.dividend_distribution` (JSONB).
-- Si está NULL, el cliente usa la config global. Si trae valor, se
-- usan los porcentajes específicos.
--
-- Schema esperado del JSON:
--   {
--     "use_default": false,
--     "partner_a_pct": 35,
--     "partner_b_pct": 35,
--     "inversiones_pct": 20,
--     "back_pct": 10
--   }
--
-- "use_default": true → equivalente a NULL (fallback al global).
-- Si los 4 % no suman 100 el UI alerta pero no bloquea la migración.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS dividend_distribution jsonb;

COMMENT ON COLUMN public.clients.dividend_distribution IS
  'Distribución de dividendos específica para este cliente. NULL = usar config global de dividend_config. Estructura: { use_default, partner_a_pct, partner_b_pct, inversiones_pct, back_pct }.';
