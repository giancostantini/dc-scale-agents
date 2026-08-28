---
type: gerencia
updated: 2026-08-12
---

# 💰 Gerencia de Finanzas

Áreas del organigrama (doc 15): **finanzas + legal/admin**. Owner humano: **Fede**.
Gerente IA conversacional: persona **"Gerente de Finanzas"** del widget (piloto H2) —
solo directores, solo lectura: te cuenta y recomienda con los números reales cargados,
jamás ejecuta.

## Dónde vive (no en el vault — regla de data ownership)

Los números NUNCA van en markdown. Toda la gerencia opera en el dashboard `/finanzas`:

| Capacidad | Sección / Job | Qué hace solo | Gate humano |
|---|---|---|---|
| Tesorería multimoneda | Tesorería + Cotizador de Divisas (`fx-rates`, diario) | TC USD/UYU del día, posición por moneda, alerta de descalce | **Convertir/mover plata: SIEMPRE socios** |
| Facturación y cobranzas | Facturación + Facturador (`billing`, diario) | Draftea facturas del mes, detecta vencidas, draftea recordatorios | Emitir y enviar: humano |
| Conciliación bancaria | Conciliación (import CSV) | Matching automático + sugerencias con score | Confirmar dudosos: Fede |
| Cierre y proyección | Cierre + Contador de Cierre (`monthly-close`, día 2) | Números deterministas + narrativa IA + cashflow 90 días | **Marcar FINAL: socios** |
| Costos de IA | Costos API + techos por agente (registry) | Suma gasto real por agente y frena al que pasa su techo | Subir un techo: director |

Regla de oro (doc 12/16, no negociable): **el dinero es SIEMPRE humano** — la IA
calcula, detecta, draftea y avisa; pagar, convertir, emitir y declarar el cierre es de ustedes.

## Diseño completo del área

`docs/ai-company-audit/16-area-finanzas-autonoma.md` (en el repo) — las 5 capacidades
(FIN-0..3 construidas) y el techo de evolución.

[Gerente General](Gerente%20General.md) · Dashboard: `/finanzas`
