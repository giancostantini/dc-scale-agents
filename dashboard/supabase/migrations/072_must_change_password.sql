-- ============================================================
-- 072 — Forzar cambio de password en el primer login
-- ------------------------------------------------------------
-- Antes la creación de usuarios usaba un password fijo
-- "12345678" que el director comunicaba por canal aparte.
-- Ahora generamos un password único aleatorio y se lo mandamos
-- al cliente por mail, pero como nunca lo eligió él, queremos
-- forzarle el cambio en su primera entrada.
--
-- Flag must_change_password = TRUE bloquea acceso al portal
-- hasta que el usuario cambie su password desde /portal/cambiar-password.
-- Una vez cambiada, el endpoint lo setea a FALSE.
--
-- Default FALSE para no afectar a los usuarios viejos (team y
-- clientes que ya entraron). Solo se setea TRUE explícitamente
-- en `/api/team/invite` cuando se crea el acceso al portal de
-- un cliente nuevo.
-- ============================================================

ALTER TABLE profiles
ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN profiles.must_change_password IS
  'TRUE = el usuario tiene que cambiar su contraseña antes de seguir. Se setea cuando creamos el acceso al portal con password aleatoria y se limpia cuando el usuario la cambia desde /portal/cambiar-password.';

-- Index para que el middleware del portal pueda chequearlo rápido.
CREATE INDEX IF NOT EXISTS profiles_must_change_password_idx
ON profiles (must_change_password)
WHERE must_change_password = TRUE;
