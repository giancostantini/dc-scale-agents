-- ============================================================
-- Migración 037: agregar payment_type='por_cliente'
-- ============================================================
-- El director necesita poder asignar el pago de cada miembro del
-- equipo según uno de estos esquemas:
--
--   - fijo          → sueldo mensual fijo (sin multiplicación)
--   - por_proyecto  → monto por proyecto (futuro: × cantidad proyectos)
--   - por_hora      → monto por hora trabajada (existente)
--   - por_cliente   → monto multiplicado por cada cliente activo del
--                     miembro (NUEVO). Si gana USD 200 por cliente y
--                     tiene 3 asignados → costo mensual USD 600.
--   - mixto         → combinación (existente)
--
-- Esta migración solo amplía el CHECK constraint del payment_type
-- en profiles + en salary_history para mantener coherencia.
-- ============================================================

-- 1) profiles.payment_type
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_payment_type_check;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* 'payment_type\s*(IN\s*\(|=\s*ANY)'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', r.conname);
  END LOOP;
END$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_payment_type_check
  CHECK (
    payment_type IS NULL OR payment_type IN (
      'fijo','por_proyecto','por_hora','por_cliente','mixto'
    )
  );

-- 2) salary_history.payment_type (si la columna existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'salary_history'
      AND column_name = 'payment_type'
  ) THEN
    -- Drop checks viejos sobre payment_type
    FOR r IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.salary_history'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ~* 'payment_type\s*(IN\s*\(|=\s*ANY)'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.salary_history DROP CONSTRAINT %I',
        r.conname
      );
    END LOOP;

    ALTER TABLE public.salary_history
      ADD CONSTRAINT salary_history_payment_type_check
      CHECK (
        payment_type IS NULL OR payment_type IN (
          'fijo','por_proyecto','por_hora','por_cliente','mixto'
        )
      );
  END IF;
END$$;

COMMENT ON COLUMN public.profiles.payment_type IS
  'Esquema de pago: fijo (mensual), por_proyecto (por proyecto activo), por_hora (por hora trabajada), por_cliente (multiplicado por cliente asignado), mixto (combinación).';
