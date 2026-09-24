import { initHeroScroll } from './hero-scroll.js';
import { initShowcase } from './showcase.js';
import { initMarquee } from './marquee.js';
import { initPageMotion } from './page-motion.js';

const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const desktop = window.matchMedia('(min-width: 1000px)');
const header = document.getElementById('entry-header');
const menu = document.getElementById('entry-menu');
const menuToggle = document.getElementById('entry-menu-toggle');

if (typeof menu.showModal === 'function') {
  header.classList.add('is-enhanced');
  menuToggle.hidden = false;
  menuToggle.addEventListener('click', () => {
    menu.showModal();
    menuToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('entry-menu-open');
  });
  menu.querySelector('.entry-menu-close').addEventListener('click', () => menu.close());
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...menu.querySelectorAll('a[href], button:not([disabled])')].filter(el => el.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  menu.addEventListener('close', () => {
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('entry-menu-open');
  });
  desktop.addEventListener('change', ({ matches }) => {
    if (matches && menu.open) { menu.close(); header.querySelector('.entry-brand').focus(); }
  });
}

document.querySelectorAll('[data-entry-booking]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (menu.open) menu.close();
    if (typeof window.openCalendly === 'function') window.openCalendly(event);
  });
});

document.querySelectorAll('.entry-header a[href^="#"], .entry-menu a[href^="#"], .entry-hero a[href^="#"], .entry-skip').forEach(link => {
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    if (menu.open) menu.close();
    const temporary = !target.hasAttribute('tabindex');
    if (temporary) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    if (temporary) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + scrollY - header.offsetHeight - 18), behavior: motionPreference.matches ? 'instant' : 'smooth' });
    history.replaceState(null, '', link.hash);
  });
});

// The hero owns the single entry scroll frame, including the header state.
initHeroScroll(header);
initShowcase();
initMarquee();
initPageMotion();

if ('IntersectionObserver' in window) {
  const visibility = new Map();
  const entryObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => visibility.set(entry.target, entry.isIntersecting));
    document.body.classList.toggle('entry-first-chapter', [...visibility.values()].some(Boolean));
  });
  document.querySelectorAll('.entry-hero, .solutions-section, .entry-proof').forEach(section => entryObserver.observe(section));
  const links = [...document.querySelectorAll('.entry-nav-links a')];
  const sections = new Map();
  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => sections.set(entry.target.id, entry.isIntersecting));
    const active = links.find(link => sections.get(link.hash.slice(1)));
    links.forEach(link => { if (link === active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
  }, { rootMargin: '-100px 0px -55% 0px', threshold: 0 });
  links.forEach(link => { const target = document.querySelector(link.hash); if (target) spy.observe(target); });
}
