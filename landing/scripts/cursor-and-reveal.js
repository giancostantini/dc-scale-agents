// Cursor custom (estilo Xpider) + reveal por palabras al scroll.
// Ambos comportamientos son puramente estéticos: si algo falla,
// la landing sigue funcionando y solo se pierden estos efectos.

(function initCursor() {
  const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isTouch || reduced) return;

  const dot = document.createElement('div');
  dot.className = 'dc-cursor-dot';
  const ring = document.createElement('div');
  ring.className = 'dc-cursor-ring';
  document.body.append(dot, ring);

  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let ringX = targetX;
  let ringY = targetY;

  document.addEventListener('mousemove', (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
    // El dot va exacto al mouse (sin lag)
    dot.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) translate(-50%, -50%)`;
  }, { passive: true });

  function tick() {
    // Lerp del ring para que sea más suave
    ringX += (targetX - ringX) * 0.18;
    ringY += (targetY - ringY) * 0.18;
    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(tick);
  }
  tick();

  // Hover state en interactivos
  const HOVER_SEL = 'a, button, [role="button"], input, textarea, select, .book-btn, .book, .brand-marquee img';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest && e.target.closest(HOVER_SEL)) ring.classList.add('is-hover');
  }, { passive: true });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest(HOVER_SEL)) ring.classList.remove('is-hover');
  }, { passive: true });

  // Ocultar cuando el mouse sale de la ventana
  document.addEventListener('mouseleave', () => { dot.style.opacity = '0'; ring.style.opacity = '0'; });
  document.addEventListener('mouseenter', () => { dot.style.opacity = '1'; ring.style.opacity = '1'; });
})();

(function initManifestoReveal() {
  const headline = document.querySelector('[data-reveal-words]');
  if (!headline) return;
  const words = [...headline.querySelectorAll('.mw')];
  if (!words.length) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    words.forEach(w => w.classList.add('is-revealed'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      // Reveal escalonado: cada palabra ~70ms después de la anterior.
      words.forEach((w, i) => {
        setTimeout(() => w.classList.add('is-revealed'), i * 70);
      });
      io.disconnect();
    }
  }, { threshold: 0.35 });

  io.observe(headline);
})();
