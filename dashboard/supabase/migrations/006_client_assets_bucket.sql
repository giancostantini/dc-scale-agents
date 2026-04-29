-- ============================================================
-- Migración 006: Bucket "client-assets" + policies
-- ============================================================
-- Bucket privado para los assets visuales operativos de cada cliente —
-- los archivos que los agentes referencian para generar contenido:
-- logos, mascot/personaje (Wizzo en sus 8 expresiones × 3 estilos),
-- patrones gráficos (curva-W de WizTrip), e inspiraciones del brandbook.
--
-- Estructura esperada dentro del bucket:
--   client-assets/<clientId>/logo/{logotipo,isotipo,logotipo-tagline}.{svg,png}
--   client-assets/<clientId>/mascot/<mascotName>-<style>-<expression>.{png,svg}
--   client-assets/<clientId>/patterns/<patternName>.{svg,png}
--   client-assets/<clientId>/inspiration/<descriptiveName>.{png,jpg}
--
-- A diferencia del bucket "client-onboarding" (que es para archivos
-- contextuales de onboarding humano: kickoff, branding zip, contratos),
-- "client-assets" tiene un manifest indexado en
-- vault/clients/<clientId>/brand/assets.md que lista cada asset con su
-- categoría, uso recomendado y nombre canónico. Los agentes leen ese
-- manifest y referencian assets por canonical name (no inventan paths).
-- ============================================================

-- ====== Crear bucket si no existe ======
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-assets', 'client-assets', false)
ON CONFLICT (id) DO NOTHING;

-- ====== Policies en storage.objects para este bucket ======
DROP POLICY IF EXISTS "client_assets_select" ON storage.objects;
DROP POLICY IF EXISTS "client_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "client_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "client_assets_delete" ON storage.objects;

-- SELECT: cualquier authenticated puede leer (descargar assets desde la UI
-- de brandbook o desde el sync helper de Remotion).
CREATE POLICY "client_assets_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'client-assets');

-- INSERT: cualquier authenticated puede subir (cualquier miembro del equipo
-- puede agregar assets nuevos a un cliente).
CREATE POLICY "client_assets_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'client-assets');

-- UPDATE: cualquier authenticated puede actualizar (reemplazar un asset
-- existente — útil cuando el diseñador entrega versión nueva).
CREATE POLICY "client_assets_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'client-assets');

-- DELETE: solo directores (acción destructiva — sacar un asset del catálogo
-- puede romper futuras generaciones que lo referenciaban).
CREATE POLICY "client_assets_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'client-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
  );

-- ====== Verificación ======
-- SELECT id, name, public FROM storage.buckets WHERE id = 'client-assets';
-- SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'client_assets%';
