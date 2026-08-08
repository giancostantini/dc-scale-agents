# 13 — Matriz Build / Buy / Connect / Human / AI-assisted / Autonomous

> Modo = quién ejecuta. BUILD/CONNECT/BUY = cómo se obtiene la capacidad.

| Capacidad | Obtención | Modo de ejecución | Justificación (evidencia) |
|---|---|---|---|
| Diagnóstico de negocio (F1) | BUILD (ya: phases/generate + research) | **AI-assisted** (draft IA → director) | El juicio final es de socios; la IA acelera 80% del documento |
| ROAS break-even / viabilidad | BUILD (fórmula en wizard/fases) | Determinístico + humano valida | Es 1/margen — no requiere LLM |
| Análisis de mercado/tráfico | BUY (SimilarWeb) | Humano con herramienta | API cara; volumen bajo; triangulación humana del Manual |
| Caza/análisis de anuncios | BUY (Foreplay) + BUILD (banco: competitor_pieces ya existe) | **AI-assisted** (humano caza, scanner sync, IA clasifica) | Ya funciona el patrón curación humana→tabla |
| Tendencias del nicho | BUILD (ya: sector-trends) | **Autonomous** (GREEN, informativo con fuentes) | En producción, el más maduro |
| Estrategia (F2) | BUILD (ya) | AI-assisted | Igual que diagnóstico |
| Calendario + briefs de contenido | BUILD (ya: content-strategy/creative-assistant) | AI-assisted (batch → aprobación CM) | Núcleo actual |
| Copys/textos de placas | BUILD (ya: consultor de contenido) | **AI autonomous con review por pieza** (rating 👍/👎 alimenta al destilador) | Riesgo bajo, reversible |
| Producción de video | HUMAN + AI-assisted (prompts p/ herramientas externas) | Humano (Octavio) | Decisión ya tomada (Remotion retirado); `generateAiPrompt` ya asiste |
| Statics/diseño | BUY (Canva/NanoBanana) | Humano con IA | Manual F3.1.3 |
| UGC / microinfluencers | BUY (UGC Point) + BUILD tracking mínimo | Humano | Manual F3.1.2; no automatizable con calidad |
| Campañas influencers | BUY (Pooshlo) | Humano | Manual F3.3 |
| Publicación en redes | CONNECT (API Meta / evaluar) | **YELLOW** siempre | Nunca auto-post sin aprobación |
| Lanzar campañas Meta | CONNECT (ya: Marketing API push) | **AI prepara spec + humano pushea** | Ya implementado con gate |
| Escalar presupuesto ads | CONNECT (futuro: update por API) | **AI recommendation + human approval** — jamás auto | RED-adjacent; límites escritos |
| Lectura de métricas ads | **CONNECT (Meta Insights API) — EL gap #3** | Autonomous (lectura) | Cierra winners/reporting |
| Evaluación de piezas/winners | BUILD (ya: social-media-metrics + insights) | Autonomous tras #3 | Determinístico + IA clasificadora |
| Reporte mensual al cliente (F5.5) | BUILD (reporting + template) | AI-assisted (draft → director → cliente) | Visible al cliente ⇒ YELLOW |
| CRO/funnel review | BUY (Clarity/Hotjar/GA4) | Humano con checklist (versionar la del Manual) | Herramientas de cuenta propia |
| SEO | BUILD (ya: agente utilitario) | AI-assisted | Publicación manual |
| Prospección/outreach | CONNECT (Apollo/Prospeo) + BUILD scoring | **AI-assisted; envío SIEMPRE humano** | Reputación (RED en contacto frío) |
| CRM pipeline | BUILD (ya: módulo pipeline) | Humano | |
| Onboarding cliente | BUILD (ya: wizard+bootstrap+brandbook) | AI-assisted con gates | Maduro |
| Facturación/pagos/dividendos | BUILD (ya: finanzas) | **HUMAN (RED)** | Fiduciario |
| Soporte/comunicación cliente | BUILD (ya: portal+consultor+digest) | Autonomous informativo / YELLOW decisiones | En producción |
| Email transaccional | CONNECT (ya: Resend) | Autonomous (plantillas aprobadas) | |
| Calendario | CONNECT (ya: Microsoft Graph) | Autonomous (sync) | |
| Credenciales | BUILD (ya: bóvedas envelope) | HUMAN only | By design |
| Scheduling/ejecución de agentes | CONNECT (ya: GitHub Actions) | Autonomous | Costos ya controlados; revisar si minutos vuelven a doler → mover crons a Supabase cron |
| Observabilidad/costos | BUILD (ya: agent_runs+api_usage+panel) | Autonomous + review humano | Falta alerting (gap #9) |
