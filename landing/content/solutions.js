// Public capability copy. Demo data is explicitly fictional, never customer data.
// Media supports 'demo' (with demo: 'mundipack' | 'brainbill'), 'upcoming', 'placeholder', 'image' and 'video'.
// A video can also supply poster and captions: { src, language, label }.
export const solutions = [
  {
    id: 'mundipack', name: 'Tecnología e IA Aplicada', category: 'Desarrollo a medida',
    status: 'Servicio de la firma', title: 'Sistemas hechos a la medida de tu operación.',
    description: 'Diseñamos software, dashboards, agentes de IA y automatizaciones para cada empresa. Cada proyecto arranca desde tu operación, no desde una plantilla. Explorá abajo un ejemplo real que construimos.',
    audience: 'Empresas que necesitan software propio para su operación.',
    challenge: 'Reunir la información y automatizar los procesos que hoy dependen de personas o de planillas.',
    work: 'Dashboards, agentes de consulta y automatizaciones integrados a los sistemas internos del cliente.',
    outcome: 'Cada desarrollo se diseña de cero. El ejemplo interactivo de abajo es Mundipack, uno de los proyectos que tenemos en implementación.',
    media: { type: 'demo', demo: 'mundipack', caption: 'Ejemplo · Mundipack. Recreación interactiva de los dashboards que construimos. Nombres, cifras y recorridos ficticios; los cambios se mantienen solo durante esta visita.' },
  },
  // Nota: Tildalo (ex Tilde / BrainBill), Rondín, Encargue y Libreta viven en #productos.
  // Growth & Marketing bajó de categoría: dejó de ser tab en el showcase principal
  // y pasa a vivir como "práctica complementaria" en la sección #crecimiento,
  // más abajo en la landing. Las cuentas que mostraba se renderizan desde
  // growthAccounts (exportado abajo) con el mismo mecanismo del growth-deck.
];

export const growthAccounts = [
  { id: 'wiztrip', name: 'WizTrip', kind: 'Instagram', image: 'assets/growth/wiztrip.webp', alt: 'Perfil de Instagram de WizTrip', note: 'Agencia de viajes digital. Identidad, contenido y crecimiento en Instagram, conectado con la web y con Wizzo, su asistente de viajes.' },
  { id: 'glassy', name: 'Glassy Waves', kind: 'Tienda online', image: 'assets/growth/glassy.webp', alt: 'Tienda online de Glassy Waves', note: 'Marca de surf y lifestyle. Tienda online, lanzamientos de colección, promociones con bancos y campañas de performance.' },
  { id: 'propios', name: 'Pinturería Propios', kind: 'Instagram', image: 'assets/growth/propios.webp', alt: 'Perfil de Instagram de Pinturería Propios', note: 'Marca lanzada desde cero. Hoy recibe más de 50 conversaciones diarias por WhatsApp.' },
];
