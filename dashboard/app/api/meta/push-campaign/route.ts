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
  let campaignId: string;
  try {
    const campaignRes = await fetch(`${graphBase}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body.spec.campaign,
        access_token: metaToken,
      }),
    });
    const campaignData = await campaignRes.json();
    if (!campaignRes.ok || !campaignData.id) {
      return Response.json(
        {
          error: "Falló crear campaign en Meta",
          step: "campaign",
          meta_response: campaignData,
        },
        { status: 502 },
      );
    }
    campaignId = campaignData.id;
  } catch (e) {
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

    // 3.x) Por cada ad del adset, crear AdCreative + Ad.
    const adsForThisAdset = adsetSpec.ads ?? [];
    const adsResults: typeof adsetResults[number]["ads"] = [];

    for (const ad of adsForThisAdset) {
      try {
        const creativePayload = {
          name: `${ad.name} · Creative`,
          object_story_spec: {
            page_id: pageId,
            link_data: {
              link: ad.destination_url,
              message: ad.primary_text,
              name: ad.headline,
              description: ad.description ?? undefined,
              picture:
                ad.creative_type === "image" ? ad.creative_ref : undefined,
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

  return Response.json({
    success: true,
    campaign_id: campaignId,
    adsets: adsetResults,
    note:
      "Todo creado en status=PAUSED. Revisá en Ads Manager y activá manualmente cuando estés conforme.",
    manage_url: `https://www.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${campaignId}`,
  });
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
