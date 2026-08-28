---
type: gerencia
updated: 2026-08-12
---

# 🤝 Gerencia de Clientes

Áreas del organigrama (doc 15): **client-success + onboarding**. Owner humano: Lucía
(cuentas) + socios. De esta gerencia cuelga todo el cluster de clientes del grafo.

## Flota

| Agente | key técnico | Estado | Qué hace |
|---|---|---|---|
| Asesor del Cliente (portal) | `consultant-portal` | 🟢 activo | El consultor que atiende al CLIENTE en su portal — solo lee lo que el cliente puede ver |
| Consultor de Cuenta | `consultant-client` | 🟢 activo | El consultor interno por cliente (director/equipo) — contexto completo + dispatch |
| Procesador de Marca | `brandbook-processor` | ⏸ pausado (on-demand) | Convierte el brandbook PDF en los 8 archivos de `brand/` |
| Alta Técnica de Clientes | `client-bootstrap` | ⏸ pausado (event-driven) | Scaffoldea la carpeta del cliente al crearlo en el dashboard |
| Generador de QR de Reseñas | `qr-review` | 🟢 activo (CLI) | QR de reseñas de Google + cartel imprimible |

Al **crear** un cliente y al **activarlo** hay eventos que empujan solos (research y
draft del Diagnóstico si hay kickoff) — ver Gerencia de Operaciones.

## Los clientes

→ **[Índice de clientes](../clients/README.md)** (cada cliente tiene su mapa al pie de su `claude-client.md`)

## Plantillas del alta (las copia Alta Técnica de Clientes)

[claude-client](../automation/templates/client-scaffold/claude-client.template.md) · [strategy](../automation/templates/client-scaffold/strategy.template.md) · [competitors](../automation/templates/client-scaffold/competitors.template.md) · [content-library](../automation/templates/client-scaffold/content-library.template.md) · [content-calendar](../automation/templates/client-scaffold/content-calendar.template.md) · [learning-log](../automation/templates/client-scaffold/learning-log.template.md) · [metrics-log](../automation/templates/client-scaffold/metrics-log.template.md) · [references](../automation/templates/client-scaffold/references/references.template.md)
> Editar una plantilla cambia cómo NACEN los clientes futuros — tratar como código.

## Método de onboarding y visibilidad

- [SOP Onboarding](../agency/methodology/sop-onboarding.md) — alta → fases con gates → optimización continua
- [Metodología completa (5 fases)](../agency/methodology/README.md)
- Regla de visibilidad: el Asesor del portal JAMÁS lee `learning-log`, `calls-log` ni `_archive` ([detalle](../CLAUDE.md))

[Gerente General](Gerente%20General.md) · Dashboard: `/hub` + portal del cliente
