-- ============================================================
-- 077 — Consultor de Contenido (agente del portal de equipo)
--
-- Chat interno por (team_member, cliente) que da ideas de contenido
-- nutridas de marca + tendencias del nicho. Tablas DEDICADAS y
-- SOLO-EQUIPO.
--
-- ¿Por qué tablas nuevas y no reusar consultant_conversations?
-- El portal del cliente lista sus conversaciones filtrando SOLO por
-- client_id (sin user_id ni scope). Si guardáramos el brainstorming
-- interno del equipo como scope='client' + client_id=<cliente>, el
-- CLIENTE lo vería en su portal. Acá el aislamiento es total: ninguna
-- policy permite role='client', y el portal no toca estas tablas.
-- ============================================================

-- ====== 1. content_ideas_threads (un hilo por team_member + cliente) ======
CREATE TABLE IF NOT EXISTS public.content_ideas_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

CREATE INDEX IF NOT EXISTS content_ideas_threads_user_idx
  ON public.content_ideas_threads(user_id);
CREATE INDEX IF NOT EXISTS content_ideas_threads_client_idx
  ON public.content_ideas_threads(client_id);

-- ====== 2. content_ideas_messages ======
CREATE TABLE IF NOT EXISTS public.content_ideas_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.content_ideas_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_ideas_messages_thread_idx
  ON public.content_ideas_messages(thread_id, created_at);

-- ====== 3. RLS — director global; team SOLO si está asignado al cliente ======
-- Espejamos el estilo EXISTS de la migración 004 (no asumimos helpers SQL).
-- Los endpoints igual usan service-role y revalidan con requireClientAccess;
-- esto es defensa en profundidad. NO hay policy para role='client'.
ALTER TABLE public.content_ideas_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_ideas_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_ideas_threads_rw ON public.content_ideas_threads;
CREATE POLICY content_ideas_threads_rw ON public.content_ideas_threads
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.client_assignments ca ON ca.user_id = p.id
      WHERE p.id = auth.uid() AND p.role = 'team'
        AND ca.client_id = content_ideas_threads.client_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.client_assignments ca ON ca.user_id = p.id
      WHERE p.id = auth.uid() AND p.role = 'team'
        AND ca.client_id = content_ideas_threads.client_id
    )
  );

DROP POLICY IF EXISTS content_ideas_messages_rw ON public.content_ideas_messages;
CREATE POLICY content_ideas_messages_rw ON public.content_ideas_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.content_ideas_threads t
      WHERE t.id = content_ideas_messages.thread_id
        AND (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'director'
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.client_assignments ca ON ca.user_id = p.id
            WHERE p.id = auth.uid() AND p.role = 'team' AND ca.client_id = t.client_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_ideas_threads t
      WHERE t.id = content_ideas_messages.thread_id
        AND (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'director'
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.client_assignments ca ON ca.user_id = p.id
            WHERE p.id = auth.uid() AND p.role = 'team' AND ca.client_id = t.client_id
          )
        )
    )
  );

COMMENT ON TABLE public.content_ideas_threads IS
  'Consultor de Contenido (portal de equipo): un hilo por (team_member, cliente). SOLO-EQUIPO — sin policy para role=client, aislado del portal del cliente.';
COMMENT ON TABLE public.content_ideas_messages IS
  'Mensajes del Consultor de Contenido. Acceso heredado del thread (director / team asignado).';
