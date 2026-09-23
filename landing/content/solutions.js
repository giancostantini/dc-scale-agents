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
  {
    id: 'brainbill', name: 'BrainBill', category: 'Desarrollo / producto propio',
    status: 'Producto propio', title: 'Las facturas de compra se cargan solas.',
    description: 'Sacás una foto de la factura del proveedor, o subís el PDF o el XML del CFE. BrainBill la lee, valida los totales, reconoce cada producto de tu catálogo y sugiere el precio de venta. Una persona confirma y la compra llega a tu sistema. Probalo de punta a punta.',
    audience: 'Empresas que cargan a mano las facturas de sus proveedores.',
    challenge: 'Tipear renglón por renglón cada compra, con errores de IVA, productos mal asociados y precios desactualizados.',
    work: 'Lectura con IA (o exacta desde el XML del CFE), validaciones de DGI, asociación al catálogo que aprende de cada proveedor y entrega a tu ERP, base de datos, planilla o API.',
    outcome: 'Minutos de carga convertidos en segundos, sin perder control: nada se carga en tu sistema sin revisión humana.',
    media: { type: 'demo', demo: 'brainbill', caption: 'Recreación interactiva del flujo de BrainBill. Proveedores, RUTs, productos y precios ficticios; nada se sube ni se guarda fuera de esta visita.' },
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
