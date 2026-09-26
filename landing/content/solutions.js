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
  // Tilde (ex BrainBill) vive en su propia sección #productos.
  // Se mantiene el demo brainbill-demo.js por si se quiere reincorporar acá.
  {
    id: 'growth', name: 'Crecimiento y marketing digital', category: 'Crecimiento / estrategia digital',
    status: 'Capacidad de la firma', title: 'Conectar marca, canales y conversión.',
    description: 'Estrategia y ejecución digital orientadas a las necesidades de cada negocio.',
    audience: 'Empresas que buscan desarrollar su crecimiento digital.',
    challenge: 'Alinear adquisición, contenido y conversión con objetivos comerciales.',
    work: 'Estrategia, performance, contenido y análisis de canales según el alcance del proyecto.',
    outcome: 'Medir el trabajo y ajustar las decisiones. Elegí una cuenta para verla.',
    media: {
      type: 'accounts',
      caption: 'Algunas de las cuentas que manejamos hoy. Tocá una card o elegila en la lista para traerla al frente.',
      accounts: [
        { id: 'wiztrip', name: 'WizTrip', kind: 'Instagram', image: 'assets/growth/wiztrip.webp', alt: 'Perfil de Instagram de WizTrip: publicaciones de viajes con su identidad violeta y celeste', note: 'Agencia de viajes digital. Identidad, contenido y crecimiento en Instagram, conectado con la web y con Wizzo, su asistente de viajes.' },
        { id: 'glassy', name: 'Glassy Waves', kind: 'Tienda online', image: 'assets/growth/glassy.webp', alt: 'Tienda online de Glassy Waves en el celular: banner New Arrivals y productos destacados', note: 'Marca de surf y lifestyle. Tienda online, lanzamientos de colección, promociones con bancos y campañas de performance.' },
        { id: 'propios', name: 'Pinturería Propios', kind: 'Instagram', image: 'assets/growth/propios.webp', alt: 'Perfil de Instagram de Pinturería Propios: videos en el local y piezas de producto', note: 'Marca lanzada desde cero. Hoy recibe más de 50 conversaciones diarias por WhatsApp.' },
      ],
    },
  },
];
