// Entirely fictional demo fixtures. Never import customer records or video captures here.
export const representatives = [
  { id: 'valentina', name: 'Valentina', initials: 'VA', target: 80000 },
  { id: 'nicolas', name: 'Nicolás', initials: 'NI', target: 65000 },
  { id: 'sofia', name: 'Sofía', initials: 'SO', target: 55000 },
];

// pos: posición del pin en el mapa ilustrativo (% x, % y). last: producto de la última compra.
export const clients = [
  { id: 'azahar', name: 'Café Azahar', zone: 'Centro', rep: 'valentina', segment: 'En riesgo', days: 42, current: 8200, previous: 14600, debt: 2400, orders: 2, initials: 'CA', last: 'vasos', pos: [14, 62] },
  { id: 'trigal', name: 'Panadería El Trigal', zone: 'Cordón', rep: 'valentina', segment: 'Leales', days: 5, current: 18400, previous: 15800, debt: 0, orders: 8, initials: 'ET', last: 'bolsas', pos: [36, 44] },
  { id: 'oliva', name: 'Mercado Oliva', zone: 'Parque Rodó', rep: 'valentina', segment: 'Nuevos', days: 12, current: 9600, previous: 0, debt: 1800, orders: 3, initials: 'MO', last: 'bandejas', pos: [58, 58] },
  { id: 'faro', name: 'Rotisería El Faro', zone: 'Palermo', rep: 'valentina', segment: 'Leales', days: 9, current: 15200, previous: 13900, debt: 0, orders: 6, initials: 'EF', last: 'potes', pos: [80, 30] },
  { id: 'bruma', name: 'Bistró Bruma', zone: 'Centro', rep: 'nicolas', segment: 'Leales', days: 3, current: 24600, previous: 19200, debt: 0, orders: 9, initials: 'BB', last: 'servilletas', pos: [20, 30] },
  { id: 'sur', name: 'Almacén del Sur', zone: 'Cordón', rep: 'nicolas', segment: 'En riesgo', days: 65, current: 0, previous: 12800, debt: 3600, orders: 0, initials: 'AS', last: 'bolsas', pos: [45, 70] },
  { id: 'nube', name: 'Pastelería Nube', zone: 'Tres Cruces', rep: 'nicolas', segment: 'Nuevos', days: 15, current: 11400, previous: 0, debt: 900, orders: 3, initials: 'PN', last: 'bandejas', pos: [72, 50] },
  { id: 'luna', name: 'Heladería Luna', zone: 'Pocitos', rep: 'sofia', segment: 'Leales', days: 7, current: 21800, previous: 17300, debt: 1200, orders: 6, initials: 'HL', last: 'potes', pos: [30, 36] },
  { id: 'rambla', name: 'Parador La Rambla', zone: 'Buceo', rep: 'sofia', segment: 'En riesgo', days: 38, current: 6100, previous: 13400, debt: 2100, orders: 2, initials: 'PR', last: 'vasos', pos: [62, 66] },
  { id: 'hoja', name: 'Verdulería La Hoja', zone: 'Pocitos', rep: 'sofia', segment: 'Leales', days: 4, current: 12900, previous: 11800, debt: 0, orders: 7, initials: 'LH', last: 'bolsas', pos: [84, 40] },
];

export const products = [
  { id: 'vasos', name: 'Vasos de cartón · pack 50', code: 'DEMO-101', family: 'Vasos', price: 240, stock: 180 },
  { id: 'bolsas', name: 'Bolsas kraft · pack 100', code: 'DEMO-102', family: 'Bolsas', price: 380, stock: 92 },
  { id: 'servilletas', name: 'Servilletas · pack 200', code: 'DEMO-103', family: 'Papel', price: 160, stock: 240 },
  { id: 'bandejas', name: 'Bandejas compostables · pack 25', code: 'DEMO-104', family: 'Envases', price: 320, stock: 18 },
  { id: 'potes', name: 'Potes con tapa · pack 50', code: 'DEMO-105', family: 'Envases', price: 290, stock: 120 },
];

export const months = ['Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep'];
// Curva de estacionalidad de los meses anteriores a "mes anterior" (índice 4)
// y "mes actual" (índice 5), que salen de previous / current de cada cliente.
export const seasonality = [0.74, 0.86, 0.79, 0.93];
