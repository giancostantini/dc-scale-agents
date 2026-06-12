-- ============================================================
-- Migración 062: bóveda de credenciales de clientes
-- ============================================================
-- vault_meta: config global de la bóveda. Una sola fila (id=1). La passphrase
--   de equipo NUNCA se guarda; guardamos solo el `salt` (para derivar la llave)
--   y un `verifier` (ciphertext de un sentinel con la llave derivada) para
--   validar que la passphrase tipeada es correcta. RLS sin policies → solo
--   service-role accede (los endpoints derivan/validan server-side).
--
-- client_credentials: contraseñas de acceso a cuentas del cliente. `secret_*`
--   va cifrado (AES-256-GCM) con la llave DERIVADA de la passphrase → sin la
--   passphrase es ilegible aunque se filtre la DB. RLS sin policies → solo
--   service-role; el acceso por cliente lo enforce el endpoint
--   (requireClientAccess: director / team asignado).
-- ============================================================

-- Helper de updated_at (defensivo: no-op si ya existe).
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---- vault_meta ----
CREATE TABLE IF NOT EXISTS public.vault_meta (
  id smallint PRIMARY KEY DEFAULT 1,
  salt text NOT NULL,
  verifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vault_meta_singleton CHECK (id = 1)
);
ALTER TABLE public.vault_meta ENABLE ROW LEVEL SECURITY;
-- (sin policies: solo service-role)

DROP TRIGGER IF EXISTS vault_meta_touch_updated ON public.vault_meta;
CREATE TRIGGER vault_meta_touch_updated
  BEFORE UPDATE ON public.vault_meta
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- client_credentials ----
CREATE TABLE IF NOT EXISTS public.client_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'otro',
  username text,
  url text,
  secret_encrypted text NOT NULL,
  notes_encrypted text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_credentials_client_idx
  ON public.client_credentials(client_id);
ALTER TABLE public.client_credentials ENABLE ROW LEVEL SECURITY;
-- (sin policies: solo service-role; el endpoint valida acceso por cliente)

DROP TRIGGER IF EXISTS client_credentials_touch_updated ON public.client_credentials;
CREATE TRIGGER client_credentials_touch_updated
  BEFORE UPDATE ON public.client_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ====== Verificación ======
-- SELECT tablename FROM pg_tables
-- WHERE schemaname='public' AND tablename IN ('vault_meta','client_credentials');
