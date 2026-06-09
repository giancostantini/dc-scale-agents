-- ============================================================
-- Migración 054: PDF de factura + datos fiscales del cliente
-- ============================================================
-- Dos cambios relacionados a facturación:
--
-- 1) `payments.pdf_url`
--    Una URL pública/firmada al PDF de la factura subida por el
--    director (factura emitida fuera del sistema, ej por contador).
--    NULL = no hay PDF cargado (la factura existe lógicamente pero
--    no tenemos el comprobante adjunto).
--
-- 2) `clients.razon_social` + `clients.rut` (ya existía `tax_id`
--    pero como genérico; este campo lo dejamos para
--    compat con datos viejos).
--    Razón social y RUT explícitos para auto-rellenar en facturación
--    y mostrar en el perfil del cliente.
--
-- Storage bucket: reusamos el bucket existente `finanzas-attachments`
-- — el path es `invoices/{payment_id}.pdf` (1 PDF por payment).
-- ============================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS pdf_url text;

COMMENT ON COLUMN public.payments.pdf_url IS
  'URL al PDF de la factura subida manualmente (factura emitida fuera del sistema). NULL = sin PDF.';

-- Datos fiscales del cliente
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS razon_social text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS rut text;

COMMENT ON COLUMN public.clients.razon_social IS
  'Razón social legal del cliente (puede diferir del nombre comercial). Usada en facturación.';
COMMENT ON COLUMN public.clients.rut IS
  'RUT / NIT / Identificador fiscal del cliente. Reemplaza/complementa el campo tax_id genérico para mostrar explícitamente.';
