-- ============================================================
-- Migración 032: nuevas categorías de egresos + override de cobros
-- ============================================================
--
-- 1. expenses.category: agregamos 'impuestos' y 'mkt_interno' al
--    CHECK existente. Las viejas (equipo, tools, ia, produccion,
--    otros) siguen funcionando.
--
-- 2. payments.amount_override: nuevo campo opcional. Si está, el
--    importe del cobro es este valor en vez de client.fee. Permite
--    al director cobrar un mes específico distinto al fee del
--    contrato (ej: descuento puntual, ajuste, extras).
--
-- 3. payments.note: nota libre para explicar el override / extras.
-- ============================================================

-- 1. expenses.category — drop el CHECK viejo (con nombre auto-generado
--    o explícito), recreamos con set ampliado.
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_category_check;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.expenses'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* 'category\s*(IN\s*\(|=\s*ANY)'
  LOOP
    EXECUTE format('ALTER TABLE public.expenses DROP CONSTRAINT %I', r.conname);
  END LOOP;
END$$;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    'equipo',        -- legacy = funcionales (sueldos / contractors)
    'tools',         -- SaaS, software
    'ia',            -- créditos / suscripciones IA
    'produccion',    -- contenido, ads creatives, eventos
    'impuestos',     -- nuevo
    'mkt_interno',   -- nuevo: ads para D&C, branding propio
    'otros'
  ));

COMMENT ON COLUMN public.expenses.category IS
  'Categoría del egreso. "equipo" = funcionales del equipo (sueldos / contractors). Nuevas: impuestos, mkt_interno.';

-- 2. payments: override del importe + nota
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_override numeric(12,2),
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN public.payments.amount_override IS
  'Importe del cobro de este mes (override). Si NULL → se usa el client.fee del contrato. Sirve para descuentos puntuales, ajustes, extras.';

COMMENT ON COLUMN public.payments.note IS
  'Nota libre del director sobre este cobro (motivo del override, etc).';
