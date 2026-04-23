-- ============================================================
-- D&C Scale — schema Día 2+ (Consultor inteligente)
-- Correr en el proyecto del dashboard, SQL Editor, una sola vez.
-- ============================================================

-- ------------------------------------------------------------
-- content_insights: agregados de performance por dimensión
-- Lo escribe scripts/insights-aggregator/ diario.
-- Lo lee el Consultor antes de enriquecer briefs de content-creator.
-- ------------------------------------------------------------
create table if not exists content_insights (
  id bigserial primary key,
  client text not null,
  dimension text not null check (dimension in ('hook','format','angle','publish_time')),
  value text not null,
  score numeric,
  sample_size int,
  computed_at timestamptz default now(),
  unique(client, dimension, value)
);
create index if not exists content_insights_client_score_idx
  on content_insights(client, score desc);

-- ------------------------------------------------------------
-- competitor_pieces: biblioteca de piezas de competencia que performaron bien
-- Lo escribe scripts/competitor-scanner/.
-- Lo lee el Consultor para inyectar `examples` en briefs.
-- ------------------------------------------------------------
create table if not exists competitor_pieces (
  id bigserial primary key,
  client text not null,
  competitor text not null,
  platform text,
  url text,
  piece_type text,
  hook text,
  format text,
  performance_estimate jsonb default '{}',
  captured_at timestamptz default now(),
  notes text,
  archived boolean default false
);
create index if not exists competitor_pieces_client_idx
  on competitor_pieces(client, captured_at desc)
  where archived = false;

-- ------------------------------------------------------------
-- consultant_memory: memoria progresiva del Consultor por cliente
-- Almacena preferencias, restricciones, decisiones pasadas y
-- aprendizajes que el Consultor detecta en conversación.
-- ------------------------------------------------------------
create table if not exists consultant_memory (
  id bigserial primary key,
  client text not null,
  kind text not null check (kind in ('preference','constraint','past_decision','learning')),
  content text not null,
  importance int default 3 check (importance between 1 and 5),
  created_at timestamptz default now(),
  expires_at timestamptz
);
create index if not exists consultant_memory_client_idx
  on consultant_memory(client, importance desc, created_at desc);

-- ------------------------------------------------------------
-- RLS (autenticados leen/escriben — sin multi-tenancy)
-- ------------------------------------------------------------
alter table content_insights enable row level security;
alter table competitor_pieces enable row level security;
alter table consultant_memory enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['content_insights','competitor_pieces','consultant_memory'] loop
    execute format('drop policy if exists "authenticated read %s" on %I', tbl, tbl);
    execute format('drop policy if exists "authenticated write %s" on %I', tbl, tbl);
    execute format(
      'create policy "authenticated read %s" on %I for select to authenticated using (true)',
      tbl, tbl
    );
    execute format(
      'create policy "authenticated write %s" on %I for all to authenticated using (true) with check (true)',
      tbl, tbl
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select table_name, row_security
from information_schema.tables
where table_schema = 'public'
  and table_name in ('content_insights','competitor_pieces','consultant_memory');
