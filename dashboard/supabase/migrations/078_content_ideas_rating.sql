-- ============================================================
-- 078 — Rating 👍/👎 en los mensajes del Consultor de Contenido
--
-- Señal de calidad explícita: la CM marca qué respuestas del consultor
-- sirvieron (1 = 👍) o no (-1 = 👎). El destilador de aprendizajes
-- (scripts/distill-learnings) usa esto para saber qué imitar vs evitar.
-- NULL = sin calificar.
-- ============================================================

ALTER TABLE public.content_ideas_messages
  ADD COLUMN IF NOT EXISTS rating smallint
    CHECK (rating IS NULL OR rating IN (-1, 1));

COMMENT ON COLUMN public.content_ideas_messages.rating IS
  'Feedback explícito de la CM sobre una respuesta del asistente: 1=👍, -1=👎, NULL=sin calificar. Lo consume el destilador de aprendizajes.';
