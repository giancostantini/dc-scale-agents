-- ============================================================
-- D&C Scale — Row Level Security
-- Corré esto en el proyecto dc-scale (SQL Editor).
-- Modelo: "solo usuarios autenticados del equipo pueden leer/escribir".
-- No hay multi-tenancy entre clientes humanos — todos los que entran son
-- del equipo D&C Scale, así que 'authenticated' alcanza.
-- Las API routes siguen usando service_role, que bypassea RLS siempre.
-- ============================================================

-- Helper: enable RLS + create a permissive policy for authenticated users
-- para todas las tablas del schema public.

do $$
declare
  t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);

    -- Drop las policies viejas demasiado permisivas (las que tenían using (true))
    execute format('drop policy if exists "read %s" on public.%I', t.tablename, t.tablename);
    execute format('drop policy if exists "update %s" on public.%I', t.tablename, t.tablename);
    execute format('drop policy if exists "authenticated read %s" on public.%I', t.tablename, t.tablename);
    execute format('drop policy if exists "authenticated write %s" on public.%I', t.tablename, t.tablename);

    -- Una policy para SELECT (solo authenticated)
    execute format($p$
      create policy "authenticated read %s" on public.%I
      for select
      to authenticated
      using (true)
    $p$, t.tablename, t.tablename);

    -- Una policy para INSERT/UPDATE/DELETE (solo authenticated)
    execute format($p$
      create policy "authenticated write %s" on public.%I
      for all
      to authenticated
      using (true)
      with check (true)
    $p$, t.tablename, t.tablename);
  end loop;
end $$;

-- ============================================================
-- Verificación: debería devolver 0 filas (0 tablas sin RLS)
-- ============================================================
select schemaname, tablename
from pg_tables
where schemaname = 'public'
  and not rowsecurity;
