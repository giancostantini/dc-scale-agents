// Datos 100% ficticios para la demo de BrainBill: proveedores, RUTs, productos
// y precios inventados. Nunca cargar facturas reales de clientes acá.

// Métodos de asociación al catálogo, en el orden en que BrainBill los prueba.
export const matchMethods = {
  barras: { label: 'Código de barras', tone: 'exact' },
  memoria: { label: 'Memoria del proveedor', tone: 'exact' },
  codigo: { label: 'Código interno', tone: 'exact' },
  nombre: { label: 'Nombre parecido', tone: 'fuzzy' },
};

export const documents = [
  {
    id: 'foto', kind: 'Foto', icon: 'camera', title: 'Foto con el celular',
    hint: 'Una foto por página. La IA lee los renglones.',
    read: 'ia', supplier: 'Distribuidora Norte', rut: '21 000 000 0013', cfe: 'e-Factura', serie: 'A', number: '004812', date: '18/09/2026',
    printedTotalDelta: 2, // el proveedor redondeó: el total impreso difiere en $ 2
    lines: [
      { raw: 'CAJA VASO CART 8OZ X12', qty: 4, price: 1450, iva: 22, conf: 0.97, match: { method: 'memoria', product: 'Vasos de cartón 8 oz', factor: 12, unit: 'unidad', note: '1 caja = 12 unidades' } },
      { raw: 'BOLSA KRAFT 30X40 PQ100', qty: 6, price: 820, iva: 22, conf: 0.94, match: { method: 'barras', product: 'Bolsas kraft 30×40', factor: 100, unit: 'unidad', note: 'EAN 779000000102' } },
      { raw: 'SERVILL. BCA 33X33', qty: 10, price: 390, iva: 22, conf: 0.81, match: { method: 'nombre', product: 'Servilletas blancas 33×33', factor: 1, unit: 'paquete', note: 'Similitud 86 %', alternatives: ['Servilletas blancas 33×33', 'Servilletas color 33×33', 'Servilletas cóctel 24×24'] } },
    ],
  },
  {
    id: 'pdf', kind: 'PDF', icon: 'file', title: 'PDF que llegó por mail',
    hint: 'La IA lee el PDF igual que una persona, sin plantillas.',
    read: 'ia', supplier: 'Papelera del Plata', rut: '21 000 000 0021', cfe: 'e-Factura', serie: 'B', number: '120337', date: '17/09/2026',
    lines: [
      { raw: 'Bandeja compostable 25u', qty: 12, price: 610, iva: 22, conf: 0.98, match: { method: 'codigo', product: 'Bandejas compostables', factor: 25, unit: 'unidad', note: 'Código PDP-2210' } },
      { raw: 'Pote c/tapa 250cc x50', qty: 8, price: 980, iva: 22, conf: 0.96, match: { method: 'memoria', product: 'Potes con tapa 250 cc', factor: 50, unit: 'unidad', note: '1 pack = 50 unidades' } },
      { raw: 'Film stretch 45cm', qty: 3, price: 1240, iva: 22, conf: 0.93, match: { method: 'barras', product: 'Film stretch 45 cm', factor: 1, unit: 'rollo', note: 'EAN 779000000219' } },
      { raw: 'Rollo térmico 80mm', qty: 20, price: 95, iva: 22, conf: 0.9, match: { method: 'nombre', product: 'Rollo papel térmico 80 mm', factor: 1, unit: 'rollo', note: 'Similitud 91 %', alternatives: ['Rollo papel térmico 80 mm', 'Rollo papel térmico 57 mm'] } },
    ],
  },
  {
    id: 'xml', kind: 'XML CFE', icon: 'code', title: 'XML del CFE',
    hint: 'Lectura exacta, sin IA: los datos vienen firmados por el emisor.',
    read: 'exacto', supplier: 'Lácteos San Pedro', rut: '21 000 000 0039', cfe: 'e-Factura', serie: 'C', number: '000951', date: '16/09/2026',
    lines: [
      { raw: 'LECHE ENTERA 1L', qty: 48, price: 42, iva: 10, conf: 1, match: { method: 'barras', product: 'Leche entera 1 L', factor: 1, unit: 'unidad', note: 'EAN 779000000330' } },
      { raw: 'YOGUR FRUTILLA 1KG', qty: 12, price: 118, iva: 10, conf: 1, match: { method: 'memoria', product: 'Yogur frutilla 1 kg', factor: 1, unit: 'unidad', note: 'Elegido la vez anterior' } },
      { raw: 'QUESO DAMBO KG', qty: 5, price: 310, iva: 10, conf: 1, match: { method: 'codigo', product: 'Queso dambo (kg)', factor: 1, unit: 'kg', note: 'Código LSP-044' } },
    ],
  },
];

export const destinations = [
  { id: 'excel', label: 'Archivo Excel / CSV', detail: 'Para importar en tu sistema; marcás "Ya la cargué".' },
  { id: 'webhook', label: 'Webhook firmado', detail: 'POST a n8n, Make, Zapier o tu backend.' },
  { id: 'sql', label: 'Base de datos', detail: 'Agente local: escribe en tablas buzón de tu ERP.' },
  { id: 'api', label: 'API de BrainBill', detail: 'Tu sistema retira la compra y confirma.' },
];

// Minutos que lleva cargar a mano una factura de ese largo (estimación de la demo).
export const manualMinutesPerLine = 2.5;
