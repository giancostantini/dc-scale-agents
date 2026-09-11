-- ============================================================
-- 100 · Prospección de punta a punta:
--   campaña (ICP) → agente busca → lead con trazabilidad →
--   borrador IA → aprobación humana → envío
-- ============================================================
-- Hasta hoy las tres piezas estaban sueltas: `prospect_campaigns` era CRUD
-- puro (ningún código la leía para ejecutar nada) y sus 4 columnas de stats
-- eran ceros permanentes porque nadie las escribía; el agente `prospeccion`
-- cargaba leads sin saber de qué campaña venían; y los mensajes se
-- generaban sobre prospectos inventados en el front.
--
-- Idempotente. APLICAR A MANO EN EL SQL EDITOR **ANTES** DE DEPLOYAR.
--
-- ⚠ REGLA DURA: no agregar NUNCA a `public.leads` un CHECK cuya definición
-- mencione la palabra "source" — el DO-block de la migración 042 dropea
-- toda constraint que matchee ILIKE '%source%' si alguien la re-corre.
-- ============================================================

-- ====== 1. leads: de dónde vino, qué tan bueno es, y a quién escribirle ======
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS campaign_id uuid
    REFERENCES public.prospect_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS score integer,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS company_domain text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_role text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_source text;

-- Constraint NOMBRADA y sin la palabra prohibida en su definición.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_score_range_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_score_range_check
  CHECK (score IS NULL OR (score >= 1 AND score <= 5));

CREATE INDEX IF NOT EXISTS leads_campaign_id_idx
  ON public.leads(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_company_lower_idx
  ON public.leads(lower(company));

COMMENT ON COLUMN public.leads.campaign_id IS
  'Campaña de prospección que lo encontró. NULL = carga manual, landing, Calendly, o corrida del agente sin campañas activas.';
COMMENT ON COLUMN public.leads.score IS
  'Fit 1-5 según la guía de vault/agents/prospeccion/busquedas.md. Solo >=4 entra al pipeline.';
COMMENT ON COLUMN public.leads.source_url IS
  'URL del aviso/señal que originó el prospecto. Antes solo vivía embebida en note.';
COMMENT ON COLUMN public.leads.company_domain IS
  'Dominio de la empresa. Lo usa el enriquecimiento (Apollo q_organization_domains_list) y ayuda al dedup.';
COMMENT ON COLUMN public.leads.enrichment_source IS
  'Proveedor que completó contact_email/linkedin_url (ej. apollo). NULL = cargado a mano.';

-- ====== 2. prospect_campaigns: archivar de verdad + updated_at ======
ALTER TABLE public.prospect_campaigns
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- El CHECK de status nació inline en schema.sql (nombre autogenerado), así
-- que lo buscamos por definición en vez de adivinar cómo se llama.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.prospect_campaigns'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.prospect_campaigns DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.prospect_campaigns
  ADD CONSTRAINT prospect_campaigns_status_check
  CHECK (status IN ('active', 'paused', 'archived'));

-- Las 4 columnas de stats quedan MUERTAS. No se dropean a propósito: las
-- migraciones se aplican a mano y el deploy de Vercel puede llegar antes o
-- después; un front viejo leyendo una columna inexistente muestra NaN.
COMMENT ON COLUMN public.prospect_campaigns.leads_found IS
  'MUERTA desde mig 100 — las stats reales salen de la vista prospect_campaign_stats. No leer ni escribir.';
COMMENT ON COLUMN public.prospect_campaigns.contacted IS
  'MUERTA desde mig 100 — ver prospect_campaign_stats. No leer ni escribir.';
COMMENT ON COLUMN public.prospect_campaigns.replied IS
  'MUERTA desde mig 100 — ver prospect_campaign_stats. No leer ni escribir.';
COMMENT ON COLUMN public.prospect_campaigns.meetings IS
  'MUERTA desde mig 100 — ver prospect_campaign_stats. No leer ni escribir.';

-- ====== 3. outreach_messages: la cola de aprobación ======
-- Gate humano de la Gerencia de Ventas: la IA redacta (status='draft'), un
-- humano aprueba, y RECIÉN AHÍ sale. LinkedIn nunca se automatiza (ToS): se
-- copia a mano y se marca 'sent'.
CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id  uuid REFERENCES public.prospect_campaigns(id) ON DELETE SET NULL,
  channel      text NOT NULL CHECK (channel IN ('email', 'linkedin')),
  -- 0 = primer toque. Los follow_ups de la campaña vivirán acá.
  sequence     integer NOT NULL DEFAULT 0,
  subject      text,
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent', 'discarded', 'failed')),
  -- Snapshot del destinatario al momento del envío (el lead puede cambiar).
  to_email     text,
  model        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  approved_at  timestamptz,
  approved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at      timestamptz,
  replied_at   timestamptz,
  provider_message_id text,
  error        text
);

-- Idempotencia del cron de drafts: un mensaje por lead/canal/secuencia.
CREATE UNIQUE INDEX IF NOT EXISTS outreach_messages_lead_channel_seq_key
  ON public.outreach_messages(lead_id, channel, sequence);
CREATE INDEX IF NOT EXISTS outreach_messages_status_idx
  ON public.outreach_messages(status, created_at DESC);
CREATE INDEX IF NOT EXISTS outreach_messages_campaign_idx
  ON public.outreach_messages(campaign_id);
CREATE INDEX IF NOT EXISTS outreach_messages_lead_idx
  ON public.outreach_messages(lead_id);

ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;

-- Mismo gate que leads/prospect_campaigns: director, o team con
-- permissions.pipeline_access. El cliente NUNCA ve esto. El agente y los
-- crons escriben con service_role (bypassa RLS).
DROP POLICY IF EXISTS outreach_messages_select ON public.outreach_messages;
CREATE POLICY outreach_messages_select ON public.outreach_messages
  FOR SELECT TO authenticated USING (public.auth_pipeline_access());

DROP POLICY IF EXISTS outreach_messages_insert ON public.outreach_messages;
CREATE POLICY outreach_messages_insert ON public.outreach_messages
  FOR INSERT TO authenticated WITH CHECK (public.auth_pipeline_access());

DROP POLICY IF EXISTS outreach_messages_update ON public.outreach_messages;
CREATE POLICY outreach_messages_update ON public.outreach_messages
  FOR UPDATE TO authenticated
  USING (public.auth_pipeline_access())
  WITH CHECK (public.auth_pipeline_access());

DROP POLICY IF EXISTS outreach_messages_delete ON public.outreach_messages;
CREATE POLICY outreach_messages_delete ON public.outreach_messages
  FOR DELETE TO authenticated USING (public.auth_pipeline_access());

COMMENT ON TABLE public.outreach_messages IS
  'Cola de aprobación de outreach (mig 100). Draft por IA → aprobación humana → envío. Email sale por Resend; LinkedIn se copia a mano y se marca sent. NADA sale sin click humano.';
COMMENT ON COLUMN public.outreach_messages.status IS
  'draft (IA, sin revisar) → approved (humano OK) → sent | failed. discarded = el humano lo rechazó; el cron NO lo vuelve a generar.';

-- ====== 4. Stats reales de campaña (reemplazan las 4 columnas muertas) ======
-- security_invoker: respeta el RLS de leads/outreach_messages del que
-- consulta. Mismo patrón que la vista content_ai_approval (mig 089).
CREATE OR REPLACE VIEW public.prospect_campaign_stats
  WITH (security_invoker = true) AS
SELECT
  c.id                             AS campaign_id,
  COALESCE(l.leads_found, 0)::int  AS leads_found,
  COALESCE(l.meetings,    0)::int  AS meetings,
  COALESCE(m.contacted,   0)::int  AS contacted,
  COALESCE(m.replied,     0)::int  AS replied
FROM public.prospect_campaigns c
LEFT JOIN LATERAL (
  SELECT count(*)                               AS leads_found,
         count(*) FILTER (WHERE meeting_booked) AS meetings
    FROM public.leads
   WHERE campaign_id = c.id
) l ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE status = 'sent')        AS contacted,
         count(*) FILTER (WHERE replied_at IS NOT NULL) AS replied
    FROM public.outreach_messages
   WHERE campaign_id = c.id
) m ON true;

GRANT SELECT ON public.prospect_campaign_stats TO authenticated;

COMMENT ON VIEW public.prospect_campaign_stats IS
  'Stats de campaña computadas on-read: leads_found/meetings desde leads.campaign_id, contacted/replied desde outreach_messages. Reemplaza las 4 columnas de prospect_campaigns que nadie escribía.';

-- ====== 5. Refrescar el schema cache de PostgREST ======
-- Sin esto, los INSERT con las columnas nuevas fallan con PGRST204 hasta
-- que el cache expire solo.
NOTIFY pgrst, 'reload schema';
