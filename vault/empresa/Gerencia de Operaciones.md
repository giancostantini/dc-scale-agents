---
type: gerencia
updated: 2026-08-12
---

# ⚙️ Gerencia de Operaciones

Áreas del organigrama (doc 15): **ops + plataforma (IT) + ecommerce-ops**. Owner
humano: Gian. Acá vive la maquinaria que mantiene a la empresa andando y midiéndose
a sí misma.

## Flota

| Agente | key técnico | Estado | Qué hace |
|---|---|---|---|
| Auditor de Calidad | `evals` | 🟢 activo | Evalúa cada lunes los outputs contra las [rubrics](../agency/evals/README.md) — "evals verdes" habilita más autonomía |
| Destilador de Aprendizajes | `distill-learnings` | 🟢 activo | Convierte chats + 👍/👎 en aprendizajes que afinan a TODA la flota (domingos) |
| Escáner de Stock Web | `stock-web` | 🟢 activo | Escanea talles/stock del sitio del cliente ecommerce (diario) |
| Briefing Matutino | `morning-briefing` | ⏸ pausado (on-demand) | El resumen del día que entrega el Gerente General a las 7:00 |
| Control de Inventario | `stock` | 💤 dormido | Status/forecast/alertas de inventario (solo ecommerce) |
| Coordinador de Logística | `logistics` | 💤 dormido | Agenda y optimización de envíos (solo ecommerce) |

## Infraestructura silenciosa (jobs sin chat)

- **Sincronizador de Procesos** (`process-sync`, diario): mantiene el estado de
  onboarding / ciclo de contenido / reporte mensual consultable por cliente.
- **Despachador de Eventos** (`events-dispatch`, diario + real-time opcional): crear
  cliente, activarlo, publicar pieza o llegar métricas EMPUJAN el paso siguiente solo,
  hasta el gate.
- **Auditor de Autonomía** (`autonomy-review`, lunes): mide qué tipo de output se ganó
  la autonomía con datos y avisa — promover es siempre un UPDATE de director.
- **Vigía de Crons** (`cron-alert`): si cualquier cron falla, campana al director.

## Conocimiento del área

- [Evals — el estándar de calidad](../agency/evals/README.md)
- [Data ownership — qué fuente manda](../agency/data-ownership.md)
- Registry de la flota (fuente única): `dashboard/lib/agent-registry.ts` (en el repo)

[Gerente General](Gerente%20General.md) · Dashboard: campana + `/configuracion`
