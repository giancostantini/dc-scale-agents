---
type: hub
updated: 2026-08-12
---

# 🏠 D&C Scale Partners — Mapa de la empresa

Punto de entrada del vault. Desde acá se llega a todo; el grafo de Obsidian
dibuja la estructura real de la empresa a partir de estos links.
> Fijala: click derecho en la pestaña → *Pin*. 

## 🏢 Agencia

- [Contexto maestro (CLAUDE.md)](CLAUDE.md) — quiénes somos, stack real, reglas del vault, principios
- [Metodología Growth](agency/methodology/README.md) — el Manual versionado: 5 fases + SOPs + checklists
- [Evals](agency/evals/README.md) — las 3 rubrics del estándar de calidad (juez semanal)
- [Data ownership](agency/data-ownership.md) — qué fuente manda en cada par vault↔DB
- [Estrategia de contenido](agency/content-strategy.md) · [Framework de paid ads](agency/paid-ads-strategy.md) · [Growth log](agency/growth-log.md)

## 👥 Clientes

→ [Índice de clientes](clients/README.md)

| Cliente | Contexto |
|---|---|
| WizTrip | [claude-client](clients/wiztrip/claude-client.md) |
| Glassy Waves | [claude-client](clients/glassy-waves/claude-client.md) |
| Pinturería Propios | [claude-client](clients/pintureria-propios/claude-client.md) |
| Grupo Mundi | [claude-client](clients/grupo-mundi/claude-client.md) |

## ⚙️ Sistema (fuera del vault)

Lo operativo NO vive en markdown — el vault es conocimiento cualitativo
([regla](agency/data-ownership.md)):

- **Dashboard** (Vercel): hub interno + portal de clientes + Finanzas + 4 consultores
- **Supabase**: estado del negocio, procesos (`process_instances`), eventos, memoria de agentes, evals, autonomía
- **GitHub Actions**: 17 crons + eventos (registry: `dashboard/lib/agent-registry.ts` en el repo)
- **Mapa completo del sistema**: `docs/ai-company-audit/` en el repo (17 documentos de la auditoría + roadmap)

## 🧭 Convención

- Carpeta de cliente: la genera `client-bootstrap` — cada `claude-client.md` cierra con su **Mapa del cliente** (links a sus archivos)
- Interno que el cliente JAMÁS ve: `learning-log.md`, `calls-log.md`, `_archive/` ([detalle](CLAUDE.md))
- Editar metodología o rubrics **cambia lo que los agentes citan** — tratarlo como código (PR)
