# Metodología Growth D&C — índice

Fuente: **Manual Growth** (PDF interno, convertido a markdown 2026-08-11, Stage 1 del roadmap).
Esto es el MÉTODO OFICIAL de la agencia versionado en git. Una página por fase + SOPs + checklists.

## Quién consume esto

- **`/api/phases/generate`** (dashboard): inyecta la página de la fase correspondiente al prompt
  cuando genera un reporte de fase. Editar estos archivos **cambia lo que citan los reportes**.
- **Humanos** (Gian, Fede, Lucía, Octavio): referencia operativa de cómo se trabaja cada fase.
- Futuro (Stage 3+): workflows estructurados leerán los SOPs como fuente de pasos.

## Estructura

| Archivo | Contenido |
|---|---|
| [Fase 1 — Diagnóstico](fase-1-diagnostico.md) | 5-7 días hábiles → Growth Diagnosis Report |
| [Fase 2 — Estrategia](fase-2-estrategia.md) | 3-5 días hábiles → Growth Strategy Plan |
| [Fase 3 — Setup](fase-3-setup.md) | 1-3 semanas → infraestructura completa lista |
| [Fase 4 — Lanzamiento](fase-4-lanzamiento.md) | 2-4 semanas → validación con datos reales |
| [Fase 5 — Optimización](fase-5-optimizacion.md) | continua → sistema predecible y escalable |
| [Checklists](checklists.md) | Los 4 checklists de funnel (F1.4, F3.5, F4.4, F5.3) |
| [SOP Producción de contenido](sop-content-production.md) | Sistema mensual (método + cómo corre hoy en DC) |
| [SOP Onboarding](sop-onboarding.md) | Alta de cliente → fases con gates → optimización continua |
| [SOP Reporting](sop-reporting.md) | Reporte mensual + seguimiento continuo |

Volver: [Gerencia de Clientes](../../empresa/Gerencia%20de%20Clientes.md) · Estándar de calidad: [Evals](../evals/Estandar%20de%20Calidad.md) · [Data ownership](../data-ownership.md)

## Reglas de edición

1. El texto del método refleja el Manual. Si el manual cambia, se edita acá (git = historial de versiones).
2. Donde la operación real de DC difiere del manual (herramientas, producción humana vs IA),
   va una **"Nota de implementación DC"** — no se reescribe el método, se anota la adaptación.
3. Las páginas de fase deben mantenerse compactas (se inyectan a prompts — tokens cuentan).
