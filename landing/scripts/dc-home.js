// Home de D&C · Tecnología Empresarial.
// Header, apariciones al hacer scroll, escenario animado del hero, socios
// estratégicos, Business Hub real embebido, aplicaciones, recorrido de un
// pedido, forma de trabajar, inversiones y la demo de Mundipack.

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
initStage();
initMarquee();
initHubEmbed();
initSolutions();
initChain();
initFlow();
initClients();

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
    matchMedia('(min-width: 1360px)').addEventListener('change', ({ matches }) => { if (matches && menu.open) menu.close(); });
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

/* ------------------------------------------ Hero: escenario */
// El texto de la izquierda queda fijo. A la derecha, como en el hero de
// Globant, el Hub aparece en 3D, se abre en las cuatro aplicaciones y
// después pasa cada una con su celular y lo que logra.
function initStage() {
  const hero = $('#top');
  const stage = $('#stage');
  if (!hero || !stage) return;
  nextFrame(() => hero.classList.add('is-ready'));
  const scenes = $$('.sc', stage);
  const bars = $$('.sb', hero);
  const DURATION = [5600, 4800, 5600, 5200, 5200, 5200];
  let current = 0, elapsed = 0, visible = true, hover = false, running = false, last = 0;

  function mark() {
    scenes.forEach((scene, k) => { const on = k === current; scene.setAttribute('aria-hidden', String(!on)); scene.inert = !on; });
    bars.forEach((bar, k) => { bar.classList.toggle('is-on', k === current); bar.style.setProperty('--p', k < current || (k === current && reduced) ? 1 : 0); });
    $$('img[loading="lazy"]', scenes[(current + 1) % scenes.length]).forEach(img => { img.loading = 'eager'; });
  }
  function enter(scene) {
    scene.classList.remove('is-out', 'is-on');
    void scene.offsetWidth;
    scene.classList.add('is-on');
  }
  function go(i) {
    const n = scenes.length;
    const next = (i + n) % n;
    elapsed = 0;
    if (next === current) { mark(); return; }
    const prev = scenes[current];
    prev.classList.remove('is-on');
    prev.classList.add('is-out');
    setTimeout(() => prev.classList.remove('is-out'), 950);
    current = next;
    enter(scenes[current]);
    mark();
  }

  const paused = () => hover || document.hidden || !visible || reduced;
  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    if (!paused()) {
      elapsed += dt;
      const k = Math.min(1, elapsed / DURATION[current]);
      bars[current].style.setProperty('--p', k);
      if (k >= 1) go(current + 1);
    }
    if (visible) requestAnimationFrame(frame); else running = false;
  }
  function run() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }

  bars.forEach((bar, i) => bar.addEventListener('click', () => go(i)));
  stage.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hover = true; });
  stage.addEventListener('pointerleave', () => { hover = false; });
  stage.addEventListener('focusin', () => { hover = true; });
  stage.addEventListener('focusout', () => { hover = false; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) run(); }, { threshold: 0.2 }).observe(hero);
  }
  mark();
  if (reduced) return;
  // La primera escena también entra con movimiento.
  scenes[0].classList.remove('is-on');
  setTimeout(() => { enter(scenes[0]); run(); }, 450);
}

/* ------------------------------------------- Socios estratégicos */
// Repite los logos hasta llenar el ancho y los desplaza en un loop continuo.
function initMarquee() {
  const marquee = $('.marquee');
  if (!marquee) return;
  const track = $('.marquee-track', marquee);
  const group = $('.marquee-group', track);
  const originals = [...group.children];
  function fill() {
    $$('.marquee-group.is-clone', track).forEach(node => node.remove());
    $$('[data-clone]', group).forEach(node => node.remove());
    let guard = 0;
    while (group.scrollWidth < marquee.clientWidth && guard++ < 12) {
      originals.forEach(item => {
        const copy = item.cloneNode(true);
        copy.dataset.clone = '';
        copy.setAttribute('aria-hidden', 'true');
        group.append(copy);
      });
    }
    const twin = group.cloneNode(true);
    twin.classList.add('is-clone');
    twin.setAttribute('aria-hidden', 'true');
    track.append(twin);
    track.style.setProperty('--dur', `${Math.max(20, Math.round(group.scrollWidth / 40))}s`);
  }
  fill();
  if ('ResizeObserver' in window) {
    let width = marquee.clientWidth, timer = 0;
    new ResizeObserver(() => {
      if (Math.abs(marquee.clientWidth - width) < 40) return;
      width = marquee.clientWidth;
      clearTimeout(timer);
      timer = setTimeout(fill, 150);
    }).observe(marquee);
  }
}

/* --------------------------------------------- 02 · Business Hub real */
// Muestra el prototipo del Hub dentro de un marco, escalado al ancho de la
// página. En el celular queda la captura y un botón para abrirlo completo.
function initHubEmbed() {
  const viewport = $('.hub-viewport');
  if (!viewport) return;
  const frame = $('iframe', viewport);
  const fit = () => viewport.style.setProperty('--s', (viewport.clientWidth / 1440).toFixed(4));
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(viewport);
  else addEventListener('resize', fit);
  const wide = matchMedia('(min-width: 760px)');
  const load = () => {
    if (!wide.matches || frame.getAttribute('src')) return;
    frame.addEventListener('load', () => { viewport.classList.add('is-live'); frame.removeAttribute('tabindex'); }, { once: true });
    frame.src = frame.dataset.src;
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      io.disconnect();
      load();
    }, { rootMargin: '700px 0px' });
    io.observe(viewport);
  } else load();
  wide.addEventListener('change', () => { if (wide.matches) load(); });
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
      if (on) shot.removeAttribute('tabindex'); else shot.setAttribute('tabindex', '-1');
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

/* ---------------------------------- 05 y 06 · Forma de trabajar e inversiones */
function initFlow() {
  const flows = $$('.flow');
  if (!flows.length) return;
  if (reduced || !('IntersectionObserver' in window)) { flows.forEach(flow => flow.classList.add('is-in')); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.3 });
  flows.forEach(flow => io.observe(flow));
}

/* ------------------------------------------ 04 · Clientes y demo */
// La recreación del sistema de Mundipack se abre y se carga a pedido.
function initClients() {
  const toggle = $('[data-demo-toggle]');
  const shell = $('#mpShell');
  const mount = $('#mpMount');
  if (!toggle || !shell || !mount) return;
  let loaded = false;
  toggle.addEventListener('click', () => {
    const open = shell.hidden;
    shell.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    $('.lbl', toggle).textContent = open ? 'Ocultar la recreación' : 'Recorrer una recreación del sistema';
    if (!open) return;
    if (!loaded) {
      loaded = true;
      import('./mundipack-demo.js')
        .then(({ createMundipackDemo }) => mount.replaceChildren(createMundipackDemo()))
        .catch(error => { loaded = false; console.warn('[demo]', error); });
    }
    shell.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  });
}
