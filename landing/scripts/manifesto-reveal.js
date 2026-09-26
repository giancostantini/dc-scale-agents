// Reveal por palabras del manifesto al scroll. Cada palabra aparece
// con fade + blur + translate escalonada al entrar en viewport.
// Respeta prefers-reduced-motion.
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
      words.forEach((w, i) => {
        setTimeout(() => w.classList.add('is-revealed'), i * 70);
      });
      io.disconnect();
    }
  }, { threshold: 0.35 });

  io.observe(headline);
})();
