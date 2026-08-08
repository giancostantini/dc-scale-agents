# 12 — Human-in-the-loop (clasificación de acciones)

> 🟢 GREEN = autónomo · 🟡 YELLOW = IA prepara, humano aprueba · 🔴 RED = solo humanos.
> "(hoy)" indica cómo está implementado en el sistema actual; "(target)" el estado propuesto.

## 🟢 GREEN — puede ejecutarse autónomamente

| Acción | Estado |
|---|---|
| Investigar tendencias del nicho + mail informativo semanal | hoy (sector-trends, con fuentes citadas) |
| Destilar aprendizajes a memoria (cap 5/semana, dedup) | hoy (distill-learnings) |
| Agregar insights de performance (determinístico) | hoy (insights-aggregator) |
| Escanear stock/talles y reportar faltantes | hoy (stock-web) |
| Sincronizar banco de anuncios curado | hoy (competitor-scanner; el input es humano) |
| Generar briefings/resúmenes internos on-demand | hoy |
| Responder chat del portal con contexto (sin acciones) | hoy (consultor cliente, no ejecuta nada por diseño) |
| Renovar suscripciones técnicas (Outlook) | hoy |
| Notificaciones/bell y digest informativo | hoy |
| Research de cliente a learning-log | hoy |

## 🟡 YELLOW — IA prepara, humano aprueba

| Acción | Gate | Estado |
|---|---|---|
| Reportes de fase (Diagnóstico/Estrategia) | Director aprueba/pide cambios; recién ahí mail al cliente | hoy ✔ |
| Piezas/calendario de contenido | Batch IA → draft; CM/director aprueba → scheduled; published manual | hoy ✔ |
| Campañas Meta | Spec generado por IA → humano revisa → push a Marketing API | hoy ✔ |
| Respuesta al cliente en solicitudes | Director escribe/edita y responde | hoy ✔ (IA podría draftear — target) |
| Publicación/programación en redes | — | target (hoy 100% manual; si se integra API, SIEMPRE con aprobación) |
| Cambios de presupuesto de ads | — | target: IA recomienda con datos; humano ejecuta; jamás auto-scaling sin límites escritos |
| Mensajes salientes nuevos (tipos de mail no existentes) | — | target: plantilla aprobada una vez, envío automático después |
| Poda/edición de memoria de agentes | — | target: sugerencias de consolidación, humano confirma |

## 🔴 RED — ejecuta una persona

| Acción | Por qué |
|---|---|
| Pagos, facturación, dividendos, movimientos bancarios | irreversible + fiduciario (hoy módulo finanzas sin IA — mantener) |
| Pricing y contratos | compromiso comercial |
| Contacto con leads fríos / cierre de ventas | reputación + juicio |
| Eliminación de datos (clientes, credenciales, historiales) | irreversible (hoy delete = director + audit_log) |
| Gestión de credenciales (passphrases, revelar secretos) | diseño criptográfico exige humano; nunca exponer a un modelo |
| Aumento de límites de gasto (ads o API) | control financiero |
| Aprobación final de identidad de marca | criterio de socios |
| Modificar guardrails/permissions del propio sistema | meta-seguridad |

## Reglas transversales propuestas

1. **Todo output visible al cliente pasa por YELLOW al menos una vez por TIPO**; cuando un tipo
   demuestra tasa de aprobación alta sostenida, puede promoverse a GREEN con muestreo (ej.
   tendencias ya lo es).
2. **Ninguna acción RED se automatiza ni con aprobación previa genérica** — cada instancia la
   ejecuta un humano.
3. **Presupuestos duros**: los agentes ya miden costo (`api_usage`); fijar límite mensual por
   agente y alerta al 80% (hoy solo hay budget global de GitHub/Anthropic).
4. **Los gates viven en el dashboard** (donde ya están: fases, contenido, solicitudes) — no
   inventar una capa nueva de aprobaciones.
