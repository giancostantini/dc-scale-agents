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

## Método de onboarding y visibilidad

- [SOP Onboarding](../agency/methodology/sop-onboarding.md) — alta → fases con gates → optimización continua
- [Metodología completa (5 fases)](../agency/methodology/README.md)
- Regla de visibilidad: el Asesor del portal JAMÁS lee `learning-log`, `calls-log` ni `_archive` ([detalle](../CLAUDE.md))

[Gerente General](Gerente%20General.md) · Dashboard: `/hub` + portal del cliente
