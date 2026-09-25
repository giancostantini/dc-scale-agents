-- ============================================================
-- Migración 103: progreso + adjuntos por tarea
-- ============================================================
-- Dos features en dev_tasks:
--   1. progress (0-100): barra de progreso de cada tarea. La setea la
--      persona asignada o el director. Al marcar 'done' la app la lleva
--      a 100.
--   2. Adjuntos: una tarea puede PEDIR un archivo (attachment_requested +
--      attachment_note "qué se pide"), y la persona asignada sube lo
--      solicitado (PDF o foto). Los archivos subidos se guardan en
--      attachments (jsonb array de {name, url, type, size, uploadedAt}).
-- ============================================================

ALTER TABLE public.dev_tasks
  ADD COLUMN IF NOT EXISTS progress smallint NOT NULL DEFAULT 0
    CHECK (progress BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS attachment_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_note text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.dev_tasks.progress IS
  'Avance de la tarea 0-100. Lo edita el asignado o el director; done = 100.';
COMMENT ON COLUMN public.dev_tasks.attachment_requested IS
  'true = la tarea pide un archivo adjunto (lo sube el asignado).';
COMMENT ON COLUMN public.dev_tasks.attachment_note IS
  'Qué archivo se pide (ej "subí el PDF firmado" / "foto del local").';
COMMENT ON COLUMN public.dev_tasks.attachments IS
  'Archivos subidos: [{name, url, type, size, uploadedAt}].';
