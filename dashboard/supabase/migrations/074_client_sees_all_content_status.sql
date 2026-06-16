-- ============================================================
-- 074 — Cliente ve TODOS los status de content_posts
-- ------------------------------------------------------------
-- Hasta la migración 007 la policy de SELECT de content_posts
-- restringía al cliente a ver solo status='published'. La idea era:
-- el cliente ve solo lo publicado, los borradores e ideas son
-- internas del equipo.
--
-- El director pidió cambiar el modelo: en /portal/agenda el cliente
-- ahora ve la AGENDA completa de publicaciones (borradores +
-- aprobadas + publicadas) y puede dejar recomendaciones SOBRE los
-- borradores. Esto le permite intervenir antes de que se programen,
-- no después de publicadas.
--
-- Cambio: dropeamos la condición AND status = 'published' de la
-- policy. El cliente ahora ve TODOS los content_posts de su
-- client_id, en cualquier status.
--
-- Lo que NO cambia:
--   · El cliente sigue sin poder INSERT/UPDATE/DELETE en
--     content_posts (esas policies no se tocan).
--   · El cliente sigue sin ver content_posts de OTROS clientes (la
--     condición auth_client_id() = client_id sigue activa).
-- ============================================================

DROP POLICY IF EXISTS content_posts_select ON public.content_posts;
CREATE POLICY content_posts_select ON public.content_posts
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (
      public.auth_role() = 'client'
      AND public.auth_client_id() = client_id
      -- ANTES: AND status = 'published'  ← bloqueaba borradores.
      -- Ahora el cliente ve toda la agenda; el chip de status del
      -- ContentFeedPreview le indica visualmente cada estado.
    )
  );

COMMENT ON POLICY content_posts_select ON public.content_posts IS
  'Director ve todo; team ve los clientes asignados; cliente ve TODA su agenda (todos los status). Ver migración 074 para el cambio del filtro.';
