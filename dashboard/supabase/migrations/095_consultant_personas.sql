-- 095: Gerentes conversacionales (piloto H2) — personas del consultor global
--
-- El widget global deja de ser UN solo chat: el mismo motor atiende como
--   general   → Gerente General (comportamiento actual, default)
--   finanzas  → Gerente de Finanzas (solo directores; solo-lectura: responde
--               con los números reales de tesorería/cierre/facturas cargados
--               en su contexto; JAMÁS ejecuta pagos)
--   marketing → Gerente de Marketing (dispatch restringido a la flota de
--               growth/contenido/paid-media)
--
-- Cada persona tiene SU conversación pinned por usuario. El briefing de la
-- mañana vive solo en 'general' (el Gerente General).
--
-- El CHECK de `scope` NO se toca (sigue 'global'|'client').

ALTER TABLE public.consultant_conversations
  ADD COLUMN IF NOT EXISTS persona text NOT NULL DEFAULT 'general'
    CHECK (persona IN ('general', 'finanzas', 'marketing'));

COMMENT ON COLUMN public.consultant_conversations.persona IS
  'Persona del widget global (mig 095): general (Gerente General, default) | finanzas | marketing. Las conversaciones existentes quedan en general por DEFAULT.';

-- Una sola pinned por (user, persona) — protege los maybeSingle()/limit=1
-- de los 5 consumidores (route, conversation, briefing-status, mark-read,
-- morning-briefing).
CREATE UNIQUE INDEX IF NOT EXISTS consultant_conversations_user_persona_pinned_uq
  ON public.consultant_conversations (user_id, persona)
  WHERE scope = 'global' AND is_pinned = true;
