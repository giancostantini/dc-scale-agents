-- 097: Personas del consultor — de 3 a 7 (un gerente por gerencia)
--
-- La mig 095 creó `persona` con CHECK inline de 3 valores (general,
-- finanzas, marketing — piloto H2). El organigrama pide un gerente
-- conversacional por gerencia: se suman analitica, operaciones, clientes
-- y ventas. El partial unique index de 095 (una pinned por user+persona)
-- no se toca: aguanta los 7 valores solo.
--
-- CORRER ANTES del deploy del código: si el código llega primero, el
-- primer mensaje a una persona nueva rebota con check-violation al crear
-- su conversación pinned.
--
-- (El nombre del constraint es el autogenerado por Postgres para el
-- CHECK inline de columna: tabla_columna_check.)

ALTER TABLE public.consultant_conversations
  DROP CONSTRAINT consultant_conversations_persona_check;

ALTER TABLE public.consultant_conversations
  ADD CONSTRAINT consultant_conversations_persona_check
  CHECK (persona IN ('general', 'finanzas', 'marketing', 'analitica', 'operaciones', 'clientes', 'ventas'));
