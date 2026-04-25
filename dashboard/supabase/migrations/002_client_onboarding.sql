-- ============================================================
-- Migración 002: onboarding completo del cliente
-- ============================================================
-- Agrega una columna `onboarding jsonb` a `clients` para guardar
-- todo el dataset que se carga en el wizard de creación:
-- contrato (duración, fechas, archivo), fee variable por tramos,
-- kickoff (archivo, propuesta, audiencia, tono, competidores,
-- objetivos iniciales), branding (archivos), presupuestos
-- (marketing, producción).
--
-- Idempotente: usar IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS onboarding jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Estructura esperada del jsonb:
-- {
--   "contractDuration": "12",         -- "6"|"12"|"18"|"24"|"open"
--   "contractFile": "contrato_x.pdf",
--   "startDate": "2026-04-25",
--   "endDate":   "2027-04-25",
--   "feeVariableTiers": ["15% sobre revenue growth si supera 30%", "..."],
--   "kickoffFile": "kickoff_x.pdf",
--   "brandingFiles": ["logo.zip", "manual.pdf"],
--   "propuesta": "...",
--   "audiencia": "...",
--   "tono": "Cercano · Profesional",
--   "competidores": "Empresa A, Empresa B",
--   "objetivosIniciales": "Leads 180/mes · ROAS 5x · ...",
--   "budgetMarketing": 5000,
--   "budgetProduccion": 1500,
--   "devProjectType": "Chatbot"       -- solo si type = 'dev'
-- }
