// Monta el growth-deck en la sección "práctica complementaria" (#crecimiento).
// El growth bajó de categoría: dejó de ser tab en el showcase principal y
// pasa a vivir acá, al final de la landing, como línea secundaria.
import { createGrowthDeck } from './growth-deck.js';
import { growthAccounts } from '../content/solutions.js';

const host = document.getElementById('growth-aside-mount');
if (host && growthAccounts && growthAccounts.length) {
  try {
    const el = createGrowthDeck(growthAccounts);
    if (el) host.replaceChildren(el);
  } catch (err) {
    console.warn('[growth-aside-mount]', err);
  }
}
