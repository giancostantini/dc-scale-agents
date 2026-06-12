/**
 * Utilidad de admin: setea una contraseña temporal para un usuario del
 * dashboard, SIN email (usa la service-role key contra la admin API de
 * Supabase Auth). Para destrabar a alguien que perdió la contraseña y no le
 * llega el mail de reset.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/admin-set-password.mjs federico@dearmascostantini.com
 *
 * (Podés pasar una password como 2º argumento; si no, genera una al azar.)
 * Después, esa persona entra con la temporal y la cambia en /perfil →
 * "Cambiar contraseña".
 */

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const email = process.argv[2];
const tempPass =
  process.argv[3] || `Dc-${Math.random().toString(36).slice(2, 10)}x9!`;

if (!url || !key) {
  console.error(
    "Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.\n" +
      "La service_role key está en Supabase → Settings → API.",
  );
  process.exit(1);
}
if (!email) {
  console.error("Uso: node scripts/admin-set-password.mjs <email> [password]");
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

const updRes = await fetch(`${base}/auth/v1/admin/users/${user.id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ password: tempPass }),
});
if (!updRes.ok) {
  console.error("Error seteando la password:", await updRes.text());
  process.exit(1);
}

console.log(`\n✓ Contraseña reseteada para ${email}`);
console.log(`  Contraseña temporal: ${tempPass}`);
console.log(
  `\n  Mandásela por un canal seguro. Que entre con esa y la cambie en\n  /perfil → "Cambiar contraseña".\n`,
);
