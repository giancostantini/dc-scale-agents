-- 076_api_usage.sql
-- Registro de uso de la API de Claude por llamada, para el panel de gasto.
-- Lo escriben los agentes (scripts/lib) y el dashboard (lib/api-usage) tras
-- cada respuesta, leyendo `response.usage`. El costo se calcula al leer
-- (dashboard/lib/claude-pricing). Tabla de métricas: client_id es texto SIN FK
-- (un slug inválido no debe tumbar el registro; es fire-and-forget).
--
-- source: 'agent:<slug>'  (ej. 'agent:morning-briefing')
--       | 'dashboard:<route>' (ej. 'dashboard:consultant')

begin;

create table if not exists api_usage (
  id                    uuid        primary key default gen_random_uuid(),
  source                text        not null,
  client_id             text,
  model                 text        not null,
  input_tokens          integer     not null default 0,
  output_tokens         integer     not null default 0,
  cache_read_tokens     integer     not null default 0,
  cache_creation_tokens integer     not null default 0,
  created_at            timestamptz not null default now()
);

-- RLS on, sin policies: escritura/lectura solo vía service-role (el panel lee
-- por un endpoint gateado a director).
alter table api_usage enable row level security;

create index if not exists api_usage_created_idx on api_usage (created_at desc);
create index if not exists api_usage_client_idx  on api_usage (client_id);
create index if not exists api_usage_source_idx  on api_usage (source);

commit;
