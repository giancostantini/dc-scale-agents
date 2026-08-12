# SOP — Onboarding de cliente nuevo

Método: Manual Growth (fases 1-4 con gates). Cómo corre HOY en DC de punta a punta.

## Flujo

1. **Alta en dashboard** (director): wizard de cliente nuevo — datos de contacto, sector,
   fee + **moneda del fee** (impacta Finanzas/Tesorería), módulos, contrato.
2. **Kickoff**: el cliente completa la planilla Kickoff (obligatoria — F1.1) y sube
   kickoff + branding en PDF vía el wizard/portal. Quedan en el bucket `client-onboarding`.
3. **Scaffold automático**: `client-bootstrap` crea `vault/clients/<slug>/` desde templates.
   Si hay brandbook, `brandbook-processor` lo convierte en los 8 archivos de `brand/`.
4. **Fase 1 — Diagnóstico** (5-7 días): trabajo según `fase-1-diagnostico.md`. El reporte se
   genera con `/api/phases/generate` (usa kickoff + branding + metodología de la fase).
   **Gate:** el director revisa/edita/aprueba. El cliente ve solo lo aprobado.
5. **Fase 2 — Estrategia** (3-5 días): ídem con `fase-2-estrategia.md`. Requiere Fase 1
   aprobada (dependencia dura en el sistema).
6. **Fase 3 — Setup** (1-3 semanas): checklist técnico F3.4 + funnel F3.5 + sistema de
   contenido (ver `sop-content-production.md`). Configurar Looker Studio y linkearlo al
   portal del cliente.
7. **Fase 4 — Lanzamiento** (2-4 semanas): activación controlada, monitoreo diario,
   validación. Aprendizajes a `learning-log.md`.
8. **Fase 5 — Optimización** (continua): régimen normal — agentes + reporte mensual
   (`sop-reporting.md`).

## Gates que NUNCA se saltean

- Reportes de fase: aprueba el director antes de que el cliente los vea.
- No se lanza (F4) sin el checklist de setup completo (F3.4 + F3.5 verificados).
- Clientes DEV (`type='dev'`): no usan agentes de growth — se operan por sprints/tareas.

## Errores conocidos a evitar

- Fee sin moneda correcta → la proyección de Tesorería miente. Verificar `fee_currency`.
- Kickoff en formato no-PDF (zip/docx) → el generador de fases no lo puede adjuntar;
  pedirlo en PDF.
- Escribir info sensible interna en archivos "públicos" del vault del cliente — va a
  `learning-log.md` / `calls-log.md` (el Consultor-Cliente no los lee jamás).
