// Public capability copy. Demo data is explicitly fictional, never customer data.
// Media supports 'demo' (with demo: 'mundipack' | 'brainbill'), 'upcoming', 'placeholder', 'image' and 'video'.
// A video can also supply poster and captions: { src, language, label }.
export const solutions = [
  {
    id: 'mundipack', name: 'Mundipack', category: 'Desarrollo / operación comercial',
    status: 'Proyecto en implementación', title: 'Un negocio. Dos formas de verlo.',
    description: 'Dirección ve el negocio completo. El vendedor tiene su cartera, su ruta y el contexto para actuar. Explorá las dos experiencias.',
    audience: 'Dirección y equipo comercial.',
    challenge: 'Reunir la información que necesitan para consultar y dar seguimiento a la operación.',
    work: 'Dashboards de seguimiento y un agente de consulta, integrados con el sistema interno.',
    outcome: 'Objetivo: facilitar el acceso a la información y el seguimiento por vendedor. El proyecto está en implementación.',
    media: { type: 'demo', demo: 'mundipack', caption: 'Recreación interactiva basada en los dashboards de Mundipack. Nombres, cifras, productos y recorridos ficticios; los cambios se mantienen únicamente durante esta visita.' },
  },
  // Tilde (ex BrainBill) vive en su propia sección #productos.
  // Se mantiene el demo brainbill-demo.js por si se quiere reincorporar acá.
  {
    id: 'growth', name: 'Growth & Marketing', category: 'Crecimiento / estrategia digital',
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
