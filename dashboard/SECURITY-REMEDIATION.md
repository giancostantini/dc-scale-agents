# Reporte de Seguridad + Plan de Remediación — Dashboard D&C

**Fecha:** 2026-06-10
**Alcance:** `dashboard/` (Next.js 16 + Supabase). Multi-tenant.
**Documento interno (repo privado)** — registro de la auditoría y su remediación.

---

## ✅ Estado — implementado en `fix/security-auth-guards` (build de producción en verde)

Cerrada la clase crítica (endpoints service-role sin auth/authz):

- **Hechos:** `brand`, `kpis`, `pieces`, `briefing/latest`, `assets/manifest`, `brandbook/archives`, `brandbook/reprocess`, `bootstrap`, `agents/run`, `agents/runs/[id]/output`, `notify`, `portal/requests/notify`, `diag/env`, `dispatch-email` (secreto interno) + hardening (timing-safe en cron/webhook, headers de seguridad). Pieza central nueva: `lib/auth-guard.ts` (`requireClientAccess` / `requireRole` / `requireInternalSecret`), que lee la sesión de la cookie o Bearer → no hubo que tocar callers del front.
- **Verificados como ya-seguros (sin cambio):** `creative-assistant`, `reporting-agent`, `reporting-send`, `creative-bulk-save` (director-only); `portal/kpi-history`, `portal/consultant` (RLS / scoping por sesión). Eran falsos positivos del finder.
- **Pendiente (fuera de este PR):** bump de `xlsx` (la versión parcheada no está en npm → migrar el paquete), CSP (riesgo de romper estilos/embeds — el resto de headers ya va), cifrar tokens legacy `profiles.outlook_*`, origin-check en `leads/from-landing` (lead capture público).

> **Dependencia operativa:** `dispatch-email` ahora exige `CRON_SECRET` (ya seteado en Vercel). No quitar esa env var o los mails transaccionales dejan de salir (la notif in-app sigue).

---

## ⚠️ Principio rector: SOLO seguridad, CERO cambio funcional

Todos los cambios de este plan son **defensivos**: agregan verificación de autenticación/autorización y endurecen comparación de secretos. **Para el usuario legítimo (director / team asignado / cliente dueño) el sistema se comporta EXACTAMENTE IGUAL.** Lo único que cambia: las requests **no autorizadas** que hoy pasan, pasarán a recibir `401`/`403`.

**Mecanismo de no-regresión:** por cada endpoint que se protege, se verifica/ajusta su **llamador en el front** para que mande el token de sesión que el usuario YA tiene (vía `getSupabase().auth.getSession()` → header `Authorization: Bearer`). Así el flujo real no cambia; solo se cierra el acceso anónimo/cross-tenant.

**Lo que NO se toca:** lógica de negocio, UI/UX, los agentes, los datos, ni el schema (sin migraciones destructivas). No se elimina ningún feature.

---

## Hallazgos CONFIRMADOS (verificados leyendo el código)

### 1. 🔴 CRÍTICO — `GET`/`PUT /api/clients/[id]/brand` sin autenticación
- **Hoy:** el endpoint ([brand/route.ts](app/api/clients/[id]/brand/route.ts)) no valida nada salvo el formato del slug. El llamador ([brandbook/page.tsx:82,122,569](app/cliente/[id]/brandbook/page.tsx)) hace `fetch` **sin token**.
- **Exploit:** cualquiera en internet, sin login, puede:
  - **Leer** el brand completo de cualquier cliente: `GET /api/clients/<slug>/brand`.
  - **Sobrescribir** los `.md` de marca (`positioning.md`, `voice-*.md`, …) que **los agentes IA leen como instrucciones** → **inyección de prompt almacenada** + vandalismo + commit al repo (vía `writeVaultFile`).
- **Qué cambia:**
  1. `app/api/clients/[id]/brand/route.ts` → agregar `requireClientAccess()` al inicio de GET y PUT.
  2. `app/cliente/[id]/brandbook/page.tsx` → las 3 llamadas mandan `Authorization: Bearer <session token>`.
- **Impacto funcional:** **NINGUNO.** El editor de brandbook sigue editando igual (el usuario ya está logueado). Solo deja de ser accesible sin sesión / cross-tenant.

### 2. 🟠 ALTO — `PATCH /api/clients/[id]/kpis` (IDOR cross-tenant)
- **Hoy:** ([kpis/route.ts:44-57](app/api/clients/[id]/kpis/route.ts)) autentica login (`getUser`) pero **no verifica que el usuario tenga acceso al cliente `id`**, y escribe con **service-role (bypassa RLS)**. El comentario "las RLS filtran lo demás" es **falso**.
- **Exploit:** cualquier usuario logueado (incluido un `client` de otro tenant) pisa los KPIs de cualquier cliente cambiando el `id` de la URL.
- **Qué cambia:** `app/api/clients/[id]/kpis/route.ts` → agregar el check de acceso al cliente tras `getUser`. El llamador **ya manda el token** (no se toca el front).
- **Impacto funcional:** **NINGUNO** para quien tiene acceso; bloquea la escritura cross-tenant.

### 3. 🟠 MEDIO-ALTO — `GET /api/diag/env` sin autenticación
- **Hoy:** ([diag/env/route.ts:134](app/api/diag/env/route.ts)) sin auth. Devuelve presencia de env vars + **primeros 8 chars** de `SUPABASE_SERVICE_ROLE_KEY` / `ANTHROPIC_API_KEY` / `GH_DISPATCH_TOKEN`, y **dispara un `repository_dispatch` real a GitHub en cada llamada**. El JSDoc asume "está detrás de auth en el hosting" — en Vercel **no lo está**.
- **Exploit:** exposición de info + fingerprinting de infra + side-effect (dispatch) sin autenticar.
- **Qué cambia:** `app/api/diag/env/route.ts` → exigir rol `director` (o quitar de prod); no exponer preview de secretos; no disparar el dispatch sin auth. Si hay una UI de diagnóstico que lo llama, que mande el token.
- **Impacto funcional:** **NINGUNO** (es una herramienta de diagnóstico interna; se sigue pudiendo usar logueado como director).

### 4. 🟡 MEDIO — `POST /api/notifications/dispatch-email` (y `notify`) sin autenticación
- **Hoy:** ([dispatch-email/route.ts:45](app/api/notifications/dispatch-email/route.ts)) sin auth. Lo llaman otros endpoints server-to-server (fire-and-forget) + un cron.
- **Exploit:** cualquiera dispara envío de mails y marca notifs como `email_sent` (abuso/spam a clientes y team; enumeración de `requestId` por 404 vs 200). Los destinatarios no son atacante-controlados (no es relay de phishing), pero sí abuso de la infra de mail.
- **Qué cambia:** estos endpoints son **internos** → requerir un secreto interno (header `x-internal-secret`, reusando `CRON_SECRET` o uno propio) y que los **llamadores internos** lo pasen. Archivos: `notifications/dispatch-email/route.ts`, `notifications/notify/route.ts` + los endpoints que los invocan.
- **Impacto funcional:** **NINGUNO** — los mails siguen saliendo igual; solo se bloquea el disparo externo anónimo.

---

## La CLASE completa (candidatos del audit, a CONFIRMAR antes de tocar)

Los finders marcaron el **mismo patrón** (service-role / acceso directo sin auth o sin authz) en más endpoints. **Solo se tocan tras confirmar cada uno leyendo el código** (para no modificar lo que ya esté bien):

- `/api/clients/[id]/pieces`, `briefing-latest`, `run-output` / agent-output, `assets-manifest`, `reporting-agent`, `creative-assistant`, `brandbook/archives`
- `/api/clients/bootstrap` (¿falta check de rol `director`?)
- `/api/agents/run` (¿auth opcional?)
- `/api/portal/requests/notify`, consultor por-cliente

**Fix (mismo patrón):** `requireClientAccess()` en el endpoint + token en el llamador.

---

## Endurecimiento adicional (security-only, no funcional)

- **Comparación timing-safe** de secretos: `CRON_SECRET` ([subscribe/route.ts](app/api/calendar/outlook/subscribe/route.ts), hoy `===`) y `clientState` ([outlook/webhook/route.ts](app/api/calendar/outlook/webhook/route.ts), hoy `!==`) → usar `crypto.timingSafeEqual`. **Mismo resultado aceptar/rechazar, solo constant-time.** Cero cambio funcional.
- **Tokens legacy** `profiles.outlook_*` en texto plano (migración 047): migrar/limpiar si quedan filas. No afecta el flujo nuevo cifrado (`outlook_connections`).
- **Headers de seguridad** (CSP, X-Frame-Options, Referrer-Policy…) en `next.config`: aditivo.
- **`xlsx`**: bump a versión sin CVEs conocidos (prototype pollution / ReDoS). Cambio de dependencia, mismo uso.

---

## Componente central (NUEVO, aditivo — no cambia nada existente)

- **Nuevo archivo** `dashboard/lib/auth-guard.ts` → `requireClientAccess(req, clientId)`:
  - `Bearer` → `getUser()` → lookup `profiles.role`.
  - Permite: `director` (global) | `team` con `has_client_assignment(clientId)` | `client` con `client_id` propio.
  - Devuelve `401` (sin sesión) / `403` (sin acceso) o el `user`/`role` para seguir.
  - Reutilizable en todos los endpoints. Es **código nuevo**: no altera ningún comportamiento actual hasta que se invoca.

---

## Falso positivo detectado (por qué la verificación importa)

- `token-crypto-key-no-hex-validation`: `lib/token-crypto.ts` **sí valida** la longitud (64 hex chars). FP / muy menor. **No se toca.**

---

## Garantía de no-regresión funcional

1. Por cada endpoint protegido, se ajusta su **llamador** para mandar el token que el usuario ya tiene → el flujo real no cambia.
2. **Verificación:** `npx tsc --noEmit` + `npm run build` + smoke manual de cada flujo tocado **como usuario autorizado** (editar brand, sync KPIs, diagnóstico como director, envío de mails) → debe funcionar idéntico.
3. **No** se tocan migraciones, lógica de negocio, UI/UX ni agentes.
4. Implementación **endpoint por endpoint**, confirmando cada uno (no un cambio masivo a ciegas).

---

## Orden sugerido de implementación

1. `lib/auth-guard.ts` (helper central).
2. **brand** GET/PUT + su caller (crítico inmediato).
3. **kpis** (authz check) · **diag/env** (gate director) · **dispatch-email/notify** (secreto interno).
4. timing-safe · headers · bump `xlsx` · tokens legacy.
5. Confirmar y arreglar los **candidatos** restantes uno por uno.

---

## Prerrequisito para la bóveda de credenciales

**No se pueden almacenar contraseñas de clientes en el dashboard hasta cerrar, como mínimo, los puntos (1)–(3).** El mismo agujero que hoy deja leer/escribir el brand sin login dejaría leer/escribir las credenciales. La bóveda depende 100% de que esta capa de autorización esté sólida primero.
