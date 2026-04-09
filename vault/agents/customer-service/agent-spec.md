# Customer Service Agent — Especificacion
Estado: v1 funcional (simulado, sin webhook real todavia)
Ultima actualizacion: 2026-04-09

## Responsabilidad
Chatbot que atiende CLIENTES FINALES en la web y WhatsApp. Resuelve dudas, recomienda productos con links directos, acompana el proceso de compra. Detecta quejas y escala cuando es necesario.

## DIFERENCIA ARQUITECTONICA CRITICA
Este agente habla CON CLIENTES FINALES, no con el equipo D&C Scale.
- El prompt posiciona a Claude como "asistente virtual de {marca}" — NUNCA menciona D&C Scale
- Las respuestas son en tono de la marca del cliente (amigable, profesional)
- Telegram va al equipo D&C Scale como MONITOREO solamente
- El campo `agentResponse` en el JSON es lo que se entrega al cliente

## Modos de operacion
| Modo | Que hace | Trigger tipico |
|------|----------|----------------|
| chat | Conversacion en tiempo real con un cliente final | Webhook / repository_dispatch |
| faq | Generar FAQ estructurada desde catalogo de productos | Manual o Consultant Agent |
| report | Analisis de patrones de interaccion y KPIs de atencion | Domingo |

## Canales soportados
- web-chat: tono amigable y directo
- whatsapp: informal con emojis moderados
- instagram-dm: casual, visual
- email: mas formal y estructurado

## Protocolo de escalacion
El agente marca `escalationNeeded: true` cuando detecta:
- Quejas serias o reclamos formales
- Pedidos de devolucion complejos
- Problemas que no puede resolver con el contexto disponible
- Clientes molestos que necesitan atencion humana

## Flujo de datos
- **Lee:** CLAUDE.md, claude-client.md, strategy.md, product-catalog.md, customer-interactions-log.md, learning-log.md
- **Escribe:** customer-interactions-log.md, learning-log.md, agent-reports/customer-service-*.json
- **Reporta a:** Consultant Agent (via agent-reports)

## Archivos
- `scripts/customer-service/index.js` — Logica principal
- `scripts/customer-service/brief-schema.js` — Contrato de brief
- `.github/workflows/customer-service.yml` — Workflow de GitHub Actions
- `vault/agents/customer-service/agent-spec.md` — Esta especificacion
- `vault/clients/{client}/product-catalog.md` — Catalogo de productos con links
- `vault/clients/{client}/customer-interactions-log.md` — Historial de conversaciones

## Fase actual
- Fase 1: Simulado (via CLI / GitHub Actions, sin webhook real)
- Fase 2: Webhook en Vercel (recibe mensajes de web-chat, devuelve respuesta)
- Fase 3: WhatsApp Business API integration
- Fase 4: Multi-canal con persistencia de contexto entre sesiones
