-- 098: Pago parcial de facturas
--
-- Permite registrar cuánto pagó la empresa de una factura sin marcarla
-- como pagada del todo. El estado "Pago parcial" es DERIVADO (como ya lo
-- es "vencida"): no se agrega un enum nuevo al CHECK de status.
--
--   - status sigue siendo 'pending' mientras 0 < paid_amount < importe.
--   - cuando paid_amount >= importe, la app la pasa a status='paid'.
--
-- El movimiento bancario de ingreso se sincroniza por el MONTO cobrado
-- (paid_amount), no por el fee completo, vía un marker por-factura en
-- cuenta_movimientos.notes ([auto-invoice:<clientId>:<month>]).

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2);

COMMENT ON COLUMN public.payments.paid_amount IS
  'Monto efectivamente cobrado de la factura. NULL = sin cobro registrado. Si 0 < paid_amount < importe → "Pago parcial" (derivado); si >= importe → status=paid.';
