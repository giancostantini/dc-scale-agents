# 08 — Qué significa realmente "una empresa operada con IA" (sin hype)

Respuestas técnicas a los 27 puntos, ancladas en lo observado en ESTE sistema.

**1. Tareas que un agente ejecuta de forma confiable hoy**: síntesis sobre datos que ya posee
(briefings, reportes draft, tendencias con fuentes citadas vía web_search + tool_use forzado),
transformación estructurada (brandbook→8 archivos con validación), generación de
borradores/briefs, destilado de conversaciones. Común: output verificable, humano aguas abajo,
input controlado.

**2. Ejecutables pero con validación**: todo lo que el cliente ve (fases, reportes, respuestas
a solicitudes), planes de contenido, specs de campañas, cambios de presupuesto. El sistema ya
lo encarna: draft IA → gate humano.

**3. No conviene delegar**: decisiones financieras y de pricing, compromisos con clientes,
cierre de ventas, juicio estratégico final (el Manual entero es criterio de socios), manejo de
credenciales (by design: passphrases humanas).

**4. Requieren APIs**: métricas de ads (Meta Insights — EL gap actual), publicación programada,
CRM/prospección (Apollo), email (ya Resend), calendario (ya Graph).

**5. Requieren navegador/computer-use**: caza de anuncios (Foreplay/Ads Library), análisis UX
de competidores (Clarity/Hotjar son de la cuenta propia, no de competidores), scraping sin API
(stock-web ya lo hace con fetch+parse; browser solo si hay JS pesado).

**6. Requieren humanos**: reunión inicial de diagnóstico (F1.1), negociación, criterio de marca
final, producción audiovisual (decisión ya tomada al eliminar content-creator), aprobar todo lo
irreversible.

**7. Determinísticas** (y así están implementadas, correctamente sin LLM): scoring de insights,
scraping de talles, parsing de competitors.md, scaffold de clientes, ROAS break-even (fórmula
= 1/margen — hoy en planilla, trivial de sistematizar).

**8. Probabilísticas**: redacción, clasificación de hooks, resúmenes, diagnósticos — todo lo
que pasa por Claude. Regla ya practicada: forzar estructura (tool_use) y validar post-hoc.

**9. Auto-ejecutables por evento**: hoy solo triggers SQL→notifs/audit y logistics→stock.
Candidatos naturales: cliente activado→diagnóstico, fase aprobada→siguiente, métricas
cargadas→evaluación de piezas.

**10. Mejor como workflows predefinidos**: onboarding (ya lo es), ciclo mensual de contenido,
reporte mensual F5.5 — secuencias conocidas con gates, no requieren "agencia" del modelo.

**11. Decisiones que deben requerir aprobación**: ver doc 12 (GREEN/YELLOW/RED completo).

**12. Información que debería ser estructurada**: métricas, campañas, planner de contenido
(ya en `content_posts` con 15+ campos — matchea el planner del Manual), solicitudes (metadata
jsonb tipada), objetivos financieros de F2.8 (hoy texto en fases → deberían ser datos).

**13. Puede permanecer en documentos**: brand voice, estrategia narrativa, SOPs, aprendizajes
cualitativos, el Manual — todo lo que humanos leen y Claude ingiere como prosa.

**14. Memoria**: el patrón correcto ya existe — `consultant_memory_v2` con scopes
(user/client), kinds (preference/constraint/past_decision/learning), importance, expiración, y
un destilador que la puebla. Falta: unificar la legacy, poda/consolidación periódica, y una
vista humana para curarla.

**15. Contexto**: hoy context-stuffing con truncados por presupuesto. Correcto al volumen
actual; el límite llegará con >10-20 clientes o historiales largos → recién ahí retrieval
selectivo.

**16. Permisos**: modelo de 3 roles + RLS + guards por endpoint + visible_menus por
asignación — sólido. Falta: permisos por AGENTE (hoy cualquier director puede dispatchar todo;
el service-role de scripts es total).

**17. Credenciales**: GitHub Secrets (agentes) + Vercel env (dashboard) + bóvedas cifradas con
passphrase para credenciales de clientes/agencia — bien. Riesgo: service_role key en GHA es
llave maestra; mitigación futura: claves por-agente con scopes (Supabase no lo facilita — al
menos rotación).

**18. Auditoría**: `audit_log` (acciones sensibles, solo director) + `agent_runs` (toda
ejecución) + `api_usage` (todo token) — por encima del promedio. Falta: correlación run→outputs
→costo en una vista.

**19. Evitar loops entre agentes**: hoy imposible por construcción (única arista
logistics→stock; coordinación por datos). Regla a conservar: **prohibir agente→agente salvo
lista blanca**; si crece la orquestación, presupuesto de profundidad (max hops) y de gasto por
cadena.

**20. Evitar invención**: guardrails ya en producción — tool_use forzado (sector-trends),
validación de secciones (brandbook), placeholders anti-alucinación, "no inventes: decí que no
está cargado" en los system prompts de consultores, briefs sin defaults (falla ruidoso si falta
cliente). Falta: verificación de citas/fuentes en outputs con web_search.

**21. Errores parciales**: patrón actual = por-cliente con `|| warning` (un cliente falla, el
loop sigue) + drain de logs. Correcto. Falta: reintentos a nivel workflow (hoy solo a nivel
llamada).

**22. Retry**: 3 intentos con backoff exponencial para 429/5xx en `callClaude` — bien. Los
crons semanales son naturalmente re-ejecutables a mano.

**23. Idempotency**: punto débil real. `registerAgentOutput` es append-only (re-runs duplican
outputs), los mails de send-all no marcan enviados por corrida, distill dedupea por contenido
(bien). Recomendación: clave de idempotencia (agente+cliente+período) en outputs y envíos.

**24. Observabilidad**: agent_runs + feed hub + notifs + panel de costos. Falta: alerting
activo cuando un cron falla (hoy hay que mirar Actions) — un aviso simple al bell/mail.

**25. Saber qué agente hizo qué**: resuelto por `agent_runs`/`agent_outputs`/`api_usage.source`
+ audit_log para acciones humanas. Gap menor: content_posts creados por IA llevan `source='ai'`
pero sin link al run que los generó (trazabilidad sugerencia→pieza).

**26. Medir calidad de un agente**: hoy solo señales — 👍/👎 del consultor de contenido,
aprobación/rechazo de fases (feedback field), qué drafts se aprueban. No hay evals. Mínimo
viable: tasa de aprobación por agente (ya calculable con datos existentes) + set chico de casos
dorados para los 3 agentes core.

**27. ROI por automatización**: costo ya medido al token (`api_usage` × pricing). El retorno
aún no se registra (horas ahorradas/ピezas publicadas por origen). Mínimo: etiquetar outputs
usados vs ignorados (la señal draft→published ya existe para contenido).

## Anti-teatro multiagente (regla aplicada a ESTE sistema)

"Use the least autonomous component capable of reliably solving the task" — el sistema YA la
practica más de lo que su documentación sugiere: 4 de los "agentes" son scripts determinísticos,
la producción de video volvió a humanos, finanzas no tiene IA, y la orquestación es por datos y
gates, no por jerarquías de agentes. **Conclusión honesta: no faltan agentes — faltan datos
(métricas), conocimiento versionado (Manual) y cierre de loops. Crear más agentes hoy sería
teatro.**
