-- ============================================================
-- 108 — Growth de productos propios (Tildalo, Encargue, Rondín, Libreta)
-- ============================================================
-- Duplicado de los módulos growth de cliente, pero SCOPEADO POR PRODUCTO
-- (campo `producto` = slug). NO hay FK a clients: los productos no son
-- clientes. Primer módulo: calendario de contenido + settings (frecuencia
-- y mix). Los demás módulos (producciones, etc.) suman sus tablas después.
-- ============================================================

-- Contenido del producto (espejo de content_posts, sin FK a clients).
CREATE TABLE IF NOT EXISTS public.producto_content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto text NOT NULL,
  date date NOT NULL,
  time text,
  network text NOT NULL,
  networks text[] NOT NULL DEFAULT '{}',
  format text NOT NULL,
  brief text NOT NULL DEFAULT '',
  content_type text CHECK (content_type IS NULL OR content_type IN ('valor','oferta','engagement')),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','draft','scheduled','published')),
  image_url text,
  pdf_url text,
  asset_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prodcontent_producto_date
  ON public.producto_content_posts (producto, date DESC);

-- Settings por producto: frecuencia + mix de contenido.
CREATE TABLE IF NOT EXISTS public.producto_settings (
  producto text PRIMARY KEY,
  content_frequency jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_mix jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: director + team pueden leer y escribir (gestionan el growth).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['producto_content_posts', 'producto_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_rw', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN (''director'',''team''))) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN (''director'',''team'')));',
      t || '_rw', t
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.producto_content_posts IS 'Calendario de contenido de un producto propio (growth). Scopeado por `producto` (slug), sin FK a clients.';
COMMENT ON TABLE public.producto_settings IS 'Frecuencia y mix de contenido por producto propio.';
