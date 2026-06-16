-- 075_agency_credentials.sql
-- Bóveda de credenciales de la AGENCIA (D&C), separada de las bóvedas por
-- cliente (client_credentials). Vive a nivel sistema (/accesos), SOLO director.
--
-- Cifrado de SOBRE reutilizando el par de llaves del EQUIPO (vault_meta): cada
-- credencial se cifra con un DEK random (AES-256) envuelto SOLO con la pública
-- del equipo (no hay lado cliente). Se revela con la passphrase de equipo — la
-- misma que las bóvedas de cliente. No requiere setup nuevo: si el equipo ya
-- configuró su bóveda, esta funciona con la misma frase.

begin;

create table if not exists agency_credentials (
  id              uuid        primary key default gen_random_uuid(),
  label           text        not null,
  category        text        not null default 'otro'
    check (category in ('banco','fiscal','infra','herramientas','dominio','email','social','otro')),
  username        text,
  url             text,
  secret_ct       text        not null,
  secret_dek_team text        not null,
  notes_ct        text,
  notes_dek_team  text,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- RLS on, SIN policies: acceso exclusivamente vía service-role (endpoints
-- gateados a director). Mismo patrón que client_credentials / vault_meta.
alter table agency_credentials enable row level security;

drop trigger if exists trg_agency_credentials_touch on agency_credentials;
create trigger trg_agency_credentials_touch
  before update on agency_credentials
  for each row execute function touch_updated_at();

commit;
