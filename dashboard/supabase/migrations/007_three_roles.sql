-- ============================================================
-- Migración 007: Tres roles (director / team / client) + permisos
--                granulares + tabla client_requests + RLS por rol
-- ============================================================
-- Este archivo es el primer commit del feature de portal del cliente.
-- Idempotente: usa IF NOT EXISTS / DROP + CREATE para policies.
--
-- Cambios:
--   1. profiles
--      - nueva columna client_id (FK a clients) — para usuarios role='client'
--      - nueva columna permissions jsonb — para flags granulares
--        (ej. pipeline_access para que el director habilite el CRM
--             a un team member específico)
--      - role check extendido para incluir 'client'
--
--   2. Helper functions con SECURITY DEFINER
--      - auth_role() — el rol del caller (director/team/client)
--      - auth_client_id() — el client_id del caller (solo si role=client)
--      - auth_pipeline_access() — true si el caller tiene
--        permissions.pipeline_access=true o es director
--      - has_client_assignment(client_id) — true si el caller team
--        tiene una asignación con ese cliente
--
--   3. Tabla nueva: client_requests
--      Inbox de solicitudes que el cliente carga desde su portal:
--        - type='oferta' (promociones, descuentos, fechas, productos)
--        - type='accion' (acciones libres: ideas, pedidos, mejoras)
--      Director y team-asignados las ven, asignan y responden.
--
--   4. RLS por rol — endurece SELECT en tablas sensibles:
--      - clients: director ve todos / team solo asignados / client solo el suyo
--      - leads, prospect_campaigns: NUNCA visibles para client
--      - phase_reports, content_posts, payments, objectives, etc:
--        client solo ve los suyos (con filtros adicionales en app:
--        ej. solo reports approved, solo posts published)
-- ============================================================

-- ====== 1. profiles ======
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS client_id text
    REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Permitir 'client' como role
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('director', 'team', 'client'));

-- Si role=client, debe tener client_id (constraint de integridad)
-- No lo hago hard-required con CHECK porque queda incómodo durante
-- la creación; lo enforzamos a nivel app/endpoint.

CREATE INDEX IF NOT EXISTS profiles_client_id_idx
  ON public.profiles(client_id);

-- ====== 2. Helper functions ======
-- Estas usan SECURITY DEFINER para bypassear RLS al leer profiles
-- desde dentro de las policies — evita recursión.

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_client_id()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_pipeline_access()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT
    role = 'director'
    OR (role = 'team' AND COALESCE((permissions->>'pipeline_access')::boolean, false))
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.has_client_assignment(target_client_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_assignments
    WHERE user_id = auth.uid() AND client_id = target_client_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_pipeline_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_client_assignment(text) TO authenticated;

-- ====== 3. Tabla client_requests ======
CREATE TABLE IF NOT EXISTS public.client_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('oferta', 'accion')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ofertas suelen tener: { startDate, endDate, discountPct, product }
  -- acciones suelen tener: { area: 'ads'|'contenido'|'seo'|'dev'|'otro', desiredDate }

  urgency text NOT NULL DEFAULT 'media'
    CHECK (urgency IN ('baja', 'media', 'alta')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewing', 'in_progress', 'done', 'rejected')),

  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  assigned_to uuid REFERENCES public.profiles(id),
  response text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_requests_client_idx
  ON public.client_requests(client_id);
CREATE INDEX IF NOT EXISTS client_requests_status_idx
  ON public.client_requests(status);
CREATE INDEX IF NOT EXISTS client_requests_submitted_by_idx
  ON public.client_requests(submitted_by);

-- Trigger updated_at (touch_updated_at ya existe de migración 006)
DROP TRIGGER IF EXISTS client_requests_touch_updated ON public.client_requests;
CREATE TRIGGER client_requests_touch_updated
  BEFORE UPDATE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

-- ====== 4. RLS endurecida ======

-- ---- profiles ----
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    -- director ve todos
    public.auth_role() = 'director'
    -- team ve director y otros team (no clientes)
    OR (public.auth_role() = 'team' AND role IN ('director', 'team'))
    -- client solo se ve a sí mismo
    OR id = auth.uid()
  );

-- profiles_update ya existe de migración 004, la mantenemos.

-- ---- clients ----
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = id)
  );

-- INSERT/UPDATE/DELETE de clients siguen con la policy default (open),
-- pero el app layer ya gatea por director. Si querés más estricto:
DROP POLICY IF EXISTS clients_insert ON public.clients;
CREATE POLICY clients_insert ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() = 'director');

DROP POLICY IF EXISTS clients_update ON public.clients;
CREATE POLICY clients_update ON public.clients
  FOR UPDATE TO authenticated
  USING (public.auth_role() = 'director')
  WITH CHECK (public.auth_role() = 'director');

DROP POLICY IF EXISTS clients_delete ON public.clients;
CREATE POLICY clients_delete ON public.clients
  FOR DELETE TO authenticated
  USING (public.auth_role() = 'director');

-- ---- leads ----
-- Pipeline: nunca visibles para client. Team solo si tiene acceso.
DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads
  FOR SELECT TO authenticated
  USING (public.auth_pipeline_access());

DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_pipeline_access());

DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads
  FOR UPDATE TO authenticated
  USING (public.auth_pipeline_access())
  WITH CHECK (public.auth_pipeline_access());

DROP POLICY IF EXISTS leads_delete ON public.leads;
CREATE POLICY leads_delete ON public.leads
  FOR DELETE TO authenticated
  USING (public.auth_pipeline_access());

-- ---- prospect_campaigns ----
DROP POLICY IF EXISTS prospect_campaigns_select ON public.prospect_campaigns;
CREATE POLICY prospect_campaigns_select ON public.prospect_campaigns
  FOR SELECT TO authenticated
  USING (public.auth_pipeline_access());

DROP POLICY IF EXISTS prospect_campaigns_insert ON public.prospect_campaigns;
CREATE POLICY prospect_campaigns_insert ON public.prospect_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_pipeline_access());

DROP POLICY IF EXISTS prospect_campaigns_update ON public.prospect_campaigns;
CREATE POLICY prospect_campaigns_update ON public.prospect_campaigns
  FOR UPDATE TO authenticated
  USING (public.auth_pipeline_access())
  WITH CHECK (public.auth_pipeline_access());

DROP POLICY IF EXISTS prospect_campaigns_delete ON public.prospect_campaigns;
CREATE POLICY prospect_campaigns_delete ON public.prospect_campaigns
  FOR DELETE TO authenticated
  USING (public.auth_pipeline_access());

-- ---- expenses (Finanzas internas) ----
-- Solo director.
DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses
  FOR SELECT TO authenticated
  USING (public.auth_role() = 'director');

DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() = 'director');

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.auth_role() = 'director')
  WITH CHECK (public.auth_role() = 'director');

DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (public.auth_role() = 'director');

-- ---- payments ----
-- Director ve todos. Team ve los de sus clientes asignados. Cliente
-- ve solo los suyos.
DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

DROP POLICY IF EXISTS payments_insert ON public.payments;
CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_role() = 'director');

DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO authenticated
  USING (public.auth_role() = 'director')
  WITH CHECK (public.auth_role() = 'director');

DROP POLICY IF EXISTS payments_delete ON public.payments;
CREATE POLICY payments_delete ON public.payments
  FOR DELETE TO authenticated
  USING (public.auth_role() = 'director');

-- ---- objectives ----
DROP POLICY IF EXISTS objectives_select ON public.objectives;
CREATE POLICY objectives_select ON public.objectives
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

-- ---- notes (notas internas, no para clientes) ----
DROP POLICY IF EXISTS notes_select ON public.notes;
CREATE POLICY notes_select ON public.notes
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  );

-- ---- dev_tasks (internas) ----
DROP POLICY IF EXISTS dev_tasks_select ON public.dev_tasks;
CREATE POLICY dev_tasks_select ON public.dev_tasks
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  );

-- ---- production_campaigns ----
-- El cliente ve sus campañas (pero el app filtra detalles).
DROP POLICY IF EXISTS production_campaigns_select ON public.production_campaigns;
CREATE POLICY production_campaigns_select ON public.production_campaigns
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

-- ---- content_posts ----
-- Cliente solo ve los publicados (status='published').
DROP POLICY IF EXISTS content_posts_select ON public.content_posts;
CREATE POLICY content_posts_select ON public.content_posts
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (
      public.auth_role() = 'client'
      AND public.auth_client_id() = client_id
      AND status = 'published'
    )
  );

-- ---- routing_rules (internas) ----
DROP POLICY IF EXISTS routing_rules_select ON public.routing_rules;
CREATE POLICY routing_rules_select ON public.routing_rules
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  );

-- ---- integrations (credenciales sensibles) ----
DROP POLICY IF EXISTS integrations_select ON public.integrations;
CREATE POLICY integrations_select ON public.integrations
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  );

-- ---- cal_events ----
-- Cliente ve eventos donde client_id matchea su client_id.
DROP POLICY IF EXISTS cal_events_select ON public.cal_events;
CREATE POLICY cal_events_select ON public.cal_events
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR public.auth_role() = 'team'
    OR (
      public.auth_role() = 'client'
      AND client_id IS NOT NULL
      AND public.auth_client_id() = client_id
    )
  );

-- ---- phase_reports ----
-- Cliente solo ve los aprobados de su cliente.
DROP POLICY IF EXISTS phase_reports_select ON public.phase_reports;
CREATE POLICY phase_reports_select ON public.phase_reports
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (
      public.auth_role() = 'client'
      AND public.auth_client_id() = client_id
      AND status = 'approved'
    )
  );

-- ---- client_assignments ----
-- Director ve todas. Team ve las propias (para saber a quién está asignado).
-- Cliente NO las ve.
DROP POLICY IF EXISTS client_assignments_select ON public.client_assignments;
CREATE POLICY client_assignments_select ON public.client_assignments
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND user_id = auth.uid())
  );

-- ---- client_requests (NUEVA) ----
DROP POLICY IF EXISTS client_requests_select ON public.client_requests;
CREATE POLICY client_requests_select ON public.client_requests
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

DROP POLICY IF EXISTS client_requests_insert ON public.client_requests;
CREATE POLICY client_requests_insert ON public.client_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Director siempre puede; cliente solo en su propio client_id.
    public.auth_role() = 'director'
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

DROP POLICY IF EXISTS client_requests_update ON public.client_requests;
CREATE POLICY client_requests_update ON public.client_requests
  FOR UPDATE TO authenticated
  USING (
    -- Director y team-asignados pueden gestionar (cambiar status,
    -- asignar, responder). El cliente NO puede modificar una request
    -- una vez enviada (alineado con "el cliente no puede pedir cambios").
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  )
  WITH CHECK (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
  );

DROP POLICY IF EXISTS client_requests_delete ON public.client_requests;
CREATE POLICY client_requests_delete ON public.client_requests
  FOR DELETE TO authenticated
  USING (public.auth_role() = 'director');

-- ====== Verificación ======
-- SELECT auth_role();
-- SELECT auth_client_id();
-- SELECT auth_pipeline_access();
-- SELECT * FROM public.client_requests LIMIT 1;
-- SELECT email, role, client_id, permissions FROM public.profiles ORDER BY role;
