-- ============================================================
-- Migración 046: visible_menus por asignación
-- ============================================================
--
-- Hasta ahora client_assignments tenía solo (client_id, user_id,
-- role_in_client). El miembro del equipo asignado a un cliente veía
-- TODO el sidebar de ese cliente.
--
-- Ahora el director puede limitar qué menús del sidebar ve cada
-- miembro asignado al cliente — útil para clientes Growth Partner
-- que tienen un menú largo (Dashboard, Fases, Objetivos, Calendario,
-- Contenido, Tareas, Producciones, Analítica, Reporting, Biblioteca,
-- Solicitudes, Notas).
--
-- Convención:
--   · NULL  → ver TODOS los menús (default, backward-compatible).
--   · []    → no ver ningún menú (raro, pero válido).
--   · ['dashboard','contenido','tareas']  → solo esos.
--
-- Los directores siempre ven todo, ignoran este campo.
-- ============================================================

ALTER TABLE public.client_assignments
  ADD COLUMN IF NOT EXISTS visible_menus text[];

COMMENT ON COLUMN public.client_assignments.visible_menus IS
  'Lista de keys de menús del sidebar del cliente que este miembro puede ver. NULL = ver todos (default).';
