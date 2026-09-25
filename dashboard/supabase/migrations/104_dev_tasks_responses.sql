-- ============================================================
-- Migración 104: respuestas / notas por tarea
-- ============================================================
-- La persona asignada (o el director/equipo) puede dejar respuestas en
-- una tarea: explicar avances, aclarar algo o pegar un link. Se guardan
-- en un jsonb array de {authorId, authorName, text, at}.
-- ============================================================

ALTER TABLE public.dev_tasks
  ADD COLUMN IF NOT EXISTS responses jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.dev_tasks.responses IS
  'Respuestas/notas de la tarea: [{authorId, authorName, text, at}]. Las deja el asignado o el equipo (avances, aclaraciones, links).';
