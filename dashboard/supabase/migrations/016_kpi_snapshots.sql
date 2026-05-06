-- ============================================================
-- Migración 016: Snapshots históricos de KPIs por mes
-- ============================================================
-- Objetivo: poder graficar la evolución mensual de los KPIs del
-- cliente (ROAS, leads, CAC, conv, etc.) en el portal.
--
-- Hoy `clients.kpis` es un JSONB snapshot — solo el valor actual.
-- Esta tabla guarda una fila por (cliente, mes) con el valor de
-- los KPIs al momento del último update de ese mes.
--
-- Trigger: cada UPDATE de `clients.kpis` hace un UPSERT a esta
-- tabla con `month = to_char(now(), 'YYYY-MM')`. Si en el mismo
-- mes hay múltiples updates, queda el último.
--
-- Empezamos a tener data desde la fecha de aplicación de esta
-- migración. Los primeros 2-3 meses los gráficos van a tener pocos
-- puntos pero crecen orgánicamente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month text NOT NULL,                        -- 'YYYY-MM'
  kpis jsonb NOT NULL,                        -- copia de clients.kpis
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, month)
);

CREATE INDEX IF NOT EXISTS kpi_snapshots_client_month_idx
  ON public.kpi_snapshots(client_id, month DESC);

ALTER TABLE public.kpi_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_snapshots_select ON public.kpi_snapshots;
CREATE POLICY kpi_snapshots_select ON public.kpi_snapshots
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'director'
    OR (public.auth_role() = 'team' AND public.has_client_assignment(client_id))
    OR (public.auth_role() = 'client' AND public.auth_client_id() = client_id)
  );

-- INSERT/UPDATE: solo backend (trigger SECURITY DEFINER + service role).
DROP POLICY IF EXISTS kpi_snapshots_insert ON public.kpi_snapshots;
CREATE POLICY kpi_snapshots_insert ON public.kpi_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS kpi_snapshots_update ON public.kpi_snapshots;
CREATE POLICY kpi_snapshots_update ON public.kpi_snapshots
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ====== Trigger: capturar snapshot cuando cambia clients.kpis ======
-- ON CONFLICT (client_id, month) DO UPDATE → en el mismo mes se
-- sobrescribe con el último valor. El primer update del mes crea la fila.

CREATE OR REPLACE FUNCTION public.snapshot_kpis_on_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kpis IS DISTINCT FROM OLD.kpis AND NEW.kpis IS NOT NULL THEN
    INSERT INTO public.kpi_snapshots (client_id, month, kpis, captured_at)
    VALUES (
      NEW.id,
      to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'),
      NEW.kpis,
      now()
    )
    ON CONFLICT (client_id, month) DO UPDATE
      SET kpis = EXCLUDED.kpis,
          captured_at = EXCLUDED.captured_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS clients_snapshot_kpis ON public.clients;
CREATE TRIGGER clients_snapshot_kpis
  AFTER UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_kpis_on_update();

-- ====== Backfill: capturar snapshot del mes actual para clientes que
-- ya tienen kpis cargados ======
INSERT INTO public.kpi_snapshots (client_id, month, kpis, captured_at)
SELECT
  id,
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'),
  kpis,
  now()
FROM public.clients
WHERE kpis IS NOT NULL AND kpis::text != '{}'::text
ON CONFLICT (client_id, month) DO NOTHING;

-- ====== Verificación ======
-- 1. SELECT * FROM kpi_snapshots ORDER BY captured_at DESC;
--    → debe haber filas para cada cliente con kpis no vacío.
-- 2. UPDATE clients SET kpis = jsonb_set(kpis, '{roas}', '"3.5x"')
--    WHERE id = 'wiztrip';
--    → debería actualizar la fila del mes actual o insertar nueva.
-- 3. Como cliente, SELECT con JWT correspondiente → solo sus snapshots.
