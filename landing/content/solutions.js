// Public capability copy. Demo data is explicitly fictional, never customer data.
// Media supports 'demo', 'upcoming', 'placeholder', 'image' and 'video'.
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
    media: { type: 'demo', caption: 'Recreación interactiva basada en los dashboards de Mundipack. Nombres, cifras, productos y recorridos ficticios; los cambios se mantienen únicamente durante esta visita.' },
  },
  {
    id: 'brainbill', name: 'BrainBill', category: 'Desarrollo / producto propio',
    status: 'En desarrollo', title: 'Gestión de facturas con IA.',
    description: 'Estamos desarrollando BrainBill: una nueva aplicación de gestión de facturas con inteligencia artificial.',
    audience: 'Empresas que buscan organizar la gestión de sus facturas.',
    challenge: 'Simplificar el trabajo con la información de facturación.',
    work: 'Producto propio en desarrollo. El alcance y la interfaz se presentarán en una próxima etapa.',
    outcome: 'Una nueva línea de desarrollo de la firma. La demostración todavía no está disponible.',
    media: { type: 'upcoming', caption: 'BrainBill · producto en desarrollo. Próximamente compartiremos su interfaz y recorrido.' },
  },
  {
    id: 'growth', name: 'Growth & Marketing', category: 'Crecimiento / estrategia digital',
    status: 'Capacidad de la firma', title: 'Conectar marca, canales y conversión.',
    description: 'Estrategia y ejecución digital orientadas a las necesidades de cada negocio.',
    audience: 'Empresas que buscan desarrollar su crecimiento digital.',
    challenge: 'Alinear adquisición, contenido y conversión con objetivos comerciales.',
    work: 'Estrategia, performance, contenido y análisis de canales según el alcance del proyecto.',
    outcome: 'Medir el trabajo y ajustar las decisiones. Este espacio describe una capacidad, no un resultado de un cliente específico.',
    media: { type: 'placeholder', src: null, alt: '', caption: 'La selección de material de Growth & Marketing se incorporará en una próxima etapa.', width: 1600, height: 1000 },
  },
];
