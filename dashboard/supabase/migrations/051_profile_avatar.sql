-- ============================================================
-- Migración 051: foto de perfil del usuario
-- ============================================================
-- Permite que cada usuario (director / team / cliente del portal)
-- suba una foto de perfil desde /perfil. La URL pública se guarda
-- en profiles.avatar_url y se usa en avatares en el resto del UI.
--
-- Storage:
--   · Bucket "avatars" público (lectura libre, escritura restringida
--     al dueño del path).
--   · Estructura del path: {user_id}/avatar.{ext}
--     → cada usuario solo puede leer/escribir su propio directorio.
--   · Límite 2 MB por archivo.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Bucket público (lectura cualquiera, escritura policy abajo).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies sobre storage.objects para el bucket "avatars".
-- Lectura pública (cualquiera puede ver una foto de perfil — esto es
-- lo que permite que el avatar aparezca en el UI sin pasar por una
-- signed URL en cada render).
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Solo el dueño del directorio (path[1] = auth.uid()::text) puede
-- escribir su avatar. Cubre INSERT, UPDATE y DELETE.
DROP POLICY IF EXISTS "avatars_owner_write" ON storage.objects;
CREATE POLICY "avatars_owner_write" ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
