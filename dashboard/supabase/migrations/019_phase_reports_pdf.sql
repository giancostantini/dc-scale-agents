-- ============================================================
-- Migración 019: Soporte de PDF subido como reporte de fase
-- ============================================================
-- El director puede subir un PDF editado afuera. Ese PDF se
-- guarda canónico en Storage y se sirve tal cual cuando descarga
-- o cuando el cliente lo ve en su portal. El texto extraído viaja
-- en content_md (lo usan los agentes para regenerar con feedback,
-- comparar versiones, etc).
--
-- Columnas nuevas:
--   pdf_path  — path en el bucket client-onboarding donde vive
--               el PDF cargado (ej "wiztrip/phase-reports/diagnostico/v5.pdf").
--               null = no hay PDF subido, el download genera desde markdown.
--
-- Mismo campo en phase_report_history para preservar el archivo
-- al archivar versiones anteriores.
-- ============================================================

ALTER TABLE public.phase_reports
  ADD COLUMN IF NOT EXISTS pdf_path text;

ALTER TABLE public.phase_report_history
  ADD COLUMN IF NOT EXISTS pdf_path text;
