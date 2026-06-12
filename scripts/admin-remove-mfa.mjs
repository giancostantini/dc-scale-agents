/**
 * Utilidad de admin: quita TODOS los factores de 2FA de un usuario (vía
 * service-role, sin que el usuario tenga que loguearse). Red de seguridad por
 * si alguien pierde el teléfono / la app y queda fuera con el enforcement.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/admin-remove-mfa.mjs federico@dearmascostantini.com
 *
 * Después esa persona entra solo con contraseña (sin 2FA) y puede volver a
 * enrolarlo desde /perfil.
 */

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const email = process.argv[2];

if (!url || !key) {
  console.error(
    "Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.\n" +
      "La service_role key está en Supabase → Settings → API.",
  );
  process.exit(1);
}
if (!email) {
  console.error("Uso: node scripts/admin-remove-mfa.mjs <email>");
  process.exit(1);
}

const base = url.replace(/\/+$/, "");
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

const listRes = await fetch(`${base}/auth/v1/admin/users?per_page=200`, {
  headers,
});
if (!listRes.ok) {
  console.error("Error listando usuarios:", await listRes.text());
  process.exit(1);
}
const body = await listRes.json();
const users = Array.isArray(body) ? body : (body.users ?? []);
const user = users.find(
  (u) => u.email && u.email.toLowerCase() === email.toLowerCase(),
);
if (!user) {
  console.error(`No existe un usuario con email ${email}.`);
  process.exit(1);
}

const factRes = await fetch(
  `${base}/auth/v1/admin/users/${user.id}/factors`,
  { headers },
);
if (!factRes.ok) {
  console.error("Error listando factores:", await factRes.text());
  process.exit(1);
}
const factors = await factRes.json();
const list = Array.isArray(factors) ? factors : (factors.factors ?? []);
if (list.length === 0) {
  console.log(`${email} no tiene factores de 2FA. Nada que hacer.`);
  process.exit(0);
}

let removed = 0;
for (const f of list) {
  const del = await fetch(
    `${base}/auth/v1/admin/users/${user.id}/factors/${f.id}`,
    { method: "DELETE", headers },
  );
  if (del.ok) removed++;
  else console.error(`No pude borrar el factor ${f.id}:`, await del.text());
}

console.log(`\n✓ Quité ${removed} factor(es) de 2FA de ${email}.`);
console.log("  Ahora entra solo con contraseña y puede re-enrolar en /perfil.\n");
