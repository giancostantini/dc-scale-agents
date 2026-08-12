-- 092: Stage 5 · Eventos formales (outbox + triggers) — sin bus externo
--
-- Patrón: OUTBOX. Los triggers solo INSERTAN una fila en `events` (cero
-- lógica, cero secretos en SQL). Un dispatcher (/api/events/dispatch, con
-- CRON_SECRET) procesa los pendientes y ejecuta el handler de cada tipo:
--
--   cliente.creado         → client-research (si el agente está activo en el registry)
--   cliente.activado       → draft del diagnóstico solo (si hay kickoff y no existe)
--   pieza.publicada        → re-sync del ciclo de contenido (process_instances)
--   metricas.actualizadas  → social-media-metrics (evaluación de piezas)
--   (fase.aprobada ya es push directo desde Stage 3 — no pasa por acá)
--
-- Cadencia: sweeper diario por GHA (events-dispatch.yml). Para REAL-TIME,
-- configurar UNA VEZ en Supabase Studio → Database → Webhooks:
--   tabla: events · evento: INSERT · tipo: HTTP Request
--   URL: https://<dashboard>/api/events/dispatch
--   headers: x-internal-secret: <CRON_SECRET> · method: POST
-- (el secret vive en el webhook, no en esta migración).

CREATE TABLE IF NOT EXISTS public.events (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  client_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'processed', 'skipped', 'error')
  ),
  -- Qué hizo (o por qué no hizo) el handler — trazabilidad legible.
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_events_pending
  ON public.events (status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_select_director ON public.events;
CREATE POLICY events_select_director ON public.events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

COMMENT ON TABLE public.events IS
  'Outbox de eventos (Stage 5). Los triggers insertan; /api/events/dispatch procesa. No editar a mano.';

-- ====== Función genérica de emisión (SECURITY DEFINER: los triggers ======
-- corren con el rol del que escribe — sin esto, un update de un usuario
-- authenticated fallaría contra el RLS de events y ROMPERÍA su write).
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
  END IF;
  RETURN NEW;
END;
$$;

-- ====== Triggers (idempotentes) ======
DROP TRIGGER IF EXISTS trg_event_cliente_creado ON public.clients;
CREATE TRIGGER trg_event_cliente_creado
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.emit_event();

DROP TRIGGER IF EXISTS trg_event_cliente_activado ON public.clients;
CREATE TRIGGER trg_event_cliente_activado
  AFTER UPDATE OF status ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.emit_event();

DROP TRIGGER IF EXISTS trg_event_pieza_publicada ON public.content_posts;
CREATE TRIGGER trg_event_pieza_publicada
  AFTER UPDATE OF status ON public.content_posts
  FOR EACH ROW EXECUTE FUNCTION public.emit_event();
