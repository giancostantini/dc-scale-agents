-- ============================================================
-- 082 — Finanzas multi-moneda (USD + UYU), streams separados
-- ------------------------------------------------------------
-- Hasta acá Finanzas era mono-moneda en la práctica: todo se asumía
-- en USD. Los egresos, la facturación y los dividendos ni siquiera
-- tenían columna de moneda. Ahora se cargan ingresos y egresos en
-- pesos uruguayos, y hay que reflejarlos sin mezclarlos con dólares.
--
-- Modelo: streams separados. Un monto en pesos NUNCA se suma a uno
-- en dólares; cada agregado (neto, KPIs, dividendos) se computa por
-- moneda. Sin conversión ni cotización.
--
-- REGLA DURA: nada de lo ya cargado cambia. Esta migración solo
-- AGREGA columnas con DEFAULT 'USD'. Ningún monto se toca ni se
-- recalcula: los registros existentes quedan etiquetados como USD,
-- que es como el sistema ya los trataba.
--
-- Solo dos monedas nuevas en los selectores: USD y UYU. Las cuentas
-- bancarias siguen aceptando su set más amplio (ARS/UYU/USD/EUR/BRL).
-- ============================================================

-- ---- Egresos ----
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD'
    CHECK (currency IN ('USD', 'UYU'));

COMMENT ON COLUMN public.expenses.currency IS
  'Moneda del egreso. USD o UYU. Los agregados se calculan por moneda, nunca mezclados.';

-- ---- Fee de clientes ----
-- Determina la moneda de la facturación de ese cliente. Cambiarlo
-- afecta solo las facturas FUTURAS; las ya emitidas no se tocan.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS fee_currency text NOT NULL DEFAULT 'USD'
    CHECK (fee_currency IN ('USD', 'UYU'));

COMMENT ON COLUMN public.clients.fee_currency IS
  'Moneda del fee del cliente (moneda en la que se factura). USD o UYU.';

-- ---- Distribución de dividendos ----
-- Ahora puede haber DOS snapshots por mes: uno USD y uno UYU. La PK
-- pasa de (month_key) a (month_key, currency). Las filas existentes
-- quedan en USD por el default, así no chocan.
ALTER TABLE public.dividend_distributions
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD'
    CHECK (currency IN ('USD', 'UYU'));

COMMENT ON COLUMN public.dividend_distributions.currency IS
  'Moneda de este reparto. Un mes puede tener un snapshot USD y otro UYU, independientes.';

-- Reemplazar la PK simple por la compuesta. El nombre por defecto de
-- la PK inline de la migración 057 es dividend_distributions_pkey.
ALTER TABLE public.dividend_distributions
  DROP CONSTRAINT IF EXISTS dividend_distributions_pkey;

ALTER TABLE public.dividend_distributions
  ADD CONSTRAINT dividend_distributions_pkey
    PRIMARY KEY (month_key, currency);

-- manual_revenues ya tiene `currency` (default 'USD') desde la
-- migración 025 — no se toca.
