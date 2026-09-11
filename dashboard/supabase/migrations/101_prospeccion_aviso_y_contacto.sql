-- ============================================================
-- 101 · El aviso adentro del prospecto (y el contacto sin Apollo)
-- ============================================================
-- Hasta hoy un prospecto era `name = "Buscan: Community Manager"` más un
-- `note` de 300 chars con la señal, el ángulo, la URL y la fecha, todo
-- concatenado. La card del kanban no podía mostrar qué se ofrece, desde
-- cuándo está publicado el llamado ni a dónde escribir, y cualquier query
-- sobre esos datos era imposible.
--
-- Y el contacto dependía de Apollo, que se descartó (cobertura floja en
-- Uruguay, nuestro mercado #1). Ahora sale del propio aviso y de la web
-- pública de la empresa — con la consecuencia honesta de que casi siempre
-- es contacto de EMPRESA (info@, teléfono), no del decisor.
--
-- Idempotente. APLICAR A MANO EN EL SQL EDITOR **ANTES** DE DEPLOYAR.
--
-- ⚠ REGLA DURA (heredada de la mig 100): no agregar NUNCA a `public.leads`
-- un CHECK cuya definición mencione la palabra "source" — el DO-block de la
-- migración 042 dropea toda constraint que matchee ILIKE '%source%' si
-- alguien la re-corre. Eso incluye cualquier CHECK sobre `source_url` y,
-- ojo, sobre `enrichment_source`: sus valores válidos se documentan con
-- COMMENT, jamás con CHECK.
-- ============================================================

-- ====== 1. El aviso ======
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS job_title         text,
  ADD COLUMN IF NOT EXISTS job_location      text,
  ADD COLUMN IF NOT EXISTS posted_at         date,
  ADD COLUMN IF NOT EXISTS posted_at_text    text,
  ADD COLUMN IF NOT EXISTS role_requirements text;

COMMENT ON COLUMN public.leads.job_title IS
  'Puesto que ofrece el aviso. Antes vivía embebido en name ("Buscan: X"); name se mantiene tal cual porque lo leen outreach-draft y generate-message para redactar.';
COMMENT ON COLUMN public.leads.job_location IS
  'Ciudad/país del aviso, como lo publica. NULL en leads manuales y de landing.';
COMMENT ON COLUMN public.leads.posted_at IS
  'Fecha de PUBLICACIÓN del aviso. Es date a propósito: el dato es día ("hace 5 días"), nunca hora — un timestamptz prometería precisión inexistente y correría la fecha un día en UTC-3. Distinto de created_at, que es cuándo lo encontramos nosotros. NULL cuando el aviso no la muestra: no se estima.';
COMMENT ON COLUMN public.leads.posted_at_text IS
  'Lo que decía el aviso, textual ("hace 5 días", "Publicado el 3/9/2026"). Se guarda siempre que haya algo, aunque posted_at quede NULL: distingue "sin dato" de "no lo pude parsear" y es la prueba de que la fecha no se inventó.';
COMMENT ON COLUMN public.leads.role_requirements IS
  'Qué se pretende en el puesto, 2-4 frases del aviso. Es el material del primer mensaje.';

-- ====== 2. El contacto (reemplaza al enriquecimiento por proveedor) ======
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_phone   text,
  ADD COLUMN IF NOT EXISTS company_email   text,
  ADD COLUMN IF NOT EXISTS company_website text;

COMMENT ON COLUMN public.leads.contact_phone IS
  'Teléfono de contacto (del aviso o de la web de la empresa). Formato libre: en Latam vienen con +598, con 0 inicial o sin separadores.';
COMMENT ON COLUMN public.leads.company_email IS
  'Casilla GENÉRICA de la empresa (info@, contacto@, ventas@, rrhh@). A propósito NO es contact_email: el cron de drafts elige canal email solo cuando contact_email tiene valor. Mandar un pitch frío a una casilla de CVs quema la marca en un mercado chico. Un humano decide si lo promueve a contact_email desde la ficha del pipeline.';
COMMENT ON COLUMN public.leads.company_website IS
  'Web institucional. Es de donde sale casi todo el contacto real ahora que no hay proveedor de enriquecimiento.';

-- ====== 3. Repropósito de las columnas de la era Apollo ======
-- No se dropean (mismo criterio que las 4 stats muertas de la mig 100: las
-- migraciones se aplican a mano y el deploy de Vercel puede llegar antes).
COMMENT ON COLUMN public.leads.enrichment_source IS
  'De dónde salió el contacto: aviso | web | manual. Sin CHECK A PROPÓSITO — el nombre de la columna contiene "source" y un CHECK que la mencione lo dropea el DO-block de la mig 042.';
COMMENT ON COLUMN public.leads.enriched_at IS
  'Cuándo se completó por última vez el bloque de contacto (el agente tras la búsqueda web, o un humano desde la ficha del pipeline).';
COMMENT ON COLUMN public.leads.company_domain IS
  'Dominio de la empresa (derivable de company_website). Ayuda al dedup. Ya no lo consume ningún proveedor externo: Apollo se descartó.';

-- ====== 4. Backfill del puesto que ya estaba embebido en name ======
-- Solo toca filas del agente. Idempotente: la condición job_title IS NULL
-- la hace no-op en la segunda corrida.
UPDATE public.leads
   SET job_title = NULLIF(btrim(substring(name from '^[Bb]uscan: *(.*)$')), '')
 WHERE job_title IS NULL
   AND name ~ '^[Bb]uscan:';

-- ====== 5. Índice: avisos más frescos primero ======
CREATE INDEX IF NOT EXISTS leads_posted_at_idx
  ON public.leads(posted_at DESC) WHERE posted_at IS NOT NULL;

-- ====== 6. Refrescar el schema cache de PostgREST ======
-- Sin esto, los INSERT con las columnas nuevas fallan con PGRST204 hasta que
-- el cache expire solo.
NOTIFY pgrst, 'reload schema';
