/**
 * Generación de contraseñas temporales para el primer login del
 * portal del cliente.
 *
 * Criterios:
 *   · Largo 12 chars — suficiente entropía para que no sea trivial
 *     de fuerza bruta y no es absurdo de copiar/pegar.
 *   · Solo letras (mayúscula + minúscula) + números. NO símbolos
 *     porque algunos clientes de email (Gmail / Outlook web) los
 *     escapan o seleccionan mal cuando hacés doble-click.
 *   · Excluimos chars ambiguos: 0/O/o, 1/l/I para que el cliente
 *     no se trabe leyendo "es 0 o O?" en el mail.
 *   · Garantizamos al menos 1 mayúscula, 1 minúscula y 2 números
 *     para que cumpla con las políticas típicas (incluye la default
 *     de Supabase Auth, mínimo 6 chars + algo de complejidad).
 *
 * Usamos crypto.randomBytes para obtener bytes criptográficamente
 * seguros — NO Math.random(), que es predecible.
 */

import { randomBytes } from "crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I, O
const LOWER = "abcdefghjkmnpqrstuvwxyz";  // sin i, l, o
const DIGIT = "23456789";                  // sin 0, 1

/** Saca un byte criptográficamente seguro y lo mapea al char del alphabet. */
function pick(alphabet: string): string {
  const b = randomBytes(1)[0];
  return alphabet[b % alphabet.length];
}

/**
 * Devuelve una contraseña aleatoria de 12 chars con al menos 1
 * mayúscula, 1 minúscula y 2 números. El resto es mezcla de los
 * 3 alfabetos. Después barajamos para que el patrón no sea
 * "siempre mayúscula primero".
 */
export function generatePortalPassword(): string {
  const required: string[] = [
    pick(UPPER),
    pick(LOWER),
    pick(DIGIT),
    pick(DIGIT),
  ];
  const pool = UPPER + LOWER + DIGIT;
  const rest: string[] = [];
  for (let i = 0; i < 12 - required.length; i++) {
    rest.push(pick(pool));
  }
  const all = required.concat(rest);

  // Fisher-Yates shuffle con crypto-bytes.
  for (let i = all.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join("");
}
