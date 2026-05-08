-- ============================================================
-- Migración 018: Historial de versiones de reportes de fases
-- ============================================================
-- phase_reports guarda solo la versión actual (última generada
-- o aprobada). Cuando el director pide cambios y se regenera,
-- la versión anterior se sobreescribe — perdiendo el rastro
-- de qué cambió de v1 a v2 a v3.
--
-- Esta tabla archiva las versiones anteriores. Cada vez que el
-- endpoint generate va a sobreescribir un content_md existente,
-- snapshotea el viejo acá.
--
-- Diseño:
-- - phase_reports queda como está (current state, status, etc).
-- - phase_report_history acumula versiones 1..(N-1), todas con
--   contenido completo. La versión N vive en phase_reports.
-- - Para mostrar el diff entre dos versiones X e Y, el director
--   hace UNION entre history (versiones < N) y phase_reports (N).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.phase_report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN (
    'diagnostico', 'estrategia', 'setup', 'lanzamiento'
  )),
  version integer NOT NULL,
  content_md text NOT NULL,
  -- Feedback que generó ESTA versión (si aplica). Útil para que en
  -- el UI veas "v3 — generada con feedback: 'sacar la tabla X'".
  -- Para v1 (generación inicial) es NULL.
  feedback text,
  -- Timestamp de cuándo Claude terminó de generar esta versión.
  generated_at timestamptz NOT NULL,
  -- Cuándo fue archivada (cuándo apareció una versión más nueva).
  archived_at timestamptz NOT NULL DEFAULT now(),
  -- Metadata para auditoría: quién pidió la regeneración que
  -- obsoletó esta versión (puede ser null si fue automática).
  archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Cada versión se archiva una única vez por (cliente, fase).
  UNIQUE (client_id, phase, version)
);

CREATE INDEX IF NOT EXISTS phase_report_history_client_phase_idx
  ON public.phase_report_history(client_id, phase, version DESC);

-- ====== RLS ======
ALTER TABLE public.phase_report_history ENABLE ROW LEVEL SECURITY;

-- Lectura: todos los autenticados pueden ver el historial (igual
-- que phase_reports). En el portal cliente no se va a usar — lo
-- usa el dashboard director.
DROP POLICY IF EXISTS phase_report_history_select ON public.phase_report_history;
CREATE POLICY phase_report_history_select ON public.phase_report_history
  FOR SELECT TO authenticated USING (true);

-- INSERT solo desde service role (el endpoint generate). Sin
-- política de INSERT para usuarios normales — RLS lo bloquea.
-- DELETE: solo director, por si hay que limpiar historiales.
DROP POLICY IF EXISTS phase_report_history_delete ON public.phase_report_history;
CREATE POLICY phase_report_history_delete ON public.phase_report_history
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );
