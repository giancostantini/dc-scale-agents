-- 085: Unificación de memoria (Stage 1c) — consultant_memory legacy → v2
--
-- Contexto: la migración 022 creó consultant_memory_v2 y backfilleó la tabla
-- vieja, PERO el Consultor-Agencia (/api/consultant) siguió leyendo y
-- escribiendo la v1 hasta ahora. Resultado: las memorias que guardó desde
-- entonces eran invisibles para el resto de la flota (que lee v2 vía
-- client-memory.js / distill-learnings / morning-briefing).
--
-- Este fix tiene dos partes:
--   CÓDIGO (mismo PR): /api/consultant pasa a leer/escribir v2.
--   SQL (este archivo): barrido final de filas v1 que faltan en v2 +
--   rename de la v1 a consultant_memory_legacy para que ningún código
--   viejo pueda volver a escribirle sin que se note.
--
-- ⚠ ORDEN: correr DESPUÉS de que el deploy con el switch a v2 esté live en
-- Vercel (merge → esperar el deploy → correr esto). Si se corre antes, el
-- save_memory del consultor falla hasta que el deploy salga.
--
-- Idempotente: el barrido no duplica (dedup por client+kind+content+created_at)
-- y el rename se saltea si la tabla ya no existe.

-- ====== 1. Barrido final v1 → v2 (mismo criterio que la 022) ======
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consultant_memory'
  ) THEN
    INSERT INTO public.consultant_memory_v2 (
      scope_type, client_id, kind, content, importance, expires_at, created_at
    )
    SELECT
      'client',
      m.client,
      m.kind,
      m.content,
      COALESCE(m.importance, 3),
      m.expires_at,
      m.created_at
    FROM public.consultant_memory m
    WHERE EXISTS (SELECT 1 FROM public.clients c WHERE c.id = m.client)
      AND NOT EXISTS (
        SELECT 1 FROM public.consultant_memory_v2 v
        WHERE v.scope_type = 'client'
          AND v.client_id = m.client
          AND v.kind = m.kind
          AND v.content = m.content
          AND v.created_at = m.created_at
      );
  END IF;
END $$;

-- ====== 2. Retirar la v1 del camino (rename, NO drop — backup barato) ======
-- Si dentro de un mes nadie la extrañó, se puede dropear a mano:
--   DROP TABLE public.consultant_memory_legacy;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consultant_memory'
  ) THEN
    ALTER TABLE public.consultant_memory RENAME TO consultant_memory_legacy;
    COMMENT ON TABLE public.consultant_memory_legacy IS
      'Memoria v1 retirada (mig 085, Stage 1c). La fuente única es consultant_memory_v2. Dropear cuando pase un mes sin reclamos.';
  END IF;
END $$;

-- ====== Verificación ======
-- 1. SELECT count(*) FROM consultant_memory_v2 WHERE scope_type='client';
--    → debe ser >= que el count de la legacy.
-- 2. SELECT * FROM information_schema.tables WHERE table_name='consultant_memory';
--    → 0 filas (ya no existe con ese nombre).
-- 3. En el dashboard: chatear con el Consultor de un cliente y decirle una
--    preferencia → debe aparecer en consultant_memory_v2 (scope_type='client').
