// Entirely fictional demo fixtures. Never import customer records or video captures here.
export const representatives = [
  { id: 'valentina', name: 'Valentina', target: 80000 },
  { id: 'nicolas', name: 'Nicolás', target: 65000 },
  { id: 'sofia', name: 'Sofía', target: 55000 },
];

export const clients = [
  { id: 'azahar', name: 'Café Azahar', zone: 'Centro', rep: 'valentina', segment: 'En riesgo', days: 42, current: 8200, previous: 14600, debt: 2400, orders: 4, initials: 'CA' },
  { id: 'trigal', name: 'Panadería El Trigal', zone: 'Cordón', rep: 'valentina', segment: 'Leales', days: 5, current: 18400, previous: 15800, debt: 0, orders: 8, initials: 'ET' },
  { id: 'oliva', name: 'Mercado Oliva', zone: 'Parque Rodó', rep: 'valentina', segment: 'Nuevos', days: 12, current: 9600, previous: 0, debt: 1800, orders: 3, initials: 'MO' },
  { id: 'bruma', name: 'Bistró Bruma', zone: 'Centro', rep: 'nicolas', segment: 'Leales', days: 3, current: 24600, previous: 19200, debt: 0, orders: 9, initials: 'BB' },
  { id: 'sur', name: 'Almacén del Sur', zone: 'Cordón', rep: 'nicolas', segment: 'En riesgo', days: 65, current: 0, previous: 12800, debt: 3600, orders: 0, initials: 'AS' },
  { id: 'luna', name: 'Heladería Luna', zone: 'Pocitos', rep: 'sofia', segment: 'Leales', days: 7, current: 21800, previous: 17300, debt: 1200, orders: 6, initials: 'HL' },
];

export const products = [
  { id: 'vasos', name: 'Vasos de cartón · pack 50', code: 'DEMO-101', family: 'Vasos', price: 240, stock: 180 },
  { id: 'bolsas', name: 'Bolsas kraft · pack 100', code: 'DEMO-102', family: 'Bolsas', price: 380, stock: 92 },
  { id: 'servilletas', name: 'Servilletas · pack 200', code: 'DEMO-103', family: 'Papel', price: 160, stock: 240 },
  { id: 'bandejas', name: 'Bandejas compostables · pack 25', code: 'DEMO-104', family: 'Envases', price: 320, stock: 64 },
  { id: 'potes', name: 'Potes con tapa · pack 50', code: 'DEMO-105', family: 'Envases', price: 290, stock: 120 },
];

export const months = ['Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep'];
export const trend = [.58, .69, .63, .82, .9, 1];
