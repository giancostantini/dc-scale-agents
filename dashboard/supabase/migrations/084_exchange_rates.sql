-- 084: Tipo de cambio USD/UYU diario (FIN-0 · Tesorería multimoneda)
--
-- Problema que resuelve: 3 clientes pagan en USD, 1 en UYU, y hay egresos
-- en ambas monedas. Hoy el dashboard usa un TC hardcodeado (UYU: 1/39 en
-- PremiumCuentasBancarias) que se desactualiza solo. Esta tabla guarda la
-- cotización del día, cargada por el cron fx-rates (GitHub Actions →
-- /api/cron/fx-rates), y la leen la vista Tesorería + la alerta de descalce.
--
-- Escritura: SOLO service role (el cron). No hay policy de INSERT/UPDATE
-- para usuarios — la service key bypassea RLS.
-- Lectura: cualquier usuario autenticado (el TC no es dato sensible y la
-- vista Tesorería vive detrás del gate director del frontend igual).

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fecha de la cotización en hora Uruguay. UNIQUE → una fila por día,
  -- el cron hace upsert idempotente sobre esta columna.
  rate_date date NOT NULL UNIQUE,
  -- Compra/venta del dólar oficial (pesos por 1 USD). Pueden venir null
  -- si la fuente de fallback solo publica un mid rate.
  usd_uyu_buy numeric(10, 4),
  usd_uyu_sell numeric(10, 4),
  -- Mid rate — el que usan los cálculos de posición/descalce.
  usd_uyu_mid numeric(10, 4) NOT NULL CHECK (usd_uyu_mid > 0),
  source text NOT NULL DEFAULT 'uy.dolarapi.com',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_date
  ON public.exchange_rates (rate_date DESC);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exchange_rates_select_authenticated" ON public.exchange_rates;
CREATE POLICY "exchange_rates_select_authenticated"
  ON public.exchange_rates FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.exchange_rates IS
  'TC USD/UYU diario. Lo carga el cron fx-rates; lo lee Tesorería (FIN-0).';
