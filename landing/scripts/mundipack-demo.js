import { clients, representatives, products, months, trend } from '../content/mundipack-demo.js';

const money = value => new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 }).format(value);
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const navItems = {
  director: [['overview', 'Dashboard', 'grid'], ['team', 'Vendedores', 'team'], ['clients', 'Clientes', 'users'], ['products', 'Productos', 'box'], ['collections', 'Cobranzas', 'wallet'], ['routes', 'Rutas', 'route']],
  seller: [['today', 'Hoy', 'grid'], ['route', 'Ruta', 'route'], ['clients', 'Cartera', 'users'], ['opportunities', 'Oportunidades', 'spark'], ['products', 'Lista de precios', 'box'], ['quote', 'Crear presupuesto', 'document'], ['progress', 'Progreso', 'chart']],
};
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>',
  team: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3M3 12h18M9 6v15M15 6v15"/>',
  box: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v10l9 4 9-4V8M12 13v9M7 5l10 5"/>',
  wallet: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M15 13h6v4h-6z"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8h9"/>',
  spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z"/>',
  document: '<path d="M14 3H5v18h14V8l-5-5ZM14 3v6h5M8 13h8M8 17h6"/>',
  chart: '<path d="M3 3v18h18M7 16l4-5 4 2 6-8"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`; }
function button(text, action, value = '', extra = '') { return `<button type="button" class="mp-button" data-action="${action}" data-value="${escape(value)}" ${extra}>${text}</button>`; }
function metric(label, value, note = '') { return `<div class="mp-stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`; }
function progress(value, label) { return `<div class="mp-progress" role="progressbar" aria-label="${escape(label)}" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(100, value)}%"></span></div>`; }

export function createMundipackDemo() {
  const root = document.createElement('div');
  root.className = 'mp-demo';
  const states = {
    director: { page: 'overview', period: 'current', rep: 'all', segment: 'Todos', query: '', family: 'Todas', client: null, visits: new Set() },
    seller: { page: 'today', period: 'current', rep: 'valentina', segment: 'Todos', query: '', family: 'Todas', client: null, visits: new Set(['trigal']), started: false, cart: {}, discount: 0, quoteClient: 'Café Azahar' },
  };
  let role = 'director';
  let chatOpen = false;
  const state = () => states[role];
  const portfolio = () => clients.filter(c => state().rep === 'all' || c.rep === state().rep);
  const repName = id => representatives.find(rep => rep.id === id)?.name || 'Todo el equipo';
  const sales = () => sum(portfolio(), state().period);
  const target = () => sum(representatives.filter(rep => state().rep === 'all' || rep.id === state().rep), 'target');
  const title = (eyebrow, heading, description = '') => `<header class="mp-page-heading"><span class="mp-eyebrow">${eyebrow}</span><h4 tabindex="-1">${heading}</h4>${description ? `<p>${description}</p>` : ''}</header>`;
  const customerButton = c => `<button class="mp-customer" type="button" data-action="client" data-value="${c.id}"><span class="mp-avatar">${c.initials}</span><span><strong>${c.name}</strong><small>${c.zone} · ${c.days} días desde su última compra</small></span><span aria-hidden="true">↗</span></button>`;

  root.innerHTML = `<div class="mp-demo-toolbar"><div class="mp-role-switch" role="group" aria-label="Elegir dashboard de Mundipack">${button('Dirección / Gerencia', 'role', 'director', 'aria-pressed="true"')}${button('Vendedores', 'role', 'seller', 'aria-pressed="false"')}</div><span class="mp-demo-label"><span aria-hidden="true">●</span> Demo interactiva · datos ficticios</span></div><p class="mp-guide">Explorá el negocio, abrí un cliente y cambiá de dashboard para vivir el día del vendedor.</p><div class="mp-window"><div class="mp-window-bar"><span class="mp-window-dots" aria-hidden="true">● ● ●</span><span>Mundipack / <span data-mp-role-name>Dirección</span></span><span class="mp-window-badge">ENTORNO DEMO</span></div><div class="mp-app"><aside class="mp-sidebar"><div class="mp-brand"><span>${icon('box')}</span><div>Mundipack<small data-mp-subtitle>GESTIÓN COMERCIAL</small></div></div><div class="mp-sidebar-label">TU ESPACIO DE TRABAJO</div><nav class="mp-nav" aria-label="Secciones del dashboard"></nav><div class="mp-session"><span class="mp-avatar" data-mp-avatar>DG</span><div data-mp-session>Dirección<small>Perfil de demostración</small></div></div></aside><div class="mp-viewport" tabindex="0" role="region" aria-label="Contenido interactivo de Mundipack"><div class="mp-view"></div></div></div><div class="mp-assistant" hidden></div><button type="button" class="mp-assistant-toggle" data-action="assistant" aria-expanded="false">${icon('spark')}<span>Asistente demo</span></button></div><p class="mp-feedback" role="status" aria-live="polite">Elegí una sección del menú para comenzar.</p>`;
  const view = root.querySelector('.mp-view');
  const viewport = root.querySelector('.mp-viewport');
  const feedback = root.querySelector('.mp-feedback');
  const say = message => { feedback.textContent = message; };

  function filters() {
    return `<div class="mp-filters"><div class="mp-period" role="group" aria-label="Período de ventas">${button('Mes actual', 'period', 'current', `aria-pressed="${state().period === 'current'}"`)}${button('Mes anterior', 'period', 'previous', `aria-pressed="${state().period === 'previous'}"`)}</div>${role === 'director' ? `<label>Vendedor<select data-field="rep"><option value="all">Todo el equipo</option>${representatives.map(rep => `<option value="${rep.id}" ${state().rep === rep.id ? 'selected' : ''}>${rep.name}</option>`).join('')}</select></label>` : ''}</div>`;
  }
  function chart() {
    return `<div class="mp-card"><div class="mp-card-title"><h5>Evolución de ventas</h5><span>UYU · datos de ejemplo</span></div><div class="mp-chart" role="img" aria-label="Ventas ficticias de abril a septiembre: ${trend.map((factor, i) => `${months[i]} ${money(sales() * factor)}`).join(', ')}">${trend.map((factor, i) => `<div class="mp-chart-column"><span>${money(Math.round(sales() * factor / 100) * 100)}</span><div class="mp-chart-bar ${i === 5 ? 'is-current' : ''}" style="height:${factor * 112}px"></div><small>${months[i]}</small></div>`).join('')}</div></div>`;
  }
  function dashboard() {
    const amount = sales();
    const percent = Math.round(amount / target() * 100);
    return `${title('INTELIGENCIA DE NEGOCIO', 'Una mirada a todo el negocio.', 'Ventas, equipo y oportunidades en un mismo lugar.')}${filters()}<div class="mp-summary"><div class="mp-summary-primary"><span class="mp-eyebrow">VENTAS NETAS · ${state().period === 'current' ? 'MES ACTUAL' : 'MES ANTERIOR'}</span><strong>${money(amount)}</strong><p>${repName(state().rep)} · cartera de demostración</p></div><div class="mp-summary-target"><div class="mp-card-title"><span>Objetivo comercial</span><strong>${percent}%</strong></div><strong>${money(target())}</strong>${progress(percent, 'Avance del objetivo comercial')}<small>${money(Math.max(0, target() - amount))} para alcanzar el objetivo.</small></div></div><div class="mp-stats">${metric('Clientes en cartera', portfolio().length, 'Abrí Clientes para explorar')}${metric('En riesgo', portfolio().filter(c => c.segment === 'En riesgo').length, 'Oportunidades de reactivación')}${metric('Por cobrar', money(sum(portfolio(), 'debt')), 'Cuentas de demostración')}</div><div class="mp-two-col">${chart()}<div class="mp-card"><div class="mp-card-title"><h5>Oportunidades de hoy</h5>${button('Ver cartera ↗', 'navigate', 'clients')}</div>${portfolio().filter(c => c.segment === 'En riesgo' || c.debt > 0).slice(0, 3).map(customerButton).join('')}</div></div>`;
  }
  function team() {
    return `${title('EL EQUIPO', 'Cada vendedor, en contexto.', 'Seleccioná un vendedor para explorar su cartera y su objetivo.')}<div class="mp-stats">${representatives.map(rep => {
      const total = sum(clients.filter(c => c.rep === rep.id), 'current');
      return `<div class="mp-card"><span class="mp-avatar">${rep.name.slice(0, 1)}</span><h5>${rep.name}</h5><strong class="mp-number">${money(total)}</strong><small>Objetivo ${money(rep.target)}</small>${progress(total / rep.target * 100, `Objetivo de ${rep.name}`)}${button('Explorar cartera ↗', 'team', rep.id)}</div>`;
    }).join('')}</div>${chart()}`;
  }
  function clientList() {
    return `${title(role === 'director' ? 'INTELIGENCIA DE NEGOCIO' : 'TUS CLIENTES', role === 'director' ? 'Clientes de la cartera.' : 'Tu cartera, siempre a mano.', 'Buscá un cliente o explorá los segmentos. Abrí una ficha para ver el contexto.')}${role === 'director' ? filters() : ''}<div class="mp-segments" role="group" aria-label="Segmento de clientes">${['Todos', 'Leales', 'En riesgo', 'Nuevos'].map(segment => button(`${segment} <span>${portfolio().filter(c => segment === 'Todos' || c.segment === segment).length}</span>`, 'segment', segment, `aria-pressed="${state().segment === segment}"`)).join('')}</div><label class="mp-search">Buscar cliente<input data-field="query" type="search" placeholder="Probá con Café Azahar…" value="${escape(state().query)}"></label><div data-client-results>${clientResults()}</div>`;
  }
  function clientResults() {
    const rows = portfolio().filter(c => (state().segment === 'Todos' || c.segment === state().segment) && normalize(c.name).includes(normalize(state().query)));
    return `<p class="mp-result-count">${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}</p><div class="mp-client-grid">${rows.map(c => `<div class="mp-card">${customerButton(c)}<div class="mp-card-title"><span class="mp-tag ${c.segment === 'En riesgo' ? 'mp-tag-warm' : ''}">${c.segment}</span><strong>${money(c[state().period])}</strong></div><small>Ventas del período · ${repName(c.rep)}</small></div>`).join('') || '<div class="mp-empty">No encontramos clientes con esos filtros. Probá otro nombre o segmento.</div>'}</div>`;
  }
  function clientDetail() {
    const c = clients.find(client => client.id === state().client);
    return `${button('← Volver a la cartera', 'back')} ${title('FICHA DE CLIENTE · DEMO', c.name, `${c.zone} · Responsable: ${repName(c.rep)}`)}<div class="mp-stats">${metric('Ventas del mes', money(c.current), 'Información ficticia')}${metric('Última compra', `Hace ${c.days} días`, c.segment)}${metric('Saldo pendiente', money(c.debt), c.debt ? 'Seguimiento de cobranza' : 'Al día')}</div><div class="mp-two-col"><div class="mp-card"><h5>El contexto antes de visitar</h5><p>${c.segment === 'En riesgo' ? 'La frecuencia de compra bajó. Una visita puede ayudar a entender qué cambió y recuperar el vínculo.' : 'La relación está activa. Revisá sus necesidades para preparar la próxima visita.'}</p><div class="mp-timeline"><div><span>Última compra</span><strong>${products[0].name}</strong><small>Registro de ejemplo · ${c.days} días atrás</small></div><div><span>Seguimiento comercial</span><strong>Revisar necesidades de reposición</strong><small>Nota de demostración</small></div></div></div><div class="mp-card"><h5>Próximo paso</h5><p>Convertí la información del cliente en una acción concreta.</p>${role === 'seller' ? `${button('Preparar presupuesto ↗', 'client-quote', c.id)}${button('Ver mi ruta', 'navigate', 'route')}` : button('Ver cobranzas ↗', 'navigate', 'collections')}${button('Consultar al asistente ✧', 'assistant-client', c.id)}</div></div>`;
  }
  function productList() {
    return `${title('CATÁLOGO COMERCIAL', role === 'director' ? 'Productos y disponibilidad.' : 'Lista de precios.', 'Buscá por producto o código. Todos los precios y stocks son ficticios.')}<div class="mp-filters"><label class="mp-search">Buscar producto<input data-field="query" type="search" value="${escape(state().query)}" placeholder="Vasos, bolsas, DEMO-101…"></label><label>Familia<select data-field="family">${['Todas', ...new Set(products.map(p => p.family))].map(family => `<option ${state().family === family ? 'selected' : ''}>${family}</option>`).join('')}</select></label></div><div data-product-results>${productResults()}</div>`;
  }
  function productResults() {
    const rows = products.filter(p => (state().family === 'Todas' || p.family === state().family) && normalize(`${p.name} ${p.code}`).includes(normalize(state().query)));
    return `<div class="mp-table-wrap"><table class="mp-table"><caption>${rows.length} productos de demostración · precios en UYU</caption><thead><tr><th>Producto</th><th>Familia</th><th>Precio</th><th>${role === 'director' ? 'Stock' : 'Presupuesto'}</th></tr></thead><tbody>${rows.map(p => `<tr><td><strong>${p.name}</strong><small>${p.code}</small></td><td>${p.family}</td><td>${money(p.price)}</td><td>${role === 'director' ? `${p.stock} packs` : button('Agregar +', 'add-product', p.id, `aria-label="Agregar ${p.name} al presupuesto"`)}</td></tr>`).join('')}</tbody></table>${!rows.length ? '<p class="mp-empty">No hay productos con esos filtros.</p>' : ''}</div>`;
  }
  function collections() {
    const rows = portfolio().filter(c => c.debt > 0);
    return `${title('GESTIÓN', 'Cobranzas pendientes.', 'Detectá qué cuentas necesitan seguimiento y consultá su ficha.')}${filters()}<div class="mp-stats">${metric('Saldo total', money(sum(rows, 'debt')), 'Datos de demostración')}${metric('Clientes con saldo', rows.length, 'En la cartera seleccionada')}${metric('Prioridad de contacto', rows.filter(c => c.segment === 'En riesgo').length, 'Cuentas en riesgo con saldo')}</div><div class="mp-card">${rows.map(c => `<div class="mp-collection">${customerButton(c)}<strong>${money(c.debt)}</strong></div>`).join('') || '<p class="mp-empty">Esta cartera no tiene saldos pendientes.</p>'}</div>`;
  }
  function map(rows) {
    const positions = [[20, 64], [48, 42], [75, 28]];
    return `<div class="mp-map" role="group" aria-label="Esquema ilustrativo de la ruta, sin ubicaciones reales"><svg viewBox="0 0 500 220" preserveAspectRatio="none" aria-hidden="true"><path class="mp-map-water" d="M0 160Q120 100 160 190T500 200V220H0Z"/><path class="mp-map-streets" d="M0 35h500M0 80h500M0 125h500M0 170h500M50 0v220M125 0v220M200 0v220M275 0v220M350 0v220M425 0v220"/><path class="mp-map-route" d="M100 140 240 92 375 62"/></svg><span class="mp-map-caption">Recorrido ilustrativo</span>${rows.slice(0, 3).map((c, i) => `<button type="button" class="mp-map-pin" style="left:${positions[i][0]}%;top:${positions[i][1]}%" data-action="client" data-value="${c.id}" aria-label="Abrir ficha de ${c.name}">${i + 1}</button>`).join('')}</div>`;
  }
  function route(director = false) {
    const rows = director ? clients.filter(c => c.rep === (state().rep === 'all' ? 'valentina' : state().rep)) : portfolio();
    const done = rows.filter(c => state().visits.has(c.id)).length;
    return `${title(director ? 'COORDINACIÓN DEL EQUIPO' : 'TU DÍA', director ? 'Rutas del equipo.' : 'Tu próxima visita, con contexto.', director ? 'Seleccioná un vendedor y explorá las paradas de su recorrido.' : 'Abrí una parada o marcá una visita para actualizar tu avance.')}${director ? filters() : ''}<div class="mp-card"><div class="mp-card-title"><h5>${director ? repName(state().rep === 'all' ? 'valentina' : state().rep) : 'Ruta de hoy'}</h5><strong>${done} / ${rows.length} visitas</strong></div>${progress(done / rows.length * 100, 'Visitas completadas')}</div>${map(rows)}<div class="mp-card mp-route-list">${rows.map((c, i) => `<div class="mp-route-stop"><span class="mp-stop-index ${state().visits.has(c.id) ? 'is-done' : ''}">${state().visits.has(c.id) ? '✓' : i + 1}</span>${customerButton(c)}${director ? `<span class="mp-tag">${state().visits.has(c.id) ? 'Hecha' : 'Pendiente'}</span>` : button(state().visits.has(c.id) ? 'Visita hecha ✓' : 'Marcar visita', 'visit', c.id, `aria-pressed="${state().visits.has(c.id)}" aria-label="${state().visits.has(c.id) ? 'Desmarcar' : 'Marcar'} visita a ${c.name}"`)}</div>`).join('')}</div>`;
  }
  function today() {
    const done = portfolio().filter(c => state().visits.has(c.id)).length;
    return `${title('PORTAL DEL VENDEDOR', 'Buen día, Valentina.', 'Tu cartera, tus visitas y tus oportunidades.')}<div class="mp-day"><div><strong>${state().started ? 'Jornada iniciada' : 'Tu jornada'}</strong><small>${state().started ? 'Ya podés registrar las visitas de hoy.' : 'Prepará tu recorrido y empezá el día.'}</small></div>${button(state().started ? 'Finalizar jornada' : 'Iniciar jornada', 'day')}</div><div class="mp-two-col"><div class="mp-summary-primary"><span class="mp-eyebrow">TU OBJETIVO DEL MES</span><strong>${money(sales())}</strong><p>de ${money(target())}</p>${progress(sales() / target() * 100, 'Objetivo del vendedor')}</div><div class="mp-card"><div class="mp-card-title"><h5>Tu ruta de hoy</h5>${button('Ver ruta ↗', 'navigate', 'route')}</div><strong class="mp-number">${done} / ${portfolio().length} visitas</strong>${progress(done / portfolio().length * 100, 'Tu ruta de hoy')}<small>Próxima parada: ${portfolio().find(c => !state().visits.has(c.id))?.name || 'Recorrido completado'}</small></div></div><div class="mp-two-col"><div class="mp-card"><h5>Clientes que necesitan atención</h5>${portfolio().filter(c => c.debt || c.segment === 'En riesgo').map(customerButton).join('')}</div>${map(portfolio())}</div>`;
  }
  function opportunities() {
    return `${title('TUS OPORTUNIDADES', 'Una acción para cada señal.', 'Explorá el contexto del cliente antes de llamar, visitar o preparar una propuesta.')}<div class="mp-client-grid">${portfolio().map(c => `<div class="mp-card"><span class="mp-tag mp-tag-warm">${c.segment === 'En riesgo' ? 'REACTIVAR' : c.debt ? 'COBRAR' : 'FIDELIZAR'}</span>${customerButton(c)}<p>${c.segment === 'En riesgo' ? `Pasaron ${c.days} días desde su última compra.` : c.debt ? `${money(c.debt)} de saldo pendiente para dar seguimiento.` : 'Buen momento para revisar necesidades de reposición.'}</p></div>`).join('')}</div>`;
  }
  function quoteTotals() {
    const subtotal = products.reduce((total, p) => total + p.price * (states.seller.cart[p.id] || 0), 0);
    return { subtotal, total: subtotal * (1 - states.seller.discount / 100) };
  }
  function quote() {
    const s = states.seller;
    return `${title('HERRAMIENTA DE VENTA', 'Crear presupuesto.', 'Probá agregar productos, cambiar cantidades y aplicar un descuento.')}<div class="mp-card"><label>Cliente<input data-field="quoteClient" maxlength="80" value="${escape(s.quoteClient)}" placeholder="Nombre del comercio"></label></div><div class="mp-card"><h5>Agregar productos</h5><div class="mp-quote-products">${products.map(p => button(`${p.name} <span>${money(p.price)} +</span>`, 'quote-add', p.id)).join('')}</div></div><div class="mp-card mp-quote"><div class="mp-card-title"><h5>Mundipack <span class="mp-tag">PRESUPUESTO DEMO</span></h5><span>UYU</span></div><p>Cliente: <strong data-quote-name>${escape(s.quoteClient) || 'Sin asignar'}</strong></p><div data-quote-lines>${quoteLines()}</div><div class="mp-quote-footer"><label>Descuento (%)<input data-field="discount" type="number" min="0" max="30" step="1" value="${s.discount}"></label><div><small>Subtotal: <span data-quote-subtotal>${money(quoteTotals().subtotal)}</span></small><strong>Total <span data-quote-total>${money(quoteTotals().total)}</span></strong></div></div><small>Ejemplo interactivo · precios ficticios con IVA incluido.</small></div>${button('Vaciar presupuesto', 'quote-clear')}`;
  }
  function quoteLines() {
    const rows = products.filter(p => states.seller.cart[p.id]);
    return rows.length ? `<div class="mp-table-wrap"><table class="mp-table"><caption>Productos del presupuesto</caption><thead><tr><th>Producto</th><th>Cantidad</th><th>Importe</th><th><span class="mp-sr">Quitar</span></th></tr></thead><tbody>${rows.map(p => `<tr><td>${p.name}</td><td><input data-field="quantity" data-product="${p.id}" type="number" min="1" max="99" step="1" value="${states.seller.cart[p.id]}" aria-label="Cantidad de ${p.name}"></td><td data-line-total="${p.id}">${money(p.price * states.seller.cart[p.id])}</td><td>${button('×', 'quote-remove', p.id, `aria-label="Quitar ${p.name}"`)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mp-empty">Elegí un producto para comenzar tu presupuesto.</p>';
  }
  function updateQuote() {
    const totals = quoteTotals();
    root.querySelector('[data-quote-subtotal]').textContent = money(totals.subtotal);
    root.querySelector('[data-quote-total]').textContent = money(totals.total);
    products.forEach(p => { const cell = root.querySelector(`[data-line-total="${p.id}"]`); if (cell) cell.textContent = money(p.price * states.seller.cart[p.id]); });
  }

  function render(focus = false) {
    const s = state();
    root.querySelectorAll('[data-action="role"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === role)));
    root.querySelector('[data-mp-role-name]').textContent = role === 'director' ? 'Dirección / Gerencia' : 'Portal del vendedor';
    root.querySelector('[data-mp-subtitle]').textContent = role === 'director' ? 'GESTIÓN COMERCIAL' : 'PORTAL VENDEDOR';
    root.querySelector('[data-mp-avatar]').textContent = role === 'director' ? 'DG' : 'VA';
    root.querySelector('[data-mp-session]').innerHTML = `${role === 'director' ? 'Dirección' : 'Valentina'}<small>Perfil de demostración</small>`;
    root.querySelector('.mp-nav').innerHTML = navItems[role].map(([id, label, glyph]) => `<button type="button" data-action="navigate" data-value="${id}" ${s.page === id ? 'aria-current="page"' : ''}>${icon(glyph)}${label}</button>`).join('');
    const pages = { overview: dashboard, team, clients: () => s.client ? clientDetail() : clientList(), products: productList, collections, routes: () => route(true), today, route, opportunities, quote, progress: () => `${title('TU EVOLUCIÓN', 'Cada paso cuenta.', 'El avance comercial y el recorrido del mes.')}${filters()}${chart()}<div class="mp-card"><h5>Cumplimiento de visitas</h5>${progress(s.visits.size / portfolio().length * 100, 'Cumplimiento de visitas')}<p>${s.visits.size} de ${portfolio().length} visitas realizadas en tu ruta.</p>${button('Continuar mi ruta ↗', 'navigate', 'route')}</div>` };
    view.innerHTML = pages[s.page]();
    if (focus) { viewport.scrollTop = 0; view.querySelector('h4')?.focus({ preventScroll: true }); }
  }
  function navigate(page) {
    if (!navItems[role].some(([id]) => id === page)) return;
    state().page = page; state().query = ''; state().client = null;
    render(true);
  }
  function assistant(open, clientId) {
    chatOpen = open;
    const panel = root.querySelector('.mp-assistant');
    panel.hidden = !open;
    root.querySelector('.mp-assistant-toggle').setAttribute('aria-expanded', String(open));
    if (!open) { root.querySelector('.mp-assistant-toggle').focus({ preventScroll: true }); return; }
    const c = clients.find(c => c.id === clientId) || portfolio()[0];
    panel.innerHTML = `<div class="mp-assistant-head"><div>${icon('spark')}<strong>Asistente comercial</strong><small>Respuestas de demostración</small></div>${button('×', 'assistant-close', '', 'aria-label="Cerrar asistente demo"')}</div><div class="mp-assistant-body"><p>Probá una consulta sobre esta cartera ficticia.</p><div class="mp-assistant-options">${button(`¿Qué pasa con ${c.name}?`, 'ask', c.id)}${button('¿A quién visitar primero?', 'ask', 'priority')}</div><div class="mp-assistant-answer" role="status"></div></div>`;
    panel.querySelector('button').focus({ preventScroll: true });
  }
  root.addEventListener('click', event => {
    const control = event.target.closest('button[data-action]');
    if (!control) return;
    const { action, value } = control.dataset;
    if (action === 'role') { role = value; chatOpen = false; root.querySelector('.mp-assistant').hidden = true; root.querySelector('.mp-assistant-toggle').setAttribute('aria-expanded', 'false'); render(); viewport.scrollTop = 0; say(`Vista de ${role === 'director' ? 'Dirección / Gerencia' : 'Vendedores'}. Cada dashboard conserva su recorrido.`); }
    if (action === 'navigate') navigate(value);
    if (action === 'period') { state().period = value; render(); root.querySelector(`[data-action="period"][data-value="${value}"]`)?.focus({ preventScroll: true }); }
    if (action === 'segment') { state().segment = value; render(); root.querySelector(`[data-action="segment"][data-value="${value}"]`)?.focus({ preventScroll: true }); }
    if (action === 'team') { state().rep = value; navigate('clients'); }
    if (action === 'client') { state().page = 'clients'; state().client = value; render(true); }
    if (action === 'back') { state().client = null; render(true); }
    if (action === 'visit') { const s = state(); if (s.visits.has(value)) s.visits.delete(value); else s.visits.add(value); render(); root.querySelector(`[data-action="visit"][data-value="${value}"]`)?.focus({ preventScroll: true }); say(`${clients.find(c => c.id === value).name}: visita ${s.visits.has(value) ? 'completada' : 'pendiente'}. Cambio guardado solo en esta demo.`); }
    if (action === 'day') { state().started = !state().started; render(); root.querySelector('[data-action="day"]').focus({ preventScroll: true }); say(state().started ? 'Jornada de demostración iniciada.' : 'Jornada de demostración finalizada.'); }
    if (action === 'client-quote') { states.seller.quoteClient = clients.find(c => c.id === value).name; navigate('quote'); }
    if (['add-product', 'quote-add'].includes(action)) {
      states.seller.cart[value] = Math.min(99, (states.seller.cart[value] || 0) + 1);
      if (action === 'add-product') navigate('quote');
      else { root.querySelector('[data-quote-lines]').innerHTML = quoteLines(); updateQuote(); }
      say(`${products.find(p => p.id === value).name} agregado. Total del presupuesto: ${money(quoteTotals().total)}.`);
    }
    if (action === 'quote-remove') { delete states.seller.cart[value]; root.querySelector('[data-quote-lines]').innerHTML = quoteLines(); updateQuote(); root.querySelector('[data-action="quote-add"]').focus({ preventScroll: true }); say(`Producto quitado. Total: ${money(quoteTotals().total)}.`); }
    if (action === 'quote-clear') { states.seller.cart = {}; render(); root.querySelector('[data-action="quote-clear"]').focus({ preventScroll: true }); say('Presupuesto vacío. Podés empezar de nuevo.'); }
    if (action === 'assistant') assistant(!chatOpen);
    if (action === 'assistant-client') assistant(true, value);
    if (action === 'assistant-close') assistant(false);
    if (action === 'ask') {
      const c = value === 'priority' ? portfolio().find(c => c.segment === 'En riesgo') || portfolio()[0] : clients.find(c => c.id === value);
      root.querySelector('.mp-assistant-answer').innerHTML = `<span class="mp-tag">EJEMPLO ILUSTRATIVO</span><p><strong>${c.name}</strong> compró hace ${c.days} días y tiene ${money(c.debt)} de saldo pendiente.</p><p>${c.segment === 'En riesgo' ? 'Priorizá una visita para revisar la reposición y entender la caída en la frecuencia de compra.' : 'Revisá sus necesidades de reposición en el próximo contacto.'}</p>${button('Abrir ficha del cliente ↗', 'chat-client', c.id)}`;
    }
    if (action === 'chat-client') { assistant(false); state().page = 'clients'; state().client = value; render(true); }
  });
  root.addEventListener('input', event => {
    const field = event.target.dataset.field;
    if (field === 'query') {
      state().query = event.target.value;
      const results = root.querySelector(state().page === 'clients' ? '[data-client-results]' : '[data-product-results]');
      results.innerHTML = state().page === 'clients' ? clientResults() : productResults();
    }
    if (field === 'quoteClient') { states.seller.quoteClient = event.target.value; root.querySelector('[data-quote-name]').textContent = event.target.value || 'Sin asignar'; }
    if (field === 'quantity' || field === 'discount') {
      const min = field === 'quantity' ? 1 : 0, max = field === 'quantity' ? 99 : 30;
      const value = Math.max(min, Math.min(max, Math.floor(Number(event.target.value) || min)));
      if (field === 'quantity') states.seller.cart[event.target.dataset.product] = value;
      else states.seller.discount = value;
      updateQuote();
    }
  });
  root.addEventListener('change', event => {
    const field = event.target.dataset.field;
    if (['rep', 'family'].includes(field)) { state()[field] = event.target.value; render(); root.querySelector(`[data-field="${field}"]`)?.focus({ preventScroll: true }); }
    if (field === 'quantity') { event.target.value = states.seller.cart[event.target.dataset.product]; say(`Total actualizado: ${money(quoteTotals().total)}.`); }
    if (field === 'discount') { event.target.value = states.seller.discount; say(`Descuento del ${states.seller.discount}%. Total: ${money(quoteTotals().total)}.`); }
  });
  root.addEventListener('keydown', event => { if (event.key === 'Escape' && chatOpen) { event.stopPropagation(); assistant(false); } });
  render();
  return root;
}
