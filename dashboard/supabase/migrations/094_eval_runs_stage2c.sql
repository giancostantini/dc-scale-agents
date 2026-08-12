-- 094: Stage 2c · Evals — scores de los 3 sets dorados (fases/creative/trends)
--
-- El juez (scripts/evals, Haiku) evalúa outputs RECIENTES del sistema
-- contra las rubrics versionadas en vault/agency/evals/ usando como
-- referencia GOLDENS = outputs reales ya aprobados por los socios (la
-- aprobación ES la curaduría). Cada evaluación deja una fila acá.
--
-- "Evals verdes" (trigger de H2, doc 17) = promedio del set ≥ 75 y sin
-- fails críticos en las últimas corridas. Consultable:
--   SELECT set, round(avg(score),1) AS avg, count(*) FILTER (WHERE verdict='fail') AS fails
--   FROM eval_runs WHERE created_at > now() - interval '30 days'
--   GROUP BY set;

CREATE TABLE IF NOT EXISTS public.eval_runs (
  id bigserial PRIMARY KEY,
  -- Agrupa las evaluaciones de una misma corrida del workflow.
  batch_id uuid NOT NULL,
  set text NOT NULL CHECK (set IN ('fases', 'creative', 'trends')),
  -- Referencia al ítem evaluado (ej. 'phase:wiztrip:diagnostico:v2',
  -- 'post:<uuid>', 'output:<id>').
  item_ref text NOT NULL,
  item_label text,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  verdict text NOT NULL CHECK (verdict IN ('pass', 'fail')),
  -- Razones del juez, legibles: ["cita ROAS break-even correctamente", ...]
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_runs_set_date ON public.eval_runs (set, created_at DESC);

ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eval_runs_select ON public.eval_runs;
CREATE POLICY eval_runs_select ON public.eval_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('director', 'team')
    )
  );

COMMENT ON TABLE public.eval_runs IS
  'Scores de evals (Stage 2c). Rubrics en vault/agency/evals/; juez semanal en scripts/evals.';
