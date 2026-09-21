---
type: prospecto
vertical: automatizacion
status: viabilidad
updated: 2026-09-21
---

# 🧭 Distribuidora con 7 sucursales (Doria) — viabilidad de la solución

> **Interno.** Vive en `agency/prospectos/` a propósito: el Consultor-Cliente del portal no lee
> esta carpeta. Nombre del cliente: **a confirmar** (el archivo tiene slug provisorio).
>
> ⚠️ **No crear `vault/clients/<slug>/` a mano para este prospecto.** `client-bootstrap` saltea
> el scaffold si la carpeta ya existe (`scripts/client-bootstrap/index.js:128`) y el cliente
> quedaría sin `claude-client.md`/`strategy.md`. Cuando firme: alta por el wizard → bootstrap →
> recién ahí mover este doc a su carpeta.

Volver: [Gerencia de Ventas](../../empresa/Gerencia%20de%20Ventas.md) · [HOME](../../HOME.md)

## 1. Resumen

Reunión del viernes 2026-09-18. Distribuidora que trabaja con Doria (igual que Mundipack), con
7 sucursales. Pide: dashboard tipo Mundipack + alertas de stock + agente de venta cruzada +
conciliación bancaria + consolidar las sucursales + agente de WhatsApp que tome pedidos y,
idealmente, los registre en Doria.

**Todo es viable. Nada depende de tecnología que no tengamos.** Lo único que no controlamos es
la **escritura en Doria**: depende de que Dario abra una puerta de entrada. Tiene un plan B
(bandeja del operador) que no bloquea el proyecto y que de todos modos es la primera fase.

Investigado para este doc: repo de Mundipack, repo de BrainBill y la vía oficial de WhatsApp
(fuentes 2025-2026, al final).

## 2. Veredicto por pieza

| Pieza | Viable | Dificultad | Depende de | Qué ya tenemos |
|---|---|---|---|---|
| Dashboard base | Sí | Baja-media | Que Dario arme las vistas `ZZZ_*` en este Doria (no vienen de fábrica) | ~80% de Mundipack se reusa. Es single-tenant → se clona el repo. Rebranding ≈ 15 strings + prompts del agente + recalibrar la regla cliente→vendedor |
| Alertas de stock | Sí | **Baja** | `ZZZ_VistaStock` + vista de renglones | El dato ya llega en cada ingesta. Mundipack hoy NO alerta (solo filtro "sin stock" en `/productos`) y el agente `stock` de Growth lee markdown del vault, no Doria. Hay que hacerlo, pero es barato |
| Venta cruzada | Sí | Baja-media | **Vista de renglones** (crítica) | `oportunidadesFamilias` (`src/lib/queries/lineas.ts:217`), oportunidades `nunca_llevo` / `dejo_de_llevar` por cliente (`src/lib/ficha-cliente.ts:49,409`), RFM (`queries/rfm.ts`), "lo que suele pedir" y precios por cliente |
| Conciliación bancaria | Sí | Media | Formato de export de cada banco; cómo identifican hoy quién depositó | Facturas abiertas, pagos y saldos de Doria ya en el dashboard; piezas copiables de BrainBill |
| Consolidar 7 Dorias | Sí, con condiciones | **Alta — la más incierta** | Dario: topología y si comparten códigos | El código hoy asume 1 solo Doria |
| Agente WPP que toma pedidos | **Sí** | Media | Alta en Meta (~1-2 semanas, burocrático) | Webhook, firma, dedup, memoria y Claude **ya codeados** en Mundipack sobre la API oficial |
| Registrar el pedido en Doria | Depende 100% de Dario | Fuera de nuestro control | Tablas buzón o stored procedure | Patrón resuelto en BrainBill: agente local + outbox + `writesEnabled=false` |

## 3. Lo más difícil, en orden

1. **Escribir en Doria.** No es un problema técnico nuestro: es que Dario acepte y construya la
   puerta. Hoy todo es solo-lectura sobre vistas (confirmado: ni un INSERT/UPDATE contra Doria en
   todo Mundipack). Ver §5.
2. **Los 7 Dorias — datos maestros.** Si cada sucursal numera productos y clientes por su cuenta,
   hay que construir un maestro unificado (mapeo producto↔producto, cliente↔cliente). Eso es lo
   caro, no las 7 conexiones. Más la operación: 7 servidores prendidos 24/7 con VPN — en
   Mundipack con uno solo ya dolió (`docs/operacion-ingesta.md`).
3. **Calidad conversacional del pedido.** "Mandame 10 de los vasos de 8" → ¿qué producto? Se
   resuelve con el historial del cliente como prior + resumen y confirmación. Sub-problemas:
   precio por cliente, frescura del stock (ingesta 3×/día no alcanza) y unidades caja/unidad (la
   vista de productos de Doria no trae empaque — ya lo sufrimos en `PresupuestoBuilder.tsx`).
4. **Identidad del cliente por teléfono.** Supuesto a verificar: que los teléfonos en Doria no
   estén limpios. Número desconocido → pedir RUT/razón social → un humano valida el vínculo una vez.
5. **Conciliación: identificar al depositante** cuando el extracto no dice quién fue, y el
   matching N:M (un depósito paga 3 facturas / una factura se paga en 2 depósitos).

**Lo que NO es difícil aunque lo parezca:** conectar un agente a WhatsApp, stock y venta cruzada.

## 4. El agente de WhatsApp

### 4.1 Por qué "no pudimos" la vez pasada

No falló nada técnico. En Mundipack está todo el código — `src/app/api/webhooks/whatsapp/route.ts`,
`src/lib/whatsapp/{client,verify-signature,politica-firma,webhook-parse,templates}.ts`,
`src/lib/agent/wa-responder.ts`, modelos `WaMensaje`/`WaTurno`, runbook `docs/whatsapp-go-live.md` —
pero las 4 env vars `META_*` nunca se cargaron: **el alta en Meta no se hizo** y se priorizó el
chat in-app. Sin esas vars el cliente corre en **mock silencioso** (devuelve `ok:true` con un id
falso y loguea en vez de mandar), así que "parece" andar. El 2026-09-09 se dio por desestimado
para Mundipack (decisión de producto: el agente vive en el dashboard y el portal).

### 4.2 Cómo lo hace Torem (y todos los que lo hacen en serio)

Por la **WhatsApp Cloud API oficial de Meta**. Torem (uruguaya, incubada en el CIE de ORT,
torem.me) no declara su conexión, pero con 150+ tiendas, campañas masivas e inbox multi-agente no
hay otra forma sin que te baneen; si es Tech Provider propio o va sobre un BSP no lo pude
confirmar. Dato útil: Torem está enfocada en e-commerce B2C — la distribución mayorista B2B está libre.

Las librerías no oficiales (Baileys, whatsapp-web.js, Evolution API, WAHA) **se descartan**:
violan los términos de WhatsApp y el ban del número es permanente y sin aviso. Para una
distribuidora el número ES el canal de ventas.

### 4.3 Por qué hoy es viable y barato

- **Coexistence** (vía Embedded Signup, disponible globalmente): el mismo número funciona a la vez
  en la app WhatsApp Business y en la Cloud API, con los mensajes espejados. El cliente
  **conserva su número y su historial, y la persona que hoy toma pedidos sigue viendo los chats y
  puede meterse**. Requisitos: usar la app *Business* (si usan WhatsApp común, migran primero) y
  abrirla al menos cada ~13 días.
- **Política de Meta** (para todos desde el 15-ene-2026): prohíbe chatbots de IA *de propósito
  general* (tipo ChatGPT en WhatsApp). Un agente de toma de pedidos de un negocio está
  **explícitamente permitido**. Guardarraíl de diseño: el agente se niega a salir de
  catálogo / pedidos / entregas / cuenta.
- **Costo Meta ≈ US$0 en operación normal.** Desde jul-2025 se cobra por mensaje: cuando el
  cliente escribe se abre una ventana de 24 h en la que los mensajes libres son gratis. Solo se
  paga por proactivos fuera de ventana (recordatorio de recompra = template *utility*, centavos;
  *marketing* es más caro). Uruguay cae en "Rest of Latin America"; **la tarifa exacta no la pude
  confirmar** — se baja del rate card en el panel de Meta.
- **Sin BSP.** Twilio/360dialog/etc. agregan abono o markup y acá el tráfico es casi todo
  entrante. Cloud API directo con la cuenta de Meta del cliente. (Si más adelante damos de alta
  varias distribuidoras, evaluar registrarnos como Tech Provider.)
- El costo real recurrente es **Claude + transcripción de audio**, no Meta.

### 4.4 Arquitectura

```
Comercio → WhatsApp → Cloud API → webhook (se reusa) → identificar cliente por teléfono
  → loop del agente con tools:
      buscar_producto   (catálogo + historial del cliente como prior)
      lo_de_siempre · precio_cliente · stock
      sugerencias       (habituales olvidados + venta cruzada — MISMO motor que usa el vendedor)
      armar_pedido      (borrador) · derivar_a_humano
  → resumen + botón "Confirmar" → Pedido en nuestra DB
  → bandeja del operador en el dashboard → Doria
```

| Se reusa de Mundipack | Hay que construir |
|---|---|
| Webhook con handshake, firma `X-Hub-Signature-256`, dedup por `wamid`, 200 siempre | Identidad por teléfono del **cliente final** (hoy identifica vendedores) + flujo de número desconocido |
| Cliente Cloud API (`sendText`, `sendTemplate`, normalización E.164) | Modelo `Pedido` + renglones + estados (Mundipack no tiene pedidos; el presupuesto es un PDF efímero) |
| Memoria conversacional (10 turnos) | Tools de pedido + búsqueda de catálogo por tool (cientos/miles de productos no van en el prompt) |
| Loop del agente con tools y prompt cacheado | **Audio**: bajar el `media_id` por Graph API + STT externo (Whisper/Deepgram — la API de Claude no recibe audio). Hoy el webhook contesta "solo leemos texto" (`route.ts:155`) |
| Patrón propone→confirma auditado (`AccionAgente`) | Handoff humano: si el operador contesta desde la app (evento `smb_message_echoes`) el agente se calla en esa conversación |
| | Botones de confirmación (interactivos) + bandeja del operador |
| | Stock más fresco que 3×/día (ver §5, agente local) |

- **Interactivos solo para el cierre.** Las listas (máx 10 opciones) y el catálogo nativo (máx 30
  ítems) no sirven para un pedido mayorista de 30 renglones. Texto libre + audio es mejor UX y es
  lo que sus clientes ya hacen hoy.
- **Deriva a humano** ante: número desconocido, cliente con deuda vencida, ambigüedad que no
  resuelve en 2 intentos, reclamo.
- **Fotos de comprobantes de pago que manden por el chat → alimentan la conciliación** (§7). Las
  dos piezas se conectan.
- **Gates** (principio 5 de la agencia). Fase A: el agente arma, el operador aprueba cada pedido.
  Fase B: auto-aprobación de pedidos de bajo riesgo (cliente conocido, productos habituales,
  dentro de crédito) cuando las métricas de aprobación lo justifiquen.
- **La landing** queda como complemento (portal con "repetir último pedido"), no como camino
  principal. No hace falta.

### 4.5 Camino crítico

El alta en Meta. Se arranca **ya**, en paralelo y sin código — Anexo B.

## 5. Escritura en Doria — qué proponerle a Dario

En orden de preferencia:

- **A. Tablas buzón (recomendada).** Nosotros hacemos INSERT en una tabla de entrada (cabezal +
  renglones) con clave de idempotencia; Doria la importa con SUS reglas (numeración, reserva de
  stock, precios, CFE) y marca el estado; nosotros leemos el estado. Dario conserva el control →
  es el "sí" más fácil de conseguir. Sirve igual para recibos de cobro (conciliación).
- **B.** Stored procedure que exponga Dario. · **C.** API, si Doria tuviera.
- **D. Plan B sin escritura — no bloquea nada.** Bandeja de pedidos ya interpretados, en el orden
  de la pantalla de carga de Doria. El operador pasa de "leer chats + interpretar + tipear" a
  "revisar + cargar". Es la Fase A de todos modos.

**Transporte.** El cron de GitHub Actions 3×/día no sirve para pedidos. Se usa un **agente local
on-prem** que hace polling de un outbox en la nube — patrón ya resuelto en BrainBill
(`apps/agent` + `apps/web/src/server/deliveries.ts`: idempotencia, reintentos, confirmación de
carga, y `writesEnabled: false` por defecto en el archivo local del cliente —
`apps/agent/src/config.ts:105`, `jobs.ts:83`). El mismo agente puede dar stock más fresco.

## 6. Las 7 sucursales

Lo de Mundipack (MANCUELLO/DEARMAS, `src/lib/doria/empresa.ts`) **no es este caso**: ahí son dos
razones sociales dentro de UN Doria, resuelto con un filtro SQL. Acá serían N orígenes.

**Cambios nuestros (acotados):** pool por origen (`src/lib/doria/sql-client.ts:20` es un singleton
de módulo), prefijo de origen en `externalId` (hoy `DOR-C-{id}` colisionaría entre Dorias), clave
compuesta en `SyncWatermark` (`prisma/schema.prisma:592`), matriz de jobs en `ingest-doria.yml`,
dimensión `sucursal` en Venta/Stock/Cliente, tablas de mapeo maestro si los códigos difieren
(sugerencia por IA + confirmación humana), y alerta por origen caído (hoy la ingesta sale "en
verde" cuando falla la conexión, para no spamear — con 7 orígenes hay que rediseñarlo).

**Recomendación: piloto con 1 sucursal.** Primera herramienta a correr: `scripts/diag-doria.ts`
(lista vistas, columnas y totales). El código ya autodescubre nombres de vista/columna para
renglones, direcciones y saldos, lo que abarata apuntarlo a otro Doria.

## 7. Conciliación bancaria

**Decisión (Gian, 2026-09-21): módulo dentro del dashboard del cliente**, no en BrainBill.
Motivo: BrainBill reusa ~70% de plataforma pero su dominio es 100% "factura de compra" (modelo
`ExtractedDocument`, matching renglón→producto y payload `brainbill.purchase.v1` congelado), y el
matching necesita las facturas/saldos abiertos de Doria, que ya viven en el dashboard. Si
funciona, después se evalúa generalizarlo como producto.

- **Extractos: sin IA.** Supuesto a verificar banco por banco: que el e-banking exporte
  CSV/XLSX. Parser determinístico + mapeo de columnas por banco, copiando de BrainBill
  `packages/connectors/src/file/table.ts` (`parseCsv`/`parseXlsx`) y el patrón del wizard
  `guessProductMapping` (`catalog-import.ts:22`). PDF solo como fallback.
- **Comprobantes de los clientes (foto / captura / PDF): con IA.** Structured output, patrón de
  `apps/web/src/server/extraction/claude.ts`, con schema nuevo: banco, fecha, monto, moneda,
  ordenante, referencia, cuenta destino.
- **Motor de matching en cascada, determinístico:**
  1. comprobante ↔ movimiento (monto + fecha ±2 días + cuenta);
  2. movimiento ↔ cliente (RUT/nombre en la descripción + **alias aprendidos**: "este ordenante =
     este cliente", que se guardan al confirmar);
  3. cliente ↔ facturas abiertas (monto exacto, combinaciones N:M, o "a cuenta").
  Propone con nivel de confianza; **el humano confirma siempre — dinero = humano**. Centavos
  enteros, como `src/lib/queries/conciliacion.ts`. Cuentas UYU y USD.
- **Salida:** planilla por cuenta bancaria + consolidado de todos los bancos (conciliado /
  pendiente / sin identificar), exportable a XLSX. Eso resuelve el "centralizar".
- **Lección de Mundipack:** Doria no imputa pagos parciales a facturas (`queries/cobranzas.ts:74`,
  `imputarSaldo`) → conciliar primero a nivel saldo de cliente. Registrar el recibo en Doria = la
  misma dependencia de escritura del §5 (fase 1: export).

## 8. Venta cruzada y stock

- **Venta cruzada — sumar a lo que ya existe:**
  1. *Rubro del cliente* (cafetería, almacén, rotisería…). ¿Hay campo en Doria? Si no:
     clasificación por IA desde nombre + canasta, confirmada por el vendedor.
  2. *Afinidad a nivel producto dentro del rubro* ("cafeterías que llevan vasos también llevan
     servilletas: 85%"). SQL puro sobre renglones; no hace falta ML.
  3. *Empuje:* tarjeta pre-visita en el portal del vendedor + el agente in-app.

  **Un motor, tres superficies** (vendedor, agente in-app, agente de WPP). La IA solo redacta el
  argumento; el cálculo es determinístico.
- **Stock — job determinístico, no agente** (principio 4: función > script > workflow > agente).
  Días de cobertura = stock ÷ venta diaria (renglones 30/60/90 d), umbral según tiempo de
  reposición, por sucursal, y **sugerencia de traspaso entre sucursales** (a una le sobra, otra
  quiebra — valor propio de tener 7). Guardar un snapshot diario desde el día 1: hoy solo hay
  foto actual (`Producto.stockActual`), sin histórico. Canales: campana + digest por mail.

## 9. Fases sugeridas

| Fase | Qué | Depende de |
|---|---|---|
| **F0** — ya, sin código, en paralelo | Reunión con Dario (Anexo A) · arrancar alta en Meta (Anexo B) · `diag-doria` contra una sucursal | — |
| **F1** | Clon del dashboard con 1 sucursal + alertas de stock + venta cruzada | Vistas `ZZZ_*` + renglones |
| **F2** | Consolidación de las 7 sucursales | Respuestas de Dario sobre topología y códigos |
| **F3** | Conciliación bancaria | Exports de los bancos |
| **F4** | Agente de WPP con bandeja del operador, sin escribir en Doria (paralelizable con F2/F3) | Alta en Meta + F1 |
| **F5** | Escritura en Doria vía buzón + auto-aprobación de pedidos de bajo riesgo | Dario + métricas de F4 |

## 10. Supuestos sin verificar

- Que este Doria tenga (o Dario pueda armar) las mismas vistas `ZZZ_*`, **incluida la de renglones**.
- Topología real de los 7 Dorias y si comparten códigos.
- Que usen la app WhatsApp *Business* (requisito de Coexistence) y no WhatsApp común.
- Que todos sus bancos exporten movimientos a CSV/XLSX.
- Calidad de los teléfonos de clientes en Doria.
- Tarifa exacta de Meta para Uruguay y conexión exacta de Torem (no confirmadas).

---

## Anexo A — Agenda para Dario

**Lectura (para F1/F2)**
1. Las 7 sucursales: ¿7 SQL Server en 7 lugares, 7 bases en un servidor, o 7 "empresas" dentro
   de un Doria?
2. ¿Comparten códigos de producto y de cliente, o cada sucursal numera por su cuenta? ¿Un mismo
   cliente puede comprar en dos sucursales?
3. ¿Puede replicar las vistas de Mundipack (`ZZZ_VistaClientes`, `Productos`, `Usuarios`,
   `Facturas`, `Pagos`, `Stock`, renglones, saldos de cta. cte.) en cada origen? ¿Usuario SQL
   read-only solo sobre esas vistas?
4. ¿Hay campo de rubro/giro del cliente? ¿Y de empaque (unidades por caja) en productos?
5. ¿Los servidores están prendidos 24/7? ¿Se puede instalar Tailscale (o equivalente) en cada uno?
6. ¿El stock se lleva por sucursal/depósito? ¿Existen traspasos entre sucursales en Doria?

**Escritura (para F5 — plantearlo como evolución, no como requisito)**
7. ¿Aceptaría tablas buzón de entrada (cabezal + renglones, con clave de idempotencia) que Doria
   importe con sus reglas y a las que les marque estado? ¿O prefiere un stored procedure?
8. ¿Qué datos mínimos necesita Doria para dar de alta un pedido? (cliente, sucursal, depósito,
   lista de precios, vendedor, condición de pago…)
9. ¿El mismo mecanismo serviría para recibos de cobro?
10. ¿Se puede correr un proceso liviano nuestro en el servidor (agente local que hace polling
    hacia afuera, sin abrir puertos entrantes)?

## Anexo B — Checklist de alta en Meta con Coexistence

1. **Confirmar con el cliente** que el número de pedidos está en la app **WhatsApp Business**
   (no WhatsApp común) y quién es el admin de su Facebook/Meta.
2. **Meta Business portfolio** del cliente con nombre legal, dirección y web que coincidan con
   los registros públicos (los mismatches chicos son la causa #1 de rechazo).
3. **Verificación del negocio** (documentación de la empresa). 1-5 días hábiles.
4. **App de Meta** tipo Business + producto WhatsApp → pasarla a modo **Live**.
5. **Alta del número por Embedded Signup eligiendo "conectar la app WhatsApp Business existente"
   (Coexistence)** — NO registrarlo como número nuevo: eso lo saca de la app y pierde el historial.
6. **Display name** aprobado por Meta.
7. **Token permanente** de System User (`whatsapp_business_messaging` +
   `whatsapp_business_management`). ⚠️ El token de la pantalla API Setup vence en 24 h.
8. **Webhook**: callback `…/api/webhooks/whatsapp`, verify token ya deployado antes de
   verificar (si no: 403), y **suscribir el campo `messages`** (si no: webhook "verificado" al
   que nunca llega nada — falla silenciosa). Para handoff, suscribir también los ecos de la app.
9. Cargar `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_VERIFY_TOKEN`, `META_APP_SECRET` y
   **redeployar**. Verificar en logs que NO diga `[wa-mock]`.
10. Templates (solo para proactivos): crear y esperar aprobación, 24-72 h.
11. Operación: abrir la app al menos cada ~13 días; medio de pago cargado en la WABA del cliente.

Plazo total hasta el primer mensaje real: **~1-2 semanas**, dominado por la verificación.

## Anexo C — Preguntas para el cliente

- ¿Cuántos pedidos por día entran por WhatsApp, en qué horarios, y qué proporción es audio?
- ¿Un solo número para las 7 sucursales o uno por sucursal? ¿Quién atiende cada uno?
- ¿Cómo decide hoy el operador a qué sucursal/depósito va un pedido?
- ¿En qué bancos y monedas cobran? ¿Cómo identifican hoy quién depositó?
- ¿Qué significa para ellos "conciliar entre sucursales": ver todo junto, o también
  traspasos/deudas entre sucursales?
- ¿Precios por lista, por cliente, o negociados por vendedor?

## Fuentes (WhatsApp)

- [Onboard WhatsApp Business app users (Coexistence) — Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Coexistence — 360dialog docs](https://docs.360dialog.com/docs/resources/phone-numbers/coexistence)
- [Embedded Signup — Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Become a Tech Provider — Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)
- [Pricing on the WhatsApp Business Platform — Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Política de chatbots de IA 2026 explicada — respond.io](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban)
- [Audio messages — Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages)
- [Baileys / whatsapp-web.js: reportes de ban — LeadNotifi](https://leadnotifi.com/articles/baileys-whatsapp-web-js-ban-experiences)
- [Torem — CIE Universidad ORT](https://cie.ort.edu.uy/emprendimientos/torem) · [Torem Agente IA](https://www.torem.me/agente-ia) · [Forbes Uruguay](https://www.forbesuruguay.com/negocios/startup-uruguaya-desarrollo-agente-ia-vende-resuelve-consultas-tres-meses-uno-sus-clientes-logro-vender-mas-10-millones-n82230)
