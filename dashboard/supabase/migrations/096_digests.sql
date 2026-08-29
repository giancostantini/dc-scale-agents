-- 096: Jerarquía de gerentes como pipeline de DIGESTS (datos, no charlas)
--
-- El modelo organizacional pedido: Gerente de PROYECTO (por cliente,
-- embebido) → Gerente de ÁREA (agrega su dominio) → GERENTE GENERAL (el
-- consultor global). Implementación fiel al principio #4 del sistema
-- ("coordinación por DATOS y eventos, no conversaciones agente→agente"):
-- cada nivel PREPARA su estado de antemano y el de arriba lo recibe
-- inyectado — mismo resultado que "le preguntó al gerente", determinista
-- y barato (el build no usa LLM).
--
--   level='cliente' → un digest por cliente (lo arma lib/digests.ts desde
--                     process_instances, runs, contenido, pagos, memoria)
--   level='area'    → un digest por gerencia (marketing | analitica |
--                     finanzas | operaciones | clientes | ventas), agrega
--                     los de cliente + fuentes propias del área
--
-- Refresh: diario al final de /api/cron/process-sync + on-demand vía
-- /api/cron/digest-sync. NO confundir con el weekly digest del portal
-- (portal-digest.ts — ese es un mail al cliente).

CREATE TABLE IF NOT EXISTS public.digests (
  id bigserial PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('cliente', 'area')),
  -- client_id, o slug de gerencia (marketing|analitica|finanzas|operaciones|clientes|ventas)
  key text NOT NULL,
  title text NOT NULL,
  content_md text NOT NULL,
  -- Agregados machine-readable (los digests de área los consumen sin re-query)
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, key)
);

ALTER TABLE public.digests ENABLE ROW LEVEL SECURITY;

-- Director: todo. Team: áreas SIN finanzas/ventas + solo SUS clientes
-- (mismo gating que ya rige en el consultor global y la persona finanzas).
-- Escritura: solo service role (sin policies de write).
DROP POLICY IF EXISTS digests_select ON public.digests;
CREATE POLICY digests_select ON public.digests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'director'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'team'
      )
      AND (
        (level = 'area' AND key NOT IN ('finanzas', 'ventas'))
        OR (
          level = 'cliente'
          AND EXISTS (
            SELECT 1 FROM public.client_assignments ca
            WHERE ca.user_id = auth.uid() AND ca.client_id = digests.key
          )
        )
      )
    )
  );

COMMENT ON TABLE public.digests IS
  'Pipeline jerárquico proyecto→área→GG (mig 096). Lo escribe lib/digests.runDigestSync (service role). NO es el weekly digest del portal.';
