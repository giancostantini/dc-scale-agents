-- ============================================================
-- Migración 049: contactos del cliente (uno-a-muchos)
-- ============================================================
-- El cliente puede tener múltiples contactos de referencia
-- (CEO, marketing manager, brand manager, etc).  Hasta ahora
-- guardábamos solo uno en clients.contact_name/email/phone.
--
-- La nueva tabla client_contacts soporta N contactos por cliente.
-- El contacto del onboarding sigue vivo en clients.contact_* como
-- "contacto principal" — los demás se agregan acá.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  /** Rol del contacto en el cliente (ej "CEO", "Marketing Manager",
   *  "Brand Manager", "Operativo"). */
  role text,
  email text,
  phone text,
  /** Notas internas sobre el contacto. */
  notes text,
  /** Si true, es el contacto principal/primario.  Solo uno por cliente. */
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_contacts_client_idx
  ON public.client_contacts(client_id, created_at);

DROP TRIGGER IF EXISTS client_contacts_touch_updated
  ON public.client_contacts;
CREATE TRIGGER client_contacts_touch_updated
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

-- Director + team pueden leer todos los contactos.
-- Solo director puede crear/editar/borrar.
DROP POLICY IF EXISTS client_contacts_select ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_insert ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_update ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_delete ON public.client_contacts;

CREATE POLICY client_contacts_select ON public.client_contacts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('director','team')
    )
  );
CREATE POLICY client_contacts_insert ON public.client_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );
CREATE POLICY client_contacts_update ON public.client_contacts
  FOR UPDATE TO authenticated
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
CREATE POLICY client_contacts_delete ON public.client_contacts
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

COMMENT ON TABLE public.client_contacts IS
  'Contactos múltiples por cliente (CEO, marketing, brand, etc). El contacto principal del onboarding queda en clients.contact_*.';
