-- ============================================================
-- Migración 031: ingresos asignables a cliente + dividendos
-- a mes vencido con default 30/30/40
-- ============================================================
--
-- 1. manual_revenues.client_id — opcional. Permite asignar un ingreso
--    manual a un cliente específico (ej: cobro extraordinario fuera
--    del fee mensual, venta puntual atribuida a un cliente). Nullable
--    porque muchos ingresos manuales son corporativos / sin cliente
--    (alquiler de cowork, premio, etc).
--
-- 2. dividend_config: cambiamos los defaults a 30/30/40/0 (Federico,
--    Gianluca, Inversiones, Back). El back queda en 0 porque ahora
--    todo lo que no se reparte va a inversiones.
-- ============================================================

-- 1. manual_revenues.client_id
ALTER TABLE public.manual_revenues
  ADD COLUMN IF NOT EXISTS client_id text
    REFERENCES public.clients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.manual_revenues.client_id IS
  'Cliente al que se asigna este ingreso. NULL = ingreso corporativo (alquiler de cowork, premio, etc).';

-- Index para queries por cliente
CREATE INDEX IF NOT EXISTS manual_revenues_client_idx
  ON public.manual_revenues(client_id)
  WHERE client_id IS NOT NULL;

-- 2. dividend_config defaults: 30/30/40/0
-- El UPDATE solo se aplica a la fila singleton (id=1) si todavía
-- tiene los defaults viejos (30/30/15/25). Si el director ya los
-- editó manualmente, no tocamos sus valores.
UPDATE public.dividend_config
SET partner_a_pct = 30.00,
    partner_b_pct = 30.00,
    inversiones_pct = 40.00,
    back_pct = 0.00
WHERE id = 1
  AND partner_a_pct = 30.00
  AND partner_b_pct = 30.00
  AND inversiones_pct = 15.00
  AND back_pct = 25.00;

-- Si no existía la fila (cliente nuevo / fresh DB), la insertamos
-- con los nuevos defaults.
INSERT INTO public.dividend_config (
  id, partner_a_pct, partner_b_pct, inversiones_pct, back_pct,
  partner_a_name, partner_b_name
)
VALUES (1, 30.00, 30.00, 40.00, 0.00, 'Federico Dearmas', 'Gianluca Costantini')
ON CONFLICT (id) DO NOTHING;
