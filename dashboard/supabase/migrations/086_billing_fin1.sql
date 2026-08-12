-- 086: FIN-1 · Facturación recurrente + cobranzas (doc 16, F-B y F-C)
--
-- Tres piezas:
--   1. clients.billing_day — día del mes en que vence el fee del cliente.
--      NULL = vence el último día del mes (default conservador).
--   2. payments.reminder_count / last_reminder_at — estado de cobranza por
--      factura (cuántos avisos se draftearon y cuándo fue el último), para
--      que el cron no spamee: cadencia mínima de 4 días entre avisos.
--   3. invoice_runs — log de corridas del runner de facturación (cuándo se
--      draftearon las facturas de cada mes y cuántas). La idempotencia real
--      la da el PK de payments (client_id, month) — esto es trazabilidad.
--
-- El cron /api/cron/billing (workflow "Facturación y cobranzas") corre
-- diario: draftea las facturas del mes que falten (después del día 1 se
-- vuelve no-op) y detecta vencidas → notificación al director con borrador
-- de recordatorio. EMITIR la factura y ENVIAR el recordatorio sigue siendo
-- 100% humano (gate YELLOW — doc 12).

-- ====== 1. Día de vencimiento por cliente ======
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_day smallint
    CHECK (billing_day IS NULL OR (billing_day BETWEEN 1 AND 31));

COMMENT ON COLUMN public.clients.billing_day IS
  'Día del mes en que vence el pago del fee. NULL = último día del mes. Se edita en la ficha del cliente (datos fiscales).';

-- ====== 2. Estado de cobranza por factura ======
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

COMMENT ON COLUMN public.payments.reminder_count IS
  'Cuántos recordatorios de cobro drafteó el cron para esta factura. >=2 = escalado a socios.';
COMMENT ON COLUMN public.payments.last_reminder_at IS
  'Último recordatorio drafteado (cadencia mínima 4 días entre avisos).';

-- ====== 3. Log de corridas del runner ======
CREATE TABLE IF NOT EXISTS public.invoice_runs (
  id bigserial PRIMARY KEY,
  month text NOT NULL,                 -- YYYY-MM facturado
  drafted integer NOT NULL DEFAULT 0,  -- facturas nuevas creadas en esta corrida
  existing integer NOT NULL DEFAULT 0, -- ya existían (no-op)
  details jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{client_id, amount, currency}]
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_runs_month ON public.invoice_runs (month);

ALTER TABLE public.invoice_runs ENABLE ROW LEVEL SECURITY;

-- Solo el director la lee (info financiera); escribe solo el service role.
DROP POLICY IF EXISTS "invoice_runs_select_director" ON public.invoice_runs;
CREATE POLICY "invoice_runs_select_director"
  ON public.invoice_runs FOR SELECT
  TO authenticated
  USING (public.auth_role() = 'director');

COMMENT ON TABLE public.invoice_runs IS
  'Log del runner de facturación (FIN-1). Cada fila = una corrida que drafteó facturas.';
