-- ============================================================
-- Migration 001 · Expandir prospect_campaigns con ICP detallado
-- Versión: Abril 2026
-- ============================================================
-- Agrega columnas estructuradas para filtros tipo Apollo.io.
-- Los campos existentes (demographics, client_type) se mantienen
-- por retro-compatibilidad — el código nuevo llena ambos.
-- ============================================================

-- ============ Geography ============
ALTER TABLE public.prospect_campaigns
  ADD COLUMN IF NOT EXISTS countries       jsonb DEFAULT '[]'::jsonb,  -- ["Uruguay", "Argentina"]
  ADD COLUMN IF NOT EXISTS regions         jsonb DEFAULT '[]'::jsonb,  -- ["Montevideo", "Buenos Aires"]
  ADD COLUMN IF NOT EXISTS cities          jsonb DEFAULT '[]'::jsonb;

-- ============ Target Company ============
ALTER TABLE public.prospect_campaigns
  ADD COLUMN IF NOT EXISTS industries          jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS company_size_min    integer,
  ADD COLUMN IF NOT EXISTS company_size_max    integer,
  ADD COLUMN IF NOT EXISTS revenue_range       text,
  ADD COLUMN IF NOT EXISTS buying_signals      jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS excluded_companies  jsonb DEFAULT '[]'::jsonb;

-- ============ Target Person ============
ALTER TABLE public.prospect_campaigns
  ADD COLUMN IF NOT EXISTS roles         jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS seniorities   jsonb DEFAULT '[]'::jsonb;

-- ============ Messaging Strategy ============
ALTER TABLE public.prospect_campaigns
  ADD COLUMN IF NOT EXISTS cta            text DEFAULT 'calendly'
    CHECK (cta IN ('calendly', 'landing', 'custom')),
  ADD COLUMN IF NOT EXISTS cta_url        text,
  ADD COLUMN IF NOT EXISTS message_tone   text DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS value_angle    text;

-- ============ Volume & Pacing ============
ALTER TABLE public.prospect_campaigns
  ADD COLUMN IF NOT EXISTS daily_volume   integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS follow_ups     integer DEFAULT 3;

-- ============ DONE ============
-- Verificar con:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'prospect_campaigns' ORDER BY ordinal_position;
