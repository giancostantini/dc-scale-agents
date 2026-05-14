-- ============================================================
-- Migración 023: Conversaciones globales (por user) + briefing
-- ============================================================
-- Objetivo:
--   El widget global del consultor tiene una "conversación pinned"
--   por user del team — ese hilo único acumula los briefings
--   diarios y la charla cotidiana. No está atado a un cliente
--   específico (scope='global'), aunque puede mencionar varios.
--
--   El esquema actual de `consultant_conversations` exige
--   `client_id NOT NULL` — porque originalmente cubría sólo el
--   chat del portal (un cliente por conversación). Acá lo
--   relajamos: permitimos `client_id NULL` cuando `scope='global'`.
--
-- Cambios:
--   1. consultant_conversations:
--      - scope TEXT ('global' | 'client'), default 'client'
--      - is_pinned BOOL, default false
--      - client_id pasa a NULLABLE (solo NULL si scope='global')
--      - CHECK xor entre scope y client_id
--      - índice parcial para encontrar la pinned de un user rápido
--
--   2. consultant_messages:
--      - is_briefing BOOL, default false (marca el mensaje del
--        morning briefing automático para UI/banner)
--      - read_at TIMESTAMPTZ NULL (cuándo el user marcó leído
--        ese mensaje; null = no leído)
--
--   3. RLS extendida:
--      - conversaciones scope='global' visibles solo a su user_id
--        (director NO ve las globales de otro director — son
--        personales por user).
--      - conversaciones scope='client' siguen con las reglas
--        existentes (director, team-asignado, client del portal).
-- ============================================================

-- ====== 1. consultant_conversations: nuevas columnas ======

ALTER TABLE public.consultant_conversations
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'client'
    CHECK (scope IN ('global', 'client')),
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Relajar client_id a NULLABLE. PostgreSQL no soporta DROP NOT NULL
-- vía IF EXISTS, así que usamos DO block para idempotencia.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'consultant_conversations'
      AND column_name = 'client_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.consultant_conversations
      ALTER COLUMN client_id DROP NOT NULL;
  END IF;
END $$;

-- CHECK: si scope='client' → client_id NOT NULL; si scope='global' → client_id NULL
ALTER TABLE public.consultant_conversations
  DROP CONSTRAINT IF EXISTS consultant_conversations_scope_xor;
ALTER TABLE public.consultant_conversations
  ADD CONSTRAINT consultant_conversations_scope_xor CHECK (
    (scope = 'client' AND client_id IS NOT NULL)
    OR
    (scope = 'global' AND client_id IS NULL AND user_id IS NOT NULL)
  );

-- Índice parcial: encontrar la pinned global de un user rápido
CREATE INDEX IF NOT EXISTS consultant_conversations_user_pinned_idx
  ON public.consultant_conversations(user_id)
  WHERE scope = 'global' AND is_pinned = true;

COMMENT ON COLUMN public.consultant_conversations.scope IS
  '''client'' (chat sobre un cliente específico, usado por portal y chat per-cliente del team) | ''global'' (chat del widget global del consultor, por user del team)';
COMMENT ON COLUMN public.consultant_conversations.is_pinned IS
  'Si true, esta conversación es la "principal" del user (en scope=global, solo una por user). El briefing diario y la charla cotidiana se acumulan acá.';

-- ====== 2. consultant_messages: is_briefing + read_at ======

ALTER TABLE public.consultant_messages
  ADD COLUMN IF NOT EXISTS is_briefing BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS consultant_messages_briefing_unread_idx
  ON public.consultant_messages(conversation_id, created_at DESC)
  WHERE is_briefing = true AND read_at IS NULL;

COMMENT ON COLUMN public.consultant_messages.is_briefing IS
  'Marca un mensaje generado por el agente morning-briefing (no por el chat user-driven). Pinta banner + badge en el widget.';
COMMENT ON COLUMN public.consultant_messages.read_at IS
  'Cuándo el user marcó este mensaje como leído (para badges del widget). NULL = no leído.';

-- ====== 3. RLS: agregar paths para scope='global' ======

-- Sólo SELECT necesita cambio (los INSERT/UPDATE/DELETE las hace el
-- service role desde los endpoints). De todos modos endurecemos
-- todas para consistencia.

DROP POLICY IF EXISTS consultant_conv_select ON public.consultant_conversations;
CREATE POLICY consultant_conv_select ON public.consultant_conversations
  FOR SELECT TO authenticated
  USING (
    -- Scope global: sólo el dueño (user_id) lo ve
    (scope = 'global' AND user_id = auth.uid())
    OR
    -- Scope client: reglas existentes (director / team-asignado / client del portal)
    (scope = 'client' AND (
      public.auth_role() = 'director'
      OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
      OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
    ))
  );

DROP POLICY IF EXISTS consultant_conv_insert ON public.consultant_conversations;
CREATE POLICY consultant_conv_insert ON public.consultant_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (scope = 'global' AND user_id = auth.uid())
    OR
    (scope = 'client' AND (
      public.auth_role() = 'director'
      OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
      OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
    ))
  );

DROP POLICY IF EXISTS consultant_conv_update ON public.consultant_conversations;
CREATE POLICY consultant_conv_update ON public.consultant_conversations
  FOR UPDATE TO authenticated
  USING (
    (scope = 'global' AND user_id = auth.uid())
    OR
    (scope = 'client' AND (
      public.auth_role() = 'director'
      OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
      OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
    ))
  )
  WITH CHECK (
    (scope = 'global' AND user_id = auth.uid())
    OR
    (scope = 'client' AND (
      public.auth_role() = 'director'
      OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
      OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
    ))
  );

DROP POLICY IF EXISTS consultant_conv_delete ON public.consultant_conversations;
CREATE POLICY consultant_conv_delete ON public.consultant_conversations
  FOR DELETE TO authenticated
  USING (
    (scope = 'global' AND user_id = auth.uid())
    OR
    (scope = 'client' AND (
      public.auth_role() = 'director'
      OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
      OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
    ))
  );

-- consultant_messages: SELECT delega a la conversación padre como antes.
-- Como ya la policy existente filtra por conversation visible, no la
-- tocamos — el cambio en consultant_conv_select cubre el caso global.

-- ====== Verificación ======
--
-- 1. Constraint xor:
--    INSERT INTO consultant_conversations (scope, client_id) VALUES ('global', 'wiztrip');
--    → debe fallar.
--    INSERT INTO consultant_conversations (scope, user_id, client_id) VALUES ('global', '<uid>', NULL);
--    → debe funcionar.
--
-- 2. Pinned única por user (en práctica, app-side):
--    SELECT user_id, count(*) FROM consultant_conversations
--    WHERE scope='global' AND is_pinned=true
--    GROUP BY user_id HAVING count(*) > 1;
--    → debe estar vacío (los endpoints garantizan unicidad).
--
-- 3. RLS global aislado:
--    Como user A: SELECT * FROM consultant_conversations WHERE scope='global';
--    → solo conversaciones donde user_id = A.id.
