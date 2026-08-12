# Evals — sets dorados de la agencia (Stage 2c)

Tres rubrics versionadas que definen qué es "bueno" para los outputs core.
Un juez barato (Haiku) evalúa cada semana los outputs recientes contra la
rubric del set, usando como referencia **goldens = outputs reales que los
socios ya aprobaron** (aprobar en el dashboard ES curar el set dorado —
no hay fixtures congelados que mantener).

## Cómo funciona

1. **Rubrics** (estos archivos): criterios explícitos con pesos. Los editan
   los socios — cambiar una rubric cambia el estándar desde la corrida
   siguiente. Se revisan como código (PR).
2. **Goldens**: el runner extrae automáticamente los últimos outputs
   APROBADOS de cada tipo (fases approved, piezas scheduled/published) y
   se los muestra al juez como "así se ve lo que el estándar acepta".
3. **Juez**: `scripts/evals/index.js` — corre los lunes (workflow "Evals"),
   evalúa los outputs recientes de cada set y escribe score 0-100 +
   verdict + razones en `eval_runs`. Resumen a la campana del director.
4. **Evals verdes** (trigger de H2, doc 17): promedio del set ≥ 75 en 30
   días y sin fails repetidos. Query en la migración 094.

## Regla de oro para editar rubrics

Criterios OBSERVABLES, no gustos: "cita la fórmula del ROAS break-even"
se puede verificar; "que sea bueno" no. Si un criterio no se puede
verificar leyendo el output, no va en la rubric.

| Set | Qué evalúa | Rubric |
|---|---|---|
| fases | Reportes de fase del onboarding | `rubric-fases.md` |
| creative | Briefs/piezas de contenido IA | `rubric-creative.md` |
| trends | Reportes semanales de tendencias | `rubric-trends.md` |
