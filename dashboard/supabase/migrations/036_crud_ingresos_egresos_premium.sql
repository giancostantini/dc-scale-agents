-- ============================================================
-- Migración 036: campos premium para CRUD de ingresos y egresos
-- ============================================================
-- Agrega los campos que pidió el director en el rediseño premium
-- (Mercury/Ramp aesthetic + CRUD completo):
--
--  manual_revenues:
--    - payment_method  (efectivo / transferencia / tarjeta / cheque / mp)
--    - iva_pct         (default 22%, UY tasa básica)
--    - comprobante_url (URL a archivo subido al bucket)
--    - status          (paid / pending / cancelled)
--
--  expenses:
--    - provider_name   (nombre del proveedor, puede ser libre o FK futura)
--    - payment_method  (mismo set)
--    - iva_pct         (default 22%)
--    - invoice_url     (URL a factura PDF/imagen)
--    - status          (paid / pending / cancelled)
--
-- Bucket de Supabase Storage para los comprobantes: 'finanzas-attachments'
-- (lo crea el director desde Studio si todavía no existe).
-- ============================================================

-- ============ manual_revenues ============
ALTER TABLE public.manual_revenues
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL OR payment_method IN (
      'efectivo','transferencia','tarjeta','cheque','mp','crypto','otro'
    ));

ALTER TABLE public.manual_revenues
  ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2) NOT NULL DEFAULT 22.00
    CHECK (iva_pct >= 0 AND iva_pct <= 100);

ALTER TABLE public.manual_revenues
  ADD COLUMN IF NOT EXISTS comprobante_url text;

ALTER TABLE public.manual_revenues
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid','pending','cancelled'));

CREATE INDEX IF NOT EXISTS manual_revenues_status_idx
  ON public.manual_revenues(status);

COMMENT ON COLUMN public.manual_revenues.payment_method IS
  'Método de pago. NULL = sin especificar.';
COMMENT ON COLUMN public.manual_revenues.iva_pct IS
  'Tasa de IVA aplicada al ingreso (default 22% UY tasa básica).';
COMMENT ON COLUMN public.manual_revenues.comprobante_url IS
  'URL pública al comprobante adjunto en Storage.';
COMMENT ON COLUMN public.manual_revenues.status IS
  'Estado del ingreso: cobrado, pendiente o cancelado.';

-- ============ expenses ============
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS provider_name text;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL OR payment_method IN (
      'efectivo','transferencia','tarjeta','cheque','mp','crypto','otro'
    ));

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2) NOT NULL DEFAULT 22.00
    CHECK (iva_pct >= 0 AND iva_pct <= 100);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS invoice_url text;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid','pending','cancelled'));

CREATE INDEX IF NOT EXISTS expenses_status_idx
  ON public.expenses(status);
CREATE INDEX IF NOT EXISTS expenses_provider_idx
  ON public.expenses(provider_name) WHERE provider_name IS NOT NULL;

COMMENT ON COLUMN public.expenses.provider_name IS
  'Nombre del proveedor. Por ahora texto libre.';
COMMENT ON COLUMN public.expenses.payment_method IS
  'Método de pago. NULL = sin especificar.';
COMMENT ON COLUMN public.expenses.iva_pct IS
  'Tasa de IVA del egreso (default 22% UY).';
COMMENT ON COLUMN public.expenses.invoice_url IS
  'URL pública a la factura adjunta en Storage.';
COMMENT ON COLUMN public.expenses.status IS
  'Estado del egreso: pagado, pendiente o cancelado.';
