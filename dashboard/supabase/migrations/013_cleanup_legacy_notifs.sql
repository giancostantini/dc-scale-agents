-- ============================================================
-- Migración 013: Limpiar notifs legacy (pre-fix de propagación de actor)
-- ============================================================
-- Antes de la 1.7, los agentes IA creaban notifs sin to_user_id —
-- quedaban con to_role='team' por el backfill heurístico de la 011 y
-- todos los del equipo + directores las veían. Como no podemos saber
-- retroactivamente quién las disparó (la info nunca se grabó en
-- agent_runs.metadata.triggered_by_user_id), la decisión es borrar
-- las viejas y arrancar limpio. Todas son de testing, no hay datos
-- de producción real.
--
-- Después de esta migración, los IDs de notifications arrancan en 1
-- de nuevo. Las notifs nuevas (post-fix) ya tendrán to_user_id o
-- to_role específico según el caso.
-- ============================================================

TRUNCATE TABLE public.notifications RESTART IDENTITY CASCADE;

-- ====== Verificación ======
-- SELECT COUNT(*) FROM public.notifications;  -- 0
