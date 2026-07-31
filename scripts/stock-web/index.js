/**
 * Stock Web Scanner (stock-web)
 *
 * Agente determinístico (NO usa Claude). Todos los días entra a la tienda
 * pública del cliente (Fenicio) y arma un reporte de los productos que tienen
 * ALGÚN talle faltante (agotado). El resultado se guarda en Supabase
 * (`agent_outputs`, output_type "stock-snapshot") para que el dashboard lo
 * muestre en el apartado del cliente, y un resumen se appendea al vault.
 *
 * Genérico: lee la URL del sitio desde `vault/clients/<slug>/claude-client.md`
 * (línea `- Web:`) y confirma que la plataforma sea Fenicio. Si el cliente no
 * es una tienda Fenicio, se saltea (no rompe).
 *
 * Cómo detecta faltantes (la web esconde los talles agotados):
 *  - Indumentaria/bikinis (talles letra): serie estándar XS·S·M·L·XL·XXL.
 *    Faltante = talle de la serie que no está publicado.
 *  - Calzado/jeans (talles número): huecos dentro del rango, con el paso real
 *    (GCD de las diferencias — evita marcar impares en jeans que van de 2 en 2).
 *  - Talle único (gorras/accesorios/audio): no aplica.
 *
 * Cron: 0 11 * * *  (11:00 UTC = 8:00 AM Uruguay)
 *
 * Uso (CLI):
 *   node scripts/stock-web/index.js                 (escanea todos los clientes del vault)
 *   node scripts/stock-web/index.js <slug>          (solo uno)
 *   node scripts/stock-web/index.js --brief b.json  (brief con { "client": "<slug>" })
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
} from "../lib/supabase.js";

const AGENT = "stock-web";
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const VAULT = resolve(REPO_ROOT, "vault");
const CLIENTS_DIR = resolve(VAULT, "clients");

const UA = "Mozilla/5.0 (compatible; DCScaleStockBot/1.0)";
const DELAY_MS = 150;
const LETTER_ORDER = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl"];
const REF_APPAREL = ["xs", "s", "m", "l", "xl", "xxl"]; // serie estándar de prendas

// --- helpers de I/O ---
function loadBriefFromArgs() {
  const args = process.argv.slice(2);
  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx !== -1 && args[briefFlagIdx + 1]) {
    return JSON.parse(readFileSync(args[briefFlagIdx + 1], "utf-8"));
  }
  const positional = args.filter((a) => !a.startsWith("--"))[0];
  return { client: positional || null };
}

function listClients() {
  if (!existsSync(CLIENTS_DIR)) return [];
  return readdirSync(CLIENTS_DIR).filter((name) => {
    const full = join(CLIENTS_DIR, name);
    return statSync(full).isDirectory() && !name.startsWith(".");
  });
}

function readVaultFile(relativePath) {
  try {
    return readFileSync(resolve(VAULT, relativePath), "utf-8");
  } catch {
    return null;
  }
}

function writeVaultFile(relativePath, content) {
  const filePath = resolve(VAULT, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpGet(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt < 3) {
      await sleep(500 * attempt);
      return httpGet(url, attempt + 1);
    }
    throw err;
  }
}

function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

// --- lógica de talles ---
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}
const sortLetters = (arr) => [...arr].sort((a, b) => LETTER_ORDER.indexOf(a) - LETTER_ORDER.indexOf(b));

function categoryFromName(name) {
  const n = (name || "").toLowerCase();
  if (/(hoodie|buzo|campera|remer|musculosa|\btop\b|pantal|short|chaleco|canguro|sweater|jogger|bermuda|calza|camisa|chomba|vestido|pollera|sherpa|rompevientos|boxer)/.test(n)) return "Vestimenta";
  if (/(champion|zapatilla|sandalia|zueco|chancleta|calzado|bota)/.test(n)) return "Calzado";
  if (/(gorra|piluso|bucket|\bcap\b)/.test(n)) return "Gorras";
  if (/(bikini|malla|traje de ba|enteriza|salida de ba)/.test(n)) return "Bikinis";
  if (/(marley|parlante|auricular|speaker|audio|vinilo|t[oó]cadiscos|turntable)/.test(n)) return "House of Marley";
  return "Accesorios / Otros";
}

/** Devuelve { disponibles, faltantes } o null si el producto no tiene talles faltantes. */
function computeMissing(agotado, sizes) {
  const avail = sizes.map((s) => s.size.toLowerCase());
  const qty = (s) => sizes.find((x) => x.size.toLowerCase() === s)?.stock ?? "";

  if (agotado === "on") return { disponibles: "—", faltantes: "TODOS (producto sin stock)" };
  if (sizes.length === 0) return null; // talle único → no aplica

  const isNumeric = avail.every((s) => /^\d+$/.test(s));
  const isLetters = avail.every((s) => LETTER_ORDER.includes(s));

  if (isNumeric) {
    const nums = [...new Set(avail.map(Number))].sort((a, b) => a - b);
    let step = 0;
    for (let i = 1; i < nums.length; i++) step = gcd(step, nums[i] - nums[i - 1]);
    step = step || 1;
    const miss = [];
    for (let v = nums[0]; v <= nums[nums.length - 1]; v += step) if (!nums.includes(v)) miss.push(String(v));
    if (miss.length === 0) return null;
    return { disponibles: nums.map((n) => `${n} (${qty(String(n))})`).join(", "), faltantes: miss.join(", ") };
  }

  if (isLetters) {
    const miss = REF_APPAREL.filter((s) => !avail.includes(s));
    if (miss.length === 0) return null;
    return {
      disponibles: sortLetters(avail).map((s) => `${s.toUpperCase()} (${qty(s)})`).join(", "),
      faltantes: sortLetters(miss).map((s) => s.toUpperCase()).join(", "),
    };
  }

  return null; // tipo desconocido → no inferimos
}

// --- scrape de un cliente ---
async function scanClient(slug) {
  const md = readVaultFile(`clients/${slug}/claude-client.md`);
  if (!md) {
    console.log(`[${AGENT}] ${slug}: sin claude-client.md — skip.`);
    return null;
  }
  const webMatch = md.match(/^\s*[-*]?\s*Web:\s*(https?:\/\/\S+)/im);
  const isFenicio = /plataforma[^\n]*:.*fenicio/i.test(md);
  if (!webMatch || !isFenicio) {
    console.log(`[${AGENT}] ${slug}: no es tienda Fenicio con URL en claude-client.md — skip.`);
    return null;
  }
  const origin = webMatch[1].replace(/\/+$/, "").replace(/(https?:\/\/[^/]+).*/, "$1");

  // 1) sitemap de artículos
  const idxXml = await httpGet(`${origin}/sitemap`);
  const artUrl = locs(idxXml).find((u) => u.includes("catalogo-articulos"));
  if (!artUrl) throw new Error(`No se encontró catalogo-articulos en el sitemap de ${origin}`);
  const urls = locs(await httpGet(artUrl));
  console.log(`[${AGENT}] ${slug}: ${urls.length} productos en el sitemap.`);

  // 2) scrape ficha por ficha
  const productos = [];
  let scanned = 0;
  let failed = 0;
  for (const url of urls) {
    try {
      const html = await httpGet(url);
      // og:title suele ser "Nombre del producto — NombreTienda"; nos quedamos con lo previo al " — ".
      const ogTitle = (html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/) || [])[1] || "";
      const name = ogTitle.split(" — ")[0].trim() || ogTitle.trim();
      const agotado = (html.match(/id="fichaProducto"[^>]*data-agotado="([^"]*)"/) || [])[1] || "off";
      const codeM = url.match(/_([A-Za-z0-9]+)_[A-Za-z0-9]+$/);
      const code = codeM ? codeM[1] : "";
      const block = (html.match(/<ul[^>]*id="lstTalles"[\s\S]*?<\/ul>/) || [])[0] || "";
      const inputs = [...block.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
      const sizes = inputs
        .map((tag) => {
          const cpre = (tag.match(/data-cpre="([^"]+)"/) || [])[1];
          const stock = (tag.match(/data-stock="([^"]+)"/) || [])[1] || "";
          return cpre ? { size: cpre, stock } : null;
        })
        .filter(Boolean);

      const miss = computeMissing(agotado, sizes);
      if (miss) {
        productos.push({ code, name, category: categoryFromName(name), url, ...miss });
      }
      scanned++;
    } catch (err) {
      failed++;
      console.warn(`[${AGENT}] ${slug}: falló ${url}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  // 3) resumen
  const freq = {};
  for (const p of productos) {
    for (const t of p.faltantes.split(",").map((x) => x.trim())) {
      if (t && !t.startsWith("TODOS")) freq[t] = (freq[t] || 0) + 1;
    }
  }
  const topTalles = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}(${n})`).join(", ");
  const fecha = new Date().toISOString().split("T")[0];

  return {
    slug,
    fecha,
    origin,
    resumen: { totalScrapeados: scanned, fallidos: failed, conFaltantes: productos.length, topTalles: freq },
    productos,
    topTalles,
  };
}

function buildBodyMd(r) {
  const lines = [
    `# Talles faltantes — ${r.slug} (${r.fecha})`,
    ``,
    `Fuente: ${r.origin} · ${r.resumen.totalScrapeados} productos relevados · **${r.resumen.conFaltantes} con talles faltantes**.`,
    `Talles más faltantes: ${r.topTalles || "—"}.`,
    ``,
    `| Código | Producto | Categoría | Talles faltantes | Disponibles (con stock) |`,
    `|---|---|---|---|---|`,
    ...r.productos.map((p) => `| ${p.code} | ${p.name} | ${p.category} | ${p.faltantes} | ${p.disponibles} |`),
  ];
  return lines.join("\n");
}

// --- entrypoint ---
export async function run(briefInput) {
  const startTime = Date.now();
  const brief = briefInput ?? loadBriefFromArgs();
  const onlyClient = brief?.client ?? null;
  const runId = brief?.runId ?? null;
  const triggeredBy = brief?.triggered_by_user_id ?? null;

  const targets = onlyClient ? [onlyClient] : listClients();
  console.log(`[${AGENT}] escaneando ${targets.length} cliente(s)…`);

  let processed = 0;
  let lastSummary = "";

  for (const slug of targets) {
    try {
      const r = await scanClient(slug);
      if (!r) continue; // no aplica
      processed++;

      const bodyMd = buildBodyMd(r);
      const title = `Talles faltantes — ${r.fecha} (${r.resumen.conFaltantes} productos)`;

      // Supabase: snapshot que lee el dashboard
      await registerAgentOutput(runId, slug, AGENT, {
        output_type: "stock-snapshot",
        title,
        body_md: bodyMd,
        structured: {
          fecha: r.fecha,
          origin: r.origin,
          resumen: r.resumen,
          productos: r.productos,
        },
      });

      // Vault: historial en git
      writeVaultFile(
        `clients/${slug}/stock-web-log.md`,
        buildBodyMd(r) + "\n"
      );

      const insight = `${r.resumen.conFaltantes} productos con talles faltantes. Top: ${r.topTalles || "—"}.`;
      await pushNotification(slug, "info", "Reporte de talles faltantes listo", insight, {
        agent: AGENT,
        link: `/cliente/${slug}/talles`,
        to_user_id: triggeredBy,
      });

      lastSummary = `${slug}: ${r.resumen.conFaltantes}/${r.resumen.totalScrapeados} con faltantes (${r.resumen.fallidos} fallidos).`;
      console.log(`[${AGENT}] ${lastSummary}`);
    } catch (err) {
      console.warn(`[${AGENT}] ${slug} falló: ${err.message}`);
      await logAgentError(slug, AGENT, err, {}).catch(() => {});
    }
  }

  const summary = processed > 0 ? lastSummary : `Sin clientes Fenicio aplicables (${targets.length} revisados).`;
  const perf = { duration_ms: Date.now() - startTime };
  if (runId) {
    // Disparado desde el dashboard (/api/agents/run abrió el agent_run):
    // lo cerramos acá para que no quede "running".
    await updateAgentRun(runId, {
      status: processed > 0 ? "success" : "error",
      summary,
      performance: perf,
    });
  } else {
    await logAgentRun(onlyClient ?? "_system", AGENT, "success", summary, { clients: targets.length, processed }, perf);
  }
  console.log(`[${AGENT}] listo. ${summary}`);
  return { clients: targets.length, processed };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  run().catch(async (err) => {
    console.error(`[${AGENT}] failed:`, err.message);
    const brief = (() => {
      try {
        return loadBriefFromArgs();
      } catch {
        return { client: null };
      }
    })();
    await logAgentError(brief.client ?? "_system", AGENT, err, {}).catch(() => {});
    if (brief?.runId) {
      await updateAgentRun(brief.runId, { status: "error", summary: err.message }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 800)); // drain HTTP/Supabase en vuelo
    process.exit(1);
  });
}
