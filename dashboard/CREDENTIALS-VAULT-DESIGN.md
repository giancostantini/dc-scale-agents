# Diseño — Bóveda de Credenciales de Clientes

**Estado:** Diseño aprobado. Implementar **DESPUÉS** de los fixes de seguridad (ver [SECURITY-REMEDIATION.md](SECURITY-REMEDIATION.md)).
**Decisión:** Opción C (la passphrase **deriva** la llave de cifrado) + **2FA (TOTP)** en el login. **UNA** passphrase de equipo, compartida Gianluca + Fede. Sin pagar herramientas externas; reusa el AES-256-GCM existente.
**Documento interno** — no publicar.

---

## 1. Las tres capas de protección (cada una cubre algo distinto)

| Capa | Qué protege | Cómo |
|---|---|---|
| **Roles / authz** (de los fixes) | **Quién** ve qué cliente | director = todos · team = asignados · client = ninguno |
| **2FA (TOTP)** en el login | **El acceso**: que sea realmente vos al entrar | código de 6 dígitos de la app (Supabase MFA nativo) |
| **Passphrase** (Opción C) | **El dato en reposo**: cifrado aunque roben el servidor | la passphrase deriva la llave; nunca se guarda en el server |

Las tres juntas = lo más cerca de un gestor profesional, hecho en casa.

---

## 2. Experiencia (flujo del día a día)

1. Entrás al dashboard con email + contraseña → te pide el **código de 6 dígitos** de tu app (2FA). *(una vez al entrar, para todo el dashboard)*
2. Vas a la ficha del cliente → pestaña **"Accesos"**.
3. Primera vez en la sesión: pantalla **bloqueada** → tipeás la **passphrase de la bóveda**.
4. Se desbloquea → ves la lista (WordPress, hosting, mail…) con las passwords en `••••••••`.
5. **Copiar** (al portapapeles sin mostrar) o **Revelar** (mostrar). La usás.
6. Cada reveal queda en **auditoría** (quién, qué, cuándo).

La passphrase se pide **una vez por sesión** (no en cada clic). Fede hace lo mismo con **su** 2FA y **la misma** passphrase.

---

## 3. Diseño técnico

### 3.1 — 2FA en el login
- **Supabase Auth MFA (TOTP)**, nativo: `enroll` (genera QR, se escanea una vez), `challenge` + `verify` en el login (enforcement AAL2).
- Generar **backup codes** al enrolar (para no quedar afuera si se pierde el teléfono).
- Beneficio: protege **todo** el dashboard, no solo la bóveda.

### 3.2 — Cifrado (Opción C, derivación desde la passphrase)
- **Derivación de llave:** `passphrase` + `salt` random (guardado, no es secreto) → **KDF** (Argon2id preferido; scrypt/PBKDF2 como fallback) → **master key** de 32 bytes.
- **Validar la passphrase sin guardarla:** al hacer setup, guardar un *verifier* = `AES-GCM(masterKey, "VAULT_OK")`. Al desbloquear, derivar la llave de la passphrase tipeada y tratar de descifrar el verifier → si da `"VAULT_OK"`, la passphrase es correcta. **Nunca se guarda la passphrase ni un hash de auth de ella.**
- **Cifrado de cada credencial:** `AES-256-GCM` con la master key + IV random por fila (reutiliza `lib/token-crypto.ts` generalizado a una key arbitraria).
- **Dónde se descifra (clave por Vercel stateless):** Vercel no garantiza memoria entre requests, así que **NO** se cachea la llave en el server. **v1 recomendado:** la passphrase se guarda en **memoria del navegador** durante la sesión (`sessionStorage`, se borra al cerrar pestaña/logout) y se manda (TLS) en cada *unlock/reveal*; el server **deriva la llave en memoria, descifra esa credencial, y descarta**. Nada de llave/passphrase persiste en disco/DB.
  - *Hardening futuro:* descifrado **client-side** con WebCrypto → la passphrase y el plaintext **nunca** tocan el server (el server solo sirve ciphertext). Más fuerte, más laburo de front.
- *Mejora opcional (envelope):* DEK random por credencial, "envuelto" por la master key → rotar la passphrase sin re-cifrar todo + aislamiento por ítem. No es necesario para v1.

### 3.3 — Modelo de datos
- **`vault_meta`** (config global del equipo): `salt`, `verifier`, `created_at`. Una fila.
- **`client_credentials`**: `id uuid`, `client_id text FK→clients`, `label`, `category`, `username` (claro), `url` (claro), `secret_encrypted`, `notes_encrypted`, `created_by`, `created_at`, `updated_at`. **RLS director/team** (sin rama client), igual al plan previo de la bóveda.

### 3.4 — Endpoints (todos detrás de `requireClientAccess` **+** passphrase)
- `POST /api/vault/setup` — primera vez: setea `salt` + `verifier` desde la passphrase elegida (solo director).
- `POST /api/vault/unlock` — recibe la passphrase, deriva, valida contra el verifier, responde `ok` (no devuelve la llave).
- `GET /api/clients/[id]/credentials` — lista **enmascarada** (sin secretos).
- `POST/PATCH/DELETE` — alta/edición/baja (cifra al guardar).
- `POST /api/clients/[id]/credentials/[credId]/reveal` — recibe la passphrase, descifra **ese** secreto, **audita** (antes de responder), devuelve plaintext.

### 3.5 — UI
- Pestaña **"Accesos"** en `/cliente/[id]` (componente de lista + modal de alta/edición).
- Pantalla de **unlock** (passphrase) la primera vez por sesión.
- Setup de 2FA en `/perfil` (enrolar TOTP + backup codes).

---

## 4. Trade-offs y operación
- **Olvido de la passphrase = irrecuperable** (por diseño; ni el sistema la conoce). → Guardar la passphrase en lugar seguro + backup.
- **Rotar la passphrase** = re-cifrar las credenciales (script puntual; raro). El modo *envelope* lo haría trivial si se adopta.
- **2FA**: guardar los **backup codes** al enrolar.

---

## 5. Dependencia y orden de implementación
1. **PRIMERO — fixes de seguridad** ([SECURITY-REMEDIATION.md](SECURITY-REMEDIATION.md)). Sin auth/authz sólida, la bóveda es vulnerable por otro lado (los mismos endpoints sin auth dejarían leer/escribir las credenciales).
2. **2FA en el login** (Supabase MFA + UI en `/perfil`).
3. **Bóveda:**
   a. Migración (`vault_meta` + `client_credentials` + RLS).
   b. Crypto (`token-crypto` generalizado + KDF + verifier).
   c. Endpoints (`setup` / `unlock` / CRUD / `reveal` con auditoría).
   d. UI (pestaña Accesos + pantalla de unlock).
4. Verificación: tsc + build + E2E (setup → unlock → alta → reveal → audit) + chequeo de que sin passphrase / sin 2FA / cross-tenant todo da 401/403.
