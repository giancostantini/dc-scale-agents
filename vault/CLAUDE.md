# D&C Scale Partners — Contexto Maestro
Ultima actualizacion: 2026-04-06

## Quienes somos
Agencia con dos verticales:
1. **Crecimiento digital y marketing** — paid media, contenido, SEO, conversion
2. **Automatizacion de procesos con IA** — agentes que operan en piloto automatico

Gianluca Costantini (estrategia y arquitectura de agentes) + Federico (dashboards y frontend).

## Estado actual del negocio
- Cliente activo: DMancuello (eCommerce artesanal de cuero, Uruguay, Shopify)
- Fase DMancuello: Por definir
- Prioridad #1 hoy: Construir la infraestructura base (vault + repo + primer agente)
- Mercados objetivo: Colombia, Peru, Paraguay

## Como trabajo yo (Gianluca)
- Prefiero avanzar hacia adelante, no retroceder
- Valido manualmente antes de automatizar
- Builds iterativos en sesiones de trabajo
- Corrijo directo cuando hay errores
- Las dos verticales se conectan a un dashboard padre, pero eso es lo ultimo

## Stack activo
- Obsidian: memoria persistente (vault local)
- Claude Code: agente principal de ejecucion
- Claude API (Sonnet 4.6): razonamiento en produccion
- GitHub Actions: automatizacion programada (reemplaza n8n, gratis 2.000 min/mes)
- GitHub: control de versiones y scripts
- Telegram Bot: delivery de reportes y alertas
- Google Sheets: config operacional de clientes
- Supabase: base de datos PostgreSQL + API REST (datos cuantitativos historicos)
- Vercel: hosting de dashboards
- NanoBanana Pro: generacion de statics/ads
- Remotion: generacion de video con codigo (local, gratis)
- ElevenLabs: voces y audios
- Blotato MCP: publicacion automatizada en redes
- Claude in Chrome: capturas web automaticas

## Reglas de la vault
1. Siempre leer claude-client.md del cliente antes de generar contenido
2. Escribir aprendizajes en learning-log.md despues de cada resultado
3. Actualizar content-library.md con metricas reales cuando llegan
4. Nunca hardcodear datos de clientes en scripts
5. Generic-first: cada sistema debe funcionar para cualquier cliente cambiando solo la config
6. Si algo falla, el error llega por Telegram, no rompe todo
7. Datos crudos van a Supabase, aprendizajes cualitativos van a la vault

## Clientes activos y su contexto
- DMancuello: ver /clients/dmancuello/claude-client.md

## Vertical de Marketing — Prioridades de agentes
1. Content Creator Agent (PRIORIDAD MAXIMA)
2. Content Strategy Agent
3. Morning Briefing Agent
4. SEO Agent
5. Meta Ads Monitor Agent (bloqueado por permisos Meta)
6. Social Media Metrics Agent

## Vertical de Automatizacion — Productos
- Agente de Reportes (Morning Briefing)
- Agente de Contenido
- Agente de Prospeccion (D&C Scale interno)
- Agente de Atencion (chatbot WhatsApp/web)
- Agente de SEO
- Agente de Ads
- Sistema de Onboarding automatizado
- Dashboard IA con chatbot

## Vertical de Automatizacion — Prioridades de construccion
1. Infraestructura base (vault + repo + Supabase)
2. Morning Briefing para DMancuello (valida el pipeline)
3. Sistema de prospeccion (Apollo + Prospeo + scoring + micro-diagnostico)
4. Dashboards (cliente + interno)
5. Onboarding automatizado + generador de propuestas

## Arquitectura — Principios no negociables
1. La vault es la verdad — todo lo que importa vive en Obsidian
2. Claude Code construye, GitHub Actions ejecuta — no mezclar roles
3. Los agentes aprenden — cada resultado se escribe de vuelta a la vault
4. Todo conectado por contexto — un agente lee el output del otro
5. Generic-first — ningun agente tiene datos hardcodeados de un cliente
6. Falla silenciosamente — error a Telegram, no rompe todo
7. Supabase como historial, vault como interpretacion

## Metodologia de 5 fases (para cada cliente)
1. Diagnostico (5-7 dias) — ROAS break-even, competidores, ads analysis
2. Estrategia (3-5 dias) — canales, funnel, proyeccion 90 dias
3. Setup (1-3 semanas) — contenido, pixel, dashboard
4. Lanzamiento (2-4 semanas) — campanas con presupuesto controlado
5. Optimizacion (continua) — redistribuir a ganadores, escalar
