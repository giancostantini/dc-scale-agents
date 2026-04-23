-- ============================================================
-- D&C Scale — Supabase Realtime publication
-- Corré esto en el proyecto dc-scale (SQL Editor) una sola vez.
-- Sin esto, el dashboard no recibe INSERT/UPDATE de notifications
-- en tiempo real (useNotifications no tira toasts hasta refresh).
-- ============================================================

-- Agregar la tabla notifications a la publicación de Realtime.
-- Si ya está agregada, el ADD falla silenciosamente; ignorá el error.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then
  -- ya está agregada, ignorar
  null;
end $$;

-- Verificación: debería listar la tabla
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename = 'notifications';
