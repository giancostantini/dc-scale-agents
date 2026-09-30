-- ============================================================
-- 107 — Tablas de datos de los productos propios (Tilde, Encargue, Vuelta)
-- ============================================================
-- Las apps de cada producto ESCRIBEN acá (con service role / key de
-- servidor) y el dashboard interno las LEE para armar los dashboards de
-- gestión de cada negocio.
--
-- Campo `empresa`: nombre de la cuenta/empresa que usa el producto
-- (estos productos son multi-tenant: varias empresas usan la misma app).
--
-- RLS: SELECT para director + team (ven la gestión). INSERT/UPDATE solo
-- service role (sin policy → solo el server key escribe). Mismo patrón
-- que paid_media_daily (mig 089).
-- ============================================================

-- ---------- Tilde: facturas de compra ----------
CREATE TABLE IF NOT EXISTS public.tilde_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa text NOT NULL,
  proveedor text,
  monto numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'UYU',
  fecha date NOT NULL,
  vencimiento date,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'controlada', 'pagada', 'observada')),
  externo_id text,            -- id de la factura en la app Tilde (idempotencia)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tilde_fecha ON public.tilde_invoices (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_tilde_empresa ON public.tilde_invoices (empresa);

-- ---------- Encargue: pedidos B2B ----------
CREATE TABLE IF NOT EXISTS public.encargue_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa text NOT NULL,
  cliente text,               -- cliente B2B que hizo el pedido
  monto numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'UYU',
  items integer NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'nuevo'
    CHECK (estado IN ('nuevo', 'confirmado', 'en_erp', 'entregado', 'cancelado')),
  fecha date NOT NULL,
  externo_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_encargue_fecha ON public.encargue_orders (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_encargue_empresa ON public.encargue_orders (empresa);

-- ---------- Vuelta: entregas / ruteo ----------
CREATE TABLE IF NOT EXISTS public.vuelta_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa text NOT NULL,
  ruta text,
  chofer text,
  camion text,
  zona text,
  fecha date NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_ruta', 'entregada', 'atrasada', 'fallida')),
  a_tiempo boolean,
  externo_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vuelta_fecha ON public.vuelta_deliveries (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_vuelta_empresa ON public.vuelta_deliveries (empresa);

-- ---------- RLS: lectura director + team ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tilde_invoices', 'encargue_orders', 'vuelta_deliveries']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN (''director'', ''team'')));',
      t || '_select', t
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.tilde_invoices IS 'Facturas de compra cargadas en Tilde (la app escribe con service role).';
COMMENT ON TABLE public.encargue_orders IS 'Pedidos B2B tomados por Encargue.';
COMMENT ON TABLE public.vuelta_deliveries IS 'Entregas / ruteo de Vuelta.';
