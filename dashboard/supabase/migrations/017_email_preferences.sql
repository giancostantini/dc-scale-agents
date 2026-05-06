-- ============================================================
-- Migración 017: Preferences de email (opt-out del digest semanal)
-- ============================================================
-- Cada user puede apagar el email semanal del portal sin afectar
-- los emails transaccionales (que son obligatorios — notif de
-- respuesta a solicitudes, aprobación de reportes, etc.).
--
-- Default: weekly_digest_enabled = true (opt-in por defecto).
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.weekly_digest_enabled IS
  'Si true, el cliente recibe el email semanal del portal cada lunes. Opt-in por defecto. No afecta emails transaccionales (respuestas a solicitudes, reportes aprobados, etc.).';

-- ====== Verificación ======
-- 1. SELECT email, role, weekly_digest_enabled FROM profiles WHERE role = 'client';
--    → todos los clientes deberían tener weekly_digest_enabled = true por default.
-- 2. UPDATE profiles SET weekly_digest_enabled = false WHERE email = 'cliente@test.com';
--    → siguiente disparo del workflow no debería mandar email a ese cliente.
