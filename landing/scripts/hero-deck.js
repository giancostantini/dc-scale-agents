// Hero product deck: rota entre Tildalo, Rondín, Encargue, Libreta.
// Autoplay cada 5s; al clickear un chip o pasar el mouse sobre el deck,
// se pausa. Respeta prefers-reduced-motion.
(function initHeroDeck() {
  const deck = document.getElementById('heroDeck');
  if (!deck) return;

  const cards = [...deck.querySelectorAll('.hd-card')];
  const chips = [...deck.querySelectorAll('.hd-chip')];
  if (!cards.length || !chips.length) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = cards.findIndex(c => c.classList.contains('is-active'));
  if (active < 0) active = 0;

  function show(index) {
    active = ((index % cards.length) + cards.length) % cards.length;
    cards.forEach((c, i) => c.classList.toggle('is-active', i === active));
    chips.forEach((c, i) => {
      c.classList.toggle('is-active', i === active);
      c.setAttribute('aria-selected', i === active ? 'true' : 'false');
    });
  }

  chips.forEach((chip, i) => {
    chip.addEventListener('click', () => {
      show(i);
      pause();
    });
  });

  // Autoplay
  let autoplayId = null;
  function play() {
    if (reduced) return;
    stop();
    autoplayId = setInterval(() => show(active + 1), 5000);
  }
  function stop() {
    if (autoplayId) { clearInterval(autoplayId); autoplayId = null; }
  }
  function pause() {
    stop();
    // Reanudar después de inactividad
    setTimeout(play, 8000);
  }

  deck.addEventListener('mouseenter', stop);
  deck.addEventListener('mouseleave', play);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else play();
  });

  play();
})();

// Count-up: cuando una métrica entra al viewport, anima el número.
// Solo si el formato es puramente numérico (opcional con sufijo % o x).
(function initCountUp() {
  const metrics = [...document.querySelectorAll('.case-metric')];
  if (!metrics.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (const el of metrics) {
    const raw = (el.textContent || '').trim();
    // Match: optional sign, digits, optional decimal, optional suffix (% x ×)
    const m = raw.match(/^([+\-]?)(\d+(?:[.,]\d+)?)(.*)$/);
    if (!m) continue;
    const sign = m[1];
    const num = parseFloat(m[2].replace(',', '.'));
    const suffix = m[3] || '';
    if (!isFinite(num)) continue;
    el.setAttribute('data-count-target', String(num));
    el.setAttribute('data-count-sign', sign);
    el.setAttribute('data-count-suffix', suffix);
    el.dataset.count = '';
    // Estado inicial
    el.textContent = `${sign}0${suffix}`;
  }

  if (reduced) {
    // Mostrar directo sin animar
    metrics.forEach(el => {
      const target = parseFloat(el.getAttribute('data-count-target'));
      if (isFinite(target)) {
        const sign = el.getAttribute('data-count-sign') || '';
        const suffix = el.getAttribute('data-count-suffix') || '';
        const isInt = Number.isInteger(target);
        el.textContent = `${sign}${isInt ? target : target.toFixed(1)}${suffix}`;
      }
    });
    return;
  }

  const animated = new WeakSet();
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || animated.has(entry.target)) continue;
      animated.add(entry.target);
      const el = entry.target;
      const target = parseFloat(el.getAttribute('data-count-target'));
      const sign = el.getAttribute('data-count-sign') || '';
      const suffix = el.getAttribute('data-count-suffix') || '';
      const isInt = Number.isInteger(target);
      const dur = 1200;
      const t0 = performance.now();

      function tick(now) {
        const p = Math.min(1, (now - t0) / dur);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - p, 3);
        const value = target * eased;
        el.textContent = `${sign}${isInt ? Math.round(value) : value.toFixed(1)}${suffix}`;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.5 });

  metrics.forEach(el => { if (el.dataset.count !== undefined) io.observe(el); });
})();
