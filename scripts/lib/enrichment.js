// ==================== ENRIQUECIMIENTO DE CONTACTOS ====================
// Convierte "la empresa X está buscando un community manager" en "hablale a
// Fulana, que es la gerente de marketing, a este mail".
//
// Provider-agnóstico a propósito: hoy la única implementación es Apollo,
// pero su cobertura en Uruguay —nuestro mercado #1— es floja (su fuerte en
// Latam son Brasil y México). Si mañana conviene otro proveedor, se agrega
// acá abajo sin tocar el agente.
//
// SIN `APOLLO_API_KEY` NO FALLA: devuelve { dormant: true } y el agente
// sigue cargando prospectos como siempre. Mismo patrón que la ingestión de
// Meta y que logistics→stock.
//
// GUARDA DE CRÉDITOS (lo que evita quemar el saldo por un bug):
//   · La búsqueda de personas NO consume créditos; solo el revelado de
//     datos (bulk_match) los gasta.
//   · JAMÁS pedimos teléfono ni waterfall: ahí es donde un contacto pasa
//     de costar 1 crédito a costar 9.
//   · Tope duro por corrida, contando los `credits_consumed` REALES que
//     devuelve la API, no una estimación.

const APOLLO_BASE = "https://api.apollo.io";
/** Búsqueda de personas. Si tu plan devuelve 403/404 acá, el fallback es
 *  el endpoint legacy — se reporta cuál se usó para no adivinar. */
const PEOPLE_SEARCH_PATHS = [
  "/api/v1/mixed_people/api_search",
  "/api/v1/mixed_people/search",
];
const BULK_MATCH_PATH = "/api/v1/people/bulk_match";
const USAGE_STATS_PATH = "/api/v1/usage_stats/api_usage_stats";

/** Apollo limita ~50 req/min. */
const THROTTLE_MS = 1200;
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function apiKey() {
  return process.env.APOLLO_API_KEY?.trim() || null;
}

/** ¿Está configurado el enriquecimiento? Se pregunta antes de usarlo. */
export function enrichmentStatus() {
  if (!apiKey()) {
    return {
      configured: false,
      provider: "apollo",
      reason:
        "APOLLO_API_KEY no está seteada — el enriquecimiento queda dormido. El agente igual carga prospectos; solo no completa el contacto.",
    };
  }
  return { configured: true, provider: "apollo" };
}

let lastCall = 0;
async function apolloFetch(path, body, attempt = 1) {
  const key = apiKey();
  if (!key) throw new Error("APOLLO_API_KEY no seteada");

  const wait = THROTTLE_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  let res;
  try {
    res = await fetch(`${APOLLO_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(1000 * Math.pow(2, attempt - 1));
      return apolloFetch(path, body, attempt + 1);
    }
    throw new Error(`Apollo network error tras ${MAX_ATTEMPTS} intentos: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(sin body)");
    const retriable = res.status === 429 || res.status >= 500;
    if (retriable && attempt < MAX_ATTEMPTS) {
      await sleep(1000 * Math.pow(2, attempt - 1));
      return apolloFetch(path, body, attempt + 1);
    }
    const err = new Error(`Apollo ${res.status} en ${path}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  return await res.json();
}

/**
 * Saldo disponible, sin gastar créditos. Se consulta ANTES de enriquecer
 * para no arrancar una tanda que no se puede terminar.
 */
export async function checkBudget() {
  try {
    const data = await apolloFetch(USAGE_STATS_PATH, {});
    return { ok: true, raw: data };
  } catch (err) {
    // No es fatal: si no podemos leer el saldo, seguimos con el tope local.
    return { ok: false, reason: err.message };
  }
}

/** Búsqueda de personas — NO consume créditos y NO devuelve emails. */
async function searchPeople({ companyName, domain, titles, seniorities, locations, perPage = 5 }) {
  const body = {
    page: 1,
    per_page: Math.min(perPage, 25),
  };
  if (domain) body.q_organization_domains_list = [domain];
  else if (companyName) body.q_organization_name = companyName;
  if (titles?.length) body.person_titles = titles;
  if (seniorities?.length) body.person_seniorities = seniorities;
  if (locations?.length) body.person_locations = locations;

  let lastErr = null;
  for (const path of PEOPLE_SEARCH_PATHS) {
    try {
      const data = await apolloFetch(path, body);
      const people = data?.people ?? data?.contacts ?? [];
      return { people, endpoint: path };
    } catch (err) {
      lastErr = err;
      // 403/404 = ese endpoint no está en este plan: probamos el otro.
      if (err.status !== 403 && err.status !== 404) throw err;
    }
  }
  throw lastErr ?? new Error("Apollo: ningún endpoint de búsqueda disponible");
}

/**
 * Revela los datos de contacto. ESTO GASTA CRÉDITOS (≈1 por persona).
 * Máximo 10 por request. Nunca pide teléfono (costaría ~9 créditos).
 */
async function bulkMatch(details) {
  const data = await apolloFetch(BULK_MATCH_PATH, {
    reveal_personal_emails: true,
    reveal_phone_number: false,
    details: details.slice(0, 10),
  });
  return {
    matches: data?.matches ?? [],
    creditsConsumed: Number(data?.credits_consumed ?? details.length) || 0,
  };
}

/**
 * Busca el decisor de una empresa y devuelve sus datos de contacto.
 *
 * @returns {Promise<{dormant?: true, reason?: string, contacts: Array, creditsSpent: number, endpoint?: string}>}
 */
export async function enrichCompanyContacts(
  { companyName, domain, titles = [], seniorities = [], locations = [] },
  { limit = 1, budget = { spent: 0, max: 20 } } = {},
) {
  const status = enrichmentStatus();
  if (!status.configured) {
    return { dormant: true, reason: status.reason, contacts: [], creditsSpent: 0 };
  }
  if (budget.spent >= budget.max) {
    return {
      capped: true,
      reason: `tope de ${budget.max} créditos alcanzado en esta corrida`,
      contacts: [],
      creditsSpent: 0,
    };
  }

  const { people, endpoint } = await searchPeople({
    companyName,
    domain,
    titles,
    seniorities,
    locations,
    perPage: 10,
  });

  // Priorizar a quien la búsqueda marca con email disponible: revelar a
  // alguien sin email gasta un crédito para nada.
  const candidatos = [...people]
    .sort((a, b) => Number(Boolean(b.has_email)) - Number(Boolean(a.has_email)))
    .slice(0, limit);

  if (candidatos.length === 0) {
    return { contacts: [], creditsSpent: 0, endpoint, notFound: true };
  }

  const restante = budget.max - budget.spent;
  const aRevelar = candidatos.slice(0, Math.max(0, restante));
  if (aRevelar.length === 0) {
    return { capped: true, contacts: [], creditsSpent: 0, endpoint };
  }

  const { matches, creditsConsumed } = await bulkMatch(
    aRevelar.map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      name: p.name,
      organization_name: p.organization?.name ?? companyName,
      domain: p.organization?.primary_domain ?? domain,
      linkedin_url: p.linkedin_url,
    })),
  );

  const contacts = matches
    .filter((m) => m && (m.email || m.linkedin_url))
    .map((m) => ({
      nombre: m.name ?? [m.first_name, m.last_name].filter(Boolean).join(" "),
      cargo: m.title ?? null,
      email: m.email ?? null,
      linkedinUrl: m.linkedin_url ?? null,
      confianza: m.match_confidence ?? null,
      provider: "apollo",
    }));

  return { contacts, creditsSpent: creditsConsumed, endpoint };
}

/**
 * Cuánta cobertura tiene el proveedor sobre una lista de empresas.
 * SOLO usa la búsqueda → **gasta cero créditos**. Es la forma de contestar
 * "¿me sirve pagar esto para Uruguay?" antes de pagarlo.
 */
export async function measureCoverage(companies, { titles = [], seniorities = [], locations = [] } = {}) {
  const status = enrichmentStatus();
  if (!status.configured) {
    return { dormant: true, reason: status.reason, results: [] };
  }

  const results = [];
  for (const c of companies) {
    try {
      const { people, endpoint } = await searchPeople({
        companyName: c.company,
        domain: c.domain,
        titles,
        seniorities,
        locations,
        perPage: 10,
      });
      results.push({
        company: c.company,
        found: people.length,
        withEmail: people.filter((p) => p.has_email).length,
        sampleTitles: people.slice(0, 3).map((p) => p.title).filter(Boolean),
        endpoint,
        error: null,
      });
    } catch (err) {
      results.push({
        company: c.company,
        found: 0,
        withEmail: 0,
        sampleTitles: [],
        error: err.message,
      });
    }
  }
  return { results };
}
