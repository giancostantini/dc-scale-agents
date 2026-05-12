-- ============================================================
-- Migración 020: Cache del análisis crítico del reporte
-- ============================================================
-- El director puede pedir un "análisis interno" del reporte:
-- un agente lee el content_md y devuelve fortalezas/huecos/riesgos.
-- El resultado se cachea acá para no tener que gastar tokens cada
-- vez que entrás a la página.
--
-- Invalidación: cuando content_md cambia (regenerar, subir, etc),
-- review_md se setea a NULL — el director va a tener que regenerar
-- el análisis para la nueva versión del contenido.
-- ============================================================

ALTER TABLE public.phase_reports
  ADD COLUMN IF NOT EXISTS review_md text;
