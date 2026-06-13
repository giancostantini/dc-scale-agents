/**
 * POST /api/meta/push-campaign
 *
 * Toma un CampaignSpec generado por /api/meta/generate-campaign-spec
 * y lo pushea a la Meta Marketing API:
 *   1. POST /act_{adAccountId}/campaigns
 *   2. POST /act_{adAccountId}/adsets         (linkeado a la campaign)
 *   3. Por cada ad del spec:
 *      a. POST /act_{adAccountId}/adimages (sube el creative)
 *      b. POST /act_{adAccountId}/adcreatives (asocia copy + imagen)
 *      c. POST /act_{adAccountId}/ads (linkea adset + ad creative)
 *
 * Requiere env vars:
 *   - META_ACCESS_TOKEN: token de System User con scope ads_management.
 *   - META_API_VERSION: opcional. Default "v21.0".
 *
 * Requiere en el cliente:
 *   - client.external_links.meta_ad_account_id (numérico sin "act_").
 *   - client.external_links.meta_business_suite_url (opcional, para
 *     mostrar el link al manager en la respuesta).
 *
 * Si falta cualquier credencial, devuelve 400 con un mensaje claro
 * que le dice al director qué setear. NO falla silencioso.
 *
 * NOTA IMPORTANTE: este endpoint crea TODO en status='PAUSED'. El
 * director siempre tiene que activar manualmente en Ads Manager. Es
 * a propósito — evita pushear plata por error desde un prompt.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

interface Ad {
  name: string;
  creative_ref: string;
  creative_type: "image" | "video";
  headline: string;
  primary_text: string;
  description?: string;
  cta_type: string;
  destination_url: string;
  status: string;
}

interface AdSet {
  name: string;
  billing_event: string;
  optimization_goal: string;
  daily_budget: number | null;
  lifetime_budget: number | null;
  start_time: string;
  end_time: string | null;
  targeting: Record<string, unknown>;
  status: string;
  /** Multi-adset: cada uno tiene su lista de ads. El push las crea
   *  todas linkeadas al adset_id correspondiente. */
  ads?: Ad[];
}

interface CampaignSpec {
  campaign: {
    name: string;
    objective: string;
    special_ad_categories: string[];
    status: string;
    buying_type: string;
  };
  /** Nueva forma multi-adset. Si está, ignoramos `adset`+`ads` legacy. */
  adsets?: AdSet[];
  /** LEGACY (compat con spec single-adset que generamos antes). */
  adset?: AdSet;
  ads?: Ad[];
  reasoning?: string;
}

interface RequestBody {
  client_id: string;
  spec: CampaignSpec;
  /** Si true, el endpoint corre en DRY-RUN: valida el spec, simula los
   *  payloads que iría a mandar a Meta y los devuelve, pero no llama
   *  a la Graph API. Útil para preview. */
  dry_run?: boolean;
}

export async function POST(req: NextRequest) {
  // ====== Validación de auth ======
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { error: "Faltan env vars de Supabase" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return Response.json({ error: "Sin auth" }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: userRes } = await admin.auth.getUser(token);
  if (!userRes.user) {
    return Response.json({ error: "Token inválido" }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .single();
  if (profile?.role !== "director") {
    return Response.json(
      { error: "Solo director puede pushear campañas Meta" },
      { status: 403 },
    );
  }

  // ====== Parsear body ======
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json(
      { error: "Body inválido (esperaba JSON)" },
      { status: 400 },
    );
  }
  if (!body.client_id || !body.spec) {
    return Response.json(
      { error: "client_id y spec son requeridos" },
      { status: 400 },
    );
  }

  // ====== Cargar Ad Account ID del cliente ======
  const { data: client } = await admin
    .from("clients")
    .select("name, external_links")
    .eq("id", body.client_id)
    .single();
  if (!client) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const adAccountId = (
    client.external_links as { meta_ad_account_id?: string } | null
  )?.meta_ad_account_id;
  if (!adAccountId) {
    return Response.json(
      {
        error: "Cliente sin Ad Account ID configurado",
        hint: `Andá a Cliente → Configuración → Meta Business Suite y cargá el "Ad Account ID" del cliente. Lo conseguís en business.facebook.com → Configuración del negocio → Cuentas publicitarias → ID (es numérico, sin el prefijo "act_").`,
      },
      { status: 400 },
    );
  }

  // ====== Cargar META_ACCESS_TOKEN ======
  const metaToken = process.env.META_ACCESS_TOKEN;
  const apiVersion = process.env.META_API_VERSION ?? "v21.0";

  if (!metaToken) {
    return Response.json(
      {
        error: "META_ACCESS_TOKEN no configurado en el servidor",
        hint: `Setear la env var META_ACCESS_TOKEN con un token de System User con scope ads_management. Lo generás en developers.facebook.com → tu App → System Users → Generate Token con permission "ads_management" + "business_management". Pegarlo en Vercel → Project Settings → Environment Variables.`,
      },
      { status: 400 },
    );
  }

  // ====== DRY-RUN o real ======
  if (body.dry_run) {
    return Response.json({
      dry_run: true,
      ad_account: `act_${adAccountId}`,
      api_version: apiVersion,
      preview: buildPayloads(body.spec, adAccountId),
    });
  }

  // ====== PUSH REAL ======
  // Hacemos los 3 niveles en secuencia. Si falla un nivel intermedio,
  // dejamos lo creado en Meta (status=PAUSED) y devolvemos el error
  // — el director puede limpiarlo manualmente desde Ads Manager.
  const graphBase = `https://graph.facebook.com/${apiVersion}/act_${adAccountId}`;

  // 1) Crear Campaign.
  //
  // Antes pasábamos el objective tal cual lo generaba Claude. Meta
  // Marketing API v18+ ya NO acepta los objectives legacy (CONVERSIONS,
  // LINK_CLICKS, REACH, MESSAGES, LEAD_GENERATION, BRAND_AWARENESS,
  // POST_ENGAGEMENT…). Hay que mandar OUTCOME_*. Como red de seguridad
  // mapeamos acá antes de enviar — así si Claude o el director pegan
  // un objective viejo no se cae el push.
  // ¿La campaña tiene presupuesto centralizado (CBO / Advantage
  // Budget) o cada AdSet maneja el suyo? Como nuestro spec setea
  // daily_budget/lifetime_budget por AdSet (no en la Campaign),
  // estamos siempre en modo "per-adset budget". Lo guardamos para
  // decidir is_adset_budget_sharing_enabled abajo.
  const campaignHasOwnBudget =
    typeof (body.spec.campaign as Record<string, unknown>).daily_budget ===
      "number" ||
    typeof (body.spec.campaign as Record<string, unknown>).lifetime_budget ===
      "number";

  const normalizedCampaign = {
    ...body.spec.campaign,
    objective: normalizeObjective(body.spec.campaign.objective),
    // special_ad_categories TIENE que ser array — algunas tools lo
    // mandan como string vacío. Lo forzamos.
    special_ad_categories: Array.isArray(body.spec.campaign.special_ad_categories)
      ? body.spec.campaign.special_ad_categories
      : [],
    // Meta v21 exige declarar is_adset_budget_sharing_enabled de
    // forma explícita cuando NO se usa Campaign Budget Optimization
    // (CBO). Sin esto Meta devuelve:
    //   "Se debe especificar Verdadero o Falso en el campo
    //    is_adset_budget_sharing_enabled si no estás usando el
    //    presupuesto de campaña."
    // Nuestro generator pone daily_budget en cada AdSet (no en la
    // Campaign), así que vamos con `false` por defecto — cada AdSet
    // gestiona su propio presupuesto sin compartirlo. Si la spec
    // ya trajo el campo, lo respetamos.
    is_adset_budget_sharing_enabled:
      typeof (body.spec.campaign as Record<string, unknown>)
        .is_adset_budget_sharing_enabled === "boolean"
        ? (body.spec.campaign as Record<string, unknown>)
            .is_adset_budget_sharing_enabled
        : campaignHasOwnBudget
          ? undefined // si la Campaign sí tiene budget, dejá que Meta default
          : false,
  };

  let campaignId: string;
  try {
    console.log("[meta-push] creating campaign", {
      account: `act_${adAccountId}`,
      payload: normalizedCampaign,
    });
    const campaignRes = await fetch(`${graphBase}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...normalizedCampaign,
        access_token: metaToken,
      }),
    });
    const campaignData = await campaignRes.json();
    if (!campaignRes.ok || !campaignData.id) {
      console.error("[meta-push] campaign create failed", {
        status: campaignRes.status,
        sent: normalizedCampaign,
        meta_response: campaignData,
      });
      return Response.json(
        {
          error: "Falló crear campaign en Meta",
          step: "campaign",
          status: campaignRes.status,
          sent: normalizedCampaign,
          meta_response: campaignData,
          hint: campaignHintFromMetaResponse(campaignData),
        },
        { status: 502 },
      );
    }
    campaignId = campaignData.id;
  } catch (e) {
    console.error("[meta-push] campaign network error", {
      err: (e as Error).message,
    });
    return Response.json(
      {
        error: "Error de red al crear campaign",
        step: "campaign",
        detail: (e as Error).message,
      },
      { status: 502 },
    );
  }

  // 2-3) Iterar sobre los AdSets (multi). Si el spec viejo solo tiene
  // adset+ads (legacy), lo normalizamos a un array de 1.
  const adsetsList: AdSet[] =
    body.spec.adsets && body.spec.adsets.length > 0
      ? body.spec.adsets
      : body.spec.adset
        ? [{ ...body.spec.adset, ads: body.spec.ads }]
        : [];

  if (adsetsList.length === 0) {
    return Response.json(
      {
        error: "Spec sin adsets",
        step: "validate",
        campaign_id: campaignId,
      },
      { status: 400 },
    );
  }

  const pageId = process.env.META_PAGE_ID;
  if (!pageId) {
    return Response.json(
      {
        error:
          "META_PAGE_ID env var faltante. Sin Facebook Page ID no se pueden crear los AdCreatives.",
        step: "config",
        campaign_id: campaignId,
      },
      { status: 400 },
    );
  }

  const adsetResults: Array<{
    name: string;
    ok: boolean;
    adset_id?: string;
    ads: Array<{
      name: string;
      ok: boolean;
      ad_id?: string;
      creative_id?: string;
      error?: string;
    }>;
    error?: string;
  }> = [];

  for (const adsetSpec of adsetsList) {
    // 2.x) Crear AdSet linkeado a la campaign.
    let adSetId = "";
    try {
      const { ads: _ignoreAds, ...adsetFields } = adsetSpec;
      const adsetRes = await fetch(`${graphBase}/adsets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...adsetFields,
          campaign_id: campaignId,
          access_token: metaToken,
        }),
      });
      const adsetData = await adsetRes.json();
      if (!adsetRes.ok || !adsetData.id) {
        adsetResults.push({
          name: adsetSpec.name,
          ok: false,
          ads: [],
          error: `adset: ${JSON.stringify(adsetData)}`,
        });
        continue;
      }
      adSetId = adsetData.id as string;
    } catch (e) {
      adsetResults.push({
        name: adsetSpec.name,
        ok: false,
        ads: [],
        error: `adset network: ${(e as Error).message}`,
      });
      continue;
    }

    // 3.x) Por cada ad del adset, subir imagen → AdCreative → Ad.
    const adsForThisAdset = adsetSpec.ads ?? [];
    const adsResults: typeof adsetResults[number]["ads"] = [];

    for (const ad of adsForThisAdset) {
      try {
        // 3.x.a) Si la creative es imagen, primero hay que subirla al
        //   endpoint /adimages para obtener image_hash. Antes pasábamos
        //   la URL en link_data.picture directo — Meta acepta el
        //   parámetro pero NO siempre resuelve la URL externa, y la Ad
        //   quedaba creada pero invisible en Ads Manager. El path
        //   confiable es bytes → image_hash → link_data.image_hash.
        let imageHash: string | undefined = undefined;
        if (ad.creative_type === "image") {
          try {
            imageHash = await uploadAdImage(
              graphBase,
              ad.creative_ref,
              metaToken,
            );
          } catch (e) {
            const err = (e as Error).message;
            console.error("[meta-push] adimages upload failed", {
              ad: ad.name,
              url: ad.creative_ref,
              err,
            });
            adsResults.push({
              name: ad.name,
              ok: false,
              error: `adimages: ${err}`,
            });
            continue;
          }
        }

        const creativePayload: Record<string, unknown> = {
          name: `${ad.name} · Creative`,
          object_story_spec: {
            page_id: pageId,
            link_data: {
              link: ad.destination_url,
              message: ad.primary_text,
              name: ad.headline,
              description: ad.description ?? undefined,
              // image_hash (subido recién) cuando es imagen.
              // Para video: TODO subir a /advideos y mandar video_id.
              // Por ahora dejamos undefined; Meta va a rechazar
              // creatives de video sin video_id pero el error queda
              // claro en la respuesta.
              image_hash: imageHash,
              call_to_action: {
                type: ad.cta_type,
                value: { link: ad.destination_url },
              },
            },
          },
          access_token: metaToken,
        };
        const creativeRes = await fetch(`${graphBase}/adcreatives`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(creativePayload),
        });
        const creativeData = await creativeRes.json();
        if (!creativeRes.ok || !creativeData.id) {
          console.error("[meta-push] adcreative failed", {
            ad: ad.name,
            meta_response: creativeData,
          });
          adsResults.push({
            name: ad.name,
            ok: false,
            error: `creative: ${JSON.stringify(creativeData)}`,
          });
          continue;
        }
        const creativeId = creativeData.id as string;

        const adRes = await fetch(`${graphBase}/ads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: ad.name,
            adset_id: adSetId,
            creative: { creative_id: creativeId },
            status: ad.status,
            access_token: metaToken,
          }),
        });
        const adData = await adRes.json();
        if (!adRes.ok || !adData.id) {
          console.error("[meta-push] ad creation failed", {
            ad: ad.name,
            meta_response: adData,
          });
          adsResults.push({
            name: ad.name,
            ok: false,
            creative_id: creativeId,
            error: `ad: ${JSON.stringify(adData)}`,
          });
          continue;
        }
        adsResults.push({
          name: ad.name,
          ok: true,
          ad_id: adData.id as string,
          creative_id: creativeId,
        });
      } catch (e) {
        console.error("[meta-push] ad pipeline crashed", {
          ad: ad.name,
          err: (e as Error).message,
        });
        adsResults.push({
          name: ad.name,
          ok: false,
          error: (e as Error).message,
        });
      }
    }

    adsetResults.push({
      name: adsetSpec.name,
      ok: true,
      adset_id: adSetId,
      ads: adsResults,
    });
  }

  // El response anterior siempre devolvía success=true cuando se creaba
  // la campaign, aunque todos los adsets/ads adentro hubieran fallado.
  // Eso confundía: el director veía "✓ pushed" pero en Ads Manager no
  // aparecían ni los conjuntos ni los anuncios. Ahora computamos
  // success real = campaign creada + todos los adsets ok + todos los
  // ads ok.
  const allAdsetsOk = adsetResults.every((a) => a.ok);
  const allAdsOk = adsetResults.every((a) => a.ads.every((ad) => ad.ok));
  const success = allAdsetsOk && allAdsOk;
  const failures: string[] = [];
  for (const a of adsetResults) {
    if (!a.ok) failures.push(`AdSet "${a.name}": ${a.error ?? "sin detalle"}`);
    for (const ad of a.ads) {
      if (!ad.ok)
        failures.push(`Ad "${ad.name}" (en ${a.name}): ${ad.error ?? "sin detalle"}`);
    }
  }

  return Response.json(
    {
      success,
      campaign_id: campaignId,
      adsets: adsetResults,
      failures,
      note: success
        ? "Todo creado en status=PAUSED. Revisá en Ads Manager y activá manualmente."
        : "Campaign creada, pero al menos un adset o ad falló. Mirá `failures` y los logs del servidor para el detalle de Meta.",
      manage_url: `https://www.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${campaignId}`,
    },
    { status: success ? 200 : 207 },
  );
}

/**
 * Sube una imagen a /act_<id>/adimages y devuelve el image_hash que
 * después se usa en link_data.image_hash de la AdCreative.
 *
 * El endpoint NO acepta URL externa como parámetro de forma confiable
 * — hay que mandar los bytes en multipart/form-data. Por eso primero
 * hacemos un fetch del recurso (la URL pública del bucket de Supabase
 * o lo que el director haya pegado en /meta), y después POST con
 * FormData.
 *
 * Tira si:
 *   · La URL no se puede bajar (404, CORS, etc).
 *   · Meta rechaza el upload (token sin permiso, formato no soportado).
 */
async function uploadAdImage(
  graphBase: string,
  imageUrl: string,
  accessToken: string,
): Promise<string> {
  // 1) Bajar la imagen.
  const dl = await fetch(imageUrl);
  if (!dl.ok) {
    throw new Error(
      `No se pudo bajar la imagen (${dl.status} ${dl.statusText}): ${imageUrl}`,
    );
  }
  const blob = await dl.blob();
  if (blob.size === 0) {
    throw new Error(`La imagen bajada vino vacía: ${imageUrl}`);
  }

  // 2) Construir multipart. Meta espera un field con nombre arbitrario
  //    (usamos "file"); en el response devuelve { images: { <field>:
  //    { hash } } }.
  const form = new FormData();
  form.append("access_token", accessToken);
  // Nombre del archivo: extraemos del path para que Meta no haga lío
  // con extensiones genéricas.
  const fileName = (() => {
    try {
      const u = new URL(imageUrl);
      const last = u.pathname.split("/").pop() ?? "creative.jpg";
      return last.includes(".") ? last : `${last}.jpg`;
    } catch {
      return "creative.jpg";
    }
  })();
  form.append("file", blob, fileName);

  const res = await fetch(`${graphBase}/adimages`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Meta /adimages ${res.status}: ${JSON.stringify(data)}`);
  }
  // Shape: { images: { "<fieldName>": { hash, url } } }
  const imagesObj = (data?.images ?? {}) as Record<string, { hash?: string }>;
  const firstKey = Object.keys(imagesObj)[0];
  const hash = firstKey ? imagesObj[firstKey]?.hash : undefined;
  if (!hash) {
    throw new Error(
      `Meta /adimages no devolvió image_hash: ${JSON.stringify(data)}`,
    );
  }
  return hash;
}

/**
 * Mapea objectives legacy de Meta Marketing API (deprecados en v18+)
 * a sus equivalentes OUTCOME_*. Si el objective ya es OUTCOME_* o no
 * lo conocemos, lo devolvemos tal cual.
 *
 * Tabla oficial de migración (Meta docs):
 *   BRAND_AWARENESS / REACH        → OUTCOME_AWARENESS
 *   LINK_CLICKS / TRAFFIC          → OUTCOME_TRAFFIC
 *   POST_ENGAGEMENT / PAGE_LIKES /
 *     EVENT_RESPONSES / MESSAGES /
 *     VIDEO_VIEWS                  → OUTCOME_ENGAGEMENT
 *   LEAD_GENERATION                → OUTCOME_LEADS
 *   APP_INSTALLS                   → OUTCOME_APP_PROMOTION
 *   CONVERSIONS / CATALOG_SALES /
 *     STORE_VISITS / PRODUCT_CATALOG_SALES
 *                                  → OUTCOME_SALES
 */
function normalizeObjective(obj: string | undefined | null): string {
  if (!obj) return "OUTCOME_TRAFFIC";
  const v = obj.trim().toUpperCase();
  if (v.startsWith("OUTCOME_")) return v;
  const map: Record<string, string> = {
    BRAND_AWARENESS: "OUTCOME_AWARENESS",
    REACH: "OUTCOME_AWARENESS",
    LINK_CLICKS: "OUTCOME_TRAFFIC",
    TRAFFIC: "OUTCOME_TRAFFIC",
    POST_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
    PAGE_LIKES: "OUTCOME_ENGAGEMENT",
    EVENT_RESPONSES: "OUTCOME_ENGAGEMENT",
    MESSAGES: "OUTCOME_ENGAGEMENT",
    VIDEO_VIEWS: "OUTCOME_ENGAGEMENT",
    LEAD_GENERATION: "OUTCOME_LEADS",
    APP_INSTALLS: "OUTCOME_APP_PROMOTION",
    CONVERSIONS: "OUTCOME_SALES",
    CATALOG_SALES: "OUTCOME_SALES",
    PRODUCT_CATALOG_SALES: "OUTCOME_SALES",
    STORE_VISITS: "OUTCOME_SALES",
  };
  return map[v] ?? "OUTCOME_TRAFFIC";
}

/**
 * Mira el JSON que devolvió Meta y arma una pista en español para el
 * director. Cubre los errores típicos que vemos: objective inválido,
 * special_ad_categories, token sin permiso, ad account sin payment
 * method, app no aprobada para Marketing API, page no asignada al
 * business, etc. Si no matchea ninguno, devolvemos null.
 */
function campaignHintFromMetaResponse(meta: unknown): string | null {
  const m = meta as { error?: { code?: number; message?: string; error_subcode?: number; error_user_msg?: string } };
  const code = m?.error?.code;
  const subcode = m?.error?.error_subcode;
  const msg = (m?.error?.message ?? "").toLowerCase();
  const userMsg = m?.error?.error_user_msg;

  if (userMsg) return userMsg;

  if (code === 100 && msg.includes("objective")) {
    return "Meta rechazó el objective. Asegurate de usar OUTCOME_TRAFFIC / OUTCOME_AWARENESS / OUTCOME_ENGAGEMENT / OUTCOME_LEADS / OUTCOME_SALES — los viejos (CONVERSIONS, LINK_CLICKS, REACH…) ya no se aceptan en v21.";
  }
  if (code === 100 && msg.includes("special_ad_categor")) {
    return "Meta rechazó special_ad_categories. Tiene que ser un array — vacío [] si no aplica, o ['HOUSING'|'EMPLOYMENT'|'CREDIT'] cuando corresponde por regulación.";
  }
  if (code === 190 || code === 102 || msg.includes("access token")) {
    return "META_ACCESS_TOKEN inválido o expiró. Re-generá el System User Token con scope ads_management + business_management y actualizalo en Vercel.";
  }
  if (code === 200 || msg.includes("permission")) {
    return "El token no tiene permisos sobre este Ad Account. En business.facebook.com → Configuración → Usuarios del sistema → tu System User, asignale la Ad Account con rol 'Anunciante' o 'Administrador'.";
  }
  if (msg.includes("payment") || msg.includes("billing") || subcode === 1487390) {
    return "El Ad Account no tiene método de pago configurado o tiene la facturación bloqueada. Abrí business.facebook.com → Facturación y verificá que haya tarjeta + cuenta activa.";
  }
  if (msg.includes("not authorized") || msg.includes("not configured")) {
    return "La App o System User no están autorizados sobre este Ad Account. Revisá que (1) la App esté en modo Live, (2) tenga el producto Marketing API habilitado, (3) el System User esté asignado al Ad Account.";
  }
  return null;
}

/** Construye los payloads que se mandarían a Meta. Usado para
 *  dry-run preview. No hace llamadas reales. */
function buildPayloads(spec: CampaignSpec, adAccountId: string) {
  const account = `act_${adAccountId}`;
  const adsetsList: AdSet[] =
    spec.adsets && spec.adsets.length > 0
      ? spec.adsets
      : spec.adset
        ? [{ ...spec.adset, ads: spec.ads }]
        : [];
  return {
    campaign_post: {
      endpoint: `${account}/campaigns`,
      body: spec.campaign,
    },
    adsets: adsetsList.map((a) => ({
      adset_post: {
        endpoint: `${account}/adsets`,
        body: { ...a, campaign_id: "<campaign_id_from_step_1>" },
      },
      ads_posts: (a.ads ?? []).map((ad) => ({
        endpoint: `${account}/ads`,
        body: { name: ad.name, status: ad.status },
        creative_endpoint: `${account}/adcreatives`,
        creative_body: {
          name: `${ad.name} · Creative`,
          object_story_spec: {
            page_id: "<META_PAGE_ID env var>",
            link_data: {
              link: ad.destination_url,
              message: ad.primary_text,
              name: ad.headline,
              picture: ad.creative_ref,
            },
          },
        },
      })),
    })),
  };
}
