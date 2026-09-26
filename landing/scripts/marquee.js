export function initMarquee() {
  const viewport = document.getElementById('brand-marquee');
  if (!viewport) return;
  const track = viewport.querySelector('.brand-track');
  const original = track.querySelector('.brand-group');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // Guardar los items iniciales (antes de duplicar). Los usamos como
  // fuente de verdad si el viewport crece y hay que repopular.
  const baseItems = Array.from(original.children).map(el => el.cloneNode(true));

  // Si hay pocos logos, el "grupo original" puede ser más angosto que
  // el viewport y aparecen huecos visibles cuando la animación hace
  // loop. Duplicamos los items internos hasta cubrir al menos el
  // ancho del viewport (con un colchón de 1.4×). Después clonamos el
  // grupo entero — así el loop sigue siendo exacto (translate -50%).
  function fillOriginal() {
    // Reset al set base
    original.innerHTML = '';
    baseItems.forEach(el => original.appendChild(el.cloneNode(true)));

    // Repetir hasta cubrir viewport
    const targetWidth = viewport.getBoundingClientRect().width * 1.4;
    let safety = 20;
    while (original.getBoundingClientRect().width < targetWidth && safety-- > 0) {
      baseItems.forEach(el => original.appendChild(el.cloneNode(true)));
    }
  }

  fillOriginal();

  const clone = original.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  clone.removeAttribute('aria-label');
  track.append(clone);

  function refreshClone() {
    // Reflejar cualquier cambio del original en el clone.
    clone.innerHTML = original.innerHTML;
  }

  function sync() {
    viewport.classList.toggle('is-ready', !reduced.matches);
    clone.hidden = reduced.matches;
    // Both groups have identical dimensions; translate(-50%) is an exact loop.
    viewport.style.setProperty('--marquee-duration', `${original.getBoundingClientRect().width / 28}s`);
  }
  reduced.addEventListener('change', sync);

  if ('ResizeObserver' in window) {
    // Observamos el viewport: si crece más allá de lo que el original
    // cubre, repopulamos y actualizamos el clone.
    let lastWidth = 0;
    new ResizeObserver(() => {
      const w = viewport.getBoundingClientRect().width;
      if (Math.abs(w - lastWidth) > 40) {
        lastWidth = w;
        fillOriginal();
        refreshClone();
      }
      sync();
    }).observe(viewport);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => viewport.classList.toggle('is-offscreen', !entry.isIntersecting)).observe(viewport);
  }
  document.addEventListener('visibilitychange', () => track.style.animationPlayState = document.hidden ? 'paused' : '');
  sync();
}
