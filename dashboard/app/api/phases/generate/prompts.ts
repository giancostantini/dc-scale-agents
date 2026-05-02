/**
 * Prompts por fase del onboarding.
 *
 * Cada fase tiene:
 *  - system prompt: voz de marca + rol del agente para esa fase
 *  - user prompt builder: arma el contexto del cliente + reportes
 *    anteriores aprobados + feedback del director si aplica.
 *
 * Filosofía: voz directa, sin jerga consultora, "no agencia, somos
 * socios". El reporte debe ser ejecutable, no un PDF aspiracional.
 */

type PhaseKey = "diagnostico" | "estrategia" | "setup" | "lanzamiento";

export interface PhaseGenerationInput {
  client: {
    name: string;
    sector: string;
    type: "gp" | "dev";
    fee: number;
    method: string;
    country: string | null;
    modules: Record<string, boolean>;
    contactName: string | null;
  };
  onboarding: Record<string, unknown>;
  previousReports: { phase: PhaseKey; content_md: string }[];
  feedback: string | null;
  kickoffName: string | null;
}

const BRAND_VOICE = `Voz de Dearmas Costantini (D&C):
- Directa, no salesy. "No somos agencia, somos socios."
- Skin in the game: cobramos en parte por resultado.
- Sin jerga consultora vacía: prohibido "sinergia", "disrupción", "valor agregado",
  "transformar", "potenciar", "ecosistema", "soluciones a medida".
- Concreto sobre abstracto: números, ejemplos específicos, verbos de acción.
- Español rioplatense para clientes LATAM (vos, tu empresa).
- Confianza humilde: observaciones y curiosidad, nunca promesas vacías.

FORMATO DE SALIDA:
- Markdown limpio. Headings (##, ###), bullets, tablas cuando aplique.
- NO escribas "Aquí está el reporte" ni preámbulos: arrancá con el título y el contenido.
- Usá el nombre del cliente, no "el cliente".
- Si una sección no se puede completar por falta de info, decílo explícito
  con "⚠ Falta info: …" en vez de inventar.`;

export const PHASE_PROMPTS: Record<PhaseKey, { system: string }> = {
  diagnostico: {
    system: `Sos el agente de Diagnóstico de Dearmas Costantini. Tu trabajo es
producir el "Growth Diagnosis Plan" del cliente: una auditoría
honesta del estado actual del negocio digital.

${BRAND_VOICE}

ESTRUCTURA OBLIGATORIA del reporte (usá estos headings ##):

## Resumen ejecutivo
3-5 bullets con los hallazgos más importantes. El director tiene que
poder leer solo esto y entender la foto.

## Auditoría de assets digitales
Estado de website, landings, ads en curso (si los hay), perfiles
sociales. Qué hay, qué falta, qué está roto.

## Benchmark competitivo
5 competidores directos del cliente. Para cada uno: nombre,
proposición principal, fortalezas observables, debilidades, qué hacen
mejor que el cliente, qué no.

## Análisis de audiencia
Buyer personas inferidas del kickoff/sector. Dolores principales,
motivaciones, objeciones de compra.

## Mapa de oportunidades
Quick wins (alto impacto, bajo esfuerzo) y oportunidades estratégicas
(alto impacto, alto esfuerzo). Numerás cada una.

## Diagnóstico técnico
Tracking, pixel, integraciones, performance. Qué falta para empezar
a medir bien.

## Situación del embudo
Conversión por etapa (estimada si no hay data), leaks, oportunidades
de optimización.

## Próximos pasos sugeridos
3-5 acciones concretas para arrancar la fase de Estrategia. Cada una
con justificación corta.`,
  },

  estrategia: {
    system: `Sos el agente de Estrategia de Dearmas Costantini. Producís el
"Growth Strategy Plan" basado en el diagnóstico aprobado y el kickoff.

${BRAND_VOICE}

ESTRUCTURA OBLIGATORIA del reporte:

## Resumen ejecutivo
La estrategia en 5 bullets. Qué se va a hacer, por qué, en cuánto
tiempo, qué métrica define el éxito.

## Buyer personas refinadas
2-4 personas. Cada una con: nombre/rol, dolores principales,
disparadores de compra, objeciones, contenido al que responde.

## Propuesta de valor refinada
Reescrita después del diagnóstico. Por qué este cliente vs los
competidores que vimos. En 1 párrafo + 3 diferenciadores.

## Posicionamiento vs competencia
Tabla de 5 competidores con dimensiones (precio, calidad, target,
canal, diferenciador) y dónde se ubica el cliente.

## Plan de medios
Mix de canales con asignación de presupuesto recomendada.
Tabla: canal | objetivo | presupuesto sugerido (%) | KPI principal.

## KPIs objetivo
Para los próximos 90 días: ROAS, CAC, LTV, conversión por canal,
volumen de leads.

## Roadmap táctico de 12 semanas
Por sprint de 2 semanas: qué se ejecuta, quién es responsable, qué
se mide al final.

## Riesgos y mitigaciones
3-5 riesgos identificados + cómo prevenirlos.`,
  },

  setup: {
    system: `Sos el agente de Setup técnico de Dearmas Costantini. Producís el
checklist de configuración técnica que el equipo de ejecución va a
seguir literal.

${BRAND_VOICE}

ESTRUCTURA OBLIGATORIA del reporte:

## Resumen
Qué se setea en esta fase, en cuántos días, quién es responsable de
cada parte.

## Tracking
- [ ] Google Tag Manager: container creado, triggers configurados
- [ ] Meta Pixel + Conversions API: instalado, eventos definidos
- [ ] Google Analytics 4: propiedad, eventos, conversiones
- (agregar bullets específicos al cliente)

## Cuentas de Ads
Qué plataformas activar según los módulos del cliente y el plan de
medios. Para cada una: estado actual, accesos requeridos, próximos
pasos.

## CRM e integraciones
Qué herramientas conectar (HubSpot, Mailchimp, Calendly, n8n, etc).
Solo las que son necesarias para este cliente.

## Agentes IA del cliente
Qué agentes activar (Creativo, Ads, SEO, Email, Social, Analytics)
según los módulos. Para cada uno: qué inputs necesita, qué outputs
genera, frecuencia de ejecución.

## Portal de cliente (read-only)
Qué páginas expone, qué métricas muestra, frecuencia de actualización.

## Bloqueantes y dependencias
Lo que necesitamos del cliente para arrancar (accesos, dominios,
contraseñas) — listado bullet por bullet.`,
  },

  lanzamiento: {
    system: `Sos el agente de Lanzamiento de Dearmas Costantini. Producís el
"Growth Launch Plan": cronograma día por día de los primeros 30 días
operativos.

${BRAND_VOICE}

ESTRUCTURA OBLIGATORIA del reporte:

## Resumen
Cómo arranca el lanzamiento, qué se busca demostrar en 30 días,
qué métricas son críticas.

## Día 0 · Go live
Qué se activa el día cero. Campañas, contenido, automatizaciones.

## Día 1-3 · Validación inicial
Qué medir en las primeras 72hs. Ajustes posibles.

## Día 4-7 · Primera ola
Contenido orgánico, primer ajuste de creatividades, primer aprendizaje.

## Día 8-14 · Email/automation flow
Secuencias activadas, métricas de engagement.

## Día 15-21 · Optimización
Reasignación de presupuesto según resultados, nuevas creatividades.

## Día 22-30 · Primer reporte
Performance del mes 1. Comparación vs KPIs objetivo de la fase de
Estrategia. Aprendizajes y plan para el mes 2.

## Riesgos del lanzamiento
Qué puede salir mal en estos 30 días y cómo se mitiga en tiempo real.

## Checkpoints con el cliente
Cuándo y cómo se reporta avance al cliente. Frecuencia recomendada.`,
  },
};

const PHASE_TITLES: Record<PhaseKey, string> = {
  diagnostico: "Growth Diagnosis Plan",
  estrategia: "Growth Strategy Plan",
  setup: "Setup técnico",
  lanzamiento: "Growth Launch Plan",
};

export function buildPhaseUserPrompt(
  phase: PhaseKey,
  input: PhaseGenerationInput,
): string {
  const sections: string[] = [];

  sections.push(
    `# Tarea\n\nGenerá el reporte de fase **${PHASE_TITLES[phase]}** para el cliente **${input.client.name}**.`,
  );

  // Cliente metadata
  sections.push(`## Datos del cliente

- **Nombre:** ${input.client.name}
- **Sector:** ${input.client.sector}
- **País:** ${input.client.country ?? "—"}
- **Tipo:** ${input.client.type === "gp" ? "Growth Partner (digital)" : "Desarrollo (IA/offline)"}
- **Método contratado:** ${input.client.method}
- **Fee mensual:** US$ ${input.client.fee.toLocaleString()}
- **Contacto principal:** ${input.client.contactName ?? "—"}
- **Módulos activos:** ${
    Object.entries(input.client.modules)
      .filter(([, on]) => on)
      .map(([k]) => k)
      .join(", ") || "—"
  }`);

  // Onboarding info
  const ob = input.onboarding;
  const obParts: string[] = [];
  if (ob.contractDuration) obParts.push(`- Duración del contrato: ${ob.contractDuration} ${ob.contractDuration === "open" ? "" : "meses"}`);
  if (ob.startDate) obParts.push(`- Inicio: ${ob.startDate}`);
  if (ob.endDate) obParts.push(`- Fin: ${ob.endDate}`);
  if (Array.isArray(ob.feeVariableTiers) && ob.feeVariableTiers.length > 0) {
    obParts.push(`- Fee variable: ${(ob.feeVariableTiers as string[]).join(" · ")}`);
  }
  const budgetMkt = ob.budgetMarketing as { fixed?: number; revenuePct?: number } | undefined;
  if (budgetMkt && (budgetMkt.fixed || budgetMkt.revenuePct)) {
    obParts.push(
      `- Presupuesto marketing: ${[
        budgetMkt.fixed ? `US$ ${budgetMkt.fixed.toLocaleString()} mín/mes` : "",
        budgetMkt.revenuePct ? `${budgetMkt.revenuePct}% revenue` : "",
      ]
        .filter(Boolean)
        .join(" + ")}`,
    );
  }
  const budgetProd = ob.budgetProduccion as { fixed?: number; revenuePct?: number } | undefined;
  if (budgetProd && (budgetProd.fixed || budgetProd.revenuePct)) {
    obParts.push(
      `- Presupuesto producción: ${[
        budgetProd.fixed ? `US$ ${budgetProd.fixed.toLocaleString()} mín/mes` : "",
        budgetProd.revenuePct ? `${budgetProd.revenuePct}% revenue` : "",
      ]
        .filter(Boolean)
        .join(" + ")}`,
    );
  }
  if (Array.isArray(ob.brandingFiles) && ob.brandingFiles.length > 0) {
    obParts.push(`- Archivos de branding cargados: ${ob.brandingFiles.length}`);
  }
  if (obParts.length > 0) {
    sections.push(`## Contrato y onboarding\n\n${obParts.join("\n")}`);
  }

  // Kickoff PDF reference
  if (input.kickoffName) {
    sections.push(
      `## Documento de kickoff\n\nEl PDF "${input.kickoffName}" está adjunto como documento en este mensaje. Leelo entero antes de generar el reporte. Es la fuente principal de verdad sobre la propuesta de valor, audiencia, tono, competidores y objetivos del cliente.`,
    );
  } else {
    sections.push(
      `## Documento de kickoff\n\n⚠ No se cargó kickoff PDF. Trabajá con la metadata del cliente y los reportes anteriores. Marcá "⚠ Falta info: …" en las secciones donde necesites el kickoff.`,
    );
  }

  // Reportes anteriores aprobados
  if (input.previousReports.length > 0) {
    sections.push(
      `## Reportes anteriores aprobados\n\nEstos reportes ya fueron aprobados por el director. Tomalos como contexto vinculante — no contradigas sus conclusiones, construí encima de ellos.`,
    );
    for (const r of input.previousReports) {
      sections.push(`### Reporte de ${r.phase}\n\n${r.content_md}`);
    }
  }

  // Feedback del director (regeneración)
  if (input.feedback) {
    sections.push(
      `## Feedback del director (REGENERACIÓN)\n\nEsta versión anterior del reporte fue rechazada. El director pidió:\n\n> ${input.feedback}\n\nReescribí el reporte aplicando este feedback puntualmente. No descartes lo que estaba bien; ajustá lo que se pidió.`,
    );
  }

  sections.push(
    `---\n\nGenerá ahora el reporte siguiendo la estructura del system prompt. Markdown limpio, sin preámbulo.`,
  );

  return sections.join("\n\n");
}
