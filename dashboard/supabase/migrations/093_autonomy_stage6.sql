-- 093: Stage 6 · Autonomía selectiva — promover a GREEN solo lo ganado con datos
--
-- Principio (docs 12/17): un tipo de output arranca SIEMPRE gateado. Si
-- sostiene aprobación ≥ threshold durante N ciclos, el sistema lo marca
-- ELEGIBLE y avisa a los socios — pero la promoción a 'auto_sampled' es un
-- UPDATE que hace un humano, nunca el sistema. Rollback trivial: volver
-- mode a 'gated' (un flag).
--
--   gated        → todo pasa por revisión humana (default, siempre).
--   auto_sampled → corre solo, PERO un sample_rate % sigue yendo a
--                  revisión (spot-check). Si la métrica cae del umbral,
--                  llega alerta para bajar a gated.
--
-- Promover un tipo (decisión de socios, ejemplo):
--   UPDATE autonomy_settings
--   SET mode='auto_sampled', promoted_at=now(), promoted_by=auth.uid()
--   WHERE output_type='monthly_report';

CREATE TABLE IF NOT EXISTS public.autonomy_settings (
  output_type text PRIMARY KEY,
  mode text NOT NULL DEFAULT 'gated' CHECK (mode IN ('gated', 'auto_sampled')),
  -- % de outputs que SIGUEN yendo a revisión humana cuando está en auto.
  sample_rate integer NOT NULL DEFAULT 20 CHECK (sample_rate BETWEEN 0 AND 100),
  -- Umbral de elegibilidad: aprobación mínima sostenida y ciclos.
  threshold_pct integer NOT NULL DEFAULT 80,
  threshold_cycles integer NOT NULL DEFAULT 3,
  -- Lo setea el review semanal cuando el tipo cumple el umbral. Solo
  -- informa — no cambia el mode.
  eligible_since timestamptz,
  promoted_at timestamptz,
  promoted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.autonomy_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS autonomy_settings_director ON public.autonomy_settings;
CREATE POLICY autonomy_settings_director ON public.autonomy_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

-- Tipos gobernados hoy. TODOS gateados de arranque.
INSERT INTO public.autonomy_settings (output_type, notes) VALUES
  ('content_piece', 'Piezas de contenido IA (content_posts source=ai). Aprobación = scheduled/published.'),
  ('monthly_report', 'Reporte mensual F5.5. auto_sampled = auto-envío por mail al cliente con spot-check.'),
  ('phase_report', 'Reportes de fase del onboarding. La aprobación del director NO se promueve — esto solo mide churn de versiones.')
ON CONFLICT (output_type) DO NOTHING;

COMMENT ON TABLE public.autonomy_settings IS
  'Autonomía por tipo de output (Stage 6). El sistema marca elegibilidad; promover/degradar es humano. Rollback = mode=gated.';

-- ====== Evento reporte.drafteado ======
-- Extiende emit_event() (mig 092) con la rama de agent_outputs: cuando
-- reporting-performance registra un reporte MENSUAL, se emite el evento
-- cuyo handler decide gated (nada) vs auto_sampled (envío con spot-check).
CREATE OR REPLACE FUNCTION public.emit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'clients' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.events (type, client_id, payload)
      VALUES ('cliente.creado', NEW.id, jsonb_build_object('name', NEW.name, 'type', NEW.type));
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'active' THEN
      INSERT INTO public.events (type, client_id, payload)
      VALUES ('cliente.activado', NEW.id, jsonb_build_object('name', NEW.name, 'prev_status', OLD.status));
    END IF;
  ELSIF TG_TABLE_NAME = 'content_posts' THEN
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'published' THEN
      INSERT INTO public.events (type, client_id, payload)
      VALUES ('pieza.publicada', NEW.client_id, jsonb_build_object('post_id', NEW.id, 'network', NEW.network, 'date', NEW.date));
    END IF;
  ELSIF TG_TABLE_NAME = 'agent_outputs' THEN
    IF TG_OP = 'INSERT' AND NEW.agent = 'reporting-performance'
       AND (NEW.structured ->> 'mode') = 'monthly' THEN
      INSERT INTO public.events (type, client_id, payload)
      VALUES ('reporte.drafteado', NEW.client, jsonb_build_object('output_id', NEW.id, 'run_id', NEW.run_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_reporte_drafteado ON public.agent_outputs;
CREATE TRIGGER trg_event_reporte_drafteado
  AFTER INSERT ON public.agent_outputs
  FOR EACH ROW EXECUTE FUNCTION public.emit_event();
