// Movimiento de la página (fuera del hero, que tiene su propia escena).
//
// Todo va atado al scroll y en los dos sentidos, estilo Apple: cada bloque
// aparece mientras entra por abajo (--e 0→1) y se va mientras sale por
// arriba (--x 0→1). Al volver a subir, vuelve a aparecer. Sin JS, con la
// pestaña oculta o con movimiento reducido, todo queda visible (las
// variables sin valor valen "visible" en el CSS).
export function initPageMotion() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const selectors = '.concept .label, .concept h2, .concept .lead, .concept-quote, .statement-eyebrow, .statement-text, .statement-inner > .book-btn, .solutions-heading > *, .solution-tabs, .cases-intro-simple > *, .case, .valor, .partner, .firm-card, .partners-label, main > section > .label, main > section > h2, main > section > .lead, .skin-eyebrow, .skin-headline, .skin-question, .skin-inner > p, .skin-explain-item, .skin-cta-row, .inline-cta, .faq-item, .cta-final-inner > *, .foot-newsletter, .foot-grid > *';
  const targets = [...document.querySelectorAll(selectors)];
  targets.forEach(target => {
    target.dataset.enter = target.matches('h2') ? 'heading' : target.matches('.case,.valor,.partner,.skin-explain-item,.firm-card') ? 'card' : 'body';
  });
  document.documentElement.classList.add('has-page-motion');

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  // Glows de secciones oscuras: parallax suave.
  const scenes = [...document.querySelectorAll('.statement-section,.cta-final')].map(section => ({ section, glow: section.querySelector('[data-parallax]') }));
  // Escenas de producto (Soluciones): el mockup entra con escala e inclinación
  // y queda plano y nítido al completarse.
  const reveals = () => [...document.querySelectorAll('[data-reveal-scene]')].filter(el => el.offsetParent);

  let frame = 0;
  function paint() {
    frame = 0;
    if (reduced.matches || document.hidden) return;
    const vh = innerHeight;
    const small = innerWidth < 600;
    // Hermanos que entran juntos se escalonan un poco (no toda una grilla).
    const siblings = new Map();
    targets.forEach(el => {
      const r = el.getBoundingClientRect();
      // Lejos de la pantalla no hay nada que animar: se deja como está.
      if (r.top > vh * 1.3 || r.bottom < -vh * .3) return;
      const n = siblings.get(el.parentElement) || 0;
      siblings.set(el.parentElement, n + 1);
      const lag = Math.min(n, 3) * vh * .035;
      const enter = clamp((vh - r.top - lag) / (vh * (small ? .22 : .3)), 0, 1);
      const exit = clamp((vh * .22 - r.bottom) / (vh * .22), 0, 1);
      el.style.setProperty('--e', enter.toFixed(3));
      el.style.setProperty('--x', exit.toFixed(3));
    });
    scenes.forEach(({ section, glow }) => {
      if (!glow) return;
      const r = section.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const distance = r.top + r.height / 2 - vh / 2;
      const amplitude = small ? 24 : 60;
      glow.style.setProperty('--ambient-y', `${clamp(-distance * .12, -amplitude, amplitude).toFixed(1)}px`);
    });
    const wide = innerWidth >= 1000;
    reveals().forEach(el => {
      if (!wide) { el.style.removeProperty('--reveal'); el.classList.add('is-revealed'); return; }
      const p = clamp((vh - el.getBoundingClientRect().top) / (vh * .8), 0, 1);
      el.style.setProperty('--reveal', p.toFixed(3));
      el.classList.toggle('is-revealed', p >= 1);
    });
  }
  function schedule() { if (!frame && !reduced.matches && !document.hidden) frame = requestAnimationFrame(paint); }
  function clearAll() {
    cancelAnimationFrame(frame); frame = 0;
    targets.forEach(el => { el.style.removeProperty('--e'); el.style.removeProperty('--x'); });
    scenes.forEach(({ glow }) => glow?.style.removeProperty('--ambient-y'));
    reveals().forEach(el => { el.style.removeProperty('--reveal'); el.classList.add('is-revealed'); });
  }

  // El foco de teclado siempre muestra el bloque completo.
  document.addEventListener('focusin', event => {
    const target = event.target.closest('[data-enter]');
    if (target) { target.style.setProperty('--e', 1); target.style.setProperty('--x', 0); }
  });
  reduced.addEventListener('change', () => (reduced.matches ? clearAll() : schedule()));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('solution:shown', schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule();
  });
  if (reduced.matches) clearAll(); else schedule();
}
