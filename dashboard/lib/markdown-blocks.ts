/**
 * Parser de markdown a bloques estructurados, optimizado para los
 * reportes de Claude (estructura predecible: headings ##/###, listas
 * con `-`, tablas pipe `| col |`, **bold**, *italic*).
 *
 * No es un parser completo de Markdown — apunta a manejar bien lo que
 * Claude genera con los system prompts de phases.
 */

export type InlineSpan =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string };

export type Block =
  | { type: "h1"; spans: InlineSpan[] }
  | { type: "h2"; spans: InlineSpan[] }
  | { type: "h3"; spans: InlineSpan[] }
  | { type: "h4"; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "bullet"; spans: InlineSpan[]; level: number }
  | { type: "ordered"; spans: InlineSpan[]; level: number; index: number }
  | { type: "table"; rows: InlineSpan[][][]; hasHeader: boolean }
  | { type: "hr" }
  | { type: "blockquote"; spans: InlineSpan[] }
  | { type: "spacer" };

/**
 * Parsea inline markdown: **bold**, *italic* (y _italic_), `code`.
 * No anida (suficiente para los reportes).
 */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  // Regex que matchea secuencialmente bold / italic / code y deja
  // texto plano entre matches.
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      spans.push({ type: "text", text: text.slice(lastIndex, m.index) });
    }
    if (m[2] !== undefined) {
      spans.push({ type: "bold", text: m[2] });
    } else if (m[3] !== undefined) {
      spans.push({ type: "italic", text: m[3] });
    } else if (m[4] !== undefined) {
      spans.push({ type: "italic", text: m[4] });
    } else if (m[5] !== undefined) {
      spans.push({ type: "code", text: m[5] });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    spans.push({ type: "text", text: text.slice(lastIndex) });
  }
  if (spans.length === 0) {
    spans.push({ type: "text", text: "" });
  }
  return spans;
}

/**
 * Detecta si una línea es una fila de tabla pipe-style.
 * Ej: `| Col 1 | Col 2 |`
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

/**
 * Detecta si una línea es el separador de header de tabla.
 * Ej: `|---|---|` o `| :--- | ---: |`
 */
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^\|[\s|:-]+\|$/.test(trimmed);
}

function parseTableRow(line: string): InlineSpan[][] {
  const trimmed = line.trim();
  // Quitar pipes externos y splitear
  const cells = trimmed
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
  return cells.map((c) => parseInline(c));
}

export function parseMarkdownBlocks(markdown: string): Block[] {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  const blocks: Block[] = [];

  let i = 0;
  let orderedCounter = 1;
  let lastBlockType: string | null = null;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Línea vacía → spacer (pero solo si la anterior no era spacer)
    if (trimmed === "") {
      if (lastBlockType !== "spacer" && lastBlockType !== null) {
        blocks.push({ type: "spacer" });
        lastBlockType = "spacer";
      }
      orderedCounter = 1;
      i++;
      continue;
    }

    // Headings
    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "h1", spans: parseInline(trimmed.slice(2)) });
      lastBlockType = "h1";
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", spans: parseInline(trimmed.slice(3)) });
      lastBlockType = "h2";
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", spans: parseInline(trimmed.slice(4)) });
      lastBlockType = "h3";
      i++;
      continue;
    }
    if (trimmed.startsWith("#### ")) {
      blocks.push({ type: "h4", spans: parseInline(trimmed.slice(5)) });
      lastBlockType = "h4";
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      lastBlockType = "hr";
      i++;
      continue;
    }

    // Tables
    if (isTableRow(line)) {
      // Coleccionar filas consecutivas
      const tableRows: InlineSpan[][][] = [];
      let hasHeader = false;
      let j = i;

      while (j < lines.length && (isTableRow(lines[j]) || isTableSeparator(lines[j]))) {
        if (isTableSeparator(lines[j])) {
          hasHeader = j === i + 1; // separador justo después de la primera fila
          j++;
          continue;
        }
        tableRows.push(parseTableRow(lines[j]));
        j++;
      }

      if (tableRows.length > 0) {
        blocks.push({ type: "table", rows: tableRows, hasHeader });
        lastBlockType = "table";
        i = j;
        continue;
      }
    }

    // Bullet lists  -, *
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const level = Math.floor(indent / 2);
      blocks.push({
        type: "bullet",
        spans: parseInline(bulletMatch[2]),
        level,
      });
      lastBlockType = "bullet";
      i++;
      continue;
    }

    // Ordered list 1.  2.
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      const indent = orderedMatch[1].length;
      const level = Math.floor(indent / 2);
      blocks.push({
        type: "ordered",
        spans: parseInline(orderedMatch[3]),
        level,
        index: orderedCounter++,
      });
      lastBlockType = "ordered";
      i++;
      continue;
    } else {
      orderedCounter = 1;
    }

    // Blockquote >
    if (trimmed.startsWith("> ")) {
      blocks.push({ type: "blockquote", spans: parseInline(trimmed.slice(2)) });
      lastBlockType = "blockquote";
      i++;
      continue;
    }

    // Paragraph (default) — agrupa líneas no vacías consecutivas
    const paraLines: string[] = [trimmed];
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].trim() !== "" &&
      !lines[j].trim().startsWith("#") &&
      !lines[j].match(/^(\s*)[-*]\s+/) &&
      !lines[j].match(/^(\s*)\d+\.\s+/) &&
      !lines[j].trim().startsWith("> ") &&
      !isTableRow(lines[j])
    ) {
      paraLines.push(lines[j].trim());
      j++;
    }
    blocks.push({
      type: "paragraph",
      spans: parseInline(paraLines.join(" ")),
    });
    lastBlockType = "paragraph";
    i = j;
  }

  return blocks;
}
