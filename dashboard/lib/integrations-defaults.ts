/**
 * Lista canónica de integraciones soportadas por D&C.
 *
 * Usada como seed cuando un cliente recién creado todavía no tiene
 * filas en la tabla `integrations`. Se consume desde:
 *   - dashboard/app/cliente/[id]/integraciones/page.tsx  (vista director)
 *   - dashboard/app/portal/conexiones/page.tsx           (vista cliente)
 *
 * Si agregás un connector nuevo acá, considerá agregar también su
 * tutorial en lib/integration-tutorials.ts.
 */

import type { Integration } from "@/lib/types";

export const DEFAULT_INTEGRATIONS: Omit<Integration, "clientId">[] = [
  // Meta
  { id: "meta_bs", key: "meta_bs", name: "Meta Business Suite", group: "Meta", status: "disconnected", account: "" },
  { id: "meta_ads", key: "meta_ads", name: "Meta Ads Manager", group: "Meta", status: "disconnected", account: "" },
  { id: "meta_pixel", key: "meta_pixel", name: "Meta Pixel", group: "Meta", status: "disconnected", account: "" },
  { id: "wa_business", key: "wa_business", name: "WhatsApp Business API", group: "Meta", status: "disconnected", account: "" },

  // Google
  { id: "google_ads", key: "google_ads", name: "Google Ads", group: "Google", status: "disconnected", account: "" },
  { id: "ga4", key: "ga4", name: "Google Analytics 4", group: "Google", status: "disconnected", account: "" },
  { id: "gtm", key: "gtm", name: "Google Tag Manager", group: "Google", status: "disconnected", account: "" },
  { id: "gsc", key: "gsc", name: "Google Search Console", group: "Google", status: "disconnected", account: "" },
  { id: "youtube", key: "youtube", name: "YouTube", group: "Google", status: "disconnected", account: "" },

  // Social
  { id: "tiktok_ads", key: "tiktok_ads", name: "TikTok Ads Manager", group: "Social", status: "disconnected", account: "" },
  { id: "tiktok_biz", key: "tiktok_biz", name: "TikTok Business", group: "Social", status: "disconnected", account: "" },
  { id: "linkedin_ads", key: "linkedin_ads", name: "LinkedIn Ads", group: "Social", status: "disconnected", account: "" },
  { id: "linkedin_company", key: "linkedin_company", name: "LinkedIn Company", group: "Social", status: "disconnected", account: "" },

  // Email & CRM
  { id: "mailchimp", key: "mailchimp", name: "Mailchimp", group: "Email & CRM", status: "disconnected", account: "" },
  { id: "hubspot", key: "hubspot", name: "HubSpot CRM", group: "Email & CRM", status: "disconnected", account: "" },
  { id: "klaviyo", key: "klaviyo", name: "Klaviyo", group: "Email & CRM", status: "disconnected", account: "" },
  { id: "calendly", key: "calendly", name: "Calendly", group: "Email & CRM", status: "disconnected", account: "" },

  // Analytics & BI
  { id: "hotjar", key: "hotjar", name: "Hotjar", group: "Analytics & BI", status: "disconnected", account: "" },
  { id: "mixpanel", key: "mixpanel", name: "Mixpanel", group: "Analytics & BI", status: "disconnected", account: "" },
  { id: "looker", key: "looker", name: "Looker Studio", group: "Analytics & BI", status: "disconnected", account: "" },

  // Automatización
  { id: "n8n", key: "n8n", name: "n8n", group: "Automatización", status: "disconnected", account: "" },
  { id: "claude", key: "claude", name: "Claude API", group: "Automatización", status: "disconnected", account: "" },
  { id: "zapier", key: "zapier", name: "Zapier", group: "Automatización", status: "disconnected", account: "" },

  // Producción
  { id: "pooshlo", key: "pooshlo", name: "Pooshlo", group: "Producción", status: "disconnected", account: "" },
  { id: "canva", key: "canva", name: "Canva for Teams", group: "Producción", status: "disconnected", account: "" },
  { id: "figma", key: "figma", name: "Figma", group: "Producción", status: "disconnected", account: "" },
];

/** Orden canónico de los grupos para mostrar en UI. */
export const INTEGRATION_GROUPS = [
  "Meta",
  "Google",
  "Social",
  "Email & CRM",
  "Analytics & BI",
  "Automatización",
  "Producción",
] as const;

export type IntegrationGroup = (typeof INTEGRATION_GROUPS)[number];
