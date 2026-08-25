/**
 * qr-review — generador de QR de reseñas de Google para cualquier cliente.
 *
 * No es un agente programado: es una herramienta de diseño que se corre a mano
 * cuando hay que producir una pieza física (cartel de mostrador, sticker, tag
 * NFC). Por eso no loggea a Supabase ni llama a Claude.
 *
 * Uso:
 *   node scripts/qr-review/index.js --brief vault/clients/<slug>/entregables/qr-brief.json
 *   node scripts/qr-review/index.js --place-id ChIJ... --client <slug>
 *
 * Genera, en el outDir:
 *   qr.svg          — vector, el master para imprenta (dimensionado en mm)
 *   qr-1200.png     — para digital (WhatsApp, redes, mails)
 *   qr-2400.png     — para imprenta que solo acepte raster
 *   qr.txt          — la URL exacta codificada, para poder auditarla después
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { encodeQr, qrToSvg, qrToPng, qrToAscii } from "../lib/qr.js";

const TOOL = "qr-review";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

// Nivel H (30% de redundancia): tolera el logo al centro y el desgaste de un
// mostrador. Nunca bajar de H en piezas físicas que van a durar años.
const DEFAULT_LEVEL = "H";
// El estándar exige 4 módulos de quiet zone. Es el error #1 de imprenta.
const DEFAULT_BORDER = 4;
// 4 cm escanea cómodo a ~40 cm, que es la distancia real en un mostrador.
const DEFAULT_PHYSICAL_SIZE = "40mm";

/** Arma la URL de "escribir reseña" de Google a partir de un Place ID. */
export function buildReviewUrl(placeId) {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(placeId)) {
    throw new Error(
      `Place ID con formato inválido: "${placeId}". ` +
        `Tiene que ser el ID de Google Maps, ej. ChIJ_VJqXSSBn5UR4XwZUpgyYm8`
    );
  }
  return `https://search.google.com/local/writereview?placeid=${placeId}`;
}

function parseArgs() {
  const args = process.argv.slice(2);

  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
  };

  const briefPath = flag("brief");
  let brief;

  if (briefPath) {
    const full = resolve(process.cwd(), briefPath);
    if (!existsSync(full)) throw new Error(`No existe el brief: ${full}`);
    brief = JSON.parse(readFileSync(full, "utf-8"));
  } else {
    brief = {};
  }

  // Los flags pisan al brief
  const client = flag("client") || brief.client;
  const placeId = flag("place-id") || brief.placeId;
  const reviewUrl = flag("url") || brief.reviewUrl || (placeId ? buildReviewUrl(placeId) : null);

  // Generic-first: sin cliente y sin URL, falla ruidoso. Cero defaults.
  if (!client) {
    throw new Error(
      `Falta el cliente. Pasá --client <slug> o "client" en el brief. ` +
        `No hay default: este script sirve para cualquier cliente.`
    );
  }
  if (!reviewUrl) {
    throw new Error(
      `Falta la URL de reseñas. Pasá --place-id <ChIJ...>, --url <url>, ` +
        `o "placeId"/"reviewUrl" en el brief.`
    );
  }

  return {
    client,
    placeId: placeId || null,
    reviewUrl,
    outDir: flag("out") || brief.outDir || `vault/clients/${client}/entregables/qr`,
    level: brief.level || DEFAULT_LEVEL,
    border: brief.border ?? DEFAULT_BORDER,
    physicalSize: brief.physicalSize || DEFAULT_PHYSICAL_SIZE,
    dark: brief.colors?.dark || "#000000",
    light: brief.colors?.light || "#FFFFFF",
  };
}

/** Escribe creando los directorios padres. Sin esto se pierde el output. */
function writeOut(dir, name, content) {
  mkdirSync(dir, { recursive: true });
  const filePath = resolve(dir, name);
  writeFileSync(filePath, content);
  return filePath;
}

/**
 * Relación de contraste WCAG entre dos colores hex. Un QR necesita mucho
 * contraste o los lectores de gama baja no lo levantan.
 */
function contrastRatio(hexA, hexB) {
  const lum = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = lum(hexA), b = lum(hexB);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function main() {
  const cfg = parseArgs();

  const qr = encodeQr(cfg.reviewUrl, { level: cfg.level });

  // El QR se lee oscuro sobre claro. Invertido, muchos lectores fallan.
  const ratio = contrastRatio(cfg.dark, cfg.light);
  if (ratio !== null && ratio < 7) {
    console.warn(
      `⚠️  Contraste bajo entre ${cfg.dark} y ${cfg.light}: ${ratio.toFixed(1)}:1. ` +
        `Para QR impreso conviene 7:1 o más. Si el oscuro de marca es claro, usá negro.`
    );
  }

  const outDir = resolve(REPO_ROOT, cfg.outDir);

  const svg = qrToSvg(qr, {
    border: cfg.border,
    dark: cfg.dark,
    light: cfg.light,
    physicalSize: cfg.physicalSize,
  });
  const svgPath = writeOut(outDir, "qr.svg", svg);

  const written = [svgPath];
  for (const target of [1200, 2400]) {
    const png = qrToPng(qr, { border: cfg.border, targetWidth: target });
    written.push(writeOut(outDir, `qr-${target}.png`, png.buffer));
  }

  writeOut(
    outDir,
    "qr.txt",
    `${cfg.reviewUrl}\n\n` +
      `cliente: ${cfg.client}\n` +
      (cfg.placeId ? `place id: ${cfg.placeId}\n` : "") +
      `version: ${qr.version} (${qr.size}x${qr.size} módulos)\n` +
      `corrección de error: nivel ${qr.level}\n` +
      `máscara: ${qr.mask}\n` +
      `quiet zone: ${cfg.border} módulos\n` +
      `tamaño de impresión: ${cfg.physicalSize}\n` +
      `generado por: scripts/${TOOL}\n`
  );

  console.log(qrToAscii(qr, 2));
  console.log("");
  console.log(`URL codificada : ${cfg.reviewUrl}`);
  console.log(`Versión QR     : ${qr.version} (${qr.size}x${qr.size}), nivel ${qr.level}, máscara ${qr.mask}`);
  console.log(`Quiet zone     : ${cfg.border} módulos`);
  console.log(`Salida         : ${outDir}`);
  for (const f of written) console.log(`  - ${f.replace(REPO_ROOT + "\\", "").replace(REPO_ROOT + "/", "")}`);
  console.log("");
  console.log("Antes de mandar a imprenta: escaneá el PNG desde la pantalla con");
  console.log("un Android y un iPhone, y confirmá que abre el formulario de reseña.");
}

main().catch((err) => {
  console.error(`\n✖ ${TOOL}: ${err.message}\n`);
  process.exit(1);
});
