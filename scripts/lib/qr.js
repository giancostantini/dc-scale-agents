/**
 * QR encoder — implementación autocontenida, sin dependencias.
 *
 * El `package.json` de la raíz no tiene deps y todos los scripts son Node ESM
 * puro. En vez de romper esa convención por un QR, el encoder vive acá.
 *
 * Alcance: modo byte (UTF-8), versiones 1-40, niveles de corrección L/M/Q/H,
 * selección automática de versión y de máscara por penalty score (ISO 18004).
 * Es todo lo que necesita un QR de URL. No implementa modo numérico ni
 * alfanumérico (comprimen más, pero para URLs no cambian la versión elegida).
 *
 * Salidas: matriz de módulos, SVG vectorial, PNG 1-bit y ASCII para verificar
 * en terminal.
 *
 * Tablas y algoritmo: ISO/IEC 18004. La estructura sigue la implementación de
 * referencia de Project Nayuki (dominio público).
 */

// --- Tablas del estándar -----------------------------------------------------

// Índice de nivel: 0=L, 1=M, 2=Q, 3=H. Índice de versión: 1..40 (0 es relleno).
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ECC_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const LEVEL_INDEX = { L: 0, M: 1, Q: 2, H: 3 };
// Los 2 bits que van en el format info NO siguen el orden L,M,Q,H.
const LEVEL_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

const PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

// --- Helpers de bits ---------------------------------------------------------

function getBit(x, i) {
  return ((x >>> i) & 1) !== 0;
}

function appendBits(val, len, bits) {
  if (len < 0 || len > 31 || val >>> len !== 0) {
    throw new RangeError(`appendBits: el valor ${val} no entra en ${len} bits`);
  }
  for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
}

// --- Capacidad ---------------------------------------------------------------

/** Módulos disponibles para datos + ECC (sin patrones de función), en bits. */
function getNumRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

/** Codewords de datos (ya descontado el ECC) para una versión y nivel. */
function getNumDataCodewords(ver, level) {
  const lvl = LEVEL_INDEX[level];
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[lvl][ver] * NUM_ECC_BLOCKS[lvl][ver]
  );
}

function getAlignmentPatternPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

// --- Reed-Solomon sobre GF(256), polinomio primitivo 0x11D -------------------

function rsMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsComputeDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}

function rsComputeRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i++) result[i] ^= rsMultiply(divisor[i], factor);
  }
  return Array.from(result);
}

/** Parte los datos en bloques, les suma ECC e interleavea según el estándar. */
function addEccAndInterleave(data, ver, level) {
  const lvl = LEVEL_INDEX[level];
  const numBlocks = NUM_ECC_BLOCKS[lvl][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[lvl][ver];
  const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks = [];
  const rsDiv = rsComputeDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsComputeRemainder(dat, rsDiv);
    if (i < numShortBlocks) dat.push(0); // relleno para alinear; se saltea al interleavear
    blocks.push(dat.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

// --- Construcción de la matriz ----------------------------------------------

function makeGrid(size, fill) {
  return Array.from({ length: size }, () => new Array(size).fill(fill));
}

function buildMatrix(dataCodewords, ver, level) {
  const size = ver * 4 + 17;
  const modules = makeGrid(size, false);
  const isFunction = makeGrid(size, false);

  const setFn = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  const drawFinder = (x, y) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  };

  const drawAlignment = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setFn(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  const drawFormatBits = (mask) => {
    const data = (LEVEL_FORMAT_BITS[level] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = (((data << 10) | rem) ^ 0x5412) >>> 0;

    for (let i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
    setFn(8, 7, getBit(bits, 6));
    setFn(8, 8, getBit(bits, 7));
    setFn(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
    setFn(8, size - 8, true); // módulo oscuro fijo
  };

  const drawVersionBits = () => {
    if (ver < 7) return;
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = ((ver << 12) | rem) >>> 0;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, bit);
      setFn(b, a, bit);
    }
  };

  // Patrones de función
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  const alignPos = getAlignmentPatternPositions(ver);
  const n = alignPos.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // los tres vértices los ocupan los finder patterns
      if (!((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0))) {
        drawAlignment(alignPos[i], alignPos[j]);
      }
    }
  }

  drawFormatBits(0); // reserva el área; se reescribe con la máscara elegida
  drawVersionBits();

  // Datos, en zigzag desde abajo a la derecha
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // la columna 6 es timing
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < dataCodewords.length * 8) {
          modules[y][x] = getBit(dataCodewords[i >>> 3], 7 - (i & 7));
          i++;
        }
        // los módulos remanentes (i >= total) quedan claros, como manda el estándar
      }
    }
  }

  const applyMask = (mask) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFunction[y][x]) continue;
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: throw new Error(`máscara inválida: ${mask}`);
        }
        if (invert) modules[y][x] = !modules[y][x];
      }
    }
  };

  // --- Penalty score (ISO 18004 §8.8.2) ---
  const finderPenaltyCountPatterns = (h) => {
    const nn = h[1];
    const core = nn > 0 && h[2] === nn && h[3] === nn * 3 && h[4] === nn && h[5] === nn;
    return (
      (core && h[0] >= nn * 4 && h[6] >= nn ? 1 : 0) +
      (core && h[6] >= nn * 4 && h[0] >= nn ? 1 : 0)
    );
  };
  const finderPenaltyAddHistory = (runLen, h) => {
    if (h[0] === 0) runLen += size; // borde claro virtual al inicio
    h.pop();
    h.unshift(runLen);
  };
  const finderPenaltyTerminate = (runColor, runLen, h) => {
    if (runColor) {
      finderPenaltyAddHistory(runLen, h);
      runLen = 0;
    }
    runLen += size; // borde claro virtual al final
    finderPenaltyAddHistory(runLen, h);
    return finderPenaltyCountPatterns(h);
  };

  const getPenaltyScore = () => {
    let result = 0;

    // Rachas horizontales + patrones tipo finder
    for (let y = 0; y < size; y++) {
      let runColor = false, runLen = 0;
      const hist = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1;
          else if (runLen > 5) result++;
        } else {
          finderPenaltyAddHistory(runLen, hist);
          if (!runColor) result += finderPenaltyCountPatterns(hist) * PENALTY_N3;
          runColor = modules[y][x];
          runLen = 1;
        }
      }
      result += finderPenaltyTerminate(runColor, runLen, hist) * PENALTY_N3;
    }

    // Rachas verticales + patrones tipo finder
    for (let x = 0; x < size; x++) {
      let runColor = false, runLen = 0;
      const hist = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        if (modules[y][x] === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1;
          else if (runLen > 5) result++;
        } else {
          finderPenaltyAddHistory(runLen, hist);
          if (!runColor) result += finderPenaltyCountPatterns(hist) * PENALTY_N3;
          runColor = modules[y][x];
          runLen = 1;
        }
      }
      result += finderPenaltyTerminate(runColor, runLen, hist) * PENALTY_N3;
    }

    // Bloques 2x2 del mismo color
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
          result += PENALTY_N2;
        }
      }
    }

    // Desbalance entre módulos oscuros y claros
    let dark = 0;
    for (const row of modules) for (const c of row) if (c) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;

    return result;
  };

  // Elegir la máscara con menor penalización
  let bestMask = 0, minPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormatBits(mask);
    const penalty = getPenaltyScore();
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = mask;
    }
    applyMask(mask); // XOR de nuevo = deshacer
  }
  applyMask(bestMask);
  drawFormatBits(bestMask);

  return { size, modules, mask: bestMask, penalty: minPenalty };
}

// --- API pública -------------------------------------------------------------

/**
 * Codifica un texto en una matriz QR.
 *
 * @param {string} text — contenido (para nosotros, siempre una URL).
 * @param {object} [opts]
 * @param {"L"|"M"|"Q"|"H"} [opts.level="H"] — nivel de corrección de error.
 * @param {number} [opts.minVersion=1] — versión mínima a forzar.
 * @returns {{size:number, modules:boolean[][], version:number, level:string, mask:number, penalty:number}}
 */
export function encodeQr(text, opts = {}) {
  const level = opts.level ?? "H";
  if (!Object.prototype.hasOwnProperty.call(LEVEL_INDEX, level)) {
    throw new Error(`Nivel de corrección inválido: "${level}". Usar L, M, Q o H.`);
  }
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("encodeQr: el texto a codificar no puede estar vacío.");
  }

  const bytes = Array.from(Buffer.from(text, "utf-8"));
  const minVersion = Math.max(1, opts.minVersion ?? 1);

  // Versión más chica en la que entre el contenido
  let version = 0;
  for (let ver = minVersion; ver <= 40; ver++) {
    const capacityBits = getNumDataCodewords(ver, level) * 8;
    const charCountBits = ver < 10 ? 8 : 16;
    if (4 + charCountBits + bytes.length * 8 <= capacityBits) {
      version = ver;
      break;
    }
  }
  if (version === 0) {
    throw new Error(
      `El contenido no entra en un QR nivel ${level}: ${bytes.length} bytes ` +
        `(máximo ~${getNumDataCodewords(40, level) - 3} bytes en versión 40).`
    );
  }

  // Segmento en modo byte
  const bits = [];
  appendBits(0x4, 4, bits);
  appendBits(bytes.length, version < 10 ? 8 : 16, bits);
  for (const b of bytes) appendBits(b, 8, bits);

  // Terminador + padding
  const capacityBits = getNumDataCodewords(version, level) * 8;
  appendBits(0, Math.min(4, capacityBits - bits.length), bits);
  appendBits(0, (8 - (bits.length % 8)) % 8, bits);
  for (let padByte = 0xec; bits.length < capacityBits; padByte ^= 0xec ^ 0x11) {
    appendBits(padByte, 8, bits);
  }

  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    dataCodewords.push(byte);
  }

  const withEcc = addEccAndInterleave(dataCodewords, version, level);
  const { size, modules, mask, penalty } = buildMatrix(withEcc, version, level);

  return { size, modules, version, level, mask, penalty };
}

/**
 * Renderiza la matriz como SVG vectorial (un solo `<path>`).
 *
 * @param {object} qr — resultado de encodeQr().
 * @param {object} [opts]
 * @param {number} [opts.border=4] — quiet zone en módulos. El estándar exige 4.
 * @param {string} [opts.dark="#000000"]
 * @param {string} [opts.light="#FFFFFF"]
 * @param {string} [opts.physicalSize] — ej. "40mm". Si se pasa, el SVG sale
 *   dimensionado en unidades físicas (para imprenta). Si no, escala al contenedor.
 */
export function qrToSvg(qr, opts = {}) {
  const border = opts.border ?? 4;
  const dark = opts.dark ?? "#000000";
  const light = opts.light ?? "#FFFFFF";
  if (border < 0) throw new RangeError("El border no puede ser negativo.");

  const dim = qr.size + border * 2;
  const parts = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) parts.push(`M${x + border},${y + border}h1v1h-1z`);
    }
  }

  const dims = opts.physicalSize
    ? ` width="${opts.physicalSize}" height="${opts.physicalSize}"`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1"${dims} viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="${light}"/>
  <path d="${parts.join("")}" fill="${dark}"/>
</svg>
`;
}

// --- PNG (1 bit por píxel, escala de grises) ---------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Renderiza la matriz como PNG en blanco y negro.
 *
 * Usa bit depth 1 + deflate "stored" (sin comprimir): cero dependencias, y el
 * archivo igual queda chico porque 1 bit por píxel ya ahorra 8x.
 *
 * @param {object} qr — resultado de encodeQr().
 * @param {object} [opts]
 * @param {number} [opts.border=4] — quiet zone en módulos.
 * @param {number} [opts.targetWidth=1200] — ancho aproximado en px. Se redondea
 *   hacia abajo a un múltiplo entero de módulos, así los bordes quedan nítidos.
 * @returns {{buffer:Buffer, width:number, scale:number}}
 */
export function qrToPng(qr, opts = {}) {
  const border = opts.border ?? 4;
  const targetWidth = opts.targetWidth ?? 1200;
  const dim = qr.size + border * 2;
  const scale = Math.max(1, Math.floor(targetWidth / dim));
  const width = dim * scale;

  // 1 bit por píxel: 0 = negro, 1 = blanco. Cada fila arranca con byte de filtro.
  const bytesPerRow = Math.ceil(width / 8);
  const raw = Buffer.alloc((bytesPerRow + 1) * width, 0);

  for (let py = 0; py < width; py++) {
    const rowStart = py * (bytesPerRow + 1);
    raw[rowStart] = 0; // filtro None
    const my = Math.floor(py / scale) - border;
    for (let px = 0; px < width; px++) {
      const mx = Math.floor(px / scale) - border;
      const inside = my >= 0 && my < qr.size && mx >= 0 && mx < qr.size;
      const isDark = inside && qr.modules[my][mx];
      if (!isDark) raw[rowStart + 1 + (px >> 3)] |= 0x80 >> (px & 7); // blanco = bit 1
    }
  }

  // zlib con bloques "stored"
  const chunks = [Buffer.from([0x78, 0x01])];
  const MAX = 65535;
  for (let off = 0; off < raw.length; off += MAX) {
    const slice = raw.subarray(off, Math.min(off + MAX, raw.length));
    const last = off + MAX >= raw.length ? 1 : 0;
    const header = Buffer.alloc(5);
    header[0] = last;
    header.writeUInt16LE(slice.length, 1);
    header.writeUInt16LE(~slice.length & 0xffff, 3);
    chunks.push(header, slice);
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(adler32(raw), 0);
  chunks.push(adler);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(width, 4);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // color type: grayscale
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", Buffer.concat(chunks)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);

  return { buffer, width, scale };
}

/** Render en ASCII para verificar a ojo en la terminal. */
export function qrToAscii(qr, border = 2) {
  const lines = [];
  for (let y = -border; y < qr.size + border; y += 2) {
    let line = "";
    for (let x = -border; x < qr.size + border; x++) {
      const at = (yy) =>
        yy >= 0 && yy < qr.size && x >= 0 && x < qr.size ? qr.modules[yy][x] : false;
      const top = at(y), bottom = at(y + 1);
      if (top && bottom) line += "█";
      else if (top) line += "▀";
      else if (bottom) line += "▄";
      else line += " ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}
