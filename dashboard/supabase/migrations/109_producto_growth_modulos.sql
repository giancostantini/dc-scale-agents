-- ============================================================
-- 109 — Growth de productos: pauta, producciones, prospección
-- ============================================================
-- Resto de submódulos del menú Growth de un producto propio, scopeados
-- por `producto` (slug), SIN FK a clients (los productos no son clientes).
-- Reporting NO lleva tabla: agrega en vivo contenido (mig 108) + pauta.
-- ============================================================

-- Pauta publicitaria (carga manual de campañas del producto).
CREATE TABLE IF NOT EXISTS public.producto_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto text NOT NULL,
  nombre text NOT NULL,
  plataforma text NOT NULL DEFAULT 'meta'
    CHECK (plataforma IN ('meta','google','tiktok','linkedin','otra')),
  estado text NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa','pausada','finalizada')),
  inversion numeric(12,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'UYU',
  alcance integer NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  fecha_inicio date,
  fecha_fin date,
  notas text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prodcampaigns_producto
  ON public.producto_campaigns (producto, created_at DESC);

-- Producciones (videos / creativos / piezas con presupuesto y estado).
CREATE TABLE IF NOT EXISTS public.producto_producciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto text NOT NULL,
  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'video'
    CHECK (tipo IN ('video','foto','diseno','copy','campana','otra')),
  estado text NOT NULL DEFAULT 'idea'
    CHECK (estado IN ('idea','en_curso','revision','entregada')),
  presupuesto numeric(12,2) NOT NULL DEFAULT 0,
  ejecutado numeric(12,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'UYU',
  fecha_entrega date,
  notas text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prodproducciones_producto
  ON public.producto_producciones (producto, created_at DESC);

-- Prospección (pipeline comercial del producto).
CREATE TABLE IF NOT EXISTS public.producto_prospectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto text NOT NULL,
  nombre text NOT NULL,
  empresa text NOT NULL DEFAULT '',
  contacto text NOT NULL DEFAULT '',
  etapa text NOT NULL DEFAULT 'nuevo'
    CHECK (etapa IN ('nuevo','contactado','propuesta','ganado','perdido')),
  valor numeric(12,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'UYU',
  notas text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prodprospectos_producto
  ON public.producto_prospectos (producto, created_at DESC);

-- RLS: director + team leen y escriben (gestionan el growth del producto).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['producto_campaigns', 'producto_producciones', 'producto_prospectos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_rw', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN (''director'',''team''))) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN (''director'',''team'')));',
      t || '_rw', t
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.producto_campaigns IS 'Pauta publicitaria (carga manual) de un producto propio. Scopeado por `producto`.';
COMMENT ON TABLE public.producto_producciones IS 'Producciones creativas de un producto propio, con presupuesto y estado.';
COMMENT ON TABLE public.producto_prospectos IS 'Pipeline de prospección de un producto propio.';
