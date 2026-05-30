-- ============================================================
-- Migración 044: clientes con cuenta bancaria default + estado
-- "cancelled" para facturas anuladas.
-- ============================================================
--
-- Cambios:
--   1. clients.default_cuenta_id (FK a cuentas_bancarias). Cuando
--      el director marca una factura del cliente como pagada,
--      automáticamente se crea un movimiento de entrada en esta
--      cuenta. Si no está configurada, no se crea el movimiento
--      (el director lo carga manual desde Cuentas Bancarias).
--   2. Permitir status='cancelled' en payments (factura anulada).
--      Se quita el constraint CHECK viejo si existía y se reescribe.
--
-- Idempotente: usa IF NOT EXISTS / DROP IF EXISTS.
-- ============================================================

-- Default cuenta bancaria del cliente
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS default_cuenta_id uuid
    REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_default_cuenta_idx
  ON public.clients(default_cuenta_id)
  WHERE default_cuenta_id IS NOT NULL;

COMMENT ON COLUMN public.clients.default_cuenta_id IS
  'Cuenta bancaria default donde se acreditan los pagos del cliente. Cuando se marca un payment como paid, se crea cuenta_movimiento ingreso automáticamente.';

-- Permitir status='cancelled' en payments
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.payments'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('paid','pending','late','cancelled'));
