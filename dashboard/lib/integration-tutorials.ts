/**
 * Tutoriales por integración para que el cliente pueda conectar sus
 * herramientas desde /portal/conexiones. Cada entry define:
 *
 *  - description:  qué es la herramienta (1 oración).
 *  - whyWeNeedIt:  por qué el equipo D&C la necesita (qué van a hacer
 *                  los agentes / el equipo con esta data).
 *  - steps:        guía paso a paso para que el cliente sepa qué hacer
 *                  en su cuenta de la plataforma.
 *  - fields:       qué IDs/credenciales tiene que pegar en el modal.
 *                  Estos valores quedan en `integrations.credentials`
 *                  (jsonb). El agente reporting-performance los lee
 *                  para llamar a las APIs.
 *  - docsUrl:      link externo opcional a docs oficiales.
 *
 * Nota: NO pedimos passwords ni access tokens reales acá. Para Meta,
 * Google, etc. el flujo es: cliente nos pasa el ID + acepta una
 * invitación de acceso (email/share link). Tokens OAuth quedan para
 * una fase posterior con encryption-at-rest.
 */

export type IntegrationFieldType = "text" | "email" | "url";

export interface IntegrationField {
  key: string;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  type?: IntegrationFieldType;
}

export interface IntegrationStep {
  title: string;
  body: string;
}

export interface IntegrationTutorial {
  description: string;
  whyWeNeedIt: string;
  steps: IntegrationStep[];
  fields: IntegrationField[];
  docsUrl?: string;
}

const SHARE_EMAIL_FIELD: IntegrationField = {
  key: "share_email",
  label: "Email al que ya nos diste acceso",
  placeholder: "tunombre@empresa.com",
  helpText: "El email de tu cuenta desde el que enviaste la invitación. Lo usamos para confirmar el access del lado del equipo.",
  required: false,
  type: "email",
};

export const INTEGRATION_TUTORIALS: Record<string, IntegrationTutorial> = {
  // ============== META ==============

  meta_bs: {
    description: "Centro de control de Meta para gestionar páginas, cuentas publicitarias, Pixel y catálogos.",
    whyWeNeedIt: "Necesitamos acceso al Business Manager para crear y manejar campañas, leer métricas y conectar el Pixel.",
    steps: [
      {
        title: "1. Entrá a Meta Business Settings",
        body: "Andá a business.facebook.com → Configuración del negocio (ícono de engranaje arriba a la derecha).",
      },
      {
        title: "2. Agregá a nuestro equipo como Partner",
        body: "Configuración → Usuarios → Socios → Agregar. Pegá el ID que te damos abajo y dale acceso a tu cuenta publicitaria + página + Pixel.",
      },
      {
        title: "3. Confirmá el ID de tu Business Manager",
        body: "En Configuración del negocio → Información del negocio, copiá el 'ID del negocio' (es un número de 15-16 dígitos) y pegalo abajo.",
      },
    ],
    fields: [
      {
        key: "business_id",
        label: "Business Manager ID",
        placeholder: "1234567890123456",
        helpText: "Lo encontrás en business.facebook.com → Configuración → Información del negocio.",
        required: true,
      },
      SHARE_EMAIL_FIELD,
    ],
    docsUrl: "https://www.facebook.com/business/help/1710077379203657",
  },

  meta_ads: {
    description: "Cuenta publicitaria de Meta (Facebook + Instagram) — donde corren las campañas pagas.",
    whyWeNeedIt: "Necesitamos el ID de la cuenta para leer métricas (gasto, CPC, ROAS, conversiones) y crear campañas si te las gestionamos.",
    steps: [
      {
        title: "1. Encontrá tu Ad Account ID",
        body: "Entrá a Ads Manager (adsmanager.facebook.com). Arriba a la izquierda vas a ver el nombre y abajo el ID con formato 'act_1234567890'. Copiá solo los números (sin 'act_').",
      },
      {
        title: "2. Compartí acceso desde Business Settings",
        body: "Business Settings → Cuentas → Cuentas publicitarias → seleccionar la tuya → Asignar socios → pegar nuestro ID y elegir 'Administrar campañas'.",
      },
    ],
    fields: [
      {
        key: "ad_account_id",
        label: "Ad Account ID",
        placeholder: "1234567890",
        helpText: "Solo los números, sin el prefijo 'act_'. Lo ves arriba a la izquierda en Ads Manager.",
        required: true,
      },
      {
        key: "page_id",
        label: "Facebook Page ID (opcional)",
        placeholder: "9876543210",
        helpText: "Si querés que también analicemos performance orgánico de tu página. Lo encontrás en Configuración de la página → Información de la página.",
        required: false,
      },
    ],
    docsUrl: "https://www.facebook.com/business/help/1492627900875762",
  },

  meta_pixel: {
    description: "Píxel de Meta — el código que trackea conversiones en tu sitio para optimizar campañas.",
    whyWeNeedIt: "Sin el Pixel ID no podemos verificar que las conversiones se estén disparando, ni configurar audiencias de remarketing.",
    steps: [
      {
        title: "1. Entrá a Events Manager",
        body: "Andá a business.facebook.com/events_manager. Vas a ver la lista de Pixels conectados a tu cuenta.",
      },
      {
        title: "2. Copiá el ID del Pixel",
        body: "Click en el Pixel que usa tu sitio. Arriba debajo del nombre vas a ver el ID (15-16 dígitos). Copialo.",
      },
      {
        title: "3. Verificá que esté instalado",
        body: "En Events Manager → Test Events ingresá la URL de tu sitio. Si ves eventos en tiempo real, está OK. Si no, avisanos para ayudarte a instalarlo.",
      },
    ],
    fields: [
      {
        key: "pixel_id",
        label: "Meta Pixel ID",
        placeholder: "1234567890123456",
        helpText: "Lo encontrás en Events Manager → tu Pixel → debajo del nombre.",
        required: true,
      },
      {
        key: "site_url",
        label: "URL del sitio donde está instalado (opcional)",
        placeholder: "https://tu-sitio.com",
        helpText: "Útil para que verifiquemos que el Pixel está disparando eventos correctamente.",
        required: false,
        type: "url",
      },
    ],
    docsUrl: "https://www.facebook.com/business/help/952192354843755",
  },

  wa_business: {
    description: "WhatsApp Business API — para enviar y recibir mensajes desde campañas o flows automatizados.",
    whyWeNeedIt: "Si vas a hacer campañas de mensajería, lead nurturing o atención automatizada, necesitamos el número y acceso al business account.",
    steps: [
      {
        title: "1. Tené tu cuenta de WhatsApp Business API",
        body: "Necesitás haber dado de alta tu número en WhatsApp Business API (no es la app normal de WhatsApp Business — es la API). Si no la tenés, avisanos para coordinar el alta con un BSP (Business Solution Provider).",
      },
      {
        title: "2. Asociá tu WABA al Business Manager",
        body: "Desde business.facebook.com → Cuentas → Cuentas de WhatsApp → asignar a nuestro partner ID.",
      },
    ],
    fields: [
      {
        key: "phone_number",
        label: "Número de WhatsApp Business",
        placeholder: "+59891234567",
        helpText: "Con código de país, sin espacios.",
        required: true,
      },
      {
        key: "waba_id",
        label: "WhatsApp Business Account ID",
        placeholder: "123456789012345",
        helpText: "Lo encontrás en Business Manager → Configuración → Cuentas de WhatsApp.",
        required: false,
      },
    ],
  },

  // ============== GOOGLE ==============

  google_ads: {
    description: "Plataforma de Google para campañas de Search, Display, YouTube y Shopping.",
    whyWeNeedIt: "Para leer performance de campañas, optimizar pujas y crear campañas nuevas si te las gestionamos.",
    steps: [
      {
        title: "1. Encontrá tu Customer ID",
        body: "Entrá a ads.google.com. En la esquina superior derecha vas a ver un número con formato '123-456-7890'. Ese es tu Customer ID.",
      },
      {
        title: "2. Aceptá nuestra invitación de acceso",
        body: "Te vamos a mandar un email con una invitación de acceso administrativo. Solo aceptala desde el email del owner de la cuenta. Después, en Tools → Setup → Account access vas a ver nuestro acceso confirmado.",
      },
    ],
    fields: [
      {
        key: "customer_id",
        label: "Google Ads Customer ID",
        placeholder: "123-456-7890",
        helpText: "Esquina superior derecha en ads.google.com. Pegalo con o sin guiones — los acomodamos.",
        required: true,
      },
      SHARE_EMAIL_FIELD,
    ],
    docsUrl: "https://support.google.com/google-ads/answer/29198",
  },

  ga4: {
    description: "Google Analytics 4 — la fuente de verdad de tráfico, conversiones y comportamiento del sitio.",
    whyWeNeedIt: "Es nuestro source de verdad para conversiones y embudos. Sin acceso no podemos atribuir leads ni calcular CAC real.",
    steps: [
      {
        title: "1. Entrá a Google Analytics",
        body: "Andá a analytics.google.com con la cuenta de email owner del proyecto. Si tenés varias propiedades, elegí la del sitio que vamos a trabajar.",
      },
      {
        title: "2. Copiá el Measurement ID",
        body: "Admin (engranaje abajo a la izquierda) → Data Streams → tu stream web → arriba a la derecha vas a ver 'Measurement ID' con formato 'G-XXXXXXXXXX'. Copialo.",
      },
      {
        title: "3. Dale acceso a nuestro email",
        body: "Admin → Account access management (o Property access management) → '+' arriba → Add users → pegá el email que te dimos → asignar rol 'Viewer' o 'Marketer'.",
      },
    ],
    fields: [
      {
        key: "measurement_id",
        label: "GA4 Measurement ID",
        placeholder: "G-XXXXXXXXXX",
        helpText: "Lo encontrás en Admin → Data Streams → tu stream web.",
        required: true,
      },
      {
        key: "property_id",
        label: "Property ID (opcional)",
        placeholder: "123456789",
        helpText: "Para usar la API de GA4 directamente. Está al lado del nombre de la propiedad en Admin.",
        required: false,
      },
    ],
    docsUrl: "https://support.google.com/analytics/answer/9304153",
  },

  gsc: {
    description: "Google Search Console — para entender qué keywords te traen tráfico orgánico desde Google.",
    whyWeNeedIt: "Lo usa el agente SEO para identificar oportunidades de contenido, posiciones y CTR de búsqueda orgánica.",
    steps: [
      {
        title: "1. Tené tu sitio verificado en Search Console",
        body: "Entrá a search.google.com/search-console. Si no tenés agregada tu propiedad, tenés que verificarla primero (vía DNS, archivo HTML o Google Analytics).",
      },
      {
        title: "2. Compartí acceso con nosotros",
        body: "Configuración (engranaje abajo a la izquierda) → Usuarios y permisos → '+ Agregar usuario' → pegar nuestro email → permiso 'Total' o 'Restringido'.",
      },
    ],
    fields: [
      {
        key: "site_url",
        label: "URL exacta del sitio en Search Console",
        placeholder: "https://tu-sitio.com",
        helpText: "Tal como aparece como propiedad en Search Console (con o sin www, http o https — exactamente como está).",
        required: true,
        type: "url",
      },
      SHARE_EMAIL_FIELD,
    ],
    docsUrl: "https://support.google.com/webmasters/answer/7687615",
  },

  gtm: {
    description: "Google Tag Manager — administra todos los tags (Pixel, GA4, conversiones) sin tocar código.",
    whyWeNeedIt: "Si tenés GTM instalado, lo usamos para agregar/editar tags sin pedirle cada cambio a tu equipo de desarrollo.",
    steps: [
      {
        title: "1. Encontrá tu Container ID",
        body: "Entrá a tagmanager.google.com. Arriba a la derecha de cada workspace vas a ver el ID con formato 'GTM-XXXXXXX'.",
      },
      {
        title: "2. Compartí acceso",
        body: "Click en tu container → Admin (arriba) → User Management → '+' → invitar nuestro email con permiso 'Edit' o 'Approve' (no necesitamos Publish).",
      },
    ],
    fields: [
      {
        key: "container_id",
        label: "GTM Container ID",
        placeholder: "GTM-XXXXXXX",
        helpText: "Arriba a la derecha en tagmanager.google.com.",
        required: true,
      },
      SHARE_EMAIL_FIELD,
    ],
    docsUrl: "https://support.google.com/tagmanager/answer/6107011",
  },
};

/**
 * Fallback para integraciones que aún no tienen tutorial completo.
 * Avisa al cliente que el account lead lo va a contactar.
 */
export const FALLBACK_TUTORIAL: IntegrationTutorial = {
  description: "Esta integración todavía no tiene una guía paso a paso publicada.",
  whyWeNeedIt: "Tu account lead te va a contactar para coordinar el acceso correcto.",
  steps: [
    {
      title: "1. Avisanos que querés conectarla",
      body: "Apretá 'Avisar al equipo' abajo. Le va a llegar una notificación a tu account lead con el detalle de la herramienta y te va a contactar en menos de 24 hs hábiles para coordinar.",
    },
  ],
  fields: [
    {
      key: "notes",
      label: "Notas (opcional)",
      placeholder: "Ej: tengo cuenta admin, accedo desde tunombre@empresa.com",
      helpText: "Cualquier cosa que nos quieras adelantar para acelerar la conexión.",
      required: false,
    },
  ],
};

export function getTutorial(key: string): IntegrationTutorial {
  return INTEGRATION_TUTORIALS[key] ?? FALLBACK_TUTORIAL;
}

export function isFullyDocumented(key: string): boolean {
  return key in INTEGRATION_TUTORIALS;
}
