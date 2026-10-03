// Home de D&C · Tecnología Empresarial.
// Header, apariciones al hacer scroll, ecosistema del hero, Business Hub
// navegable, soluciones, recorrido de un pedido, forma de trabajar y la
// demo de Mundipack. Sin dependencias.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
// Doble frame con respaldo: si el navegador frena requestAnimationFrame
// (pestaña en segundo plano), el callback igual corre.
const nextFrame = fn => {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(() => requestAnimationFrame(run));
  setTimeout(run, 80);
};

window.__dcReady = true;

initHeader();
initReveal();
initHero();
initHubApp();
initSolutions();
initChain();
initFlow();
initDemo();

/* ---------------------------------------------------------------- Header */
function initHeader() {
  const header = $('#siteHeader');
  const onScroll = () => header.classList.toggle('is-solid', scrollY > 24);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  const menu = $('#menu');
  const toggle = $('#menuToggle');
  if (menu && typeof menu.showModal === 'function') {
    toggle.addEventListener('click', () => { menu.showModal(); toggle.setAttribute('aria-expanded', 'true'); });
    $('[data-close]', menu).addEventListener('click', () => menu.close());
    menu.addEventListener('close', () => toggle.setAttribute('aria-expanded', 'false'));
    menu.addEventListener('click', event => {
      if (event.target === menu || event.target.closest('a[href^="#"]')) menu.close();
    });
    matchMedia('(min-width: 1200px)').addEventListener('change', ({ matches }) => { if (matches && menu.open) menu.close(); });
  } else if (toggle) {
    toggle.hidden = true;
  }

  // Marca la sección visible en el menú.
  const links = $$('.nav a[href^="#"]');
  const byId = new Map(links.map(link => [link.hash.slice(1), link]));
  if (!('IntersectionObserver' in window)) return;
  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(link => link.removeAttribute('aria-current'));
      byId.get(entry.target.id)?.setAttribute('aria-current', 'location');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['top', ...byId.keys(), 'contacto'].forEach(id => { const section = document.getElementById(id); if (section) spy.observe(section); });
}

/* ------------------------------------------------------------ Apariciones */
function initReveal() {
  const items = $$('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) { items.forEach(el => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach(el => io.observe(el));
}

/* ------------------------------------------------------ Hero: ecosistema */
function initHero() {
  const hero = $('#top');
  const eco = $('#eco');
  if (!hero || !eco) return;
  nextFrame(() => hero.classList.add('is-ready'));

  const svg = $('.eco-lines', eco);
  const hub = $('#ecoHub');
  const tiles = $$('.eco-app', eco).sort((a, b) => a.dataset.step - b.dataset.step);
  const steps = $$('.step', hero);
  const pauseBtn = $('.steps-pause', hero);
  const caption = $('.steps-caption', hero);
  const feed = $('.hub-feed', hub);
  const rows = $$('.hub-row', hub);
  const NS = 'http://www.w3.org/2000/svg';

  const STEPS = [
    { name: 'Tildalo', color: 'var(--c-tildalo)', text: 'Factura de Fundición Oriental leída y validada.', em: 'Subió 9 % desde la última compra.', inc: 1 },
    { name: 'Rondín', color: 'var(--c-rondin)', text: 'Camión 2 en ruta con 14 entregas.', em: 'Sanitaria Oeste ya recibió el aviso de llegada.', inc: 1 },
    { name: 'Encargue', color: 'var(--c-encargue)', text: 'Pedido por WhatsApp de Ferretería Malvín.', em: '12 artículos, cargado al sistema.', inc: 1 },
    { name: 'Libreta', color: 'var(--c-libreta)', text: 'Valeria tomó un pedido en Pinturas Cordón.', em: 'Sumó lo que el cliente suele llevar.', inc: 14 },
    { name: 'Business Hub', color: 'var(--arena)', text: 'Compras, reparto, pedidos y ventas en un mismo sistema.', em: 'Toda la operación, en un solo lugar.' },
  ];
  const DURATION = [5200, 5200, 5200, 5200, 7000];
  const values = [127, 38, 45, 182];
  const format = [n => `${n} facturas`, n => `${n} entregas`, n => `${n} pedidos`, n => `$U ${n} mil`];
  steps.forEach((step, i) => { STEPS[i].desc = $('.d', step)?.textContent || ''; });

  // Líneas, puertos y paquetes de datos (uno por aplicación).
  const paths = [], ports = [], packets = [];
  tiles.forEach(() => {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('class', 'eco-path');
    svg.append(path);
    paths.push(path);
  });
  tiles.forEach(() => {
    const port = document.createElementNS(NS, 'circle');
    port.setAttribute('class', 'eco-port');
    port.setAttribute('r', '3.5');
    svg.append(port);
    ports.push(port);
  });
  tiles.forEach(() => {
    const packet = document.createElementNS(NS, 'circle');
    packet.setAttribute('class', 'eco-packet');
    packet.setAttribute('r', '4');
    packet.style.opacity = '0';
    svg.append(packet);
    packets.push(packet);
  });

  const box = el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  function layout() {
    const width = eco.clientWidth, height = eco.clientHeight;
    if (!width) return;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const h = box(hub);
    tiles.forEach((tile, i) => {
      const t = box(tile);
      const top = t.y + t.h / 2 < h.y + h.h / 2;
      const left = t.x + t.w / 2 < h.x + h.w / 2;
      const sx = t.x + t.w / 2;
      const sy = top ? t.y + t.h : t.y;
      let ex, ey, d;
      if (sx > h.x - 10 && sx < h.x + h.w + 10) {
        // La app queda encima o debajo del Hub: entra por el borde superior o inferior.
        ex = Math.min(Math.max(sx, h.x + 22), h.x + h.w - 22);
        ey = top ? h.y : h.y + h.h;
        const mid = (sy + ey) / 2;
        d = `M${sx},${sy} C${sx},${mid} ${ex},${mid} ${ex},${ey}`;
      } else {
        // La app queda al costado: baja y entra por el lateral del Hub.
        ex = left ? h.x : h.x + h.w;
        ey = h.y + h.h * (top ? 0.34 : 0.66);
        d = `M${sx},${sy} C${sx},${sy + (ey - sy) * 0.82} ${sx + (ex - sx) * 0.3},${ey} ${ex},${ey}`;
      }
      paths[i].setAttribute('d', d);
      ports[i].setAttribute('cx', ex);
      ports[i].setAttribute('cy', ey);
    });
  }
  layout();
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(eco);
  else addEventListener('resize', layout);
  document.fonts?.ready.then(layout);

  function sendPacket(i, duration = 1000) {
    return new Promise(resolve => {
      if (reduced) { resolve(); return; }
      const path = paths[i], packet = packets[i];
      const length = path.getTotalLength();
      const start = performance.now();
      packet.style.opacity = '1';
      const tick = now => {
        const k = Math.min(1, (now - start) / duration);
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const point = path.getPointAtLength(length * eased);
        packet.setAttribute('cx', point.x);
        packet.setAttribute('cy', point.y);
        if (k < 1) requestAnimationFrame(tick);
        else { packet.style.opacity = '0'; resolve(); }
      };
      requestAnimationFrame(tick);
    });
  }

  function setFeed(i) {
    const s = STEPS[i];
    const previous = $$('.hub-feed-item:not(.is-out)', feed);
    const item = document.createElement('div');
    item.className = 'hub-feed-item is-in-start';
    item.style.setProperty('--c', s.color);
    item.innerHTML = `<span class="src"><i></i>${s.name} · ahora</span>${s.text} <em>${s.em}</em>`;
    feed.append(item);
    nextFrame(() => item.classList.remove('is-in-start'));
    previous.forEach(old => { old.classList.add('is-out'); setTimeout(() => old.remove(), 600); });
  }

  function bump(i, by) {
    const el = $('b', rows[i]);
    const from = values[i], to = from + by;
    values[i] = to;
    rows[i].classList.add('is-hot');
    if (reduced) { el.textContent = format[i](to); return; }
    const start = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - start) / 700);
      el.textContent = format[i](Math.round(from + (to - from) * k));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  let current = -1, elapsed = 0, token = 0;
  let userPaused = false, focusPaused = false, visible = true;

  function go(i, fromUser = false) {
    current = i; elapsed = 0;
    const mine = ++token;
    const all = i === 4;
    tiles.forEach((tile, k) => tile.classList.toggle('is-on', all || k === i));
    eco.classList.toggle('is-focused', !all);
    hub.classList.toggle('is-center', all);
    paths.forEach((path, k) => path.classList.toggle('is-on', all || k === i));
    rows.forEach(row => row.classList.remove('is-hot'));
    steps.forEach((step, k) => {
      const on = k === i;
      step.classList.toggle('is-on', on);
      step.setAttribute('aria-selected', String(on));
      step.tabIndex = on ? 0 : -1;
      $('.bar i', step).style.transform = `scaleX(${k < i || (on && (reduced || userPaused)) ? 1 : 0})`;
    });
    if (caption) caption.innerHTML = `<b>${STEPS[i].name}</b> · ${STEPS[i].desc}`;
    if (!all) {
      setTimeout(async () => {
        if (mine !== token) return;
        await sendPacket(i, 1000);
        if (mine !== token) return;
        bump(i, STEPS[i].inc);
        setFeed(i);
      }, fromUser ? 80 : 300);
    } else {
      setFeed(4);
      tiles.forEach((_, k) => setTimeout(async () => {
        if (mine !== token) return;
        await sendPacket(k, 1100);
        if (mine === token) rows[k].classList.add('is-hot');
      }, 200 + k * 160));
    }
  }

  const isPaused = () => userPaused || focusPaused || document.hidden || !visible || reduced;
  let last = performance.now(), running = false;
  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    if (!isPaused() && current >= 0) {
      elapsed += dt;
      const k = Math.min(1, elapsed / DURATION[current]);
      $('.bar i', steps[current]).style.transform = `scaleX(${k})`;
      if (k >= 1) go((current + 1) % STEPS.length);
    }
    if (visible) requestAnimationFrame(frame); else running = false;
  }
  function run() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }

  steps.forEach((step, i) => {
    step.addEventListener('click', () => go(i, true));
    step.addEventListener('keydown', event => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!delta) return;
      event.preventDefault();
      const next = (i + delta + steps.length) % steps.length;
      steps[next].focus();
      go(next, true);
    });
  });
  tiles.forEach((tile, i) => tile.addEventListener('click', () => go(i, true)));
  const stepsList = $('.steps-list', hero);
  stepsList.addEventListener('focusin', event => { if (event.target.matches(':focus-visible')) focusPaused = true; });
  stepsList.addEventListener('focusout', () => { focusPaused = false; });
  pauseBtn.addEventListener('click', () => {
    userPaused = !userPaused;
    pauseBtn.setAttribute('aria-pressed', String(userPaused));
    pauseBtn.setAttribute('aria-label', userPaused ? 'Reanudar el recorrido' : 'Pausar el recorrido');
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) run();
    }, { threshold: 0.15 }).observe(hero);
  }

  if (reduced) {
    // Sin animaciones: se muestra el ecosistema completo y se recorre a mano.
    pauseBtn.hidden = true;
    go(4);
  } else {
    setTimeout(() => { go(0); run(); }, 1300);
  }
}

/* --------------------------------------------- 02 · Business Hub navegable */
function initHubApp() {
  const app = $('#hubApp');
  if (!app) return;
  const view = $('#hubView');
  const crumb = $('[data-crumb]', app);
  const tabs = $$('.app-nav [data-view]', app);
  const search = $('.app-search', app);
  const icon = id => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const head = (title, sub, period = '') => `<div class="view-head"><div><h4>${title}</h4><p>${sub}</p></div>${period ? `<span class="period">${period}</span>` : ''}</div>`;
  const kpi = (label, value, note, cls = 'up', main = false) => `<div class="kpi${main ? ' is-main' : ''}"><span>${label}</span><b>${value}</b><em class="${cls}">${note}</em></div>`;
  const bars = (values, highlight) => `<div class="bars">${values.map((v, k) => `<i data-h="${v}%" style="--k:${k}"${k === highlight ? ' class="hl"' : ''}></i>`).join('')}</div>`;
  const tag = '<span class="demo-tag">Datos de ejemplo</span>';

  const ANSWERS = [
    { q: '¿Qué clientes dejaron de comprar en los últimos 30 días?', a: `Tres clientes que compraban todos los meses no hicieron pedidos en los últimos 30 días:<div class="rows">
        <div class="r r-pay"><span>Corralón del Sur<small>Última compra hace 42 días · Valeria</small></span><b>$U 64 mil</b><span class="tag t-warn">Visitar</span></div>
        <div class="r r-pay"><span>Ferretería La Unión<small>Hace 35 días · Gonzalo</small></span><b>$U 29 mil</b><span class="tag t-warn">Llamar</span></div>
        <div class="r r-pay"><span>Sanitaria Norte<small>Hace 33 días · Paula</small></span><b>$U 18 mil</b><span class="tag t-warn">Llamar</span></div></div>` },
    { q: '¿Qué producto subió más de costo?', a: 'La válvula esférica 1/2" de Fundición Oriental: pasó de $U 298 a $U 325 (+9 %). Lo detectó Tildalo al leer la última factura y quedó marcada para revisar antes del pago del miércoles.' },
    { q: '¿Cuánto vendió Valeria esta semana?', a: 'Valeria Fernández vendió $U 486 mil esta semana en 31 pedidos: 18 los tomó en la calle con Libreta y 13 entraron por WhatsApp con Encargue. Va al 112 % de su objetivo del mes.' },
  ];
  let askIndex = 0;

  const VIEWS = {
    inicio: { title: 'Inicio', html: () => `${head('Así está tu negocio hoy', 'Resumen de todas las áreas, actualizado en tiempo real.', 'Este mes')}
      <div class="kpis">${kpi('Ventas del mes', '$U 4,82 M', '▲ 6,4 % vs. mes anterior', 'up', true)}${kpi('Pedidos de hoy', '46', '▲ 8 vs. ayer')}${kpi('Por cobrar vencido', '$U 312 mil', '▼ 4,1 % este mes')}${kpi('Entregas a tiempo', '94 %', '▲ 2 puntos')}</div>
      <div class="panels">
        <div class="panel"><h5>Ventas por semana <small>Últimas 8 semanas</small></h5>${bars([52, 61, 58, 66, 63, 72, 69, 84], 7)}<div class="bars-x">${['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'].map(s => `<span>${s}</span>`).join('')}</div></div>
        <div class="panel"><h5>Aplicaciones conectadas <small>Hace 1 min</small></h5><div class="rows">
          <div class="r r-app"><span class="ai">${icon('i-tildalo')}</span><span>Tildalo<small>128 facturas este mes</small></span><span class="status"><i></i>Conectada</span></div>
          <div class="r r-app"><span class="ai">${icon('i-rondin')}</span><span>Rondín<small>39 entregas hoy</small></span><span class="status"><i></i>Conectada</span></div>
          <div class="r r-app"><span class="ai">${icon('i-encargue')}</span><span>Encargue<small>46 pedidos hoy</small></span><span class="status"><i></i>Conectada</span></div>
          <div class="r r-app"><span class="ai">${icon('i-libreta')}</span><span>Libreta<small>9 vendedores en calle</small></span><span class="status"><i></i>Conectada</span></div>
        </div></div>
      </div>${tag}` },
    comercial: { title: 'Comercial', html: () => `${head('Comercial', 'Ventas, vendedores y oportunidades del día.', 'Este mes')}
      <div class="kpis k3">${kpi('Cumplimiento del objetivo', '87 %', 'Faltan 9 días hábiles', 'up', true)}${kpi('Clientes con compra', '412', '▲ 23 vs. mes anterior')}${kpi('Ticket promedio', '$U 11.700', '▲ 3,2 %')}</div>
      <div class="panels">
        <div class="panel"><h5>Vendedores <small>Avance del objetivo</small></h5><div class="rows">
          ${[['VF', 'Valeria Fernández', 'Centro', 112], ['GR', 'Gonzalo Rodríguez', 'Este', 96], ['PM', 'Paula Méndez', 'Costa', 88], ['MS', 'Martín Silva', 'Oeste', 71]].map(([ini, name, zone, pct]) => `<div class="r r-seller"><span class="avatar" style="width:26px;height:26px;font-size:9.5px">${ini}</span><span>${name}<small>Zona ${zone}</small></span><span class="prog${pct > 100 ? ' over' : ''}"><i data-w="${Math.min(pct, 100)}%"></i></span><b>${pct} %</b></div>`).join('')}
        </div></div>
        <div class="panel"><h5>Oportunidades de hoy <small>Por monto</small></h5><div class="rows">
          <div class="r r-opp"><span class="tag t-warn">Reactivar</span><span>Corralón del Sur<small>Sin compras hace 42 días</small></span><b>$U 64 mil</b></div>
          <div class="r r-opp"><span class="tag t-ok">Reposición</span><span>Sanitaria Oeste<small>Compra cada 15 días: le toca hoy</small></span><b>$U 38 mil</b></div>
          <div class="r r-opp"><span class="tag t-red">Cobrar</span><span>Pinturas Cordón<small>Factura vencida hace 12 días</small></span><b>$U 21 mil</b></div>
        </div></div>
      </div>${tag}` },
    operaciones: { title: 'Operaciones', html: () => `${head('Operaciones', 'Qué comprar, cuánto y a quién.', 'Hoy')}
      <div class="kpis k3">${kpi('Compras sugeridas', '4 productos', 'Antes de quedarte sin stock', 'up', true)}${kpi('Órdenes por aprobar', '3', '$U 286 mil en total', '')}${kpi('Proveedores a tiempo', '91 %', '▲ 3 puntos')}</div>
      <div class="panels one"><div class="panel"><h5>Necesidades de compra <small>Cobertura de stock vs. plazo del proveedor</small></h5><div class="rows">
        <div class="r r-buy r-head"><span>Producto</span><span>Cobertura</span><span>Pedir</span><span>Proveedor</span></div>
        <div class="r r-buy"><span>Tanque tricapa 1.000 L</span><span><span class="tag t-red">4 días</span></span><b>18 u</b><span>Tanques del Este</span></div>
        <div class="r r-buy"><span>Caño PVC 110 mm</span><span><span class="tag t-warn">6 días</span></span><b>240 u</b><span>Termoplásticos del Plata</span></div>
        <div class="r r-buy"><span>Válvula esférica 1/2"</span><span><span class="tag t-warn">9 días</span></span><b>120 u</b><span>Fundición Oriental</span></div>
        <div class="r r-buy"><span>Pegamento PVC 250 cc</span><span><span class="tag">12 días</span></span><b>60 u</b><span>Selladores del Plata</span></div>
      </div></div></div>${tag}` },
    administracion: { title: 'Administración', html: () => `${head('Administración', 'Cuentas por cobrar, pagos y conciliación.', 'Este mes')}
      <div class="kpis k3">${kpi('Por cobrar', '$U 2,94 M', '62 % al día', 'up', true)}${kpi('Pagos de la semana', '$U 1,21 M', '14 pagos a proveedores', '')}${kpi('Conciliación bancaria', '96 %', '3 movimientos por revisar', '')}</div>
      <div class="panels">
        <div class="panel"><h5>Antigüedad de la deuda <small>Clientes</small></h5>
          <div class="aging"><i style="width:62%;background:var(--selva)"></i><i style="width:21%;background:var(--arena)"></i><i style="width:11%;background:#C9A14A"></i><i style="width:6%;background:var(--alerta)"></i></div>
          <div class="legend"><span><i style="background:var(--selva)"></i>Al día<b>$U 1,82 M</b></span><span><i style="background:var(--arena)"></i>1 a 30 días<b>$U 617 mil</b></span><span><i style="background:#C9A14A"></i>31 a 60 días<b>$U 323 mil</b></span><span><i style="background:var(--alerta)"></i>Más de 60<b>$U 176 mil</b></span></div>
        </div>
        <div class="panel"><h5>Próximos pagos <small>Esta semana</small></h5><div class="rows">
          <div class="r r-pay"><span>Termoplásticos del Plata<small>Vence el martes</small></span><b>$U 412 mil</b><span class="tag t-ok">Aprobado</span></div>
          <div class="r r-pay"><span>Fundición Oriental<small>Vence el miércoles · Tildalo marcó un aumento</small></span><b>$U 268 mil</b><span class="tag t-warn">Revisar</span></div>
          <div class="r r-pay"><span>Tanques del Este<small>Vence el viernes</small></span><b>$U 197 mil</b><span class="tag">Pendiente</span></div>
        </div></div>
      </div>${tag}` },
    finanzas: { title: 'Finanzas', html: () => `${head('Finanzas', 'Flujo de caja de las próximas semanas.', 'Próximas 6 semanas')}
      <div class="kpis k3">${kpi('Saldo en bancos', '$U 3,46 M', 'Hoy', 'up', true)}${kpi('Ingresos proyectados', '$U 9,8 M', 'Cobranzas y ventas', '')}${kpi('Egresos proyectados', '$U 8,1 M', 'Proveedores, sueldos e impuestos', '')}</div>
      <div class="panels one"><div class="panel"><h5>Ingresos y egresos por semana <small>Proyección</small></h5>
        <div class="bars bars-pairs">${[[72, 58], [64, 70], [80, 61], [69, 52], [77, 66], [86, 60]].map(([a, b], k) => `<span><i class="hl" data-h="${a}%" style="--k:${k * 2}"></i><i class="out" data-h="${b}%" style="--k:${k * 2 + 1}"></i></span>`).join('')}</div>
        <div class="bars-x">${['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(s => `<span>${s}</span>`).join('')}</div>
        <div class="legend" style="margin-top:14px"><span><i style="background:var(--selva)"></i>Ingresos</span><span><i style="background:rgba(176,75,58,.35)"></i>Egresos</span></div>
      </div></div>${tag}` },
    asistente: { title: 'Asistente', html: () => {
      const current = ANSWERS[askIndex];
      const others = ANSWERS.map((item, k) => k === askIndex ? '' : `<button type="button" data-ask="${k}">${item.q}</button>`).join('');
      return `${head('Asistente', 'Preguntale a tu negocio. Responde con los datos de tu empresa.')}
        <div class="ask"><div class="ask-q">${current.q}</div><div class="ask-a">${current.a}</div><div class="ask-sugs">${others}</div></div>
        <span class="demo-tag">Respuestas de ejemplo</span>`;
    } },
  };

  let seen = false;
  function grow() {
    if (!seen) return;
    $$('[data-h]', view).forEach(bar => { bar.style.height = bar.dataset.h; });
    $$('[data-w]', view).forEach(bar => { bar.style.width = bar.dataset.w; });
  }
  function render(key) {
    const item = VIEWS[key];
    if (!item) return;
    tabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.view === key)));
    crumb.textContent = item.title;
    view.classList.add('is-swapping');
    setTimeout(() => {
      view.innerHTML = item.html();
      view.classList.remove('is-swapping');
      $$('[data-ask]', view).forEach(button => button.addEventListener('click', () => { askIndex = Number(button.dataset.ask); render('asistente'); }));
      nextFrame(grow);
    }, reduced ? 0 : 200);
  }

  tabs.forEach(tab => tab.addEventListener('click', () => render(tab.dataset.view)));
  search.addEventListener('click', () => render('asistente'));
  view.innerHTML = VIEWS.inicio.html();

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      seen = true;
      grow();
      io.disconnect();
    }, { threshold: 0.25 });
    io.observe(app);
  } else { seen = true; grow(); }
}

/* --------------------------------------------------------- 03 · Soluciones */
function initSolutions() {
  const items = $$('.sol-item');
  const stage = $('#solStage');
  const side = $('.sol-side');
  if (!items.length || !stage) return;
  const shots = $$('.shot', stage);
  const wide = matchMedia('(min-width: 1024px)');
  let active = Math.max(0, items.findIndex(item => item.classList.contains('is-on')));
  let shown = false;

  // En pantallas anchas la vista previa vive a la derecha; en el celular,
  // dentro de la aplicación abierta.
  function place() {
    const host = wide.matches ? side : $('.sol-inner', items[active]);
    if (host && stage.parentElement !== host) host.append(stage);
  }
  function play(shot) {
    shot.classList.remove('is-play');
    if (!shown) return;
    void shot.offsetWidth;
    shot.classList.add('is-play');
  }
  function select(i) {
    active = i;
    items.forEach((item, k) => {
      const on = k === i;
      item.classList.toggle('is-on', on);
      $('.sol-btn', item).setAttribute('aria-expanded', String(on));
    });
    const key = items[i].dataset.sol;
    shots.forEach(shot => {
      const on = shot.dataset.shot === key;
      shot.classList.toggle('is-on', on);
      shot.setAttribute('aria-hidden', String(!on));
      if (on) play(shot); else shot.classList.remove('is-play');
    });
    place();
  }

  items.forEach((item, k) => $('.sol-btn', item).addEventListener('click', () => select(k)));
  wide.addEventListener('change', place);
  $$('[data-sol-link]').forEach(link => link.addEventListener('click', () => {
    const k = items.findIndex(item => item.dataset.sol === link.dataset.solLink);
    if (k >= 0) select(k);
  }));
  place();

  const reveal = () => { shown = true; const on = shots.find(shot => shot.classList.contains('is-on')); if (on) play(on); };
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      reveal();
      io.disconnect();
    }, { threshold: 0.3 });
    io.observe(stage);
  } else reveal();
}

/* ---------------------------------------- 03 · Un pedido, de punta a punta */
function initChain() {
  const chain = $('#chain');
  if (!chain) return;
  const run = () => {
    chain.classList.add('is-reset');
    chain.classList.remove('is-on');
    void chain.offsetWidth;
    chain.classList.remove('is-reset');
    chain.classList.add('is-on');
  };
  $('.chain-replay')?.addEventListener('click', run);
  if (reduced || !('IntersectionObserver' in window)) { chain.classList.add('is-on'); return; }
  const io = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    run();
    io.disconnect();
  }, { threshold: 0.5 });
  io.observe(chain);
}

/* -------------------------------------------------- 05 · Forma de trabajar */
function initFlow() {
  const flow = $('#flow');
  if (!flow) return;
  if (reduced || !('IntersectionObserver' in window)) { flow.classList.add('is-in'); return; }
  const io = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    flow.classList.add('is-in');
    io.disconnect();
  }, { threshold: 0.3 });
  io.observe(flow);
}

/* --------------------------------------------- 04 · Demo de Mundipack */
function initDemo() {
  const mount = $('#mpMount');
  if (!mount) return;
  const load = () => import('./mundipack-demo.js')
    .then(({ createMundipackDemo }) => mount.replaceChildren(createMundipackDemo()))
    .catch(error => console.warn('[demo]', error));
  if (!('IntersectionObserver' in window)) { load(); return; }
  const io = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    io.disconnect();
    load();
  }, { rootMargin: '900px 0px' });
  io.observe(mount);
}
