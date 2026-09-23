import { documents, destinations, matchMethods, manualMinutesPerLine } from '../content/brainbill-demo.js';

// Demo interactiva de BrainBill: foto / PDF / XML → lectura → validación →
// catálogo → revisión humana → entrega. Todo local y ficticio.

const money = value => new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 }).format(value);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const wait = ms => new Promise(resolve => setTimeout(resolve, reduced.matches ? 0 : ms));

const STEPS = [
  ['load', 'Cargar'],
  ['read', 'Lectura'],
  ['check', 'Validación'],
  ['match', 'Catálogo'],
  ['review', 'Revisión'],
  ['deliver', 'Entrega'],
];
const ICONS = {
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  file: '<path d="M14 3H6v18h12V7l-4-4ZM14 3v4h4M9 13h6M9 17h4"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17.2v.1"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

function totals(doc) {
  const byRate = {};
  let net = 0;
  for (const line of doc.lines) {
    const amount = line.qty * line.price;
    net += amount;
    byRate[line.iva] = (byRate[line.iva] || 0) + amount * line.iva / 100;
  }
  const tax = Object.values(byRate).reduce((a, b) => a + b, 0);
  const total = Math.round(net + tax);
  return { net, byRate, tax, total, printed: total + (doc.printedTotalDelta || 0) };
}

export function createBrainBillDemo() {
  const root = document.createElement('div');
  root.className = 'bb-demo';
  let run = 0; // invalida animaciones viejas al cambiar de factura
  const s = {
    step: 'load', doc: documents[0], readDone: false, checkDone: false,
    margin: 35, choices: {}, acks: new Set(), dest: 'excel', delivery: null, started: 0, seconds: 0,
  };

  root.innerHTML = `<div class="bb-toolbar"><ol class="bb-steps" aria-label="Pasos del recorrido"></ol><span class="bb-label"><span aria-hidden="true">●</span> Demo interactiva · datos ficticios</span></div>
  <div class="bb-window"><div class="bb-window-bar"><span class="bb-dots" aria-hidden="true">● ● ●</span><span>BrainBill / Compras</span><span class="bb-badge">ENTORNO DEMO</span></div>
  <div class="bb-app"><div class="bb-doc" aria-label="Vista previa de la factura de ejemplo" role="img"></div><div class="bb-panel" tabindex="-1"></div></div></div>
  <p class="bb-feedback" role="status" aria-live="polite">Elegí una factura de ejemplo para empezar.</p>`;
  const stepsEl = root.querySelector('.bb-steps');
  const docEl = root.querySelector('.bb-doc');
  const panel = root.querySelector('.bb-panel');
  const say = text => { root.querySelector('.bb-feedback').textContent = text; };
  const stepIndex = id => STEPS.findIndex(([key]) => key === id);

  const lineOk = (line, i) => line.match.method !== 'nombre' || s.choices[i];
  const pendingMatches = () => s.doc.lines.filter((line, i) => !lineOk(line, i)).length;
  const warnings = () => (s.doc.printedTotalDelta ? [{ id: 'total', text: `El total impreso (${money(totals(s.doc).printed)}) difiere en ${money(s.doc.printedTotalDelta)} del calculado. Parece un redondeo del proveedor.` }] : []);
  const canConfirm = () => !pendingMatches() && warnings().every(w => s.acks.has(w.id));

  function renderSteps() {
    const current = stepIndex(s.step);
    stepsEl.innerHTML = STEPS.map(([id, label], i) => {
      const state = i < current ? 'done' : i === current ? 'current' : 'todo';
      const clickable = i < current && s.step !== 'deliver';
      return `<li class="bb-step is-${state}">${clickable ? `<button type="button" data-action="goto" data-value="${id}">` : '<span>'}<span class="bb-step-num">${state === 'done' ? '✓' : i + 1}</span>${label}${clickable ? '</button>' : '</span>'}${i === current ? '<span class="bb-sr"> (paso actual)</span>' : ''}</li>`;
    }).join('');
  }

  function renderDoc(reading = -1) {
    const d = s.doc;
    const t = totals(d);
    const mark = key => (reading >= 0 && FIELD_ORDER[reading] === key ? ' is-reading' : '');
    if (d.read === 'exacto') {
      docEl.className = 'bb-doc is-xml';
      docEl.innerHTML = `<pre class="bb-xml"><span class="${mark('supplier')}">&lt;RznSoc&gt;${escape(d.supplier)}&lt;/RznSoc&gt;</span>
<span class="${mark('rut')}">&lt;RUCEmisor&gt;${d.rut.replace(/ /g, '')}&lt;/RUCEmisor&gt;</span>
<span class="${mark('cfe')}">&lt;TipoCFE&gt;111&lt;/TipoCFE&gt; &lt;Serie&gt;${d.serie}&lt;/Serie&gt; &lt;Nro&gt;${d.number}&lt;/Nro&gt;</span>
<span class="${mark('date')}">&lt;FchEmis&gt;2026-09-16&lt;/FchEmis&gt;</span>
${d.lines.map(l => `<span class="${mark('lines')}">&lt;Item&gt;&lt;NomItem&gt;${escape(l.raw)}&lt;/NomItem&gt;&lt;Cantidad&gt;${l.qty}&lt;/Cantidad&gt;&lt;PrecioUnitario&gt;${l.price}&lt;/PrecioUnitario&gt;&lt;/Item&gt;</span>`).join('\n')}
<span class="${mark('total')}">&lt;MntPagar&gt;${t.total}&lt;/MntPagar&gt;</span>
<span class="bb-xml-sign">&lt;Signature&gt;…firma del emisor…&lt;/Signature&gt;</span></pre>`;
      return;
    }
    docEl.className = `bb-doc ${d.id === 'foto' ? 'is-photo' : 'is-pdf'}`;
    docEl.innerHTML = `<div class="bb-paper">
      <div class="bb-paper-head"><div><strong class="${mark('supplier')}">${escape(d.supplier)}</strong><small class="${mark('rut')}">RUT ${d.rut}</small></div><div class="bb-qr" aria-hidden="true"></div></div>
      <div class="bb-paper-meta"><span class="${mark('cfe')}">${d.cfe} · Serie ${d.serie} Nº ${d.number}</span><span class="${mark('date')}">${d.date}</span></div>
      <table class="bb-paper-lines${mark('lines')}"><thead><tr><th>Cant.</th><th>Descripción</th><th>P. unit.</th><th>Importe</th></tr></thead><tbody>${d.lines.map(l => `<tr><td>${l.qty}</td><td>${escape(l.raw)}</td><td>${l.price}</td><td>${(l.qty * l.price).toLocaleString('es-UY')}</td></tr>`).join('')}</tbody></table>
      <div class="bb-paper-total${mark('total')}"><span>Subtotal ${t.net.toLocaleString('es-UY')}</span><span>IVA ${Math.round(t.tax).toLocaleString('es-UY')}</span><strong>TOTAL ${t.printed.toLocaleString('es-UY')}</strong></div>
      ${reading >= 0 ? '<span class="bb-scan" aria-hidden="true"></span>' : ''}
    </div>`;
  }
  const FIELD_ORDER = ['supplier', 'rut', 'cfe', 'date', 'lines', 'total'];

  function header(eyebrow, heading, text = '') {
    return `<header class="bb-head"><span class="bb-eyebrow">${eyebrow}</span><h4 tabindex="-1">${heading}</h4>${text ? `<p>${text}</p>` : ''}</header>`;
  }
  function next(label, action, disabled = false, hint = '') {
    return `<div class="bb-next">${hint ? `<small>${hint}</small>` : ''}<button type="button" class="bb-primary" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button></div>`;
  }
  function conf(value, isXml) {
    if (isXml) return '<span class="bb-chip is-exact">Firmado</span>';
    const pct = Math.round(value * 100);
    return `<span class="bb-chip ${pct < 85 ? 'is-warn' : ''}">IA ${pct}%</span>`;
  }

  // ---------- pasos ----------
  function stepLoad() {
    return `${header('PASO 1 · CAPTURA', 'Subí una factura de compra.', 'Elegí un ejemplo. En la app real sacás la foto con el celular, subís el PDF o el XML del CFE.')}
    <div class="bb-choices" role="radiogroup" aria-label="Factura de ejemplo">${documents.map(d => `<button type="button" role="radio" aria-checked="${d.id === s.doc.id}" class="bb-choice" data-action="doc" data-value="${d.id}">${icon(d.icon)}<span><strong>${d.title}</strong><small>${d.hint}</small></span><em>${d.kind}</em></button>`).join('')}</div>
    <p class="bb-rule">Nada se carga en tu sistema sin revisión humana. Es una regla del producto, no una opción.</p>
    ${next('Leer la factura →', 'start')}`;
  }
  function stepRead() {
    const d = s.doc;
    const xml = d.read === 'exacto';
    const rows = [['Proveedor', d.supplier, 'supplier'], ['RUT', d.rut, 'rut'], ['Comprobante', `${d.cfe} ${d.serie}-${d.number}`, 'cfe'], ['Fecha', d.date, 'date']];
    return `${header('PASO 2 · LECTURA', xml ? 'Lectura exacta, sin IA.' : 'La IA lee la factura.', xml ? 'El XML del CFE trae los datos firmados por el emisor: no hay nada que adivinar.' : 'Lee los renglones como una persona, sin plantillas por proveedor, y marca qué tan segura está de cada dato.')}
    <dl class="bb-fields">${rows.map(([label, value, key]) => `<div class="bb-field" data-field="${key}" hidden><dt>${label}</dt><dd>${escape(value)}</dd>${conf(key === 'supplier' ? 0.99 : 0.98, xml)}</div>`).join('')}</dl>
    <div class="bb-lines" data-field="lines" hidden><table class="bb-table"><caption>${d.lines.length} renglones leídos</caption><thead><tr><th>Renglón del proveedor</th><th>Cant.</th><th>Precio</th><th>IVA</th><th><span class="bb-sr">Confianza</span></th></tr></thead><tbody>${d.lines.map(l => `<tr><td>${escape(l.raw)}</td><td>${l.qty}</td><td>${money(l.price)}</td><td>${l.iva}%</td><td>${conf(l.conf, xml)}</td></tr>`).join('')}</tbody></table></div>
    <div class="bb-field bb-field-total" data-field="total" hidden><dt>Total</dt><dd>${money(totals(d).printed)}</dd>${conf(0.99, xml)}</div>
    ${next('Validar →', 'to-check', !s.readDone)}`;
  }
  function stepCheck() {
    const d = s.doc;
    const t = totals(d);
    const checks = [
      ['Aritmética por renglón', `${d.lines.length} renglones: cantidad × precio correctos.`],
      ['IVA por tasa', Object.entries(t.byRate).map(([rate, v]) => `${rate}%: ${money(v)}`).join(' · ')],
      ['Dígito verificador del RUT', `${d.rut} es válido.`],
      ['Tipo de CFE', `${d.cfe} (111) con indicadores correctos.`],
      ['Duplicados', `No hay otra compra con la clave UY:${d.rut.replace(/ /g, '')}:111:${d.serie}:${d.number}.`],
      ['Empresa receptora', 'El RUT receptor es el de tu empresa.'],
    ];
    const warn = warnings()[0];
    return `${header('PASO 3 · VALIDACIÓN', 'Todo se controla antes de seguir.', 'Las reglas de DGI se aplican solas. Los errores bloquean; las advertencias piden un OK explícito.')}
    <ul class="bb-checks">${checks.map(([title, detail]) => `<li class="bb-check" hidden>${icon('check')}<span><strong>${title}</strong><small>${escape(detail)}</small></span></li>`).join('')}${warn ? `<li class="bb-check is-warn" hidden>${icon('alert')}<span><strong>Total impreso</strong><small>${escape(warn.text)} Lo vas a confirmar en la revisión.</small></span></li>` : ''}</ul>
    ${next('Asociar al catálogo →', 'to-match', !s.checkDone)}`;
  }
  function suggested(line) {
    const unitCost = line.price / line.match.factor;
    return { unitCost, price: Math.ceil(unitCost * (1 + s.margin / 100)) };
  }
  function stepMatch() {
    const d = s.doc;
    return `${header('PASO 4 · CATÁLOGO', 'Cada renglón, a su producto.', 'Primero por código de barras, después por lo que ya elegiste para ese proveedor, el código interno y, por último, un nombre parecido. Con el costo por unidad sugiere el precio de venta.')}
    <label class="bb-margin">Margen para el precio sugerido <strong data-margin-out>${s.margin}%</strong><input type="range" min="10" max="80" step="1" value="${s.margin}" data-field="margin"></label>
    <div class="bb-matches">${d.lines.map((line, i) => {
      const m = line.match;
      const meta = matchMethods[m.method];
      const p = suggested(line);
      const fuzzy = m.method === 'nombre';
      return `<div class="bb-match ${fuzzy && !s.choices[i] ? 'is-pending' : ''}"><div class="bb-match-raw"><small>Renglón del proveedor</small><strong>${escape(line.raw)}</strong></div><span class="bb-arrow" aria-hidden="true">→</span><div class="bb-match-product"><span class="bb-chip ${meta.tone === 'fuzzy' ? 'is-warn' : 'is-exact'}">${meta.label}</span>${fuzzy
        ? `<label class="bb-pick">¿Es este producto?<select data-field="choice" data-line="${i}"><option value="">Elegí para confirmar…</option>${m.alternatives.map(a => `<option ${s.choices[i] === a ? 'selected' : ''}>${escape(a)}</option>`).join('')}</select></label>`
        : `<strong>${escape(m.product)}</strong>`}<small>${escape(m.note)}</small></div><div class="bb-match-price"><small>Costo / ${m.unit}</small><span>${money(p.unitCost)}</span><small>Precio sugerido</small><strong data-price="${i}">${money(p.price)}</strong></div></div>`;
    }).join('')}</div>
    ${next('Ir a la revisión →', 'to-review', false, pendingMatches() ? `Falta confirmar ${pendingMatches()} ${pendingMatches() === 1 ? 'producto' : 'productos'}: podés hacerlo acá o en la revisión.` : '')}`;
  }
  function stepReview() {
    const d = s.doc;
    const t = totals(d);
    const pend = pendingMatches();
    return `${header('PASO 5 · REVISIÓN HUMANA', 'Una persona confirma.', 'Revisás lo que BrainBill dejó listo, corregís si hace falta y confirmás. Al confirmar, aprende: la próxima factura de este proveedor se asocia sola.')}
    <div class="bb-summary"><div><small>Proveedor</small><strong>${escape(d.supplier)}</strong></div><div><small>Comprobante</small><strong>${d.serie}-${d.number}</strong></div><div><small>Renglones</small><strong>${d.lines.length}</strong></div><div><small>Total</small><strong>${money(t.total)}</strong></div></div>
    <ul class="bb-issues">
      ${pend ? `<li class="is-block">${icon('alert')}<span><strong>Falta confirmar ${pend} ${pend === 1 ? 'producto' : 'productos'}</strong><small>La compra no se puede cargar con una asociación sin confirmar.</small></span><button type="button" class="bb-link" data-action="goto" data-value="match">Confirmar en Catálogo</button></li>` : ''}
      ${warnings().map(w => `<li class="is-warn">${icon('alert')}<span><strong>Advertencia</strong><small>${escape(w.text)}</small></span><label class="bb-ack"><input type="checkbox" data-field="ack" data-value="${w.id}" ${s.acks.has(w.id) ? 'checked' : ''}> Revisado, cargar con el total calculado</label></li>`).join('')}
      ${!pend && !warnings().length ? `<li class="is-ok">${icon('check')}<span><strong>Sin observaciones</strong><small>Todo cerró: solo falta tu confirmación.</small></span></li>` : ''}
    </ul>
    ${next('Confirmar compra', 'confirm', !canConfirm(), canConfirm() ? '' : 'Resolvé lo marcado para habilitar la confirmación.')}`;
  }
  function stepDeliver() {
    const d = s.doc;
    const status = s.delivery;
    const manual = Math.round(d.lines.length * manualMinutesPerLine + 3);
    return `${header('PASO 6 · ENTREGA', 'La compra llega a tu sistema.', 'Elegí a dónde. BrainBill la entrega con reintentos y te avisa cuando quedó cargada.')}
    <div class="bb-dests" role="radiogroup" aria-label="Destino de la compra">${destinations.map(dest => `<button type="button" role="radio" aria-checked="${s.dest === dest.id}" class="bb-choice bb-dest" data-action="dest" data-value="${dest.id}" ${status ? 'disabled' : ''}><span><strong>${dest.label}</strong><small>${dest.detail}</small></span></button>`).join('')}</div>
    ${status ? `<ol class="bb-outbox">${['En cola', 'Enviando', 'Cargada'].map((label, i) => `<li class="${i < status.stage ? 'is-done' : i === status.stage ? 'is-active' : ''}">${i < status.stage || (i === 2 && status.stage >= 2) ? icon('check') : '<span class="bb-dot" aria-hidden="true"></span>'}${label}</li>`).join('')}</ol>` : ''}
    ${status && status.stage >= 2 ? `<div class="bb-result"><strong>Compra cargada ✓</strong><p>${escape(d.supplier)} · ${d.serie}-${d.number} · ${money(totals(d).total)} en <em>${escape(destinations.find(x => x.id === s.dest).label)}</em>.</p><div class="bb-time"><div><small>Con BrainBill</small><strong>${s.seconds} s</strong></div><div><small>Cargándola a mano</small><strong>~${manual} min</strong></div></div><button type="button" class="bb-primary" data-action="restart">Probar con otra factura</button></div>` : next('Enviar compra →', 'deliver', !!status)}`;
  }

  const pages = { load: stepLoad, read: stepRead, check: stepCheck, match: stepMatch, review: stepReview, deliver: stepDeliver };
  function render(focus = true) {
    renderSteps();
    renderDoc();
    panel.innerHTML = pages[s.step]();
    if (s.step === 'read' && s.readDone) panel.querySelectorAll('[data-field]').forEach(el => { el.hidden = false; });
    if (s.step === 'check' && s.checkDone) panel.querySelectorAll('.bb-check').forEach(el => { el.hidden = false; });
    if (focus) panel.querySelector('h4')?.focus({ preventScroll: true });
  }
  function go(step) { s.step = step; render(); }

  async function animateRead() {
    const id = ++run;
    s.readDone = false;
    go('read');
    const fields = FIELD_ORDER.map(key => panel.querySelector(`[data-field="${key}"]`));
    for (let i = 0; i < FIELD_ORDER.length; i++) {
      renderDoc(i);
      await wait(i === 4 ? 520 : 300);
      if (id !== run) return;
      fields[i].hidden = false;
      fields[i].classList.add('is-in');
    }
    renderDoc();
    s.readDone = true;
    panel.querySelector('[data-action="to-check"]').disabled = false;
    say(s.doc.read === 'exacto' ? 'XML leído: datos firmados por el emisor.' : `Factura leída con IA: ${s.doc.lines.length} renglones.`);
  }
  async function animateCheck() {
    const id = ++run;
    s.checkDone = false;
    go('check');
    for (const item of panel.querySelectorAll('.bb-check')) {
      await wait(220);
      if (id !== run) return;
      item.hidden = false;
      item.classList.add('is-in');
    }
    s.checkDone = true;
    panel.querySelector('[data-action="to-match"]').disabled = false;
    say(warnings().length ? 'Validación completa con una advertencia para revisar.' : 'Validación completa: todo cerró.');
  }
  async function deliver() {
    const id = ++run;
    s.seconds = Math.max(1, Math.round((performance.now() - s.started) / 1000));
    for (let stage = 0; stage <= 2; stage++) {
      s.delivery = { stage };
      render(false);
      await wait(stage === 2 ? 0 : 650);
      if (id !== run) return;
    }
    panel.querySelector('.bb-result .bb-primary')?.focus({ preventScroll: true });
    say(`Compra cargada en ${destinations.find(x => x.id === s.dest).label}.`);
  }
  function reset(docId = s.doc.id) {
    run++;
    Object.assign(s, { step: 'load', doc: documents.find(d => d.id === docId), readDone: false, checkDone: false, choices: {}, acks: new Set(), delivery: null, seconds: 0 });
  }

  root.addEventListener('click', event => {
    const control = event.target.closest('button[data-action]');
    if (!control || control.disabled) return;
    const { action, value } = control.dataset;
    if (action === 'doc') { reset(value); render(false); root.querySelector(`[data-action="doc"][data-value="${value}"]`)?.focus({ preventScroll: true }); say(`${s.doc.title}: ${s.doc.supplier}.`); }
    if (action === 'start') { s.started = performance.now(); animateRead(); }
    if (action === 'to-check') animateCheck();
    if (action === 'to-match') go('match');
    if (action === 'to-review') go('review');
    if (action === 'goto') { run++; go(value); }
    if (action === 'confirm' && canConfirm()) { go('deliver'); say('Compra confirmada. Elegí el destino.'); }
    if (action === 'dest') { s.dest = value; render(false); root.querySelector(`[data-action="dest"][data-value="${value}"]`)?.focus({ preventScroll: true }); }
    if (action === 'deliver') deliver();
    if (action === 'restart') { const nextDoc = documents[(documents.indexOf(s.doc) + 1) % documents.length]; reset(nextDoc.id); render(); say(`Nueva factura de ejemplo: ${s.doc.title}.`); }
  });
  root.addEventListener('input', event => {
    if (event.target.dataset.field !== 'margin') return;
    s.margin = Number(event.target.value);
    root.querySelector('[data-margin-out]').textContent = `${s.margin}%`;
    s.doc.lines.forEach((line, i) => { const cell = root.querySelector(`[data-price="${i}"]`); if (cell) cell.textContent = money(suggested(line).price); });
  });
  root.addEventListener('change', event => {
    const { field, line, value } = event.target.dataset;
    if (field === 'choice') {
      if (event.target.value) s.choices[line] = event.target.value; else delete s.choices[line];
      render(false);
      root.querySelector(`[data-field="choice"][data-line="${line}"]`)?.focus({ preventScroll: true });
      say(event.target.value ? `Producto confirmado: ${event.target.value}. BrainBill lo recuerda para este proveedor.` : 'Asociación sin confirmar.');
    }
    if (field === 'ack') {
      if (event.target.checked) s.acks.add(value); else s.acks.delete(value);
      render(false);
      root.querySelector(`[data-field="ack"][data-value="${value}"]`)?.focus({ preventScroll: true });
    }
    if (field === 'margin') say(`Margen del ${s.margin}%: precios sugeridos actualizados.`);
  });
  render(false);
  return root;
}
