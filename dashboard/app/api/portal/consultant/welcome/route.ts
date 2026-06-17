/**
 * GET /api/portal/consultant/welcome
 *
 * Devuelve el "mensaje de bienvenida" del Consultor IA al cliente.
 * Es lo primero que ve cuando entra a /portal — un resumen del estado
 * de su cuenta + sugerencia de qué preguntar.
 *
 * Cache strategy:
 *   - Tabla consultant_welcomes(client_id PK, content_md, data_signature, generated_at)
 *   - Hit si: signature matchea Y generated_at > now() - 24h.
 *   - Triggers SQL invalidan el cache si phase_reports pasa a approved
 *     o si clients.kpis cambia (ver migration 014).
 *   - Si miss → llamar a Claude → UPSERT.
 *
 * Response:
 *   { welcome: string, cached: boolean, generatedAt: string }
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  loadClientContext,
  buildClientContextBlock,
  computeDataSignature,
  createAdminClient,
} from "@/lib/consultant-context";
import {
  loadClientVaultForPortal,
  buildPortalVaultBlock,
  vaultSignatureFragment,
} from "@/lib/portal-vault-context";
import { CLAUDE_MODEL_OPUS } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";

const MODEL = CLAUDE_MODEL_OPUS;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const SYSTEM_PROMPT = `Sos D&C Advisor, el asistente IA del portal de Dearmas Costantini. Cuando te presentás, decí "D&C Advisor" — nunca "Consultor IA" ni variantes.

CONTEXTO DEL TURNO:
El cliente acaba de abrir el portal. Es lo primero que va a leer hoy.
Saludalo brevemente por nombre y dale un resumen ejecutivo en este orden, usando markdown limpio:

1) **Cómo va tu mes** — 1 oración con el estado de KPIs vs target (si hay objectives). Si no hay data, decílo.
2) **Novedades** — bullets cortos con: reportes nuevos aprobados, decisiones tomadas, próximos pasos del equipo, cambios en strategy.md o brand/* recientes. Máximo 3 bullets.
3) **Próximas reuniones** — hasta 2.
4) **Te sugiero preguntarme** — 1 pregunta concreta que el cliente podría hacerte hoy. Apoyate en lo que el equipo cargó en su vault (strategy, brandbook, content-library) para hacer la sugerencia más rica que un genérico "¿cómo va el ROAS?".

CONTEXTO QUE TENÉS:
- Tablas Supabase: KPIs, objetivos, fases, campañas, contenido publicado, reuniones, pagos, solicitudes, integraciones.
- Vault textual cargado por el equipo: claude-client.md, strategy.md, brand/* (8 archivos), content-library, content-calendar, ads-library, seo-library, metrics-log, performance-log.
- NO accedés a info interna (learning-log, calls-log, notas internas).

REGLAS:
- Tono cálido pero ejecutivo. Sin jerga ni promesas vacías.
- Español rioplatense (vos, tu cuenta, tu negocio).
- Prohibido: "sinergia", "potenciar", "transformar", "valor agregado", "ecosistema".
- Concreto: números reales, fechas reales. Si no tenés data, decís "todavía no veo X cargado".
- Nunca inventes métricas.
- Máximo 220 palabras totales.
- NO empezar con "¡Hola!" repetido — variar el saludo.`;

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!url || !anonKey || !anthropicKey) {
    return Response.json(
      { error: "Servidor no configurado." },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { error: "Servidor no configurado (service role key)." },
      { status: 500 },
    );
  }

  // Auth
  const callerToken = req.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role, client_id, name")
    .eq("id", caller.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.role !== "client" || !callerProfile.client_id) {
    return Response.json(
      { error: "Solo clientes pueden pedir el welcome." },
      { status: 403 },
    );
  }

  const clientId = callerProfile.client_id;

  // Cargar contexto en paralelo: tablas Supabase + vault filtrado del repo.
  const [bundle, vault] = await Promise.all([
    loadClientContext(admin, clientId),
    loadClientVaultForPortal(clientId).catch((err) => {
      console.warn(
        `[welcome] vault load falló para ${clientId}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }),
  ]);

  if (!bundle) {
    return Response.json(
      { error: "Cliente no encontrado." },
      { status: 404 },
    );
  }

  // Signature = hash de tablas + hash del vault. Si el equipo edita
  // strategy.md o brand/positioning.md, el cache se invalida automáticamente.
  const tablesSig = computeDataSignature(bundle);
  const vaultSig = vault
    ? createHash("sha256")
        .update(vaultSignatureFragment(vault))
        .digest("hex")
        .slice(0, 16)
    : "novault";
  const signature = `${tablesSig}-${vaultSig}`;

  // Chequear cache
  const { data: cached } = await admin
    .from("consultant_welcomes")
    .select("content_md, data_signature, generated_at")
    .eq("client_id", clientId)
    .maybeSingle();

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime();
    const fresh = age < CACHE_TTL_MS && cached.data_signature === signature;
    if (fresh) {
      return Response.json({
        welcome: cached.content_md,
        cached: true,
        generatedAt: cached.generated_at,
      });
    }
  }

  // Cache miss — generar
  const contextBlock = buildClientContextBlock(bundle);
  const vaultBlock = vault ? buildPortalVaultBlock(vault) : null;
  const userMessage = `Es la primera vez del día que el cliente ${bundle.client.name} entra a su portal. Generá el mensaje de bienvenida según las reglas.`;

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  let welcome: string;
  try {
    const systemBlocks: Array<{
      type: "text";
      text: string;
      cache_control?: { type: "ephemeral" };
    }> = [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: contextBlock,
      },
    ];
    if (vaultBlock) {
      systemBlocks.push({
        type: "text",
        text: vaultBlock,
        cache_control: { type: "ephemeral" },
      });
    }

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: systemBlocks,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    welcome =
      textBlock && textBlock.type === "text"
        ? textBlock.text.trim()
        : "Bienvenido a tu portal.";
    await recordApiUsage({
      source: "dashboard:portal-welcome",
      clientId,
      model: response.model,
      usage: response.usage,
    });
  } catch (err) {
    console.error("welcome generation error:", err);
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY inválida." },
        { status: 401 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        { error: `Claude: ${err.message}` },
        { status: err.status ?? 500 },
      );
    }
    return Response.json({ error: "Error inesperado." }, { status: 500 });
  }

  const generatedAt = new Date().toISOString();

  // UPSERT cache
  const { error: cacheErr } = await admin
    .from("consultant_welcomes")
    .upsert({
      client_id: clientId,
      content_md: welcome,
      data_signature: signature,
      generated_at: generatedAt,
    });

  if (cacheErr) {
    console.error("welcome cache upsert error:", cacheErr.message);
    // No fallamos el request — devolvemos el welcome igual.
  }

  return Response.json({
    welcome,
    cached: false,
    generatedAt,
  });
}
