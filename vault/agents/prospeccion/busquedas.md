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
> son el **ICP de fallback**: se usan cuando no hay ninguna campaña activa.

## Las dos señales que buscamos

La agencia tiene dos verticales y cada una tiene su propia señal de compra
en un aviso laboral. El agente **clasifica cada hallazgo** en una de las dos
(`vertical: growth | dev`), y eso define el tipo del prospecto en el CRM
(Growth Partner o Desarrollo) y el ángulo del mensaje.

| Vertical | La señal | Por qué es candidata |
|---|---|---|
| **growth** | Busca marketing in-house (CM, redes, paid media, contenido) | Tiene necesidad y presupuesto de marketing; tercerizarlo con una agencia es una alternativa directa |
| **dev** | Busca perfiles de tecnología/datos, o el aviso describe un proceso manual y repetitivo | Tiene un problema operativo con presupuesto asignado; parte de eso se resuelve con automatización en vez de (o antes de) sumar gente |

---

## Vertical GROWTH — puestos a buscar (fallback)

- community manager
- marketing digital / responsable de marketing / analista de marketing
- redes sociales / social media manager
- growth / growth marketer / growth partner
- paid media / trafficker digital / media buyer
- content manager / creador de contenido

---

## Vertical DESARROLLO (automatización e IA) — qué buscar

### A. Puestos de tecnología y datos (señal más limpia)

Contratan tecnología: tienen agenda y presupuesto. Ofrecer construirlo no
compite con la persona, la complementa.

- desarrollador / programador / analista funcional
- analista de datos / Power BI / business intelligence
- automatización / RPA / integraciones / API
- implementación de ERP / analista de sistemas
- soporte técnico / mesa de ayuda con foco en procesos

### B. Puestos operativos repetitivos (señal más frecuente)

El aviso describe, sin querer, el proceso que se puede automatizar.

- administrativo / a · data entry · carga de datos
- facturación · conciliación · cobranzas · liquidación
- control de stock / inventario · seguimiento de pedidos
- atención al cliente por WhatsApp / mesa de entrada
- coordinación logística / armado de rutas

### C. Lo que dice el aviso (el dato más valioso)

Cuando el texto menciona **planillas de Excel, carga manual, control
cruzado, reportes armados a mano, seguimiento por WhatsApp, "uso avanzado
de Excel"** — eso es literalmente la especificación de lo que se puede
automatizar. **Capturalo en la señal**: es lo que hace específico al primer
mensaje.

### Regla de tono para esta vertical (no negociable)

Nunca plantear "no contrates a esa persona" ni "reemplazá ese puesto". El
ángulo es **aditivo**: hay una parte del proceso que un sistema absorbe para
que la persona que entre haga el trabajo que de verdad importa. Un mensaje
que suena a "despedí gente" quema la marca en un mercado chico como Uruguay.

---

## Geografías (fallback, en orden de prioridad)

1. **Uruguay** (Montevideo primero) — mercado principal, servicio más fácil
2. Colombia
3. Perú
4. Paraguay

## Exclusiones (no cargar, las dos verticales)

- **Agencias de marketing/publicidad contratando para sí mismas** (competencia, no cliente)
- **Software factories / consultoras de IT contratando devs** (competencia de la vertical dev)
- Búsquedas de freelance puro por proyecto chico (sin presupuesto recurrente)
- Clientes actuales de la agencia
- Puestos corporativos de multinacionales gigantes (no compran boutique)
- Avisos sin empresa identificable (consultora de RRHH sin revelar cliente final) → score máximo 2

## Guía de scoring (1-5)

**Growth**

| Score | Perfil |
|---|---|
| 5 | PyME/marca local UY con presencia digital activa buscando CM o marketing generalista — exactamente lo que la agencia reemplaza |
| 4 | Empresa Latam target o rol específico (paid media, contenido) donde tercerizar es natural |
| 3 | Señal buena pero con fricción (empresa muy chica, rol muy senior/estratégico in-house) |
| 2 | Empresa no identificable o fit dudoso |
| 1 | Fuera de perfil (excluible) |

**Desarrollo**

| Score | Perfil |
|---|---|
| 5 | El aviso describe un proceso manual concreto y repetitivo (facturación, conciliación, stock, pedidos) en una empresa con volumen real — sabemos exactamente qué construir |
| 4 | Busca perfil de tecnología/datos en una PyME o empresa mediana: hay agenda de sistemas y presupuesto |
| 3 | Señal de proceso pero difusa, o empresa demasiado chica para un proyecto |
| 2 | Empresa no identificable, o el rol es puramente técnico sin proceso de negocio atrás |
| 1 | Software factory, consultora de IT, o fuera de perfil |

**Solo score ≥ 4 entra al pipeline.** El resto queda en el reporte del run
(campana → link) por si los socios quieren repescar alguno a mano.

## Qué capturar de cada aviso

Además de la señal y el score, el agente extrae lo que la card y la ficha
del prospecto muestran:

- **Puesto** que ofrecen y **ubicación**.
- **Fecha de publicación**, TAL COMO LA MUESTRE el aviso ("hace 5 días",
  "3/9/2026"). Si no la muestra, se deja vacía: **no se estima**.
- **Qué se pretende en el puesto**: 2-4 frases con experiencia, herramientas,
  modalidad y responsabilidades. Es el material del primer mensaje.
- **Email de contacto del aviso**, si lo publica. Va a la casilla de la
  empresa, nunca al email del decisor (ver
  [Gerencia de Ventas](../../empresa/Gerencia%20de%20Ventas.md)).

Después de cargar los prospectos, el agente hace **una** pasada de búsqueda
web para completar web institucional, teléfono y casilla de contacto de las
empresas con mejor score.

## Fuentes

Resultados públicos vía web search de Claude: LinkedIn Jobs (avisos públicos
indexados por buscadores — LinkedIn NO se scrapea directo: login wall + ToS),
Computrabajo, BuscoJobs, portales locales.

Mejoras futuras declaradas (v2, si la cobertura queda corta):
- API de jobs con key (JSearch / SerpApi) para exhaustividad
- `user_location` de la tool web_search (existe en la API, sin precedente en el repo)
