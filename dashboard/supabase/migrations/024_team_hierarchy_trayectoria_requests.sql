-- ============================================================
-- Migración 024: Equipo — jerarquía + trayectoria + requests
-- ============================================================
-- Tres cosas relacionadas con el equipo de la agencia:
--
-- 1) profiles.reports_to_id — a quién le reporta cada persona.
--    Con esto armamos el árbol/organigrama en /equipo.
--
-- 2) Trayectoria (4 tipos de historial):
--    - position_history    cambios de cargo
--    - salary_history      cambios de sueldo
--    - team_milestones     hitos / notas manuales
--    (los clientes en los que trabajó vienen de client_assignments
--     existente — no necesita tabla nueva)
--
-- 3) team_requests — caja de pedidos: ausencia / licencia /
--    proyecto de innovación / otros. El miembro carga el pedido,
--    el director lo revisa.
-- ============================================================

-- ====== 1) JERARQUÍA ======
-- Quién le reporta a quién. NULL = persona sin jefe directo (típicamente
-- los directores fundadores). Self-ref con ON DELETE SET NULL para no
-- borrar la cadena si alguien se va.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reports_to_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_reports_to_idx
  ON public.profiles(reports_to_id);

-- ====== 2) TRAYECTORIA ======

-- Historial de cargos (position_history)
-- Para cada cambio de cargo: cuándo empezó, qué cargo, y opcional nota.
-- end_date NULL = es el cargo actual. Solo puede haber un registro
-- con end_date NULL por persona (lo enforcemos en la app, no en DB
-- para flexibilidad).
CREATE TABLE IF NOT EXISTS public.position_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS position_history_user_idx
  ON public.position_history(user_id, start_date DESC);

-- Historial de sueldo (salary_history)
-- Cada cambio de pago: monto, moneda, tipo, desde cuándo.
-- end_date NULL = es el sueldo vigente.
CREATE TABLE IF NOT EXISTS public.salary_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  payment_type text NOT NULL DEFAULT 'fijo'
    CHECK (payment_type IN ('fijo', 'por_proyecto', 'por_hora', 'mixto')),
  effective_from date NOT NULL,
  end_date date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salary_history_user_idx
  ON public.salary_history(user_id, effective_from DESC);

-- Hitos / notas manuales (team_milestones)
-- Eventos importantes que el director carga: viajes, formaciones,
-- premios, etc. Sin fechas de fin — son puntos en el tiempo.
CREATE TABLE IF NOT EXISTS public.team_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('formacion', 'viaje', 'premio', 'promocion', 'otro')),
  title text NOT NULL,
  description text,
  date date NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_milestones_user_idx
  ON public.team_milestones(user_id, date DESC);

-- ====== 3) REQUESTS DEL EQUIPO ======
-- El miembro del equipo submite un pedido. El director lo aprueba/rechaza
-- y opcionalmente deja una respuesta.
CREATE TABLE IF NOT EXISTS public.team_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('ausencia', 'licencia', 'innovacion', 'otro')),
  title text NOT NULL,
  description text,
  start_date date,  -- aplicable para ausencia / licencia
  end_date date,    -- idem
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'in_review')),
  director_response text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_requests_user_idx
  ON public.team_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS team_requests_status_idx
  ON public.team_requests(status, created_at DESC)
  WHERE status IN ('pending', 'in_review');

-- Trigger updated_at en team_requests
DROP TRIGGER IF EXISTS team_requests_touch_updated ON public.team_requests;
CREATE TRIGGER team_requests_touch_updated
  BEFORE UPDATE ON public.team_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ====== RLS ======
-- position_history / salary_history / team_milestones:
--   SELECT: director ve todo. Team ve solo lo propio.
--   INSERT/UPDATE/DELETE: solo director.
-- team_requests:
--   SELECT: director ve todo. Team ve solo los suyos.
--   INSERT: cualquier autenticado puede crear UN request para sí mismo.
--   UPDATE: director (para cambiar status y agregar response). El
--     creador puede editar mientras esté pending.
--   DELETE: solo director.

-- position_history
ALTER TABLE public.position_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS position_history_select ON public.position_history;
CREATE POLICY position_history_select ON public.position_history
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );
DROP POLICY IF EXISTS position_history_write ON public.position_history;
CREATE POLICY position_history_write ON public.position_history
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

-- salary_history
ALTER TABLE public.salary_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS salary_history_select ON public.salary_history;
CREATE POLICY salary_history_select ON public.salary_history
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );
DROP POLICY IF EXISTS salary_history_write ON public.salary_history;
CREATE POLICY salary_history_write ON public.salary_history
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

-- team_milestones
ALTER TABLE public.team_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_milestones_select ON public.team_milestones;
CREATE POLICY team_milestones_select ON public.team_milestones
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );
DROP POLICY IF EXISTS team_milestones_write ON public.team_milestones;
CREATE POLICY team_milestones_write ON public.team_milestones
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

-- team_requests
ALTER TABLE public.team_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_requests_select ON public.team_requests;
CREATE POLICY team_requests_select ON public.team_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );
DROP POLICY IF EXISTS team_requests_insert_self ON public.team_requests;
CREATE POLICY team_requests_insert_self ON public.team_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS team_requests_update ON public.team_requests;
CREATE POLICY team_requests_update ON public.team_requests
  FOR UPDATE TO authenticated
  USING (
    -- Director siempre, o el creador mientras esté pending.
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
    OR (user_id = auth.uid() AND status = 'pending')
  );
DROP POLICY IF EXISTS team_requests_delete ON public.team_requests;
CREATE POLICY team_requests_delete ON public.team_requests
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );
