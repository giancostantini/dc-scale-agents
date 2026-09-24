export function initMarquee() {
  const viewport = document.getElementById('brand-marquee');
  if (!viewport) return;
  const track = viewport.querySelector('.brand-track');
  const original = track.querySelector('.brand-group');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clone = original.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  clone.removeAttribute('aria-label');
  track.append(clone);

  function sync() {
    viewport.classList.toggle('is-ready', !reduced.matches);
    clone.hidden = reduced.matches;
    // Both groups have identical dimensions; translate(-50%) is an exact loop.
    viewport.style.setProperty('--marquee-duration', `${original.getBoundingClientRect().width / 28}s`);
  }
  reduced.addEventListener('change', sync);
  if ('ResizeObserver' in window) new ResizeObserver(sync).observe(original);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => viewport.classList.toggle('is-offscreen', !entry.isIntersecting)).observe(viewport);
  }
  document.addEventListener('visibilitychange', () => track.style.animationPlayState = document.hidden ? 'paused' : '');
  sync();
}
