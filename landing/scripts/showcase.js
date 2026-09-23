import { solutions } from '../content/solutions.js';
import { createMundipackDemo } from './mundipack-demo.js';
import { createBrainBillDemo } from './brainbill-demo.js';

const DEMOS = { mundipack: createMundipackDemo, brainbill: createBrainBillDemo };

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function mediaUrl(src) {
  if (!src) return null;
  const url = new URL(src, document.baseURI);
  return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
}

export function initShowcase() {
  const root = document.getElementById('solution-showcase');
  if (!root || !solutions.length) return;
  const tabs = element('div', 'solution-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Explorar soluciones y capacidades');
  const panels = element('div', 'solution-panels');
  const buttons = [];
  const views = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let panelAnimation;

  solutions.forEach((solution, index) => {
    const tab = element('button', 'solution-tab');
    tab.type = 'button';
    tab.id = `solution-tab-${solution.id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `solution-panel-${solution.id}`);
    tab.append(element('span', 'solution-tab-index', `0${index + 1}`), element('span', '', solution.name));
    tabs.append(tab);
    buttons.push(tab);

    const panel = element('div', 'solution-panel');
    panel.id = `solution-panel-${solution.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    const info = element('div', 'solution-info');
    info.append(element('p', 'solution-category', solution.category), element('span', 'solution-status', solution.status), element('h3', 'solution-title', solution.title), element('p', 'solution-description', solution.description));
    const context = element('details', 'solution-context');
    context.append(element('summary', '', 'Sobre esta solución'));
    const facts = element('dl', 'solution-facts');
    for (const [label, value] of [['Para quién', solution.audience], ['El desafío', solution.challenge], ['El trabajo', solution.work], ['Qué permite hacer', solution.outcome]]) {
      const item = element('div', 'solution-fact');
      item.append(element('dt', '', label), element('dd', '', value));
      facts.append(item);
    }
    context.append(facts);
    info.append(context);
    const figure = element('figure', 'solution-figure');
    if (solution.media.type === 'demo') figure.dataset.revealScene = '';
    const stage = element('div', 'solution-media');
    const media = solution.media;
    const url = mediaUrl(media.src);
    if (media.type === 'demo' && DEMOS[media.demo]) {
      panel.classList.add('solution-panel-interactive');
      stage.classList.add('solution-media-interactive');
      stage.append(DEMOS[media.demo]());
    } else if (media.type === 'upcoming') {
      stage.classList.add('solution-upcoming');
      stage.append(element('span', 'solution-preview-label', 'PRODUCTO PROPIO / EN DESARROLLO'), element('p', 'solution-preview-name', solution.name), element('p', 'solution-preview-copy', solution.title), element('span', 'solution-preview-note', solution.status));
    } else if (url && media.type === 'image') {
      const image = element('img');
      image.src = url; image.alt = media.alt || solution.name;
      image.width = media.width || 1600; image.height = media.height || 1000;
      image.loading = 'lazy'; image.decoding = 'async';
      stage.append(image);
    } else if (url && media.type === 'video') {
      const video = element('video');
      video.src = url; video.controls = true; video.preload = 'none'; video.playsInline = true;
      video.width = media.width || 1600; video.height = media.height || 1000;
      video.setAttribute('aria-label', media.alt || solution.name);
      if (mediaUrl(media.poster)) video.poster = mediaUrl(media.poster);
      if (media.captions && mediaUrl(media.captions.src)) {
        const track = element('track');
        track.kind = 'captions'; track.src = mediaUrl(media.captions.src);
        track.srclang = media.captions.language || 'es'; track.label = media.captions.label || 'Español'; track.default = true;
        video.append(track);
      }
      stage.append(video);
    } else {
      stage.classList.add('is-placeholder');
      stage.append(element('span', 'placeholder-index', 'ESTRATEGIA + EJECUCIÓN'));
      const composition = element('div', 'placeholder-composition');
      composition.setAttribute('aria-hidden', 'true');
      composition.append(element('span', 'placeholder-line'), element('span', 'placeholder-line'), element('span', 'placeholder-line'));
      stage.append(composition, element('p', 'placeholder-name', solution.name), element('p', 'placeholder-notice', 'Próximamente: un recorrido por nuestro trabajo digital.'));
    }
    stage.style.setProperty('--media-ratio', `${media.width || 1600} / ${media.height || 1000}`);
    figure.append(stage, element('figcaption', '', media.caption));
    panel.append(info, figure);
    panels.append(panel);
    views.push(panel);
  });

  function select(index, focus = false) {
    panelAnimation?.cancel();
    buttons.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    views.forEach((view, i) => {
      view.hidden = i !== index;
      if (i !== index) view.querySelectorAll('video').forEach(video => video.pause());
    });
    if (focus) buttons[index].focus({ preventScroll: true });
    document.dispatchEvent(new Event('solution:shown'));
    if (!reduced.matches && views[index].animate) panelAnimation = views[index].animate([{ opacity: .55, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 280, easing: 'ease-out' });
  }
  buttons.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next === undefined) return;
      event.preventDefault(); select(next, true);
    });
  });
  root.replaceChildren(tabs, panels);
  select(0);
  reduced.addEventListener('change', () => panelAnimation?.cancel());
}
