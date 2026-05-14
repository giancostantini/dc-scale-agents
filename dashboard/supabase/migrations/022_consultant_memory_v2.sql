-- ============================================================
-- Migración 022: consultant_memory_v2 (scope user | client)
-- ============================================================
-- Objetivo:
--   La tabla `consultant_memory` actual solo tiene scope por cliente
--   (preferencias del DUEÑO del cliente, restricciones del cliente,
--   aprendizajes). Con el widget global del consultor, también
--   necesitamos memoria por USER del team (Gianluca prefiere ver
--   números primero, Federico quiere bullets cortos, etc.).
--
--   Esta migración crea una tabla unificada con un CHECK que
--   garantiza que cada fila tiene UN scope (user XOR client,
--   nunca ambos, nunca ninguno).
--
-- Diseño:
--   - scope_type 'user' → user_id NOT NULL, client_id NULL
--   - scope_type 'client' → client_id NOT NULL, user_id NULL
--
-- RLS:
--   - scope='user': el dueño (user_id = auth.uid()) puede leer/escribir
--     lo suyo. El director puede leer todo (para debugging).
--   - scope='client': director (todos), team (solo si tiene assignment
--     a ese client), client role (read-only de lo suyo).
--
-- Backfill: copiar filas de la vieja `consultant_memory` con
-- scope_type='client' usando el campo `client` como client_id.
-- ============================================================

-- ====== 1. Tabla ======

CREATE TABLE IF NOT EXISTS public.consultant_memory_v2 (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('user', 'client')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES public.clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('preference', 'constraint', 'past_decision', 'learning')),
  content TEXT NOT NULL,
  importance INT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consultant_memory_v2_scope_xor CHECK (
    (scope_type = 'user' AND user_id IS NOT NULL AND client_id IS NULL)
    OR
    (scope_type = 'client' AND client_id IS NOT NULL AND user_id IS NULL)
  )
);

COMMENT ON TABLE public.consultant_memory_v2 IS
  'Memoria progresiva del Consultor. scope_type=user → preferencias del miembro del equipo. scope_type=client → reglas/preferencias atadas al cliente.';

CREATE INDEX IF NOT EXISTS consultant_memory_v2_user_idx
  ON public.consultant_memory_v2(user_id, importance DESC, created_at DESC)
  WHERE scope_type = 'user';

CREATE INDEX IF NOT EXISTS consultant_memory_v2_client_idx
  ON public.consultant_memory_v2(client_id, importance DESC, created_at DESC)
  WHERE scope_type = 'client';

-- ====== 2. RLS ======

ALTER TABLE public.consultant_memory_v2 ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS consultant_memory_v2_select ON public.consultant_memory_v2;
CREATE POLICY consultant_memory_v2_select ON public.consultant_memory_v2
  FOR SELECT TO authenticated
  USING (
    (scope_type = 'user' AND (user_id = auth.uid() OR public.auth_role() = 'director'))
    OR
    (scope_type = 'client' AND (
      public.auth_role() = 'director'
      OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
      OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
    ))
  );

-- INSERT — en práctica los endpoints usan service role para escribir,
-- pero dejamos la policy permisiva para que un eventual write desde
-- el cliente con anon key respete el scope.
DROP POLICY IF EXISTS consultant_memory_v2_insert ON public.consultant_memory_v2;
CREATE POLICY consultant_memory_v2_insert ON public.consultant_memory_v2
  FOR INSERT TO authenticated
  WITH CHECK (
    (scope_type = 'user' AND user_id = auth.uid())
    OR
    (scope_type = 'client' AND (
      public.auth_role() = 'director'
      OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    ))
  );

-- UPDATE — mismo criterio que SELECT (un user puede editar lo suyo;
-- director puede editar todo).
DROP POLICY IF EXISTS consultant_memory_v2_update ON public.consultant_memory_v2;
CREATE POLICY consultant_memory_v2_update ON public.consultant_memory_v2
  FOR UPDATE TO authenticated
  USING (
    (scope_type = 'user' AND (user_id = auth.uid() OR public.auth_role() = 'director'))
    OR
    (scope_type = 'client' AND (
      public.auth_role() = 'director'
      OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    ))
  )
  WITH CHECK (
    (scope_type = 'user' AND (user_id = auth.uid() OR public.auth_role() = 'director'))
    OR
    (scope_type = 'client' AND (
      public.auth_role() = 'director'
      OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    ))
  );

-- DELETE — restringido a director.
DROP POLICY IF EXISTS consultant_memory_v2_delete ON public.consultant_memory_v2;
CREATE POLICY consultant_memory_v2_delete ON public.consultant_memory_v2
  FOR DELETE TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (scope_type = 'user' AND user_id = auth.uid())
  );

-- ====== 3. Backfill desde consultant_memory (legacy) ======
-- Sólo si la tabla vieja existe y la nueva está vacía. Idempotente:
-- corre múltiples veces sin duplicar.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consultant_memory'
  ) THEN
    INSERT INTO public.consultant_memory_v2 (
      scope_type, client_id, kind, content, importance, expires_at, created_at
    )
    SELECT
      'client',
      m.client,
      m.kind,
      m.content,
      COALESCE(m.importance, 3),
      m.expires_at,
      m.created_at
    FROM public.consultant_memory m
    -- Solo backfill filas cuyo client aún existe (evita FK violation)
    WHERE EXISTS (SELECT 1 FROM public.clients c WHERE c.id = m.client)
    -- Evita re-insertar si ya está
    AND NOT EXISTS (
      SELECT 1 FROM public.consultant_memory_v2 v
      WHERE v.scope_type = 'client'
        AND v.client_id = m.client
        AND v.kind = m.kind
        AND v.content = m.content
        AND v.created_at = m.created_at
    );
  END IF;
END $$;

-- ====== Verificación ======
-- 1. Tabla + indexes:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'consultant_memory_v2';
--    → consultant_memory_v2_pkey, consultant_memory_v2_user_idx, consultant_memory_v2_client_idx
--
-- 2. CHECK xor:
--    INSERT INTO consultant_memory_v2 (scope_type, user_id, client_id, kind, content)
--    VALUES ('user', '00000000-0000-0000-0000-000000000000', 'wiztrip', 'preference', 'test');
--    → debe fallar por consultant_memory_v2_scope_xor.
--
-- 3. Backfill:
--    SELECT count(*) FROM consultant_memory;             -- N
--    SELECT count(*) FROM consultant_memory_v2 WHERE scope_type='client';  -- N (o más si ya había v2)
