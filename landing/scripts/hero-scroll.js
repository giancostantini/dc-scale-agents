const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function initHeroScroll(header) {
  const hero = document.querySelector('.entry-hero');
  const stage = hero?.querySelector('.hero-stage');
  if (!hero || !stage) return;
  const mode = matchMedia('(prefers-reduced-motion: no-preference)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0;
  let start = 0;
  let distance = 1;
  let pageDistance = 1;
  let lastProgress = -1;
  let previousHeaderState;
  let lastPageProgress = -1;
  let inView = true;
  let lastTime = 0;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const entrance = [];

  function finishEntrance() {
    entrance.forEach(animation => animation.cancel());
    entrance.length = 0;
  }

  function enter() {
    if (!mode.matches || scrollY > 24 || (location.hash && location.hash !== '#top') || !hero.animate) return;
    hero.querySelectorAll('.hero-line-inner').forEach((line, index) => {
      entrance.push(line.animate([
        { transform: 'translate3d(0,110%,0) rotate(2deg)', opacity: 0, filter: 'blur(5px)' },
        { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1, filter: 'blur(0px)' }
      ], { duration: 900, delay: index * 110, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    });
    hero.querySelectorAll('.entry-intro, .entry-actions, .hero-scroll-cue').forEach((element, index) => {
      entrance.push(element.animate([
        { opacity: 0, transform: 'translate3d(0,20px,0)' },
        { opacity: 1, transform: 'translate3d(0,0,0)' }
      ], { duration: 650, delay: 280 + index * 100, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'backwards' }));
    });
    const accent = hero.querySelector('.hero-line-accent .hero-line-inner');
    if (accent) entrance.push(accent.animate([
      { backgroundPosition: '110% 50%' }, { backgroundPosition: '-10% 50%' }
    ], { duration: 1400, delay: 450, easing: 'ease-in-out' }));
  }

  function measure() {
    // Read geometry only after layout changes, never for each animation write.
    start = hero.getBoundingClientRect().top + scrollY;
    // Fade while the first screen gives way to the logos, including on mobile.
    distance = Math.max(1, stage.offsetHeight * .95);
    pageDistance = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    lastProgress = -1;
    schedule();
  }
  function paint(time) {
    frame = 0;
    const pageProgress = clamp(scrollY / pageDistance).toFixed(4);
    if (pageProgress !== lastPageProgress) {
      header.style.setProperty('--page-progress', pageProgress);
      lastPageProgress = pageProgress;
    }
    const scrolled = scrollY > 20;
    if (scrolled !== previousHeaderState) {
      header.classList.toggle('is-scrolled', scrolled);
      previousHeaderState = scrolled;
    }
    if (!mode.matches) return;
    if (scrollY > 24 && entrance.length) finishEntrance();
    const progress = clamp((scrollY - start) / distance);
    if (progress !== lastProgress) {
      lastProgress = progress;
      hero.style.setProperty('--hero-depth', ease(progress).toFixed(4));
      hero.style.setProperty('--hero-fade', ease((progress - .08) / .84).toFixed(4));
      hero.style.setProperty('--hero-support-fade', ease(progress / .82).toFixed(4));
      // Fully faded controls must no longer receive clicks or keyboard focus.
      hero.style.setProperty('--hero-controls-visibility', progress >= .82 ? 'hidden' : 'visible');
    }
    // Only the pointer's short settling movement needs consecutive JS frames.
    if (!inView || !finePointer.matches) { lastTime = 0; return; }
    const delta = lastTime ? Math.min(time - lastTime, 40) : 16;
    lastTime = time;
    const blend = 1 - Math.exp(-delta / 110);
    pointer.x += (pointer.targetX - pointer.x) * blend;
    pointer.y += (pointer.targetY - pointer.y) * blend;
    const settling = Math.abs(pointer.targetX - pointer.x) + Math.abs(pointer.targetY - pointer.y) > .002;
    if (!settling) { pointer.x = pointer.targetX; pointer.y = pointer.targetY; lastTime = 0; }
    hero.style.setProperty('--hero-pointer-x', pointer.x.toFixed(4));
    hero.style.setProperty('--hero-pointer-y', pointer.y.toFixed(4));
    if (settling) schedule();
  }
  function schedule() { if (!frame && !document.hidden) frame = requestAnimationFrame(paint); }
  function resetPointer() {
    pointer.targetX = 0;
    pointer.targetY = 0;
    schedule();
  }
  function updateActivity() {
    const active = mode.matches && inView && !document.hidden;
    hero.classList.toggle('is-atmosphere-active', active);
    if (!active) { resetPointer(); lastTime = 0; }
    if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; }
    if (!document.hidden) schedule();
  }
  function updateMode() {
    hero.classList.toggle('is-scroll-scene', mode.matches);
    if (!mode.matches) {
      hero.style.removeProperty('--hero-fade');
      hero.style.removeProperty('--hero-support-fade');
      hero.style.removeProperty('--hero-controls-visibility');
      hero.style.removeProperty('--hero-depth');
      hero.style.removeProperty('--hero-pointer-x');
      hero.style.removeProperty('--hero-pointer-y');
      pointer.x = pointer.y = pointer.targetX = pointer.targetY = 0;
      finishEntrance();
    }
    updateActivity();
    measure();
  }
  stage.addEventListener('pointermove', event => {
    if (!mode.matches || !finePointer.matches || !inView || event.pointerType === 'touch') return;
    pointer.targetX = (event.clientX / innerWidth - .5) * 2;
    pointer.targetY = (event.clientY / innerHeight - .5) * 2;
    schedule();
  }, { passive: true });
  stage.addEventListener('pointerleave', resetPointer);
  hero.addEventListener('focusin', finishEntrance);
  finePointer.addEventListener('change', () => {
    pointer.x = pointer.y = 0;
    hero.style.removeProperty('--hero-pointer-x');
    hero.style.removeProperty('--hero-pointer-y');
    resetPointer();
  });
  document.addEventListener('visibilitychange', updateActivity);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateActivity();
    }).observe(stage);
  }
  mode.addEventListener('change', updateMode);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('pageshow', measure);
  document.fonts?.ready.then(measure);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(document.body);
  }
  updateMode();
  enter();
}
