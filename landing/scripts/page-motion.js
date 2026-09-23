export function initPageMotion() {
  if (!('IntersectionObserver' in window)) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const selectors = '.concept .label, .concept h2, .concept .lead, .concept-quote, .statement-eyebrow, .statement-text, .statement-btn, .solutions-heading > *, .cases-intro-simple > *, .case, .valor, .partner, main > section > .label, main > section > h2, main > section > .lead, .skin-eyebrow, .skin-headline, .skin-question, .skin-inner > p, .skin-explain-item, .skin-cta-row, .inline-cta, .faq-item, .cta-final-inner > *, .foot-newsletter, .foot-grid > *';
  const targets = [...document.querySelectorAll(selectors)];
  const observer = new IntersectionObserver(entries => {
    // Stagger only siblings entering together, never an entire tall grid.
    const groups = new Map();
    entries.filter(entry => entry.isIntersecting).forEach(({ target }) => {
      const n = groups.get(target.parentElement) || 0;
      groups.set(target.parentElement, n + 1);
      target.style.setProperty('--enter-delay', `${Math.min(n, 3) * 90}ms`);
      target.classList.add('is-entered');
      observer.unobserve(target);
    });
  }, { rootMargin: '0px 0px -32px 0px', threshold: 0 });
  targets.forEach(target => {
    target.dataset.enter = target.matches('h2') ? 'heading' : target.matches('.case,.valor,.partner,.skin-explain-item') ? 'card' : 'body';
    if (target.getBoundingClientRect().top < innerHeight || reduced.matches) target.classList.add('is-entered');
    else observer.observe(target);
  });
  document.documentElement.classList.add('has-page-motion');
  document.addEventListener('focusin', event => {
    const target = event.target.closest('[data-enter]');
    if (target) { target.classList.add('is-entered'); observer.unobserve(target); }
  });
  const scenes = [...document.querySelectorAll('.statement-section,.cta-final')].map(section => ({ section, glow: section.querySelector('[data-parallax]'), start: 0, height: 0 }));
  const active = new Set();
  let frame = 0;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  // Escenas de producto: el mockup entra con escala, inclinación y opacidad
  // atadas al scroll (--reveal 0→1) y queda quieto y usable al terminar.
  const reveals = () => [...document.querySelectorAll('[data-reveal-scene]')].filter(el => el.offsetParent);
  function paintReveals() {
    const wide = innerWidth >= 1000;
    reveals().forEach(el => {
      if (!wide) { el.style.removeProperty('--reveal'); el.classList.add('is-revealed'); return; }
      const top = el.getBoundingClientRect().top;
      const p = clamp((innerHeight - top) / (innerHeight * .8), 0, 1);
      el.style.setProperty('--reveal', p.toFixed(3));
      el.classList.toggle('is-revealed', p >= 1);
    });
  }
  function paint() {
    frame = 0;
    if (reduced.matches || document.hidden) return;
    paintReveals();
    active.forEach(scene => {
      const distance = scene.start + scene.height / 2 - scrollY - innerHeight / 2;
      const amplitude = innerWidth < 600 ? 24 : 60;
      scene.glow?.style.setProperty('--ambient-y', `${clamp(-distance * .12, -amplitude, amplitude).toFixed(1)}px`);
    });
  }
  function schedule() { if (!frame && !reduced.matches && !document.hidden) frame = requestAnimationFrame(paint); }
  function measure() {
    scenes.forEach(scene => { const rect = scene.section.getBoundingClientRect(); scene.start = rect.top + scrollY; scene.height = rect.height; });
    schedule();
  }
  const sceneObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => { const scene = scenes.find(scene => scene.section === entry.target); if (entry.isIntersecting) active.add(scene); else active.delete(scene); });
    schedule();
  });
  scenes.forEach(scene => sceneObserver.observe(scene.section));
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      observer.disconnect();
      targets.forEach(target => target.classList.add('is-entered'));
      scenes.forEach(scene => scene.glow?.style.removeProperty('--ambient-y'));
      reveals().forEach(el => { el.style.removeProperty('--reveal'); el.classList.add('is-revealed'); });
      cancelAnimationFrame(frame); frame = 0;
    } else measure();
  });
  window.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('solution:shown', schedule);
  window.addEventListener('resize', measure, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule();
  });
  document.fonts?.ready.then(measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
  measure();
}
