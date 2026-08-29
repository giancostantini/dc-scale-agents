---
type: hub
updated: 2026-08-12
---

# 🏠 D&C Scale Partners

Punto de entrada del vault. **El grafo es el organigrama**: HOME → Gerente General →
gerencias → sus equipos y conocimiento. Cada cliente cuelga de la Gerencia de Clientes.
> Fijala: click derecho en la pestaña → *Pin*.

## La empresa

**[🎩 Gerente General](empresa/Gerente%20General.md)** — el consultor global: tu
interlocutor con toda la empresa (y dónde se decide qué).

| Gerencia | Qué cubre |
|---|---|
| [📣 Marketing y Contenido](empresa/Gerencia%20de%20Marketing%20y%20Contenido.md) | Growth, contenido, pauta — la flota que produce |
| [📊 Analítica](empresa/Gerencia%20de%20Analitica.md) | Métricas reales, reportes, learning loop |
| [💰 Finanzas](empresa/Gerencia%20de%20Finanzas.md) | Tesorería, facturación, cierre — el dinero SIEMPRE humano |
| [⚙️ Operaciones](empresa/Gerencia%20de%20Operaciones.md) | Procesos, eventos, calidad (evals), autonomía, IT |
| [🤝 Clientes](empresa/Gerencia%20de%20Clientes.md) | Portal, onboarding, cuentas — y el cluster de clientes |
| [📈 Ventas](empresa/Gerencia%20de%20Ventas.md) | En formación (decisión de socios) |

## Cómo leer el grafo

- **La vista jerárquica de verdad es el *local graph* desde esta nota**: abrilo acá
  (⌘/Ctrl+P → "Open local graph"), profundidad **2**, attachments **off**. Vas a ver
  HOME → gerencias → sus equipos, limpio.
- El **grafo global** (fuerza-dirigido) posiciona por física, no por jerarquía — nunca
  va a ser un organigrama prolijo; sirve para descubrir conexiones, no para leer la
  estructura. Los colores por gerencia se configuran en cada máquina (snippet en
  [Gerente General](empresa/Gerente%20General.md)).
- Nodos gordos que no son gerencias: `CLAUDE` es el **reglamento transversal** de la
  flota (7 agentes lo leen por path — no se puede renombrar) y los índices ahora se
  llaman por lo que son (Índice de Clientes, Metodología Growth, Estándar de Calidad).

## Reglas de la casa

- [Reglamento de agentes (CLAUDE.md)](CLAUDE.md) — quiénes somos, stack real, reglas del vault, principios
- Los números viven en Supabase y la operación en el dashboard — este vault es el
  conocimiento y el mapa. Editar metodología o rubrics **cambia lo que los agentes
  citan**: se trata como código (PR).
