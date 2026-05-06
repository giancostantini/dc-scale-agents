-- ============================================================
-- Migración 015: Comentarios sobre reportes de fase
-- ============================================================
-- Permite que el cliente deje feedback estructurado sobre un
-- phase_report aprobado, y que el equipo le responda en el mismo
-- hilo. Antes esto se hacía por WhatsApp y se perdía el registro.
--
-- Reglas:
--   - Cliente solo lee/escribe comentarios sobre SUS phase_reports
--     que estén en estado 'approved'.
--   - Director y team-asignado ven y escriben siempre.
--   - Trigger: cuando el cliente comenta, se notifica al team con
--     to_role='team' y client_id del cliente.
--   - Trigger: cuando alguien del team comenta sobre un report,
--     se notifica al cliente (to_role='client').
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL
    REFERENCES public.phase_reports(id) ON DELETE CASCADE,
  client_id text NOT NULL
    REFERENCES public.clients(id) ON DELETE CASCADE,
  -- Denormalizamos client_id para que las notif policies sean simples
  -- (sino habría que joinear phase_reports en cada query de notif).
  author_id uuid NOT NULL REFERENCES auth.users(id),
  author_role text NOT NULL
    CHECK (author_role IN ('director', 'team', 'client')),
  body text NOT NULL CHECK (length(body) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_comments_report_idx
  ON public.report_comments(report_id, created_at);
CREATE INDEX IF NOT EXISTS report_comments_client_idx
  ON public.report_comments(client_id, created_at DESC);

ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

-- ====== SELECT ======
DROP POLICY IF EXISTS report_comments_select ON public.report_comments;
CREATE POLICY report_comments_select ON public.report_comments
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (
      public.auth_role() = 'client'
      AND public.auth_client_id() = client_id
      AND EXISTS (
        SELECT 1 FROM public.phase_reports pr
        WHERE pr.id = report_id AND pr.status = 'approved'
      )
    )
  );

-- ====== INSERT ======
DROP POLICY IF EXISTS report_comments_insert ON public.report_comments;
CREATE POLICY report_comments_insert ON public.report_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND author_role = public.auth_role()
    AND (
      public.auth_role() = 'director'
      OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
      OR (
        public.auth_role() = 'client'
        AND public.auth_client_id() = client_id
        AND EXISTS (
          SELECT 1 FROM public.phase_reports pr
          WHERE pr.id = report_id
            AND pr.client_id = client_id
            AND pr.status = 'approved'
        )
      )
    )
  );

-- No hay UPDATE ni DELETE — los comentarios son inmutables. Esto
-- evita rewrites de historia. Si hay un comentario equivocado, se
-- agrega otro corrigiendo.

-- ====== Trigger: notificar al equipo cuando el cliente comenta,
-- y al cliente cuando el equipo comenta ======

CREATE OR REPLACE FUNCTION public.notify_on_report_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_phase text;
BEGIN
  SELECT phase INTO report_phase FROM public.phase_reports WHERE id = NEW.report_id;

  IF NEW.author_role = 'client' THEN
    -- Cliente comentó → avisar al team
    INSERT INTO public.notifications (
      client, agent, level, title, body, link, read, to_role
    ) VALUES (
      NEW.client_id,
      'portal',
      'info',
      'Comentario nuevo del cliente en ' || COALESCE(report_phase, 'reporte'),
      LEFT(NEW.body, 140),
      '/cliente/' || NEW.client_id || '/fases/' || COALESCE(report_phase, ''),
      false,
      'team'
    );
  ELSE
    -- Team o director comentó → avisar al cliente
    INSERT INTO public.notifications (
      client, agent, level, title, body, link, read, to_role
    ) VALUES (
      NEW.client_id,
      'portal',
      'info',
      'El equipo respondió en tu reporte de ' || COALESCE(report_phase, ''),
      LEFT(NEW.body, 140),
      '/portal',
      false,
      'client'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS report_comments_notify ON public.report_comments;
CREATE TRIGGER report_comments_notify
  AFTER INSERT ON public.report_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_report_comment();

-- ====== Verificación ======
-- 1. Como cliente:
--    INSERT INTO public.report_comments (report_id, client_id, author_id, author_role, body)
--    VALUES ('<report_id_approved>', '<su_client>', auth.uid(), 'client', 'Test');
--    → debe insertar OK, disparar notificación to_role='team'.
--
-- 2. Como cliente, intentar comentar en report no-approved:
--    → debe fallar por RLS (insert policy).
--
-- 3. SELECT como cliente sobre comentarios de otro cliente:
--    → debe devolver 0 filas (RLS filtra).
