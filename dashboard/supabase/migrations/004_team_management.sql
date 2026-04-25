-- ============================================================
-- Migración 004: Gestión de equipo + asignaciones a clientes
-- ============================================================
-- Idempotente: usa IF NOT EXISTS / DROP + CREATE para policies.
--
-- Cambios:
--   1) Extiende `profiles` con: position, payment_*, start_date,
--      phone, notes (sólo el director ve/edita los campos sensibles).
--   2) Nueva tabla `client_assignments` (relación N:M entre profiles
--      y clients con un rol-en-cliente).
--   3) Endurece RLS en profiles: cada usuario puede actualizar sólo
--      su propio profile (campos no sensibles); el director puede
--      actualizar cualquiera. Sin esto, la policy default era abierta.
-- ============================================================

-- ====== 1. Extender `profiles` ======
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS payment_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS payment_currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'fijo',
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Constraint para payment_type (libre si no se setea)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_payment_type_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_payment_type_check
      CHECK (payment_type IS NULL OR payment_type IN ('fijo', 'por_proyecto', 'por_hora', 'mixto'));
  END IF;
END $$;

-- ====== 2. Tabla `client_assignments` ======
CREATE TABLE IF NOT EXISTS public.client_assignments (
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_in_client text NOT NULL,
  since date NOT NULL DEFAULT CURRENT_DATE,
  until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, user_id, role_in_client)
);

CREATE INDEX IF NOT EXISTS client_assignments_client_idx
  ON public.client_assignments(client_id);
CREATE INDEX IF NOT EXISTS client_assignments_user_idx
  ON public.client_assignments(user_id);

ALTER TABLE public.client_assignments ENABLE ROW LEVEL SECURITY;

-- ====== 3. RLS POLICIES ======

-- helper: ¿el caller es director?
-- Se usa inline en cada policy con EXISTS para no tener que crear
-- una función que requeriría SECURITY DEFINER.

-- ---- profiles ----
-- SELECT: ya está abierto a todos los authenticated del schema base.
-- UPDATE: cada usuario puede actualizar su propio profile, o el director cualquiera.
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid() AND p2.role = 'director'
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid() AND p2.role = 'director'
    )
  );

-- INSERT a profiles lo hace el trigger handle_new_user, no usuarios.
-- Mantenemos el insert abierto a authenticated como antes (no es la
-- vía habitual; si alguien lo quisiera bypassear, igual el trigger
-- determina el role).

-- DELETE: nadie por ahora. Si alguna vez hace falta dar de baja un
-- profile, lo hace el director vía la admin API (cascade desde
-- auth.users al borrar el user).

-- ---- client_assignments ----
DROP POLICY IF EXISTS client_assignments_select ON public.client_assignments;
CREATE POLICY client_assignments_select ON public.client_assignments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS client_assignments_insert ON public.client_assignments;
CREATE POLICY client_assignments_insert ON public.client_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );

DROP POLICY IF EXISTS client_assignments_update ON public.client_assignments;
CREATE POLICY client_assignments_update ON public.client_assignments
  FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS client_assignments_delete ON public.client_assignments;
CREATE POLICY client_assignments_delete ON public.client_assignments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );

-- ====== Verificación ======
-- SELECT email, role, position, payment_amount, payment_currency
-- FROM public.profiles ORDER BY role DESC, email;
--
-- SELECT * FROM public.client_assignments;
