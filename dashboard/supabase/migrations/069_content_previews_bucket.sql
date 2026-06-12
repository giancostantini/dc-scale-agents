-- ============================================================
-- 069 — Bucket PÚBLICO para previews de contenido
-- ------------------------------------------------------------
-- El bucket "client-onboarding" (mig 005) es privado — está bien
-- para contratos/branding (sensible), pero para las imágenes de
-- preview que el director sube por pieza necesitamos URLs públicos
-- que el browser pueda cargar con `<img src>` sin auth.
--
-- Creamos un bucket nuevo "content-post-previews" con public=true.
-- Policies:
--   - SELECT abierto (público) para que el `<img>` cargue desde
--     cualquier sesión.
--   - INSERT/UPDATE/DELETE solo authenticated (el director sube).
--
-- Path dentro del bucket: <clientId>/<timestamp>_<filename>.
-- ============================================================

-- Crear bucket si no existe.
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-post-previews', 'content-post-previews', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Limpiar policies viejas para que sea idempotente.
DROP POLICY IF EXISTS "content_previews_select" ON storage.objects;
DROP POLICY IF EXISTS "content_previews_insert" ON storage.objects;
DROP POLICY IF EXISTS "content_previews_update" ON storage.objects;
DROP POLICY IF EXISTS "content_previews_delete" ON storage.objects;

-- SELECT público — cualquiera con la URL puede leer la imagen.
-- Esto es lo que permite que el `<img src>` del browser funcione.
CREATE POLICY "content_previews_select"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'content-post-previews');

-- INSERT/UPDATE/DELETE solo authenticated.
CREATE POLICY "content_previews_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'content-post-previews');

CREATE POLICY "content_previews_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'content-post-previews');

CREATE POLICY "content_previews_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'content-post-previews');
