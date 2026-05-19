-- ============================================================
-- Migración 031: cal_events.owner_user_id
-- ============================================================
-- Objetivo:
--   Cada usuario que conecta su Outlook ve sus propios eventos. Para
--   eso necesitamos marcar quién es el dueño de cada evento — no solo
--   a qué cliente pertenece.
--
--   Cambios:
--   - Nueva columna owner_user_id: el usuario cuyo Outlook generó este
--     evento (vía sync).
--   - client_id pasa a NULLABLE: el equipo agenda reuniones internas
--     que no se asocian a ningún cliente; queremos que aparezcan en
--     su calendario igual.
--   - RLS endurecida: cada user ve los eventos donde es owner. El
--     director sigue viendo todo cross-client (filtro app-side).
-- ============================================================

ALTER TABLE public.cal_events
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Relajar client_id NOT NULL si lo era. Idempotente con DO block.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cal_events'
      AND column_name = 'client_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.cal_events ALTER COLUMN client_id DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cal_events_owner_user_idx
  ON public.cal_events(owner_user_id, date DESC)
  WHERE owner_user_id IS NOT NULL;

COMMENT ON COLUMN public.cal_events.owner_user_id IS
  'User cuyo Outlook generó este evento via sync. NULL para eventos manuales legacy. El calendario filtra por este campo (cada user ve solo lo suyo).';
COMMENT ON COLUMN public.cal_events.client_id IS
  'Cliente asociado al evento, opcional. Se setea (a) automáticamente cuando un team member sincroniza un evento y algún attendee matchea con clients.contact_email, o (b) cuando un cliente sincroniza (client_id = su propio client_id por defecto). NULL = evento personal sin asociación a cliente.';

-- ====== RLS adicional (heredada de schema base + capa nueva) ======
-- El schema actual de cal_events probablemente tiene RLS basada en
-- client_id. Acá agregamos: si owner_user_id está seteado, el dueño
-- también puede leer y borrar lo suyo. Esto es aditivo: NO removemos
-- las policies existentes.

DROP POLICY IF EXISTS cal_events_owner_select ON public.cal_events;
CREATE POLICY cal_events_owner_select ON public.cal_events
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS cal_events_owner_delete ON public.cal_events;
CREATE POLICY cal_events_owner_delete ON public.cal_events
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

-- ====== Verificación ======
-- SELECT column_name, is_nullable FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='cal_events'
--   AND column_name IN ('owner_user_id', 'client_id');
