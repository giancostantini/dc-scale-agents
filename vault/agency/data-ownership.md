# Data ownership — qué fuente manda en cada par vault ↔ DB

Stage 1d del roadmap (derivado de `docs/ai-company-audit/11-data-memory-architecture.md`).
Regla general: **Supabase = estado operacional y números; vault = conocimiento cualitativo y
narrativo.** Cuando un dato vive en los dos lados, acá está escrito cuál es la verdad y qué
rol cumple la copia. Si encontrás un conflicto, gana la columna "Fuente canónica" y el otro
lado se corrige.

## Tabla de pares

| Dato | Fuente canónica | El otro lado es… | Quién escribe |
|---|---|---|---|
| Datos del cliente (fee, moneda, status, módulos, contactos) | **DB `clients`** | `claude-client.md` es narrativa de contexto — NO números de contrato | Director vía dashboard |
| Contexto narrativo del cliente (quién es, posicionamiento) | **Vault `claude-client.md`** | — | client-bootstrap + equipo |
| Brandbook (voz, visual, restricciones) | **Vault `brand/*.md`** (8 archivos) | El PDF original en Storage es solo el insumo | brandbook-processor (desde el PDF) |
| Estrategia del cliente | **DB `phase_reports`** (aprobados, con historial de versiones) | `strategy.md` del vault = resumen vivo para agentes; se actualiza al aprobar fases | phases/generate + gate director |
| Metodología de la agencia (método, SOPs, checklists) | **Vault `agency/methodology/`** | Los prompts la citan — nunca la duplican inline | Socios (editar acá cambia lo que citan los reportes) |
| Calendario de contenido | **DB `content_posts`** (planner del dashboard) | `content-calendar.md` = registro/nota para agentes | content-strategy + CM |
| Piezas/briefs de contenido | **DB** (`content_posts` + agent_outputs) | `content-library.md` = biblioteca curada con métricas | creative-assistant + CM |
| Memoria de directivas (preferencias, restricciones, decisiones) | **DB `consultant_memory_v2`** (única — mig 085) | `learning-log.md` = aprendizajes narrativos humanos, NO directivas | Consultores (save_memory) + distill-learnings |
| Hooks / formatos ganadores | **Vault `agents/content-creator/hook-database.md` + `winning-formats.md`** | — | social-media-metrics |
| Métricas de marketing (por ahora, carga asistida) | **Vault `metrics-log.md` / `performance-log.md`** (hasta ingestión Meta = Stage 2, que moverá la verdad a DB) | — | Equipo + reporting-performance |
| Ofertas / paquetes del cliente | **DB `client_requests`** (metadata jsonb) | — | Cliente vía portal |
| Finanzas (pagos, egresos, cuentas, fees, TC) | **DB** (`payments`, `expenses`, `cuentas_bancarias`, `client_fee_schedules`, `exchange_rates`) | El vault NUNCA guarda números financieros | Director + cron fx-rates |
| Credenciales de clientes | **DB bóveda cifrada** (`client_vaults`, `client_credentials` — envelope RSA+AES) | PROHIBIDO en vault markdown | Cliente/director vía bóveda |
| Ejecuciones de agentes y outputs | **DB `agent_runs` / `agent_outputs`** | Los archivos que el agente escribe al vault son el entregable, no el log | Agentes vía supabase.js |
| Auditoría y costos API | **DB `audit_log` / `api_usage`** | — | Triggers + endpoints |
| Tendencias del sector | **Vault** (archivos de sector-trends; histórico = commits de git) | — | sector-trends (semanal) |

## Reglas operativas

1. **Números → DB. Narrativa → vault.** Si dudás: ¿se suma/filtra/proyecta? → DB. ¿Se lee
   para escribir mejor? → vault.
2. **Nada financiero ni credenciales en markdown.** Sin excepciones.
3. **El vault del cliente tiene dos zonas:** pública (la lee el Consultor-Cliente del portal)
   e interna (`learning-log.md`, `calls-log.md`, `_archive/` — el portal no las lee jamás).
   Info sensible interna va SIEMPRE a la zona interna.
4. **La copia no se edita a mano.** Si `strategy.md` difiere del phase_report aprobado, se
   regenera desde el reporte — no se parchea el reporte desde el vault.
5. **Cambios de metodología = PR.** `agency/methodology/` afecta prompts de producción;
   se revisa como código.

---
[HOME](../HOME.md) · [Metodología](methodology/README.md) · [Evals](evals/README.md) · [Clientes](../clients/README.md)
