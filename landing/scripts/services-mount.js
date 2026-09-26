// Monta las demos de la sección "Nuestros servicios".
// Reemplaza el rol que antes tenía showcase.js, sin dependencias del framework
// de tabs. Cada bloque de servicio tiene un contenedor propio (#mp-mount para
// Mundipack, #gd-mount para el Growth Deck) donde inyectamos el elemento
// devuelto por su factory. Si la factory falla por cualquier razón, dejamos
// el fallback estático que ya está en el HTML.
import { createMundipackDemo } from './mundipack-demo.js';
import { createGrowthDeck } from './growth-deck.js';
import { solutions } from '../content/solutions.js';

function mount(id, factory) {
  const host = document.getElementById(id);
  if (!host) return;
  try {
    const el = factory();
    if (!el) return;
    host.replaceChildren(el);
  } catch (err) {
    console.warn(`[services-mount] no se pudo montar ${id}:`, err);
  }
}

// Mundipack: la factory ya construye todo desde su propio dataset interno.
mount('mp-mount', () => createMundipackDemo());

// Growth Deck: necesita el array de accounts. Vive dentro del objeto
// "growth" en content/solutions.js, así que lo leemos de ahí para no
// duplicar datos.
const growth = solutions.find((s) => s.id === 'growth');
const accounts = growth?.media?.accounts;
if (accounts && accounts.length) {
  mount('gd-mount', () => createGrowthDeck(accounts));
}
