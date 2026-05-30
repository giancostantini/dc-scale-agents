-- ============================================================
-- Migración 040: gestión de documentos contables/financieros
-- ============================================================
-- Nueva tabla finanzas_documents para tracking de metadata de cada
-- archivo subido al sistema (facturas, recibos, contratos, balances,
-- liquidaciones, impuestos, etc).
--
-- Los archivos físicos viven en el bucket "finanzas-documents" de
-- Supabase Storage. Esta tabla guarda solo metadata + path del file
-- en el bucket.
--
-- Carpetas (folder enum):
--   - facturas_venta
--   - facturas_compra
--   - recibos
--   - contratos
--   - balances
--   - liquidaciones
--   - impuestos
--   - otros
-- ============================================================

-- ====== Bucket ======
INSERT INTO storage.buckets (id, name, public)
VALUES ('finanzas-documents', 'finanzas-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policies (solo director puede subir/borrar; equipo puede leer)
DROP POLICY IF EXISTS "finanzas_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "finanzas_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "finanzas_docs_delete" ON storage.objects;

CREATE POLICY "finanzas_docs_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'finanzas-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('director','team')
    )
  );

CREATE POLICY "finanzas_docs_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'finanzas-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'director'
    )
  );

CREATE POLICY "finanzas_docs_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'finanzas-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'director'
    )
  );

-- ====== Tabla de metadata ======
CREATE TABLE IF NOT EXISTS public.finanzas_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  folder text NOT NULL CHECK (folder IN (
    'facturas_venta','facturas_compra','recibos','contratos',
    'balances','liquidaciones','impuestos','otros'
  )),
  /** Tipo del documento (factura, recibo, contrato, balance, etc). */
  doc_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  mime_type text,
  /** Quién lo subió. */
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_by_name text,
  /** Notas opcionales del director. */
  notes text,
  /** Si el documento está marcado como pendiente de clasificar. */
  pending_review boolean NOT NULL DEFAULT false,
  /** Si el documento se compartió con alguien externo (link público). */
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finanzas_documents_folder_idx
  ON public.finanzas_documents(folder, created_at DESC);

CREATE INDEX IF NOT EXISTS finanzas_documents_created_at_idx
  ON public.finanzas_documents(created_at DESC);

DROP TRIGGER IF EXISTS finanzas_documents_touch_updated
  ON public.finanzas_documents;
CREATE TRIGGER finanzas_documents_touch_updated
  BEFORE UPDATE ON public.finanzas_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.finanzas_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finanzas_documents_select ON public.finanzas_documents;
DROP POLICY IF EXISTS finanzas_documents_insert ON public.finanzas_documents;
DROP POLICY IF EXISTS finanzas_documents_update ON public.finanzas_documents;
DROP POLICY IF EXISTS finanzas_documents_delete ON public.finanzas_documents;

CREATE POLICY finanzas_documents_select ON public.finanzas_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('director','team')
    )
  );

CREATE POLICY finanzas_documents_insert ON public.finanzas_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

CREATE POLICY finanzas_documents_update ON public.finanzas_documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

CREATE POLICY finanzas_documents_delete ON public.finanzas_documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

COMMENT ON TABLE public.finanzas_documents IS
  'Metadata de documentos financieros/contables. Archivos físicos en bucket "finanzas-documents".';
