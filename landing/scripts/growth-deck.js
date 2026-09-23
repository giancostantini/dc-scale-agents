// Cuentas que maneja la firma, como cards superpuestas (teléfonos en abanico).
// Elegir una la trae al frente; las demás quedan detrás, escalonadas.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function createGrowthDeck(accounts) {
  const root = el('div', 'gd');
  const stage = el('div', 'gd-stage');
  const picker = el('div', 'gd-picker');
  picker.setAttribute('role', 'tablist');
  picker.setAttribute('aria-label', 'Elegir cuenta');
  const detail = el('div', 'gd-detail');
  detail.setAttribute('aria-live', 'polite');
  let active = 0;

  const cards = accounts.map((account, i) => {
    const card = el('button', 'gd-card');
    card.type = 'button';
    card.setAttribute('aria-label', `Ver ${account.name}`);
    const phone = el('span', 'gd-phone');
    const img = el('img');
    img.src = account.image;
    img.alt = account.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    phone.append(el('span', 'gd-notch'), img);
    card.append(phone);
    card.addEventListener('click', () => select(i));
    stage.append(card);
    return card;
  });
  const chips = accounts.map((account, i) => {
    const chip = el('button', 'gd-chip');
    chip.type = 'button';
    chip.setAttribute('role', 'tab');
    chip.append(el('strong', '', account.name), el('small', '', account.kind));
    chip.addEventListener('click', () => select(i));
    chip.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      select((i + step + accounts.length) % accounts.length, true);
    });
    picker.append(chip);
    return chip;
  });

  function select(index, focus = false) {
    active = index;
    const n = accounts.length;
    cards.forEach((card, i) => {
      // Posición relativa al activo: 0 al frente, 1 a la derecha, -1 a la izquierda.
      let offset = (i - active + n) % n;
      if (offset > n / 2) offset -= n;
      card.style.setProperty('--offset', offset);
      card.style.setProperty('--depth', Math.abs(offset));
      card.classList.toggle('is-active', offset === 0);
      card.tabIndex = offset === 0 ? -1 : 0;
    });
    chips.forEach((chip, i) => {
      chip.setAttribute('aria-selected', String(i === active));
      chip.tabIndex = i === active ? 0 : -1;
    });
    const account = accounts[active];
    detail.replaceChildren(el('span', 'gd-kind', account.kind), el('p', 'gd-name', account.name), el('p', 'gd-note', account.note));
    if (focus) chips[active].focus({ preventScroll: true });
  }

  root.append(stage, el('div', 'gd-side'));
  root.lastChild.append(picker, detail);
  select(0);
  return root;
}
