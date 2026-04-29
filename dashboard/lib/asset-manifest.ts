// ==================== ASSET MANIFEST GENERATOR ====================
// Genera el archivo `vault/clients/<slug>/brand/assets.md` que cataloga
// todos los assets visuales operativos del cliente. Los agentes leen este
// manifest (via brand-loader / vault-loader) y referencian assets por
// canonical name al generar contenido.
//
// El manifest se regenera automáticamente cada vez que se sube / borra un
// asset desde la UI. Es una sola fuente de verdad: lo que está en el
// bucket client-assets queda reflejado acá.

import { createClient } from "@supabase/supabase-js";

const BUCKET = "client-assets";

// ============================================================
// Catálogo de descripciones de uso — heredado del brandbook estructurado.
// Estas descripciones se inyectan en el manifest para que los agentes
// sepan cuándo usar cada asset (no solo qué nombre tiene).
// ============================================================

const LOGO_USAGE: Record<string, string> = {
  logotipo: "Uso principal cuando la marca tiene contexto. Redes sociales (donde el nombre es protagonista), sobre fotografía, piezas de marca para usuarios que ya conocen la marca.",
  isotipo: "Espacios reducidos donde el logo completo pierde legibilidad: íconos web, favicons. Como remate visual o detalle decorativo en layouts complejos.",
  "logotipo-tagline": "Campañas y pauta. Material institucional (presentaciones, papelería, firmas de mail). Merchandising. Donde el usuario nuevo necesita entender qué hace la marca.",
};

const LOGO_COLOR_USAGE: Record<string, string> = {
  color: "Versión cromática completa. Default para fondos claros (crema, blanco).",
  blanco: "Sobre fondos oscuros (violeta profundo del brandbook, negro). NUNCA logo negro sobre foto oscura.",
  negro: "Sobre fondos claros cuando el color completo no es necesario. NO usar negro puro #000000 — usar #222524 del brandbook.",
};

// Mapeo de expresiones de mascot → cuándo usar cada una
// Inferido del brandbook estructurado (ver brand/voice-character.md)
const MASCOT_EXPRESSION_USAGE: Record<string, string> = {
  standard: "Default neutral. Cuando aparece como guía/copiloto en frames de información o presentación general.",
  error: "Marcar advertencias, trampas turísticas, lugares sobrevalorados. Acompaña texto del estilo 'huí de eso'.",
  festejo: "Celebrar wins del usuario, confirmaciones de buena decisión. Acompaña el closer 'Elegiste bien'.",
  muybien: "Aprobación / Wizzo Pick. Confirmar que la opción que el usuario eligió (o que se está recomendando) cumple con el criterio.",
  saludo: "Apertura de pieza, intro de Wizzo, primer frame donde el personaje se presenta.",
  magia: "Frames de revelación. Momento mágico cuando se descubre un Pique, una oportunidad, un dato de insider. Default para 'EL PIQUE DE WIZZO'.",
  pensando: "Análisis, comparación, momento donde Wizzo está procesando opciones. Acompaña texto del tipo 'pensemos esto bien'.",
  baile: "Cierre celebratorio, momento de máxima energía. CTA final donde el usuario ya tomó la decisión.",
};

const MASCOT_STYLE_USAGE: Record<string, string> = {
  color: "Versión cromática completa. Para frames principales donde Wizzo es protagonista (hero, revelación de Pique, cierre).",
  line: "Trazo / line art. Para corners decorativos, watermarks suaves, capas de soporte que no compiten con el contenido principal.",
  sticker: "Versión sticker (con borde / contorno). Para overlays sobre fotografía, esquinas inferiores en reels donde se quiere personalidad sin ocupar mucho espacio.",
};

// ============================================================
// Tipos
// ============================================================

interface SupabaseFile {
  name: string;
  metadata?: { size?: number; mimetype?: string } | null;
}

export interface ClientAssetSummary {
  logo: SupabaseFile[];
  mascot: SupabaseFile[];
  patterns: SupabaseFile[];
  inspiration: SupabaseFile[];
}

// ============================================================
// Helpers
// ============================================================

function parseLogoCanonicalName(canonicalName: string): {
  variant: string;
  colorVariant: string;
} | null {
  // canonicalName format: "<variant>-<colorVariant>" e.g. "logotipo-color"
  // Cuidado: variant puede ser "logotipo-tagline" (con guión interno).
  const variants = ["logotipo-tagline", "logotipo", "isotipo"];
  for (const v of variants) {
    if (canonicalName.startsWith(v + "-")) {
      return {
        variant: v,
        colorVariant: canonicalName.slice(v.length + 1),
      };
    }
  }
  return null;
}

function parseMascotCanonicalName(canonicalName: string): {
  mascotName: string;
  style: string;
  expression: string;
} | null {
  // canonicalName format: "<mascotName>-<style>-<expression>"
  // e.g. "wizzo-color-magia". Mascot name puede ser cualquier cosa (no tiene
  // guión interno por convención — es el nombre del personaje).
  const parts = canonicalName.split("-");
  if (parts.length < 3) return null;
  return {
    mascotName: parts[0],
    style: parts[1],
    expression: parts.slice(2).join("-"), // por si la expresión tiene guiones
  };
}

function stripExtension(filename: string): { name: string; ext: string } {
  const m = filename.match(/^(.+)\.([a-zA-Z0-9]+)$/);
  if (!m) return { name: filename, ext: "" };
  return { name: m[1], ext: m[2].toLowerCase() };
}

// ============================================================
// Lista de assets desde Supabase Storage (server-side)
// ============================================================

export async function listAssetsServerSide(
  clientId: string,
): Promise<ClientAssetSummary> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "asset-manifest: faltan env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    );
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const out: ClientAssetSummary = {
    logo: [],
    mascot: [],
    patterns: [],
    inspiration: [],
  };

  for (const category of ["logo", "mascot", "patterns", "inspiration"] as const) {
    const { data, error } = await client.storage
      .from(BUCKET)
      .list(`${clientId}/${category}`, {
        limit: 200,
        sortBy: { column: "name", order: "asc" },
      });
    if (error) {
      console.warn(
        `[asset-manifest] list ${clientId}/${category} failed:`,
        error.message,
      );
      continue;
    }
    out[category] = (data ?? []).filter(
      (f) => f.name && f.name !== ".emptyFolderPlaceholder",
    );
  }

  return out;
}

// ============================================================
// Render del manifest a Markdown
// ============================================================

export function renderManifestMarkdown(
  clientId: string,
  clientName: string,
  assets: ClientAssetSummary,
): string {
  const generated = new Date().toISOString().replace("T", " ").slice(0, 16);
  const lines: string[] = [];

  lines.push(`# Asset Library — ${clientName}`);
  lines.push("");
  lines.push("> Generado automáticamente. **NO editar a mano** — los cambios se pierden cuando se re-genera.");
  lines.push(`> Última actualización: ${generated} UTC`);
  lines.push("");
  lines.push("Los agentes leen este manifest cuando generan contenido visual. Cuando un script o storyboard referencia un asset, debe usar el **canonical name** (los headings de cada sub-sección abajo, en `monospace`). Los agentes NO deben inventar paths nuevos — si un asset que necesitan no está en este manifest, indicarlo en el output como dependencia faltante.");
  lines.push("");
  lines.push("---");
  lines.push("");

  // ====== Resumen ======
  const totals = {
    logo: assets.logo.length,
    mascot: assets.mascot.length,
    patterns: assets.patterns.length,
    inspiration: assets.inspiration.length,
  };
  const total = totals.logo + totals.mascot + totals.patterns + totals.inspiration;

  lines.push(`## Resumen`);
  lines.push("");
  lines.push(`- **Total**: ${total} assets`);
  lines.push(`- Logo: ${totals.logo}`);
  lines.push(`- Mascot/Personaje: ${totals.mascot}`);
  lines.push(`- Patrones gráficos: ${totals.patterns}`);
  lines.push(`- Inspiración / referencias: ${totals.inspiration}`);
  lines.push("");

  if (total === 0) {
    lines.push("> ⚠️ Este cliente no tiene assets cargados todavía. Subir desde `/cliente/" + clientId + "/brandbook/assets`.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("---");
  lines.push("");

  // ====== Logo ======
  if (assets.logo.length > 0) {
    lines.push("## Logos");
    lines.push("");
    for (const file of assets.logo) {
      const { name } = stripExtension(file.name);
      const parsed = parseLogoCanonicalName(name);
      lines.push(`### \`${name}\``);
      lines.push("");
      lines.push(`- **Storage path**: \`${clientId}/logo/${file.name}\``);
      if (parsed) {
        lines.push(`- **Variante**: ${parsed.variant}`);
        lines.push(`- **Color**: ${parsed.colorVariant}`);
        if (LOGO_USAGE[parsed.variant]) {
          lines.push(`- **Cuándo usar (variante)**: ${LOGO_USAGE[parsed.variant]}`);
        }
        if (LOGO_COLOR_USAGE[parsed.colorVariant]) {
          lines.push(`- **Cuándo usar (color)**: ${LOGO_COLOR_USAGE[parsed.colorVariant]}`);
        }
      }
      lines.push("");
    }
  }

  // ====== Mascot ======
  if (assets.mascot.length > 0) {
    lines.push("## Mascot / Personaje");
    lines.push("");
    lines.push("Cada asset combina **estilo** (color/line/sticker) × **expresión** (8 variantes). Los agentes deben elegir la expresión correcta según el momento emocional del frame.");
    lines.push("");
    for (const file of assets.mascot) {
      const { name } = stripExtension(file.name);
      const parsed = parseMascotCanonicalName(name);
      lines.push(`### \`${name}\``);
      lines.push("");
      lines.push(`- **Storage path**: \`${clientId}/mascot/${file.name}\``);
      if (parsed) {
        lines.push(`- **Personaje**: ${parsed.mascotName}`);
        lines.push(`- **Estilo**: ${parsed.style}${MASCOT_STYLE_USAGE[parsed.style] ? ` — ${MASCOT_STYLE_USAGE[parsed.style]}` : ""}`);
        lines.push(`- **Expresión**: ${parsed.expression}${MASCOT_EXPRESSION_USAGE[parsed.expression] ? ` — ${MASCOT_EXPRESSION_USAGE[parsed.expression]}` : ""}`);
      }
      lines.push("");
    }
  }

  // ====== Patterns ======
  if (assets.patterns.length > 0) {
    lines.push("## Patrones gráficos");
    lines.push("");
    lines.push("Recursos visuales reusables: curvas, formas derivadas del logo, ornamentos, etc. Suelen ser SVG vectorial.");
    lines.push("");
    for (const file of assets.patterns) {
      const { name } = stripExtension(file.name);
      lines.push(`### \`${name}\``);
      lines.push("");
      lines.push(`- **Storage path**: \`${clientId}/patterns/${file.name}\``);
      lines.push("");
    }
  }

  // ====== Inspiration ======
  if (assets.inspiration.length > 0) {
    lines.push("## Inspiración / referencias");
    lines.push("");
    lines.push("Mockups, ejemplos de posteo del brandbook, capturas de competencia. Los agentes los usan como referencia compositiva, no para incluirlos directos en piezas.");
    lines.push("");
    for (const file of assets.inspiration) {
      const { name } = stripExtension(file.name);
      lines.push(`### \`${name}\``);
      lines.push("");
      lines.push(`- **Storage path**: \`${clientId}/inspiration/${file.name}\``);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("## Reglas operativas para los agentes");
  lines.push("");
  lines.push("1. **Referenciar por canonical name**: cuando el script o storyboard pida 'logo de la marca' o 'Wizzo en pose mágica', usar el canonical name exacto (e.g. `wizzo-color-magia`).");
  lines.push("2. **Si un asset que necesitás no existe acá**, no inventes el path. Indicalo como dependencia: `MISSING_ASSET: <descripción>`. El sistema te avisará para que el equipo lo suba.");
  lines.push("3. **Usar la expresión correcta del mascot según el momento emocional del frame** — ver descripciones de uso arriba.");
  lines.push("4. **Combinación logo + color**: respetar el contraste — logo blanco sobre fondo oscuro, logo color o negro sobre fondo claro. Nunca logo color sobre fondo del mismo tono.");

  return lines.join("\n");
}
