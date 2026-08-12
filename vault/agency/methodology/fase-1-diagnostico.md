# FASE 1 — DIAGNÓSTICO

Punto de partida obligatorio en todo nuevo cliente. Objetivo: comprender la situación actual
del negocio, su mercado, su competencia y su potencial de crecimiento **antes de ejecutar
cualquier acción** de marketing o publicidad. Se diseña estrategia con datos, no supuestos.
Aplica a cualquier sector (eCommerce, servicios, productos físicos, negocios digitales).

- **Duración:** 5-7 días hábiles
- **Entregable:** **Growth Diagnosis Report**

## 1.1 — Entendimiento del negocio

Objetivo: obtener toda la información estratégica y financiera para entender el negocio,
calcular la viabilidad de adquisición de clientes y sentar las bases de la estrategia.

La **reunión inicial** es estratégica (no comercial): cómo funciona el negocio, qué objetivos
tiene el cliente, cuáles son sus márgenes reales. De ahí salen los datos para estimar CAC,
ROAS necesario y viabilidad de campañas. La información se releva con el **Kickoff Clientes
(planilla)** — toda es obligatoria para avanzar.

**ROAS break-even** (dato clave de la reunión): punto donde la inversión publicitaria cubre
exactamente costo y gastos asociados, sin pérdida ni ganancia.

> ROAS break-even = 1 ÷ margen de contribución

**North Star Metric + métricas de palanca** — encuadrar el negocio en una categoría:
- eCommerce de compra única (conversión, ticket, margen)
- eCommerce con recompra / suscripción (LTV y retención)
- Servicios por lead — turnos / cotización (el cierre depende del proceso comercial)
- High-ticket (ciclos largos; cualificación y seguimiento determinan el cierre)
- B2B (ventas complejas, autoridad)
- Marketplace / dos lados (liquidez y equilibrio oferta-demanda)

## 1.2 — Análisis de mercado y competencia

Identificar: tamaño de mercado (estimado), demanda existente (activa y latente) y nivel de
competencia. Se analizan **3-5 competidores directos** + indirectos y sustitutos: sitio web,
posicionamiento, oferta y canales de adquisición.

Herramienta principal: **SimilarWeb** (visitas mensuales, evolución, distribución de fuentes:
pago/orgánico/social/directo/referral). Se usa como señal comparativa y se **triangula** con
otras fuentes para evitar sesgos.

En paralelo: keywords relevantes, tendencias de búsqueda y estacionalidad para distinguir:
- **Demanda activa** — buscan solución directa (capturable por SEO y Paid Search)
- **Demanda latente** — aún no buscan (se activa con Paid Social, contenido y oferta)

**Benchmark de oferta**: estructura de precios, qué incluye la propuesta, promociones,
financiación, garantías/cancelación (riesgo reverso), prueba social (reseñas, casos, UGC).

Todo se registra en una **tabla comparativa de competidores**. El análisis DEBE cerrar con:
1. Canales dominantes del mercado y su lógica (por intención)
2. **3 oportunidades claras** (huecos de posicionamiento / oferta / canal)
3. **3 riesgos o amenazas** (barreras, saturación, dependencia de canal, estacionalidad)

## 1.3 — Análisis de anuncios y comunicación

Detectar qué creativos, mensajes, ángulos y estructuras de oferta funcionan en la industria.
Herramientas: **Foreplay** (principal) + verificación en **Meta Ads Library** / TikTok
Creative Center.

Cada anuncio se descompone según su estructura completa:
**Hook → Problema → Mecanismo → Prueba → Oferta → Riesgo reverso → CTA**

Clasificación por tipo (UGC, testimonios, demos, comparativas, educativo,
founder/institucional, ofertas) y por etapa del funnel:
- **TOF** (Awareness): captar atención, activar interés
- **MOF** (Consideración): mecanismo, comparativas, confianza
- **BOF** (Conversión): oferta, urgencia, garantía, cierre
- **Retargeting**: responde objeciones, empuja la decisión

Anuncios activos hace varios meses = indicio de resultados positivos → guardar como
referencia evaluando contexto (retargeting/branding/performance — no asumir escalabilidad).
Se construye un **banco de anuncios del mercado** con etiquetas mínimas: competidor,
formato, etapa de funnel, ángulo, oferta, hook, promesa, prueba, CTA. Ese banco alimenta
directamente la estrategia de contenido, el plan creativo y la estructura de campañas.

## 1.4 — Análisis del funnel y la experiencia del usuario

Recorrido completo del usuario en los sitios de los competidores: landing pages, estructura
de oferta, proceso de compra/registro, CTAs. Herramientas: **Microsoft Clarity / Hotjar**
(grabaciones, mapas de calor — dónde clickean, hasta dónde llegan, dónde abandonan) +
**GA4** (tiempo en página, rebote, conversiones) + Tag Manager para eventos específicos.
Salida: fricciones identificadas y mejoras de conversión sin subir inversión.
(Checklist operativo: ver `checklists.md` § F1.4.)

## 1.5 — Benchmark y oportunidades

Con todo lo anterior: benchmark de mercado (canales predominantes, tipos de anuncio más
usados, ofertas estándar del sector) → **matriz de oportunidades**: diferenciales posibles,
canales poco explotados, ángulos de comunicación no utilizados. Es la base de la fase 2.

## 1.6 — Entregable y cierre

El **Growth Diagnosis Report** incluye: análisis de mercado · análisis de competidores ·
análisis de tráfico · análisis de anuncios · ángulos de comunicación detectados ·
oportunidades · riesgos · recomendación estratégica inicial.

**Stack de la fase:** Foreplay (anuncios) · SimilarWeb (mercado/tráfico) · Clarity
(comportamiento real) · Hotjar (mapas de calor) · GA4 (métricas) · Dashcortex (dashboard) ·
test de usuarios (insights reales).

> **Nota de implementación DC:** el dashboard de métricas hoy es **Looker Studio** (no
> Dashcortex). El análisis de competidores/tendencias lo asisten los agentes
> `competitor-scanner`, `client-research` y `sector-trends`; la síntesis y el criterio son humanos.

Solo después de esta etapa se avanza a la Fase 2 (Estrategia).
