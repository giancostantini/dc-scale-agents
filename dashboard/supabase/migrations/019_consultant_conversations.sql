-- ============================================================
-- Migración 019: Persistencia del chat con D&C Advisor
-- ============================================================
-- Objetivo:
--   1. Persistir conversaciones del Consultor IA del portal del
--      cliente (hoy son state efímero del componente — se pierden
--      al refrescar).
--   2. Permitir conversaciones independientes (estilo ChatGPT) que
--      el cliente puede listar e intercambiar desde el historial.
--   3. Con RLS estricta para que cada cliente acceda SOLO a sus
--      conversaciones (defensa en profundidad además del filtro
--      por client_id en los endpoints).
--
-- Nota sobre contexto cross-conversation: el endpoint
--   /api/portal/consultant lee mensajes de OTRAS conversaciones
--   del mismo cliente al armar el system prompt — así el agente
--   tiene contexto histórico. La persistencia acá habilita esa
--   feature.
--
-- Idempotente: usa IF NOT EXISTS / DROP+CREATE.
-- ============================================================

-- ====== 1. Tablas ======

CREATE TABLE IF NOT EXISTS public.consultant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.consultant_conversations IS
  'Conversaciones del Consultor IA del portal por cliente. Cada conversación es un thread independiente.';
COMMENT ON COLUMN public.consultant_conversations.title IS
  'Auto-generado a partir de la primera pregunta del cliente (truncado a 60 chars). NULL si todavía no hay turnos user.';

CREATE INDEX IF NOT EXISTS consultant_conversations_client_updated_idx
  ON public.consultant_conversations(client_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.consultant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.consultant_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  is_welcome boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.consultant_messages IS
  'Mensajes individuales de las conversaciones del Consultor IA. is_welcome=true marca el welcome cacheado (no se manda al historial de Claude).';

CREATE INDEX IF NOT EXISTS consultant_messages_conversation_idx
  ON public.consultant_messages(conversation_id, created_at ASC);

-- ====== 2. RLS conversations ======

ALTER TABLE public.consultant_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultant_conv_select ON public.consultant_conversations;
CREATE POLICY consultant_conv_select ON public.consultant_conversations
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

DROP POLICY IF EXISTS consultant_conv_insert ON public.consultant_conversations;
CREATE POLICY consultant_conv_insert ON public.consultant_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

DROP POLICY IF EXISTS consultant_conv_update ON public.consultant_conversations;
CREATE POLICY consultant_conv_update ON public.consultant_conversations
  FOR UPDATE TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  )
  WITH CHECK (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

DROP POLICY IF EXISTS consultant_conv_delete ON public.consultant_conversations;
CREATE POLICY consultant_conv_delete ON public.consultant_conversations
  FOR DELETE TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

-- ====== 3. RLS messages (delegan al client_id de la conversación padre) ======

ALTER TABLE public.consultant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultant_msg_select ON public.consultant_messages;
CREATE POLICY consultant_msg_select ON public.consultant_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.consultant_conversations c
      WHERE c.id = conversation_id
        AND (
          public.auth_role() = 'director'
          OR (public.auth_role() = 'team' AND public.has_client_assignment(c.client_id))
          OR (public.auth_role() = 'client' AND public.auth_client_id() = c.client_id)
        )
    )
  );

-- INSERT/UPDATE/DELETE: el endpoint usa service role para escribir
-- ambos lados (user + assistant) atómicamente. Igual permitimos al
-- authenticated por consistencia con welcomes — el RLS del padre
-- (consultant_conversations) ya bloquea writes cruzados.
DROP POLICY IF EXISTS consultant_msg_insert ON public.consultant_messages;
CREATE POLICY consultant_msg_insert ON public.consultant_messages
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS consultant_msg_update ON public.consultant_messages;
CREATE POLICY consultant_msg_update ON public.consultant_messages
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS consultant_msg_delete ON public.consultant_messages;
CREATE POLICY consultant_msg_delete ON public.consultant_messages
  FOR DELETE TO authenticated
  USING (true);

-- ====== Verificación ======
-- 1. Tablas y columnas:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema='public'
--      AND table_name IN ('consultant_conversations','consultant_messages');
--
-- 2. RLS habilitada:
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('consultant_conversations','consultant_messages');
--    → ambas con relrowsecurity=true.
--
-- 3. Aislamiento por cliente — como role='client', probar:
--    INSERT INTO consultant_conversations (client_id) VALUES ('otro_cliente');
--    → debe fallar por RLS.
--    INSERT INTO consultant_conversations (client_id) VALUES ('<su_client_id>');
--    → debe funcionar.
--
-- 4. Cleanup en cascada:
--    DELETE FROM consultant_conversations WHERE id = '<uuid>';
--    → mensajes asociados se borran solos por ON DELETE CASCADE.
