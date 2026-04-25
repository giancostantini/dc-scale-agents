-- ============================================================
-- Migración 005: Bucket "client-onboarding" + policies
-- ============================================================
-- Bucket privado para guardar los archivos que se suben en el
-- wizard de cliente (kickoff PDF + branding ZIP/PDF/imágenes).
--
-- Como Supabase Storage usa el schema `storage`, no podemos
-- crear el bucket con CREATE BUCKET vía SQL plano — hay que
-- hacerlo desde la consola O via la API. Acá usamos la inserción
-- directa en `storage.buckets` (idempotente).
--
-- Después de correr este SQL, el bucket existe y los authenticated
-- users pueden INSERT (subir) y SELECT (leer) cualquier objeto.
-- DELETE/UPDATE quedan reservados a directores.
-- ============================================================

-- ====== Crear bucket si no existe ======
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-onboarding', 'client-onboarding', false)
ON CONFLICT (id) DO NOTHING;

-- ====== Policies en storage.objects para este bucket ======
-- Drop existentes para que sea idempotente.
DROP POLICY IF EXISTS "client_onboarding_select" ON storage.objects;
DROP POLICY IF EXISTS "client_onboarding_insert" ON storage.objects;
DROP POLICY IF EXISTS "client_onboarding_update" ON storage.objects;
DROP POLICY IF EXISTS "client_onboarding_delete" ON storage.objects;

-- SELECT: cualquier authenticated puede leer (necesario para descargar
-- los archivos desde la pantalla del cliente).
CREATE POLICY "client_onboarding_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'client-onboarding');

-- INSERT: cualquier authenticated puede subir.
CREATE POLICY "client_onboarding_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'client-onboarding');

-- UPDATE: solo directores (poco común — pisar archivos).
CREATE POLICY "client_onboarding_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'client-onboarding'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );

-- DELETE: solo directores.
CREATE POLICY "client_onboarding_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'client-onboarding'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );

-- ====== Verificación ======
-- SELECT id, name, public FROM storage.buckets WHERE id = 'client-onboarding';
-- SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'client_onboarding%';
