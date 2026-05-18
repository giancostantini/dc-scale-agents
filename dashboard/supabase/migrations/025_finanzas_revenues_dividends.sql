-- ============================================================
-- Migración 025: Finanzas — ingresos manuales + dividendos
-- ============================================================
-- Dos features:
--
-- 1) manual_revenues — ingresos que NO vienen de fees mensuales
--    de clientes. Pueden ser:
--    - FIJOS: se repiten cada mes desde start_date (con end_date
--      opcional). Ej: alquiler de cowork sub-arrendado, suscripción
--      recurrente de un servicio nuestro.
--    - ONE-TIME: una sola entrada en una fecha específica. Ej:
--      venta puntual, premio, devolución de impuestos.
--
-- 2) dividend_config — porcentajes de distribución del net profit.
--    Default: 30% socio A, 30% socio B, 15% inversiones, 25% back
--    de empresa. Editable desde la UI por el director.
-- ============================================================

-- ====== INGRESOS MANUALES ======
CREATE TABLE IF NOT EXISTS public.manual_revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Naturaleza del ingreso
  kind text NOT NULL CHECK (kind IN ('fijo', 'one_time')),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  -- Para FIJOS: ventana de vigencia. end_date NULL = vigente sin fin.
  start_date date,
  end_date date,
  -- Para ONE-TIME: la fecha del evento (start_date queda NULL para
  -- one-time pero conviene tener date explícita para reportes).
  date date,
  -- Categoría libre para tagging (ej: "alquiler-cowork", "premio", etc).
  category text,
  notes text,
  -- Auditoría
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Validación: si kind=fijo debe tener start_date.
  -- Si kind=one_time debe tener date.
  CONSTRAINT manual_revenues_fields_for_kind CHECK (
    (kind = 'fijo' AND start_date IS NOT NULL)
    OR (kind = 'one_time' AND date IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS manual_revenues_kind_idx
  ON public.manual_revenues(kind, start_date DESC, date DESC);

-- Trigger updated_at
DROP TRIGGER IF EXISTS manual_revenues_touch_updated ON public.manual_revenues;
CREATE TRIGGER manual_revenues_touch_updated
  BEFORE UPDATE ON public.manual_revenues
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ====== CONFIG DE DIVIDENDOS ======
-- Singleton: una sola fila (id=1) con los % de distribución.
-- Default: 30/30/15/25.
CREATE TABLE IF NOT EXISTS public.dividend_config (
  id smallint PRIMARY KEY DEFAULT 1,
  partner_a_pct numeric(5,2) NOT NULL DEFAULT 30.00,
  partner_b_pct numeric(5,2) NOT NULL DEFAULT 30.00,
  inversiones_pct numeric(5,2) NOT NULL DEFAULT 15.00,
  back_pct numeric(5,2) NOT NULL DEFAULT 25.00,
  -- Nombres de los socios (display only)
  partner_a_name text NOT NULL DEFAULT 'Federico Dearmas',
  partner_b_name text NOT NULL DEFAULT 'Gianluca Costantini',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Solo permitir id=1 (singleton)
  CONSTRAINT dividend_config_singleton CHECK (id = 1),
  -- Total no puede exceder 100
  CONSTRAINT dividend_config_max_100 CHECK (
    partner_a_pct + partner_b_pct + inversiones_pct + back_pct <= 100.00
  )
);

-- Seed: insertar la fila default si no existe.
INSERT INTO public.dividend_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS dividend_config_touch_updated ON public.dividend_config;
CREATE TRIGGER dividend_config_touch_updated
  BEFORE UPDATE ON public.dividend_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ====== RLS ======
-- manual_revenues: solo director ve / escribe. No es info que el team
-- general necesita ver.
ALTER TABLE public.manual_revenues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manual_revenues_all ON public.manual_revenues;
CREATE POLICY manual_revenues_all ON public.manual_revenues
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );

-- dividend_config: solo director.
ALTER TABLE public.dividend_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dividend_config_all ON public.dividend_config;
CREATE POLICY dividend_config_all ON public.dividend_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );
