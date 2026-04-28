import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parseBrief, DEFAULT_BRIEF } from "./brief-schema.js";
import {
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
} from "../lib/supabase.js";
import { loadBrandFiles, buildBrandBlock } from "../lib/brand-loader.js";

const AGENT = "seo";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// --- CLI parsing ---

function loadBriefFromArgs() {
  const args = process.argv.slice(2);

  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx !== -1 && args[briefFlagIdx + 1]) {
    const briefPath = resolve(process.cwd(), args[briefFlagIdx + 1]);
    const raw = JSON.parse(readFileSync(briefPath, "utf-8"));
    return parseBrief({ ...raw, source: raw.source || "cli" });
  }

  return parseBrief({
    client: args[0] || DEFAULT_BRIEF.client,
    pieceType: args[1] || DEFAULT_BRIEF.pieceType,
    source: "cli",
  });
}

// --- Helpers ---

function readVaultFile(relativePath) {
  try {
    return readFileSync(resolve(VAULT, relativePath), "utf-8");
  } catch {
    return null;
  }
}

function appendToVaultFile(relativePath, content) {
  const filePath = resolve(VAULT, relativePath);
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  writeFileSync(filePath, existing + "\n" + content, "utf-8");
}

async function callClaude(prompt, maxTokens = 8192) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

function getNextPieceId(seoLibrary) {
  if (!seoLibrary) return "001";
  const matches = seoLibrary.match(/## SEO #(\d+)/g);
  if (!matches || matches.length === 0) return "001";
  const lastNum = Math.max(
    ...matches.map((m) => parseInt(m.replace("## SEO #", ""), 10))
  );
  return String(lastNum + 1).padStart(3, "0");
}

function getTodayFormatted() {
  return new Date().toLocaleDateString("es-UY", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getTodayISO() {
  return new Date().toISOString().split("T")[0];
}

// --- Context Loader ---

function loadClientContext(client) {
  console.log(`Loading vault context for client: ${client}`);

  // Brand: SEO necesita positioning (target keywords semánticos),
  // voice-operational (tono de blog posts), y restrictions (qué evitar).
  const brand = loadBrandFiles(VAULT, client, [
    "positioning",
    "voice-operational",
    "restrictions",
  ]);

  const context = {
    agencyContext: readVaultFile("CLAUDE.md"),
    clientBrand: readVaultFile(`clients/${client}/claude-client.md`),
    strategy: readVaultFile(`clients/${client}/strategy.md`),
    keywordDatabase: readVaultFile("agents/seo/keyword-database.md"),
    winningPages: readVaultFile("agents/seo/winning-pages.md"),
    learningLog: readVaultFile(`clients/${client}/learning-log.md`),
    seoLibrary: readVaultFile(`clients/${client}/seo-library.md`),
    brand,
    brandBlock: buildBrandBlock(brand),
  };

  const loaded = Object.entries(context).filter(([, v]) => v !== null).length;
  const total = Object.keys(context).length;
  console.log(`Vault context loaded: ${loaded}/${total} files found`);

  return context;
}

// --- Prompt Builders ---

function buildBlogPostPrompt(ctx, brief) {
  const directives = [];
  if (brief.targetKeyword)
    directives.push(`KEYWORD PRINCIPAL: ${brief.targetKeyword}`);
  if (brief.secondaryKeywords && brief.secondaryKeywords.length > 0)
    directives.push(
      `KEYWORDS SECUNDARIOS: ${brief.secondaryKeywords.join(", ")}`
    );
  if (brief.searchIntent)
    directives.push(`SEARCH INTENT: ${brief.searchIntent}`);
  if (brief.articleFormat)
    directives.push(`FORMATO DE ARTICULO: usar "${brief.articleFormat}"`);
  if (brief.topic) directives.push(`TEMA/ANGULO: ${brief.topic}`);
  if (brief.targetAudience)
    directives.push(`AUDIENCIA OBJETIVO: ${brief.targetAudience}`);
  if (brief.tone) directives.push(`TONO: ${brief.tone}`);
  if (brief.instructions)
    directives.push(`INSTRUCCIONES ADICIONALES: ${brief.instructions}`);

  const directivesBlock =
    directives.length > 0
      ? `--- DIRECCION SEO (del ${brief.source === "consultant-agent" ? "Agente Consultor" : brief.source === "dashboard" ? "dueno del negocio" : "operador"}) ---\n${directives.join("\n")}`
      : "--- DIRECCION SEO ---\nSin directivas especificas. Analiza el nicho del cliente e identifica el mejor keyword y angulo.";

  return `Eres el SEO Agent de D&C Scale Partners.

Tu trabajo es generar contenido SEO LISTO PARA PUBLICAR. No generas borradores vagos — generas articulos completos, optimizados, con estructura perfecta para rankear en Google.

TIPO DE PIEZA: Articulo de blog SEO (1500-2500 palabras)
CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}
SOLICITADO POR: ${brief.source}

${directivesBlock}

--- CONTEXTO DE LA AGENCIA ---
${ctx.agencyContext || "Sin contexto de agencia."}

--- MARCA DEL CLIENTE (overview) ---
${ctx.clientBrand || "Sin contexto de marca cargado. Usa buenas practicas SEO genericas del sector."}

${ctx.brandBlock}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida aun."}

--- KEYWORD DATABASE ---
${ctx.keywordDatabase || "Sin keywords registrados. Identifica keywords basandote en el nicho del cliente."}

--- PAGINAS GANADORAS ---
${ctx.winningPages || "Sin paginas ganadoras registradas."}

--- APRENDIZAJES ---
${ctx.learningLog || "Sin aprendizajes registrados."}

---

REGLAS DE ORO SEO (SIEMPRE APLICAR):
1. Keyword research primero — identifica keyword principal + 3-5 secundarios + long-tails
2. Intent match obligatorio — el contenido debe responder exactamente lo que busca el usuario
3. Un keyword principal por articulo, integrado naturalmente
4. Estructura H1 > H2 > H3 jerarquica con keywords en headers
5. Meta title: max 60 caracteres, keyword al inicio, brand al final
6. Meta description: max 155 caracteres, keyword + CTA implicito
7. Contenido util primero — nada de keyword stuffing, escribir para humanos
8. Links internos: minimo 2 links a paginas del sitio del cliente
9. Parrafos cortos (max 3 lineas) + bullet points para scannability
10. Featured snippet friendly — definiciones, listas, tablas que Google pueda extraer

FORMATOS DE ARTICULO:
A) "Guia Definitiva" — "Todo lo que necesitas saber sobre [X]" — 2000-2500 palabras, keywords informativos de alto volumen
B) "Listicle SEO" — "X mejores [producto] para [uso]" — 1500-2000 palabras, keywords transaccionales comparativos
C) "How-To" — "Como [accion] paso a paso" — 1500-2000 palabras, keywords informativos con intent de accion

---

GENERA LO SIGUIENTE (formato Markdown):

## Keyword Target
- **Keyword principal:** [keyword con volumen estimado]
- **Keywords secundarios:** [3-5 keywords]
- **Long-tails:** [3-5 variaciones long-tail]
- **Search intent:** [informacional/transaccional/comercial]

## Meta Tags
- **Meta title:** [max 60 chars, keyword al inicio]
- **Meta description:** [max 155 chars, keyword + CTA]
- **URL slug sugerido:** [slug-seo-friendly]

## Articulo Completo

[Articulo completo con H1, H2s, H3s, listas, negritas, y estructura optimizada.
1500-2500 palabras. Listo para copiar y publicar.]

## Internal Links Sugeridos
- [Texto ancla 1] → [pagina destino sugerida]
- [Texto ancla 2] → [pagina destino sugerida]

## Schema Markup Sugerido
\`\`\`json
[Schema JSON-LD apropiado: FAQ, HowTo, Article, o Product segun corresponda]
\`\`\`

## Metadata
- keyword_principal: [keyword]
- search_intent: [tipo]
- article_format: [A/B/C]
- word_count: [numero]
- target_position: [posicion objetivo]
- internal_links: [cantidad]

Se directo, experto, y especifico al nicho del cliente.`;
}

function buildKeywordResearchPrompt(ctx, brief) {
  return `Eres el SEO Agent de D&C Scale Partners.

Tu trabajo es hacer keyword research exhaustivo para el nicho del cliente.

TIPO DE PIEZA: Keyword Research — Analisis de cluster tematico
CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}

${brief.topic ? `TEMA A INVESTIGAR: ${brief.topic}` : "TEMA: Analizar el nicho completo del cliente e identificar los mejores clusters de keywords."}
${brief.instructions ? `INSTRUCCIONES: ${brief.instructions}` : ""}

--- MARCA DEL CLIENTE (overview) ---
${ctx.clientBrand || "Sin contexto de marca cargado."}

${ctx.brandBlock}

--- ESTRATEGIA ACTIVA ---
${ctx.strategy || "Sin estrategia definida."}

--- KEYWORDS YA IDENTIFICADOS ---
${ctx.keywordDatabase || "Ninguno — este es el primer analisis."}

---

Genera un analisis completo de keywords agrupados por intent:

## Cluster: [tema principal]

### Keywords transaccionales (compra directa)
| Keyword | Search Intent | Dificultad estimada (baja/media/alta) | Prioridad (1-5) | Tipo de contenido recomendado |
|---------|--------------|---------------------------------------|-----------------|-------------------------------|

### Keywords informacionales (educacion/awareness)
| Keyword | Search Intent | Dificultad estimada | Prioridad | Tipo de contenido recomendado |
|---------|--------------|---------------------|-----------|-------------------------------|

### Long-tail opportunities (baja competencia, alto intent)
| Keyword | Search Intent | Dificultad estimada | Prioridad | Tipo de contenido recomendado |
|---------|--------------|---------------------|-----------|-------------------------------|

### Content Map — Plan de ejecucion
Para cada keyword de prioridad 1-2, indica:
- Keyword → tipo de pieza (blog-post/product-meta/category-meta) + formato (A/B/C)
- Orden de ejecucion sugerido (que publicar primero para ganar traccion)

### Quick Wins
Keywords donde el cliente podria rankear rapido por baja competencia + alta relevancia.

Se exhaustivo, practico, y enfocado en el nicho real del cliente.`;
}

function buildProductMetaPrompt(ctx, brief) {
  return `Eres el SEO Agent de D&C Scale Partners.

Tu trabajo es generar meta titles y meta descriptions optimizados para paginas de producto.

CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}
${brief.productSlug ? `PRODUCTO: ${brief.productSlug}` : "PRODUCTOS: Todos los productos principales del cliente."}
${brief.instructions ? `INSTRUCCIONES: ${brief.instructions}` : ""}

--- MARCA DEL CLIENTE (overview) ---
${ctx.clientBrand || "Sin contexto de marca cargado."}

${ctx.brandBlock}

---

REGLAS PARA META TAGS:
- Meta title: max 60 caracteres, keyword transaccional al inicio, brand al final
- Meta description: max 155 caracteres, que es + diferencial + CTA implicito
- Incluir variaciones para A/B testing (2 opciones por producto)
- Keywords transaccionales: "comprar", "precio", "mejor", "[producto] artesanal"

Para cada producto genera:

## [Nombre del producto]

### Opcion A
- **Meta title:** [max 60 chars] ([X chars])
- **Meta description:** [max 155 chars] ([X chars])
- **Keywords target:** [keywords principales]

### Opcion B
- **Meta title:** [max 60 chars] ([X chars])
- **Meta description:** [max 155 chars] ([X chars])
- **Keywords target:** [keywords principales]

---

Se preciso con el conteo de caracteres. Cada meta tag debe ser atractivo para el click.`;
}

function buildContentBriefPrompt(ctx, brief) {
  return `Eres el SEO Agent de D&C Scale Partners.

Tu trabajo es generar un content brief detallado para un articulo SEO.

CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}
${brief.targetKeyword ? `KEYWORD TARGET: ${brief.targetKeyword}` : ""}
${brief.topic ? `TEMA: ${brief.topic}` : ""}
${brief.instructions ? `INSTRUCCIONES: ${brief.instructions}` : ""}

--- MARCA DEL CLIENTE (overview) ---
${ctx.clientBrand || "Sin contexto de marca cargado."}

${ctx.brandBlock}

--- ESTRATEGIA ---
${ctx.strategy || "Sin estrategia definida."}

---

## Content Brief: [titulo propuesto]

### Target
- **Keyword principal:** [keyword]
- **Keywords secundarios:** [3-5]
- **Long-tails:** [3-5]
- **Search intent:** [tipo]
- **Volumen estimado:** [bajo/medio/alto]
- **Dificultad estimada:** [baja/media/alta]

### Analisis de competencia (top 3 resultados)
Para cada resultado actual en Google:
- URL / titulo
- Que cubre bien
- Que le falta
- Nuestra oportunidad de superarlo

### Estructura propuesta
- **H1:** [titulo optimizado]
- **H2s:** [secciones principales con keywords]
- **H3s:** [subsecciones]
- **Word count objetivo:** [numero]
- **Formato:** [A/B/C — Guia/Listicle/How-To]

### Guia de tono y estilo
[Como escribir: nivel de tecnicismo, formalidad, uso de datos, etc.]

### Internal links obligatorios
[Paginas del sitio que deben linkearse]

### CTA del articulo
[Que accion queremos del lector]

### Assets sugeridos
[Imagenes, infografias, tablas, videos que enriquezcan el articulo]

Se preciso y actionable. Este brief debe ser suficiente para escribir el articulo sin mas contexto.`;
}

function buildCategoryMetaPrompt(ctx, brief) {
  return `Eres el SEO Agent de D&C Scale Partners.

Tu trabajo es generar meta titles y descriptions para paginas de categoria.

CLIENTE: ${brief.client}
FECHA: ${getTodayFormatted()}
${brief.categorySlug ? `CATEGORIA: ${brief.categorySlug}` : "CATEGORIAS: Todas las categorias principales del cliente."}
${brief.instructions ? `INSTRUCCIONES: ${brief.instructions}` : ""}

--- MARCA DEL CLIENTE (overview) ---
${ctx.clientBrand || "Sin contexto de marca cargado."}

${ctx.brandBlock}

---

REGLAS PARA META TAGS DE CATEGORIA:
- Meta title: "[Keyword categoria] — [Beneficio/Variedad] | [Brand]" (max 60 chars)
- Meta description: describir la variedad + diferencial + invitar a explorar (max 155 chars)
- Keywords: "[categoria]", "comprar [categoria]", "[categoria] artesanal", "[categoria] de cuero"

Para cada categoria:

## [Nombre de la categoria]

### Opcion A
- **Meta title:** [max 60 chars] ([X chars])
- **Meta description:** [max 155 chars] ([X chars])
- **Keywords target:** [keywords]

### Opcion B
- **Meta title:** [max 60 chars] ([X chars])
- **Meta description:** [max 155 chars] ([X chars])
- **Keywords target:** [keywords]

Se preciso con caracteres. Optimiza para CTR en resultados de Google.`;
}

// --- Prompt Router ---

function buildPrompt(ctx, brief) {
  const builders = {
    "blog-post": buildBlogPostPrompt,
    "keyword-research": buildKeywordResearchPrompt,
    "product-meta": buildProductMetaPrompt,
    "category-meta": buildCategoryMetaPrompt,
    "content-brief": buildContentBriefPrompt,
  };

  const builder = builders[brief.pieceType];
  if (!builder) {
    throw new Error(`No prompt builder for piece type: ${brief.pieceType}`);
  }

  return builder(ctx, brief);
}

// --- Max tokens per piece type ---

function getMaxTokens(pieceType) {
  const tokens = {
    "blog-post": 8192,
    "keyword-research": 4096,
    "product-meta": 2048,
    "category-meta": 2048,
    "content-brief": 4096,
  };
  return tokens[pieceType] || 4096;
}

// --- SEO Library Registration ---

function buildSEOEntry(pieceId, brief, output) {
  const briefSummary = [];
  if (brief.targetKeyword)
    briefSummary.push(`Keyword: ${brief.targetKeyword}`);
  if (brief.topic) briefSummary.push(`Topic: ${brief.topic}`);
  if (brief.searchIntent) briefSummary.push(`Intent: ${brief.searchIntent}`);
  if (brief.articleFormat) briefSummary.push(`Format: ${brief.articleFormat}`);
  if (brief.instructions)
    briefSummary.push(`Instructions: ${brief.instructions}`);

  return `
## SEO #${pieceId} — ${brief.pieceType}
Date: ${getTodayISO()} | Source: ${brief.source} | Status: DRAFT
Type: ${brief.pieceType}
Client: ${brief.client}
${briefSummary.length > 0 ? `Brief: ${briefSummary.join(" | ")}` : "Brief: defaults (no specific direction)"}

### Generated Content
${output}

### SEO Metrics (fill when data arrives from Search Console)
Position avg: PENDING
CTR organico: PENDING
Impressions: PENDING
Clicks: PENDING
Time on page: PENDING
Bounce rate: PENDING

### Auto-evaluation
Status: PENDING
Decision: PENDING
Learning: PENDING
`;
}

// --- Main: exported for future use by Consultant Agent ---

export async function createSEOPiece(briefInput) {
  const brief = parseBrief(briefInput);
  const startTime = Date.now();
  console.log(
    `SEO Agent — ${brief.pieceType} for ${brief.client} (source: ${brief.source})`
  );

  // Step 1: Load vault context
  const ctx = loadClientContext(brief.client);

  // Step 2: Generate content
  console.log("Generating SEO content...");
  const prompt = buildPrompt(ctx, brief);
  const maxTokens = getMaxTokens(brief.pieceType);
  const output = await callClaude(prompt, maxTokens);
  console.log("SEO content generated successfully.");

  // Step 3: Register in seo-library.md
  const pieceId = getNextPieceId(ctx.seoLibrary);
  const entry = buildSEOEntry(pieceId, brief, output);
  appendToVaultFile(`clients/${brief.client}/seo-library.md`, entry);
  console.log(`Registered as SEO #${pieceId} in seo-library.md`);

  // Step 4: Build summary for Consultant Agent (who notifies the business owner via WhatsApp)
  const pieceTypeLabels = {
    "blog-post": "Blog Post",
    "keyword-research": "Keyword Research",
    "product-meta": "Product Meta Tags",
    "category-meta": "Category Meta Tags",
    "content-brief": "Content Brief",
  };

  const summary = `SEO Agent — Pieza #${pieceId}\nTipo: ${pieceTypeLabels[brief.pieceType] || brief.pieceType}\nCliente: ${brief.client}${brief.targetKeyword ? `\nKeyword: ${brief.targetKeyword}` : ""}${brief.topic ? `\nTema: ${brief.topic}` : ""}\nEstado: DRAFT — revisar y aprobar\nRegistro: vault/clients/${brief.client}/seo-library.md`;

  console.log("\n" + summary);

  // Step 5: Register output + close run
  const runId = brief.runId ?? null;
  const shortSummary = `SEO #${pieceId} generado (${brief.pieceType}) para ${brief.client}`;

  await registerAgentOutput(runId, brief.client, AGENT, {
    output_type: "seo-piece",
    title: `SEO #${pieceId} — ${pieceTypeLabels[brief.pieceType] ?? brief.pieceType}`,
    body_md: output,
    structured: {
      pieceId,
      pieceType: brief.pieceType,
      targetKeyword: brief.targetKeyword ?? null,
      topic: brief.topic ?? null,
    },
  });

  if (runId) {
    await updateAgentRun(runId, {
      status: "success",
      summary: shortSummary,
      summary_md: summary,
      performance: { duration_ms: Date.now() - startTime },
    });
  } else {
    await logAgentRun(
      brief.client,
      AGENT,
      "success",
      shortSummary,
      { pieceId, pieceType: brief.pieceType, source: brief.source },
      { duration_ms: Date.now() - startTime },
    );
  }

  await pushNotification(brief.client, "success", `SEO #${pieceId} listo`, summary, {
    agent: AGENT,
    link: `/cliente/${brief.client}/biblioteca`,
  });

  return {
    pieceId,
    client: brief.client,
    pieceType: brief.pieceType,
    source: brief.source,
    output,
    summary,
    registeredAt: `vault/clients/${brief.client}/seo-library.md`,
  };
}

// --- CLI entry point ---

async function main() {
  const brief = loadBriefFromArgs();
  const result = await createSEOPiece(brief);

  console.log("\n" + "=".repeat(60));
  console.log(`SEO #${result.pieceId} — ${result.pieceType.toUpperCase()}`);
  console.log("=".repeat(60) + "\n");
  console.log(result.output);
  console.log("\n" + "=".repeat(60));
}

main().catch(async (err) => {
  console.error(`[${AGENT}] failed:`, err.message);
  const fallbackBrief = (() => {
    try {
      return loadBriefFromArgs();
    } catch {
      return { client: "_unknown", runId: null };
    }
  })();
  await logAgentError(fallbackBrief.client, AGENT, err, {});
  if (fallbackBrief.runId) {
    await updateAgentRun(fallbackBrief.runId, { status: "error", summary: err.message });
  }
  await pushNotification(fallbackBrief.client, "error", `SEO falló`, err.message, { agent: AGENT });
  process.exit(1);
});
