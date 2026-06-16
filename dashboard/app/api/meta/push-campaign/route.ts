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

// ============================================================
// BULLETPROOFING — defaults por objective que sabemos que funcionan
// en Meta v21+ sin requerir pixel, lead form ni otra config previa.
//
// Idea central: en lugar de jugar al whack-a-mole con cada nuevo
// error de Meta, normalizamos AGRESIVO upfront a un set mínimo que
// SIEMPRE funciona. El director puede subir la complejidad después
// editando en Ads Manager.
// ============================================================
interface ObjectiveDefaults {
  optimization_goal: string;
  billing_event: string;
  /** CTAs que Meta acepta para este objective. */
  cta_allowlist: string[];
  /** CTA que usamos si Claude generó uno inválido. */
  default_cta: string;
}

const OBJECTIVE_DEFAULTS: Record<string, ObjectiveDefaults> = {
  OUTCOME_TRAFFIC: {
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    cta_allowlist: [
      "LEARN_MORE",
      "SHOP_NOW",
      "SIGN_UP",
      "BOOK_NOW",
      "DOWNLOAD",
      "GET_OFFER",
      "APPLY_NOW",
      "ORDER_NOW",
      "SEE_MORE",
    ],
    default_cta: "LEARN_MORE",
  },
  OUTCOME_AWARENESS: {
    optimization_goal: "REACH",
    billing_event: "IMPRESSIONS",
    cta_allowlist: ["LEARN_MORE", "SHOP_NOW", "WATCH_MORE", "SEE_MORE"],
    default_cta: "LEARN_MORE",
  },
  OUTCOME_ENGAGEMENT: {
    optimization_goal: "POST_ENGAGEMENT",
    billing_event: "IMPRESSIONS",
    cta_allowlist: [
      "LEARN_MORE",
      "MESSAGE_PAGE",
      "LIKE_PAGE",
      "SEE_MORE",
      "WATCH_MORE",
    ],
    default_cta: "LEARN_MORE",
  },
  OUTCOME_LEADS: {
    // OUTCOME_LEADS con LEAD_GENERATION exige un lead_gen_form_id que
    // no tenemos. Como fallback seguro usamos LINK_CLICKS — la campaña
    // va a generar tráfico al sitio. Si el director necesita lead form
    // de verdad, lo arma directo en Ads Manager.
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    cta_allowlist: ["SIGN_UP", "LEARN_MORE", "CONTACT_US", "APPLY_NOW"],
    default_cta: "SIGN_UP",
  },
  OUTCOME_SALES: {
    // OUTCOME_SALES con OFFSITE_CONVERSIONS exige promoted_object con
    // pixel + custom_event_type. Fallback a LINK_CLICKS para que no
    // se caiga el push si todavía no está pixeleado el cliente.
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    cta_allowlist: ["SHOP_NOW", "ORDER_NOW", "GET_OFFER", "LEARN_MORE"],
    default_cta: "SHOP_NOW",
  },
  OUTCOME_APP_PROMOTION: {
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    cta_allowlist: ["DOWNLOAD", "INSTALL_MOBILE_APP", "USE_APP"],
    default_cta: "DOWNLOAD",
  },
};

/**
 * Toma el spec crudo (de Claude o pegado a mano) y lo deja en una
 * forma que Meta v21+ acepta sin discutir. Devuelve también los
 * warnings de lo que ajustamos para que el director los vea en la UI.
 *
 * Reglas:
 *   1. objective → normalizar a OUTCOME_* (red de seguridad, el
 *      generator nuevo ya los devuelve así).
 *   2. campaign.is_adset_budget_sharing_enabled = false (no CBO).
 *   3. campaign.special_ad_categories = [] si no es array.
 *   4. Por cada AdSet:
 *      a. optimization_goal + billing_event forzados desde
 *         OBJECTIVE_DEFAULTS[objective] (no confiamos en lo que
 *         haya generado Claude — esto causaba combos imposibles).
 *      b. bid_strategy = LOWEST_COST_WITHOUT_CAP (auto-bid sin tope).
 *      c. start_time/end_time → ISO 8601 con UTC.
 *      d. targeting: SOLO conservamos geo_locations + age + genders
 *         + publisher_platforms. Borramos facebook_positions /
 *         instagram_positions / device_platforms — Meta usa
 *         Advantage+ Placements por default, que es lo
 *         recomendado en v21 y nunca rompe.
 *      e. targeting_automation.advantage_audience = 0.
 *      f. Filtramos ads con creative_type=video (no soportamos
 *         /advideos aún; se acumula warning).
 *      g. cta_type validado contra OBJECTIVE_DEFAULTS[objective]
 *         .cta_allowlist. Si está fuera de la lista, fallback al
 *         default_cta.
 *      h. destination_url: si falta o no empieza con http(s),
 *         intentamos client.website; si no hay, warning.
 */
function bulletproofSpec(
  spec: CampaignSpec,
  ctx: { clientWebsite?: string | null },
): { spec: CampaignSpec; warnings: string[] } {
  const warnings: string[] = [];
  const fallbackUrl =
    (ctx.clientWebsite ?? "").trim() || "https://example.com";

  // ---- Campaign ----
  const rawCampaign = (spec.campaign ?? {}) as Record<string, unknown>;
  const objective = normalizeObjective(rawCampaign.objective as string);
  if (
    typeof rawCampaign.objective === "string" &&
    rawCampaign.objective !== objective
  ) {
    warnings.push(
      `Objective normalizado a ${objective} (entró como "${rawCampaign.objective}", que ya no acepta Meta v21).`,
    );
  }
  const defaults = OBJECTIVE_DEFAULTS[objective] ?? OBJECTIVE_DEFAULTS.OUTCOME_TRAFFIC;

  const campaign = {
    name: (rawCampaign.name as string) ?? `Campaña · ${new Date().toISOString().slice(0, 10)}`,
    objective,
    special_ad_categories: Array.isArray(rawCampaign.special_ad_categories)
      ? rawCampaign.special_ad_categories
      : [],
    status: (rawCampaign.status as string) ?? "PAUSED",
    buying_type: (rawCampaign.buying_type as string) ?? "AUCTION",
    is_adset_budget_sharing_enabled: false,
  };

  // ---- AdSets ----
  const adsetsList: AdSet[] =
    spec.adsets && spec.adsets.length > 0
      ? spec.adsets
      : spec.adset
        ? [{ ...spec.adset, ads: spec.ads }]
        : [];

  const cleanAdsets: AdSet[] = adsetsList.map((adsetRaw, idx) => {
    const raw = adsetRaw as unknown as Record<string, unknown>;
    const adsetName = (raw.name as string) ?? `AdSet ${idx + 1}`;

    // Targeting limpio: solo lo seguro.
    const rawT = (raw.targeting ?? {}) as Record<string, unknown>;
    const cleanTargeting: Record<string, unknown> = {};
    if (rawT.geo_locations) cleanTargeting.geo_locations = rawT.geo_locations;
    else
      cleanTargeting.geo_locations = { countries: ["AR", "UY"] }; // default LATAM
    if (typeof rawT.age_min === "number") cleanTargeting.age_min = rawT.age_min;
    if (typeof rawT.age_max === "number") cleanTargeting.age_max = rawT.age_max;
    if (Array.isArray(rawT.genders) && rawT.genders.length > 0)
      cleanTargeting.genders = rawT.genders;
    if (Array.isArray(rawT.publisher_platforms))
      cleanTargeting.publisher_platforms = rawT.publisher_platforms;
    else cleanTargeting.publisher_platforms = ["facebook", "instagram"];
    // targeting_automation.advantage_audience SIEMPRE explícito.
    cleanTargeting.targeting_automation = { advantage_audience: 0 };

    if (rawT.facebook_positions || rawT.instagram_positions) {
      warnings.push(
        `AdSet "${adsetName}": placements específicos descartados — usamos Advantage+ Placements (recomendado por Meta v21).`,
      );
    }

    // optimization_goal + billing_event: forzados desde la tabla.
    if (
      typeof raw.optimization_goal === "string" &&
      raw.optimization_goal !== defaults.optimization_goal
    ) {
      warnings.push(
        `AdSet "${adsetName}": optimization_goal "${raw.optimization_goal}" reemplazado por "${defaults.optimization_goal}" (compatible con ${objective}).`,
      );
    }
    if (
      typeof raw.billing_event === "string" &&
      raw.billing_event !== defaults.billing_event
    ) {
      warnings.push(
        `AdSet "${adsetName}": billing_event "${raw.billing_event}" reemplazado por "${defaults.billing_event}".`,
      );
    }

    // Ads: filtrar videos + validar CTA + destination.
    const ads = ((raw.ads as unknown[]) ?? []) as Ad[];
    const cleanAds: Ad[] = [];
    for (const ad of ads) {
      const adName = (ad.name as string) ?? "Ad sin nombre";
      if (ad.creative_type === "video") {
        warnings.push(
          `Ad "${adName}" descartado: creative_type=video todavía no se soporta (falta integración /advideos). Subilo manual en Ads Manager.`,
        );
        continue;
      }
      const cta = defaults.cta_allowlist.includes(ad.cta_type)
        ? ad.cta_type
        : defaults.default_cta;
      if (cta !== ad.cta_type) {
        warnings.push(
          `Ad "${adName}": cta_type "${ad.cta_type}" no es válido para ${objective} → reemplazado por "${cta}".`,
        );
      }
      const url =
        ad.destination_url && /^https?:\/\//i.test(ad.destination_url.trim())
          ? ad.destination_url.trim()
          : fallbackUrl;
      if (url !== ad.destination_url) {
        warnings.push(
          `Ad "${adName}": destination_url inválida o vacía → usamos "${url}" como fallback.`,
        );
      }
      cleanAds.push({
        name: adName,
        creative_ref: ad.creative_ref,
        creative_type: "image",
        headline: ad.headline ?? "",
        primary_text: ad.primary_text ?? "",
        description: ad.description,
        cta_type: cta,
        destination_url: url,
        status: "PAUSED",
      });
    }

    if (cleanAds.length === 0) {
      warnings.push(
        `AdSet "${adsetName}": no quedó ningún Ad válido después de filtrar. Va a quedar vacío en Meta.`,
      );
    }

    return {
      name: adsetName,
      billing_event: defaults.billing_event,
      optimization_goal: defaults.optimization_goal,
      daily_budget:
        typeof raw.daily_budget === "number" ? raw.daily_budget : null,
      lifetime_budget:
        typeof raw.lifetime_budget === "number" ? raw.lifetime_budget : null,
      start_time: ensureIsoDate(raw.start_time) ?? new Date().toISOString(),
      end_time: raw.end_time == null ? null : (ensureIsoDate(raw.end_time) ?? null),
      targeting: cleanTargeting,
      status: "PAUSED",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      ads: cleanAds,
    } as AdSet & { bid_strategy: string };
  });

  return {
    spec: {
      campaign,
      adsets: cleanAdsets,
      reasoning: spec.reasoning,
    } as CampaignSpec,
    warnings,
  };
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

  // ====== Cargar Ad Account ID + website + token del cliente ======
  // Importante: la columna es website_url (mig 053), no "website".
  // Si Supabase tira error de columna inexistente, queremos surfacearlo
  // tal cual en lugar de devolver "Cliente no encontrado" genérico —
  // antes nos comíamos esos errores y costaba diagnosticarlos.
  // meta_access_token (mig 073) lo leemos solo acá server-side — NUNCA
  // se devuelve al frontend.
  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("name, external_links, website_url, meta_access_token")
    .eq("id", body.client_id)
    .single();
  if (clientErr) {
    return Response.json(
      {
        error: "Error leyendo el cliente",
        detail: clientErr.message,
      },
      { status: 500 },
    );
  }
  if (!client) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // ====== BULLETPROOF SPEC ======
  // Normaliza objective/optimization_goal/billing_event/bid/targeting/CTA/
  // destination_url upfront para evitar la cadena de 5 errores que sufrimos
  // antes. Devuelve también warnings de lo que ajustó.
  const { spec: safeSpec, warnings } = bulletproofSpec(body.spec, {
    clientWebsite: (client as { website_url?: string | null }).website_url,
  });

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
  // Prioridad:
  //   1. clients.meta_access_token (per-cliente) — para clientes con
  //      su propio Business Manager / App de Meta Developers. Cada
  //      cliente carga su token desde /cliente/[id]/configuracion →
  //      panel Meta Business Suite.
  //   2. META_ACCESS_TOKEN env var (global, fallback) — para los setups
  //      donde todos los Ad Accounts viven en el mismo BM (típicamente
  //      el de la agencia).
  // Si no hay ni uno ni otro → 400 con hint para cargarlo.
  const clientToken = (
    client as { meta_access_token?: string | null }
  ).meta_access_token;
  const metaToken =
    (clientToken && clientToken.trim().length > 0
      ? clientToken
      : process.env.META_ACCESS_TOKEN) ?? "";
  const apiVersion = process.env.META_API_VERSION ?? "v21.0";

  if (!metaToken) {
    return Response.json(
      {
        error:
          "Falta el Meta Access Token para este cliente. No hay token cargado en el cliente ni env var de fallback.",
        hint: [
          "Tenés dos opciones para cargar el token:",
          "",
          "1) Per-cliente (recomendado si cada cliente tiene su propio BM):",
          "   Cliente → Configuración → Meta Business Suite → campo 'Meta Access Token'.",
          "   Pegá el token del System User del BM de este cliente.",
          "",
          "2) Global vía env var (si todos los clientes están en TU BM):",
          "   Vercel → Project Settings → Environment Variables → agregar",
          "   META_ACCESS_TOKEN con el token del System User de tu BM.",
          "",
          "Lo generás en business.facebook.com → Usuarios del sistema → tu System User → 'Generar nuevo token', con scope ads_management + business_management + pages_*.",
        ].join("\n"),
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
      warnings,
      preview: buildPayloads(safeSpec, adAccountId),
    });
  }

  // ====== PUSH REAL ======
  // Hacemos los 3 niveles en secuencia. Si falla un nivel intermedio,
  // dejamos lo creado en Meta (status=PAUSED) y devolvemos el error
  // — el director puede limpiarlo manualmente desde Ads Manager.
  const graphBase = `https://graph.facebook.com/${apiVersion}/act_${adAccountId}`;

  // 1) Crear Campaign.
  // bulletproofSpec() ya forzó objective válido (OUTCOME_*),
  // special_ad_categories array, status PAUSED, buying_type AUCTION
  // y is_adset_budget_sharing_enabled=false. Mandamos tal cual.
  const normalizedCampaign = safeSpec.campaign;

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
          hint: hintForMetaError(campaignData),
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

  // 2-3) Iterar sobre los AdSets bulletproofed.
  const adsetsList: AdSet[] = safeSpec.adsets ?? [];

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

  // El Facebook Page ID puede venir de dos lugares:
  //   1. Configuración del cliente (recomendado — cada cliente tiene su
  //      propia Page, lo guardamos en clients.external_links.meta_page_id).
  //   2. Env var META_PAGE_ID (fallback global — útil cuando todo se
  //      publica desde la misma Page de la agencia).
  // Si no hay ninguno, no podemos crear AdCreatives → 400 con un hint
  // claro que apunta a /cliente/<id>/configuracion.
  const clientPageId = (
    client.external_links as { meta_page_id?: string } | null
  )?.meta_page_id;
  const pageId = clientPageId || process.env.META_PAGE_ID;
  if (!pageId) {
    return Response.json(
      {
        error: "Falta Facebook Page ID — sin esto no se pueden crear los AdCreatives.",
        step: "config",
        campaign_id: campaignId,
        hint: "Cargá el Facebook Page ID del cliente en Cliente → Configuración → Meta Business Suite. Lo conseguís en business.facebook.com → Configuración del negocio → Páginas → seleccionar la Page → ID. Si querés un Page ID global para todos los clientes, también podés setear la env var META_PAGE_ID en Vercel.",
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
      /** Pista en español derivada de la respuesta de Meta — sale en
       *  la UI debajo del error técnico cuando podemos diagnosticarlo
       *  (ej. App en Dev mode, CTA inválido, token expirado, etc). */
      hint?: string;
    }>;
    error?: string;
    /** Idem `hint` pero a nivel AdSet. */
    hint?: string;
  }> = [];

  for (const adsetSpec of adsetsList) {
    // 2.x) Crear AdSet linkeado a la campaign. Ya pasó por
    // bulletproofSpec(): optimization_goal + billing_event
    // compatibles, bid_strategy LOWEST_COST_WITHOUT_CAP, targeting
    // limpio con advantage_audience explícito, ISO dates.
    let adSetId = "";
    try {
      const { ads: _ignoreAds, ...adsetClean } = adsetSpec as AdSet & {
        bid_strategy?: string;
      };
      console.log("[meta-push] creating adset", {
        adset: adsetSpec.name,
        payload: adsetClean,
      });
      const adsetRes = await fetch(`${graphBase}/adsets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...adsetClean,
          campaign_id: campaignId,
          access_token: metaToken,
        }),
      });
      const adsetData = await adsetRes.json();
      if (!adsetRes.ok || !adsetData.id) {
        console.error("[meta-push] adset create failed", {
          adset: adsetSpec.name,
          status: adsetRes.status,
          sent: adsetClean,
          meta_response: adsetData,
        });
        adsetResults.push({
          name: adsetSpec.name,
          ok: false,
          ads: [],
          error: `adset: ${JSON.stringify(adsetData)}`,
          hint: hintForMetaError(adsetData) ?? undefined,
        });
        continue;
      }
      adSetId = adsetData.id as string;
    } catch (e) {
      console.error("[meta-push] adset network error", {
        adset: adsetSpec.name,
        err: (e as Error).message,
      });
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
            hint: hintForMetaError(creativeData) ?? undefined,
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
            hint: hintForMetaError(adData) ?? undefined,
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
      warnings,
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
 * Limpia el objeto de targeting de placements que Meta v21 deprecó.
 * Los más comunes que Claude genera y rompen el create del AdSet:
 *
 *   facebook_positions:
 *     - "video_feeds" → eliminado en v18+ (sale como
 *       "ubicación de feeds de vídeo obsoleta")
 *
 *   instagram_positions:
 *     - "explore_home" → solo válido en algunos objectives
 *
 * Conservamos solo placements del allowlist por red. Si después un
 * valor concreto no aplica al objective, Meta lo va a rechazar y se
 * verá en el error de la siguiente capa, pero al menos eliminamos los
 * deprecados conocidos.
 */
const FB_POSITIONS_OK = new Set([
  "feed",
  "right_hand_column",
  "marketplace",
  "story",
  "search",
  "instream_video",
  "facebook_reels",
  "facebook_reels_overlay",
]);
const IG_POSITIONS_OK = new Set([
  "stream",
  "story",
  "reels",
  "explore",
  "ig_search",
  "shop",
  "profile_feed",
]);

function normalizeTargeting(t: unknown): Record<string, unknown> | undefined {
  if (!t || typeof t !== "object") return undefined;
  const out: Record<string, unknown> = { ...(t as Record<string, unknown>) };
  if (Array.isArray(out.facebook_positions)) {
    out.facebook_positions = (out.facebook_positions as string[]).filter((p) =>
      FB_POSITIONS_OK.has(p),
    );
    if ((out.facebook_positions as string[]).length === 0) {
      delete out.facebook_positions;
    }
  }
  if (Array.isArray(out.instagram_positions)) {
    out.instagram_positions = (out.instagram_positions as string[]).filter(
      (p) => IG_POSITIONS_OK.has(p),
    );
    if ((out.instagram_positions as string[]).length === 0) {
      delete out.instagram_positions;
    }
  }
  // Meta v21+ exige declarar Advantage Audience explícitamente.
  // Sin esto el create del AdSet falla con:
  //   "Se requiere la marca de audiencia de Advantage. Para crear
  //    tu conjunto de anuncios, debes activar o desactivar la
  //    función de audiencia de Advantage."
  // Default 0 = OFF — Meta respeta nuestra segmentación tal cual.
  // Si querés "ampliación inteligente", el director puede prenderlo
  // después desde Ads Manager. Si la spec ya lo trae seteado, no lo
  // pisamos.
  const ta = (out.targeting_automation ?? {}) as Record<string, unknown>;
  if (typeof ta.advantage_audience !== "number") {
    ta.advantage_audience = 0;
  }
  out.targeting_automation = ta;
  return out;
}

/**
 * Asegura que un valor de fecha (string | Date | nada) salga como ISO
 * 8601 con offset, que es lo que Meta acepta sin discutir. Si nos
 * llega "2026-06-20" plano (sin hora), lo convertimos a la medianoche
 * UTC de ese día — Claude a veces lo devuelve así desde el spec.
 */
function ensureIsoDate(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v.toISOString();
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s === "") return undefined;
  // Patrón YYYY-MM-DD (sin "T"). Ej: "2026-06-20".
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00Z`).toISOString();
  }
  // Si ya tiene "T" lo asumimos válido; si Meta lo rechaza, va a
  // surfacear el error.
  return s;
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
 * director. Antes era específica de campaign, pero los mismos códigos
 * de error aparecen en cualquier nivel (Campaign / AdSet / AdCreative
 * / Ad). Ahora es genérica.
 *
 * Cubre los errores típicos que vimos: objective inválido,
 * special_ad_categories, token sin permiso, ad account sin payment
 * method, App de Meta en modo Development, etc.
 */
function hintForMetaError(meta: unknown): string | null {
  const m = meta as { error?: { code?: number; message?: string; error_subcode?: number; error_user_msg?: string; error_user_title?: string } };
  const code = m?.error?.code;
  const subcode = m?.error?.error_subcode;
  const msg = (m?.error?.message ?? "").toLowerCase();
  const userMsg = m?.error?.error_user_msg;

  // App en modo Development — sale en AdCreative cuando la App de
  // developers.facebook.com no está en Live mode. Caso muy común en
  // setups nuevos. Lo chequeamos ANTES del userMsg porque queremos
  // mostrar la pista accionable, no solo el mensaje literal de Meta.
  if (
    subcode === 1885183 ||
    msg.includes("modo de desarrollo") ||
    msg.includes("development mode")
  ) {
    return [
      "Tu App de Meta Developers está en MODO DE DESARROLLO. Para crear anuncios en cuentas externas tiene que estar LIVE.",
      "",
      "Camino corto (testing, solo tu ad account):",
      "  1) developers.facebook.com → tu App → Roles → Roles → Add People",
      "  2) Agregá tu cuenta personal de Facebook como Administrator o Tester.",
      "  3) Pueden crear ads en modo Dev SIEMPRE QUE el ad account les pertenezca.",
      "",
      "Camino correcto (producción, cualquier cliente):",
      "  1) developers.facebook.com → tu App → Settings → Basic.",
      "     Completá: Privacy Policy URL, Category, Business Use.",
      "  2) Asociá la App a un Business Manager verificado.",
      "  3) App Review → solicitá los permisos: ads_management + business_management con Standard Access.",
      "  4) Una vez aprobada, el toggle 'App Mode' lo podés pasar a Live.",
    ].join("\n");
  }

  if (userMsg) return userMsg;

  if (code === 100 && msg.includes("objective")) {
    return "Meta rechazó el objective. Asegurate de usar OUTCOME_TRAFFIC / OUTCOME_AWARENESS / OUTCOME_ENGAGEMENT / OUTCOME_LEADS / OUTCOME_SALES — los viejos (CONVERSIONS, LINK_CLICKS, REACH…) ya no se aceptan en v21.";
  }
  if (code === 100 && (msg.includes("bid") || subcode === 2490487)) {
    return "Meta exige bid_strategy explícito. Ya seteamos LOWEST_COST_WITHOUT_CAP por default — si querés capar el bid o usar COST_CAP/TARGET_ROAS, editá el AdSet desde Ads Manager después.";
  }
  if (code === 100 && msg.includes("special_ad_categor")) {
    return "Meta rechazó special_ad_categories. Tiene que ser un array — vacío [] si no aplica, o ['HOUSING'|'EMPLOYMENT'|'CREDIT'] cuando corresponde por regulación.";
  }
  if (code === 190 || code === 102 || msg.includes("access token")) {
    return "META_ACCESS_TOKEN inválido o expiró. Re-generá el System User Token con scope ads_management + business_management y actualizalo en Vercel.";
  }
  if (code === 200 || msg.includes("permission")) {
    return [
      "Meta dice que el token no tiene permisos sobre este Ad Account. Esto puede pasar por VARIAS razones — chequealas en orden:",
      "",
      "1) ¿Es el MISMO Business Manager? El Ad Account del cliente tiene que estar dentro del MISMO Business Manager donde generaste el System User Token. Si el cliente lo tiene en su propio BM, primero hay que claim/share el Ad Account hacia tu BM:",
      "   business.facebook.com → Configuración → Cuentas publicitarias → 'Solicitar acceso a una cuenta publicitaria' o pedirle al cliente que te la comparta.",
      "",
      "2) ¿El System User está asignado al Ad Account? business.facebook.com → Configuración → Usuarios del sistema → tu System User → 'Activos asignados' → agregá la Ad Account con rol 'Administrador' o 'Anunciante'.",
      "",
      "3) ¿La APP está asignada al Ad Account? Además del System User, la App misma debe figurar. En la pantalla del System User → 'Activos asignados' → revisá que tu App esté listada. Si no, agregala con permission 'Administrar campañas'.",
      "",
      "4) ¿El token actual es del MISMO System User? Si generaste un token, después eliminaste el System User y creaste otro, el token viejo deja de funcionar. Re-generá el token (System User → Generar token → con scope ads_management + business_management) y actualizalo en Vercel.",
      "",
      "5) ¿El meta_ad_account_id del cliente está bien? En Cliente → Configuración → Meta Business Suite, verificá que el número del Ad Account ID coincide con el que ves en business.facebook.com (sin el prefijo 'act_').",
      "",
      "Si tras revisar todo lo anterior sigue fallando, abrí 'Ver JSON crudo' abajo y mandanos el error_message + error_subcode — es el dato que diferencia los casos.",
    ].join("\n");
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
