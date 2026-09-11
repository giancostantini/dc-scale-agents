---
type: agent-config
updated: 2026-09-11
---

# Prospector de Llamados — método de búsqueda

Lo que usa el agente `prospeccion` cada lunes. **Editar este archivo cambia
la búsqueda desde la corrida siguiente** (se trata como código: PR).
Volver: [Gerencia de Ventas](../../empresa/Gerencia%20de%20Ventas.md)

> **Quién manda sobre qué (mig 100).** Las **campañas activas del CRM**
> (`/pipeline` → Campañas de prospección) definen el TARGETING de cada
> corrida: geografías, puestos, rubros, señales, exclusiones propias y tope
> de prospectos. Este archivo define el MÉTODO, que aplica siempre: guía de
> scoring, exclusiones duras y fuentes. Las keywords y geografías de abajo
> son el **ICP de fallback**: se usan cuando no hay ninguna campaña activa
> (ahí el agente corre como antes de las campañas).

## Keywords de puestos a buscar (fallback)

- community manager
- marketing digital / responsable de marketing / analista de marketing
- redes sociales / social media manager
- growth / growth marketer / growth partner
- paid media / trafficker digital / media buyer
- content manager / creador de contenido

## Geografías (fallback, en orden de prioridad)

1. **Uruguay** (Montevideo primero) — mercado principal, servicio más fácil
2. Colombia
3. Perú
4. Paraguay

## Exclusiones (no cargar)

- **Agencias de marketing/publicidad contratando para sí mismas** (competencia, no cliente)
- Búsquedas de freelance puro por proyecto chico (sin presupuesto recurrente)
- Clientes actuales de la agencia
- Puestos corporativos de multinacionales gigantes (no compran agencia boutique)
- Avisos sin empresa identificable (consultora de RRHH sin revelar cliente final) → score máximo 2

## Guía de scoring (1-5)

| Score | Perfil |
|---|---|
| 5 | PyME/marca local UY con presencia digital activa buscando CM o marketing generalista — exactamente lo que la agencia reemplaza |
| 4 | Empresa Latam target o rol específico (paid media, contenido) donde tercerizar es natural |
| 3 | Señal buena pero con fricción (empresa muy chica, rol muy senior/estratégico in-house) |
| 2 | Empresa no identificable o fit dudoso |
| 1 | Fuera de perfil (excluible) |

**Solo score ≥ 4 entra al pipeline.** El resto queda en el reporte del run
(campana → link) por si los socios quieren repescar alguno a mano.

## Fuentes

Resultados públicos vía web search de Claude: LinkedIn Jobs (avisos públicos
indexados por buscadores — LinkedIn NO se scrapea directo: login wall + ToS),
Computrabajo, BuscoJobs, portales locales.

Mejoras futuras declaradas (v2, si la cobertura queda corta):
- API de jobs con key (JSearch / SerpApi) para exhaustividad
- `user_location` de la tool web_search (existe en la API, sin precedente en el repo)
