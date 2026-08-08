# 01 — Executive Summary

**Fecha**: 2026-08-07 · **Base auditada**: `main` @ `ceb0aa0` · **Fuentes**: repo completo
(código verificado, no nombres de archivos), vault (117 .md), Manual Growth (PDF 25 págs
entregado durante la auditoría) · **Método**: evidencia con ruta/línea; lo no verificable se
marca; taxonomía estricta (agente ≠ skill ≠ workflow ≠ knowledge).

## El sistema en una frase
Una plataforma **dashboard-céntrica (Next.js+Supabase) con una flota de 15 agentes/jobs
ejecutados por GitHub Actions y 4 consultores conversacionales**, que cubre con solidez
onboarding, contenido (ideación), comunicación con el cliente y finanzas — y que quedó a
**un dato de cerrar sus loops**: las métricas de campañas (hoy carga manual).

## Estado por dimensión (honesto)

| Dimensión | Veredicto |
|---|---|
| Ejecución de agentes | Madura: 7 crons semanales/diarios + dispatch on-demand + fast-path; costos medidos al token |
| Human-in-the-loop | Mejor de lo esperado: gates reales en fases, contenido, campañas Meta y solicitudes |
| Conocimiento | **El punto más débil**: método de la agencia NO versionado (stubs); doc maestra desactualizada (describe piezas eliminadas) |
| Datos | Sólidos en record/logs/metering; DDL fragmentado en 3 fuentes; sin ingestion de métricas de ads |
| Obsidian | Clase **D**: file-store en git con paths convencionales; 0 links / 0 frontmatter; graph decorativo |
| Aprendizaje | Loop nuevo y bien diseñado (memoria v2 + destilador + 👍/👎); winners a media máquina por falta de métricas |
| Riesgos | Cero tests; idempotencia débil; sin alerting de crons; registries de agentes cuadruplicados |

## Los 3 movimientos que más valor liberan
1. **Versionar el Manual Growth** y conectarlo a los agentes de fases (Stage 1) — el método es
   el activo diferencial y hoy vive fuera del sistema.
2. **Conectar lectura de Meta Insights** (Stage 2) — un solo integrador cierra winners →
   briefs, social-media-metrics y el reporte mensual F5.5.
3. **Higiene de verdad interna** (Stage 0) — CLAUDE.md real + registry único + limpieza; barato
   y prerequisito de todo.

## Recomendación de arquitectura
**Opción D (híbrida)**: workflows deterministas + eventos para lo mecánico; consultores como
router de intención (ya tienen `run_agent`); gates humanos donde ya están (dashboard); **sin
manager-agents ni orquestador central** — al tamaño actual serían teatro. Detalle en doc 10;
camino en doc 14 (Stages 0-6). No se implementó nada: este paquete es diagnóstico + diseño.
