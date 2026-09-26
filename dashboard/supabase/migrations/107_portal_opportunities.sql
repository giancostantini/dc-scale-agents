-- ================================================================
-- 107 · Oportunidades del asesor en el portal del cliente
-- ================================================================
-- Un job semanal (/api/cron/portal-opportunities) mira los datos reales del
-- cliente (paquetes y ofertas, campañas de Meta, competencia, tendencias del
-- sector) y deja 0–3 oportunidades concretas. El cliente las ve en el
-- inicio del portal como "Sugerencia del asesor IA".
--
-- Decisión de Gian (2026-09-26): se publican directo al cliente, sin
-- revisión previa — excepción explícita al gate humano. Por eso:
--   - el equipo recibe copia de cada tanda en la campana;
--   - el interruptor es autonomy_settings.output_type = 'portal_opportunity':
--     mode 'auto_sampled' = se publican · 'gated' = quedan solo internas
--     (status 'interna', el cliente no las ve). Rollback = UPDATE a 'gated'.
--
-- Aplicar a mano en el SQL editor de Supabase. Idempotente.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.portal_opportunities (
  id bigserial PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('paquete', 'campana', 'tendencia', 'competencia', 'contenido')),
  title text NOT NULL,
  body text NOT NULL,
  -- Los datos en los que se apoya (lo que el modelo citó), para auditar.
  basis jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- activa = visible al cliente · interna = solo equipo (modo gated)
  -- descartada = la descartó el cliente o el equipo · vencida = la reemplazó otra tanda
  status text NOT NULL DEFAULT 'activa'
    CHECK (status IN ('activa', 'interna', 'descartada', 'vencida')),
  dismissed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_portal_opps_client
  ON public.portal_opportunities (client_id, status, created_at DESC);

ALTER TABLE public.portal_opportunities ENABLE ROW LEVEL SECURITY;

-- Lectura: director/team todo; el cliente solo las activas de su empresa.
DROP POLICY IF EXISTS portal_opportunities_select ON public.portal_opportunities;
CREATE POLICY portal_opportunities_select ON public.portal_opportunities
  FOR SELECT TO authenticated
  USING (
    public.auth_role() IN ('director', 'team')
    OR (
      public.auth_role() = 'client'
      AND client_id = public.auth_client_id()
      AND status = 'activa'
    )
  );
-- Escritura: solo service role (cron + endpoint de descartar).

INSERT INTO public.autonomy_settings (output_type, mode, sample_rate, notes, promoted_at)
VALUES (
  'portal_opportunity',
  'auto_sampled',
  0,
  'Oportunidades del asesor en el portal. Publicación directa al cliente por decisión de Gian (2026-09-26). gated = quedan solo internas.',
  now()
)
ON CONFLICT (output_type) DO NOTHING;

COMMENT ON TABLE public.portal_opportunities IS
  'Oportunidades que el asesor IA muestra en el portal (job semanal /api/cron/portal-opportunities). Interruptor: autonomy_settings portal_opportunity.';
