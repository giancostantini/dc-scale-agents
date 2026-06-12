-- 065_shared_credentials_vault.sql
-- Upgrade de la bóveda a cifrado de SOBRE (envelope) con doble destinatario.
--
-- Antes (migración 062): bóveda simétrica e interna — el equipo cifraba con su
-- passphrase y solo el equipo cargaba/leía.
-- Ahora: el CLIENTE deposita sus credenciales desde su portal (canal seguro en
-- vez de WhatsApp), aparecen automáticamente en la vista interna del equipo
-- (por cliente), y CADA lado descifra con SU propia passphrase:
--   • Equipo  → passphrase de equipo  → privada del equipo  → DEK → secreto
--   • Cliente → passphrase del cliente → privada del cliente → DEK → secreto
--
-- Cada credencial usa un DEK random (AES-256). El DEK se envuelve (RSA-OAEP)
-- con la pública del equipo y con la del cliente. El servidor NUNCA puede
-- descifrar sin una de las dos passphrases.
--
-- RESET: la bóveda actual solo tiene datos de prueba y el modelo viejo es
-- incompatible con el sobre. Vaciamos las credenciales y el meta del equipo
-- para rehacer el setup (que ahora también genera el par de llaves del equipo).

begin;

-- 1) Reset de los datos del modelo simétrico viejo.
truncate table client_credentials;
delete from vault_meta;

-- 2) vault_meta (equipo): sumamos el par de llaves RSA del equipo.
--    public_key en claro; private_key_encrypted cifrada con la passphrase de
--    equipo (AES-GCM sobre la llave derivada por scrypt).
alter table vault_meta
  add column if not exists public_key            text,
  add column if not exists private_key_encrypted text;

-- 3) Bóveda por cliente: una fila por cada cliente que activa su bóveda desde
--    el portal. Mismo esquema que el meta del equipo (salt + verifier + par de
--    llaves), pero la privada va cifrada con la passphrase DE ESE cliente.
create table if not exists client_vaults (
  client_id             text        primary key references clients(id) on delete cascade,
  salt                  text        not null,
  verifier              text        not null,
  public_key            text        not null,
  private_key_encrypted text        not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- RLS on, SIN policies: acceso exclusivamente vía service-role (endpoints
-- gateados), igual que vault_meta / client_credentials.
alter table client_vaults enable row level security;

drop trigger if exists trg_client_vaults_touch on client_vaults;
create trigger trg_client_vaults_touch
  before update on client_vaults
  for each row execute function touch_updated_at();

-- 4) client_credentials: del secreto simétrico al sobre dual-recipient.
--    - secret_ct      : AES-256-GCM(secreto, DEK)
--    - secret_dek_team : DEK envuelto con la pública del equipo   (siempre)
--    - secret_dek_client : DEK envuelto con la pública del cliente (si tiene bóveda)
--    - notes_*         : ídem para las notas (opcionales)
--    - added_by_role   : 'team' | 'client' (quién la cargó → tag en la UI)
alter table client_credentials
  drop column if exists secret_encrypted,
  drop column if exists notes_encrypted;

alter table client_credentials
  add column if not exists secret_ct         text not null,
  add column if not exists secret_dek_team   text not null,
  add column if not exists secret_dek_client text,
  add column if not exists notes_ct          text,
  add column if not exists notes_dek_team    text,
  add column if not exists notes_dek_client  text,
  add column if not exists added_by_role     text not null default 'team'
    check (added_by_role in ('team', 'client'));

commit;
