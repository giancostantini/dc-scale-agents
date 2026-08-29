---
type: gerencia
updated: 2026-08-12
---

# 🎩 Gerente General

El quinto integrante del equipo: **el Consultor Global** del dashboard (registry:
`consultant-global`). No es una metáfora — es un rol operativo con contexto, memoria
y herramientas reales.

## Quién es y qué ve

- **Dónde vive:** su oficina es la página **`/gerente`** del dashboard (botón
  "Gerente" en la barra superior) — chat a pantalla completa + el estado de las 6
  gerencias al costado. El widget flotante (burbuja abajo a la derecha) es el mismo
  gerente en versión de bolsillo, disponible en cualquier página. Te habla con TU
  contexto: si sos director ve toda la agencia; si sos team, solo tus clientes.
- **Cómo le llega la información (la jerarquía en acción):** cada cliente tiene un
  **Gerente de Proyecto** embebido que prepara a diario el estado de SU cliente; cada
  **gerencia** agrega los de sus clientes + sus fuentes propias; el GG recibe los 6
  estados YA preparados antes de responderte. Por eso contesta con datos precisos al
  instante — ya "le preguntó" a la cadena, sin charlas agente→agente (principio #4).
- **Memoria:** guarda tus preferencias y las reglas de cada cliente en silencio
  (`consultant_memory_v2` — la misma que lee TODA la flota).
- **Procesos:** sabe en qué paso está cada cliente (onboarding, ciclo de contenido,
  reporte mensual) y qué gate humano lo bloquea — pedile "¿en qué estamos con X?".
- **Briefing:** todas las mañanas (7:00 UY) te deja el briefing del día en su chat.
- **Puede dispatchar** agentes de la flota (con guardrails: permisos por rol + techo
  de gasto mensual por agente).

> La fuente de verdad de su comportamiento es el código:
> `dashboard/lib/consultant-global-context.ts` (prompt) y
> `dashboard/app/api/consultant/global/route.ts` (herramientas). Esta nota es el mapa,
> no el prompt — no duplicar.

## Qué NUNCA hace (gates duros)

- **Dinero:** jamás mueve, convierte, paga ni factura — el dinero es SIEMPRE humano.
- **Aprobaciones:** no aprueba fases, cierres ni piezas — propone y prepara, ustedes deciden.
- **Cliente:** nada llega al portal del cliente sin gate humano.
- La autonomía se GANA con métricas (ver `autonomy_settings` + Auditor de Calidad) y
  la promoción siempre es un acto de director.

## Las gerencias

- [Gerencia de Marketing y Contenido](Gerencia%20de%20Marketing%20y%20Contenido.md)
- [Gerencia de Analitica](Gerencia%20de%20Analitica.md)
- [Gerencia de Finanzas](Gerencia%20de%20Finanzas.md)
- [Gerencia de Operaciones](Gerencia%20de%20Operaciones.md)
- [Gerencia de Clientes](Gerencia%20de%20Clientes.md)
- [Gerencia de Ventas](Gerencia%20de%20Ventas.md)

Contexto maestro de la agencia: [CLAUDE](../CLAUDE.md) · Bitácora: [Growth log](../agency/growth-log.md)

## 🧭 Dónde se decide qué

| Capa | Qué es | Qué decidís ahí |
|---|---|---|
| **Obsidian (este vault)** | El mapa y el conocimiento: método, marcas, aprendizajes | Cambiar el ESTÁNDAR (metodología, rubrics) — se edita como código (PR) |
| **Dashboard** | La operación: planner, fases, finanzas, agentes | Los GATES del día a día: aprobar fases/piezas, marcar cierres, pagar |
| **La campana 🔔** | Decisiones pendientes que el sistema te empuja | Lo que espera tu OK: drafts listos, vencidas, descalces, spot-checks |
| **Mensuales** | Cierre financiero · Evals · Autonomía | Dar por FINAL el cierre, promover/degradar autonomía, ajustar rubrics |

## 🎨 Mantenimiento del grafo (por máquina)

`.obsidian/` es config local (gitignoreada). Para que el grafo pinte los clusters,
pegar en `vault/.obsidian/graph.json` → clave `"colorGroups"`:

```json
[
  { "query": "path:empresa", "color": { "a": 1, "rgb": 12872264 } },
  { "query": "path:agency", "color": { "a": 1, "rgb": 5745719 } },
  { "query": "path:agents", "color": { "a": 1, "rgb": 5395108 } },
  { "query": "path:clients/wiztrip", "color": { "a": 1, "rgb": 14725458 } },
  { "query": "path:clients/glassy-waves", "color": { "a": 1, "rgb": 5410418 } },
  { "query": "path:clients/pintureria-propios", "color": { "a": 1, "rgb": 15029821 } },
  { "query": "path:clients/grupo-mundi", "color": { "a": 1, "rgb": 9464511 } }
]
```

(Cerrar y reabrir la vista de grafo para que tome el cambio. Repetir en la máquina de Fede.)
