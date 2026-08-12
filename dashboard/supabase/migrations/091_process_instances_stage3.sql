-- 091: Stage 3 · process_instances — estado explícito de procesos multi-paso
--
-- NO es un motor de workflows genérico (regla del roadmap). Es UNA tabla
-- con el estado DERIVADO de los 3 procesos que ya existen en el sistema:
--
--   onboarding      → derivado de phase_reports (diagnóstico→…→lanzamiento)
--   content_cycle   → derivado de content_posts del mes (calendario→…→evaluado)
--   monthly_report  → derivado de agent_outputs + paid_media_daily (datos→draft→gate)
--
-- La deriva NUNCA la escribe un humano ni un agente directamente: la
-- computa lib/process-sync.ts desde las tablas fuente (cron diario + al
-- aprobar una fase). Si borrás una fila, el próximo sync la reconstruye —
-- cero riesgo de drift. "¿En qué paso está el cliente X?" = un SELECT.

CREATE TABLE IF NOT EXISTS public.process_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process text NOT NULL CHECK (process IN ('onboarding', 'content_cycle', 'monthly_report')),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- YYYY-MM para procesos mensuales; NULL para onboarding (es único por cliente).
  period text,
  -- Paso actual (slug legible: 'diagnostico', 'aprobacion_piezas', …).
  step text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waiting_gate', 'done')),
  -- Qué gate humano bloquea el avance (NULL = ninguno, avanza solo).
  gate text,
  -- Historial de pasos completados: [{step, at}].
  steps_done jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Único por proceso+cliente+período (period NULL cuenta como '').
CREATE UNIQUE INDEX IF NOT EXISTS idx_process_instances_unique
  ON public.process_instances (process, client_id, COALESCE(period, ''));

CREATE INDEX IF NOT EXISTS idx_process_instances_client
  ON public.process_instances (client_id, process);

ALTER TABLE public.process_instances ENABLE ROW LEVEL SECURITY;

-- Lee director + team (el equipo necesita saber en qué paso está cada
-- cliente). Escribe solo el service role (el sync).
DROP POLICY IF EXISTS process_instances_select ON public.process_instances;
CREATE POLICY process_instances_select ON public.process_instances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('director', 'team')
    )
  );

COMMENT ON TABLE public.process_instances IS
  'Estado derivado de procesos multi-paso (Stage 3). Lo computa process-sync desde las tablas fuente — no editar a mano.';
