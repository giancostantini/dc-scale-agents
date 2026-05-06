-- ============================================================
-- Migración 006: Reportes de fases del onboarding
-- ============================================================
-- Cada cliente atraviesa 5 fases (kickoff/diagnostico/estrategia/
-- setup/lanzamiento). Cada una de las últimas 4 produce un reporte
-- generado automáticamente por Claude leyendo el kickoff + reportes
-- anteriores aprobados.
--
-- Flujo de aprobación encadenado:
--   1) Cliente creado con kickoff cargado → status='generating' en
--      diagnostico.
--   2) Generación termina → status='draft'.
--   3) Director:
--        a) "Confirmar"          → status='approved', dispara la
--                                    siguiente fase como 'generating'.
--        b) "Proponer cambios"   → status='changes_requested' con
--                                    feedback; al regenerar pasa a
--                                    'generating' y luego 'draft' v+1.
--   4) Repite hasta lanzamiento.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.phase_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN (
    'diagnostico', 'estrategia', 'setup', 'lanzamiento'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- precursor aprobado, listo para generar
    'generating',        -- Claude trabajando
    'draft',             -- generado, esperando review
    'changes_requested', -- director pidió cambios; va a regenerarse
    'approved'           -- confirmado, locked, dispara la siguiente
  )),
  content_md text,              -- markdown del reporte
  feedback text,                -- feedback del director si pidió cambios
  version integer NOT NULL DEFAULT 1,
  model text,                   -- ej "claude-opus-4-7"
  usage jsonb,                  -- input/output tokens, cache hits
  generated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Una fase por cliente (al regenerar bumpeamos version, no creamos
  -- una fila nueva — el historial vive en una tabla separada si hace
  -- falta).
  UNIQUE (client_id, phase)
);

CREATE INDEX IF NOT EXISTS phase_reports_client_idx
  ON public.phase_reports(client_id);
CREATE INDEX IF NOT EXISTS phase_reports_status_idx
  ON public.phase_reports(status);

-- updated_at trigger (idempotente)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS phase_reports_touch_updated ON public.phase_reports;
CREATE TRIGGER phase_reports_touch_updated
  BEFORE UPDATE ON public.phase_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ====== RLS ======
ALTER TABLE public.phase_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS phase_reports_select ON public.phase_reports;
CREATE POLICY phase_reports_select ON public.phase_reports
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE solo el director (las generaciones se hacen
-- server-side con service role key, pero igual gateamos por si acaso).
DROP POLICY IF EXISTS phase_reports_insert ON public.phase_reports;
CREATE POLICY phase_reports_insert ON public.phase_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );

DROP POLICY IF EXISTS phase_reports_update ON public.phase_reports;
CREATE POLICY phase_reports_update ON public.phase_reports
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );

DROP POLICY IF EXISTS phase_reports_delete ON public.phase_reports;
CREATE POLICY phase_reports_delete ON public.phase_reports
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );
