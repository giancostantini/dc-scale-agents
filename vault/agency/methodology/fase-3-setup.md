# FASE 3 — SETUP

Preparar TODA la infraestructura operativa, técnica y creativa para ejecutar la estrategia:
el sistema que permite lanzar campañas, producir contenido, medir y optimizar. Fase crítica:
un error de configuración (herramientas, tracking, funnel) pega directo en la rentabilidad.
El cliente queda listo para adquirir tráfico con un sistema organizado, medible y escalable.

- **Duración:** 1-3 semanas (según estado inicial del negocio y activos a preparar)
- **Resultado:** checklist de fin de fase completo (ver abajo)

## 3.1 — Creación de contenido

Sistema **mensual planificado** que parte de los objetivos comerciales y del funnel definido
en la estrategia: primero pilares de contenido y ángulos de venta prioritarios; después
calendario con el volumen necesario de piezas orgánicas y creatividades para anuncios.
Cada semana se produce, publica y testea contenido para atraer, educar y convertir, con
framework claro: **hook → desarrollo → prueba → CTA**. Las piezas con mejor rendimiento se
escalan en paid media. Se planifica en la planilla **Creación de contenido**.

### 3.1.1 — Producción de contenido con IA según estrategia

Producción constante para sostener el testing. Preparar: definición de estilo visual de
marca · guías de tono y comunicación · biblioteca de creativos · variantes de anuncios ·
videos cortos · hooks de comunicación.
Herramientas del manual: Higgsfield (visual), ElevenLabs (voces), Runway (video).

> **Nota de implementación DC:** hoy la producción es **humana** (CM produce estáticos,
> editor produce video) a partir de los briefs del `creative-assistant` (idea + ángulo +
> copy + dirección visual). Los agentes NO producen el media final. El estilo visual y tono
> salen del brandbook procesado (`brand/*.md` del cliente).

### 3.1.2 — UGC y microinfluencers

Sistema de colaboración con creadores (contenido auténtico + prueba social). Organizar:
selección de microinfluencers (planilla de prospección) · brief de contenido · tipos de
piezas · calendario de entregas · **derechos de uso para publicidad** · seguimiento.
Se usa **UGC Point** para contratación.

### 3.1.3 — Diseños creativos estáticos

Piezas gráficas alineadas a pilares y ángulos priorizados: beneficios, ofertas, prueba
social, diferenciales. Criterios: performance, claridad del mensaje, jerarquía visual,
lectura rápida, CTA. Se producen en volumen, se testean, se analizan y se itera →
**librería de creatividades optimizadas**. Herramientas: Canva · ForkAds · NanoBanana Pro.

## 3.2 — Planificación de contenido

Calendario mensual coherente con objetivos de adquisición y posicionamiento:
- Planificación del calendario mensual (Planificador de Contenido)
- Organización por tipos (UGC, ofertas, testimonios, institucional)
- Coordinación orgánico ↔ campañas pagas
- Programación anticipada en Meta Business Suite

> **Nota de implementación DC:** el calendario vive en el planner del dashboard
> (`content_pieces`) y lo alimenta `content-strategy`; la programación final la hace la CM.

## 3.3 — Campañas de influencers

Estructura para campañas con influencers (alcance + posicionamiento): objetivo · perfiles a
contratar · presupuesto · formato de colaboración · métricas de evaluación · cronograma.
Se usa **Pooshlo** para la gestión.

## 3.4 — Configuración técnica de campañas

Verificar ANTES de lanzar (medición correcta = optimización posible):
- Pixel + API de conversiones instalados en el sitio
- Eventos de conversión configurados (compra, lead, registro…)
- Verificación de dominio
- Pixel vinculado a las cuentas publicitarias
- Acceso a Business Manager
- Métodos de pago activos
- Audiencias iniciales creadas
- Permisos del equipo

## 3.5 — Preparación del funnel

Recorrido completo del anuncio a la conversión: claro, funcional, sin fricciones.
Checklist completo en `checklists.md` § F3.5 (landing · página de producto · proceso de
compra/registro · CTAs · mobile · velocidad · página de gracias · seguimiento post conversión).

## 3.6 — Dashboards y medición

Panel centralizado en tiempo real para decisiones y comunicación con el cliente:
dashboard principal de rendimiento · integración Meta Ads · integración Google Ads (si
corresponde) · seguimiento de inversión · seguimiento de ventas/leads · conversion rate.
El manual usa Dashcortex; se revisa en reuniones de seguimiento.

> **Nota de implementación DC:** hoy el panel del cliente es **Looker Studio** (link en su
> portal) + el dashboard interno. La ingestión automática de métricas Meta es el gap #1 del
> roadmap (Stage 2) — hasta entonces, carga asistida a `metrics-log.md`.

## Resultado esperado de la fase

- Sistema de contenido planificado y programado
- Creativos producidos y listos para testeo
- Dashboard de métricas activo
- Influencers y UGC en marcha
- Pixel y eventos configurados
- Cuentas publicitarias listas
- Funnel operativo

Solo con TODO verificado se avanza a Fase 4 (Lanzamiento).
