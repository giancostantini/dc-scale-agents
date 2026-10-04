// Contacto de la Home de D&C: datos antes de agendar, calendario de
// Calendly y asistente (chat contra el Sistema D&C).
(function () {
  // ============ Agendar ============
  const CALENDLY_URL = 'https://calendly.com/dearmascostantini';
  const LEADS_ENDPOINT = 'https://sistemadearmascostantini.com/api/leads/from-landing';

  const overlay = document.getElementById('prebookOverlay');
  const form = document.getElementById('prebookForm');
  const reasonField = document.getElementById('pb-reason');
  const calendar = document.getElementById('calendarOverlay');
  const calendarWidget = document.getElementById('calendarWidget');
  let topicText = '';

  document.getElementById('calendarClose').addEventListener('click', () => calendar.close());
  calendar.addEventListener('click', event => { if (event.target === calendar) calendar.close(); });
  calendar.addEventListener('close', () => {
    calendarWidget.replaceChildren();
    document.body.style.overflow = '';
  });

  function openCalendly(event, topic) {
    if (event) event.preventDefault();
    if (overlay.open) return false;
    // Si viene de "Pedir una demo", el motivo llega precargado.
    if (topic && (!reasonField.value.trim() || reasonField.value === topicText)) {
      reasonField.value = topic;
      topicText = topic;
    }
    overlay.showModal();
    document.body.style.overflow = 'hidden';
    document.getElementById('pb-name').focus();
    return false;
  }
  window.openCalendly = openCalendly;

  overlay.addEventListener('close', () => {
    document.body.style.overflow = calendar.open ? 'hidden' : '';
  });
  document.getElementById('prebookClose').addEventListener('click', () => overlay.close());
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.close(); });

  document.querySelectorAll('[data-booking]').forEach(trigger => {
    trigger.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const menu = document.getElementById('menu');
      if (menu && menu.open) menu.close();
      openCalendly(event, trigger.dataset.topic);
    });
  });

  async function sendLeadToDashboard(data) {
    try {
      const res = await fetch(LEADS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
        credentials: 'omit'
      });
      if (!res.ok) console.warn('[lead] dashboard non-200:', res.status);
    } catch (err) {
      console.warn('[lead] dashboard unreachable:', err);
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const fields = [...form.querySelectorAll('[required]')];
    fields.forEach(field => field.setCustomValidity(field.value.trim() ? '' : 'Completá este campo.'));
    if (!form.reportValidity()) return;

    const name = document.getElementById('pb-name').value.trim();
    const email = document.getElementById('pb-email').value.trim();
    const company = document.getElementById('pb-company').value.trim();
    const reason = reasonField.value.trim();

    sendLeadToDashboard({ name, email, company, reason });
    overlay.close();

    const prefill = { name: `${name} (${company})`, email, customAnswers: { a1: reason, a2: company } };
    if (window.Calendly && window.Calendly.initInlineWidget) {
      calendar.showModal();
      document.body.style.overflow = 'hidden';
      window.Calendly.initInlineWidget({ url: CALENDLY_URL, parentElement: calendarWidget, prefill, resize: false });
    } else {
      const params = new URLSearchParams({ name: prefill.name, email, a1: reason, a2: company });
      window.open(`${CALENDLY_URL}?${params.toString()}`, '_blank', 'noopener');
    }
  });
  form.addEventListener('input', event => event.target.setCustomValidity && event.target.setCustomValidity(''));

  // ============ Asistente ============
  const CHAT_ENDPOINT = 'https://sistemadearmascostantini.com/api/chat';
  const chatToggle = document.getElementById('chatToggle');
  const chatWindow = document.getElementById('chatWindow');
  const chatClose = document.getElementById('chatClose');
  const chatBubble = document.getElementById('chatBubble');
  const chatBubbleClose = document.getElementById('chatBubbleClose');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');
  const chatQuickActions = document.getElementById('chatQuickActions');

  const chatHistory = [];
  let chatBubbleShown = false;
  let chatOpened = false;

  function showChatBubble() {
    if (chatBubbleShown || chatOpened) return;
    chatBubbleShown = true;
    chatBubble.classList.add('show');
    setTimeout(() => { if (!chatOpened) chatBubble.classList.remove('show'); }, 9000);
  }

  function toggleChat(forceState) {
    const open = typeof forceState === 'boolean' ? forceState : !chatWindow.classList.contains('open');
    chatWindow.classList.toggle('open', open);
    chatToggle.classList.toggle('active', open);
    chatToggle.setAttribute('aria-expanded', String(open));
    chatToggle.setAttribute('aria-label', open ? 'Cerrar chat' : 'Abrir chat');
    chatWindow.setAttribute('aria-hidden', String(!open));
    chatWindow.inert = !open;
    if (open) {
      chatOpened = true;
      chatBubble.classList.remove('show');
      chatInput.focus();
    } else {
      chatToggle.focus({ preventScroll: true });
    }
  }

  // El aviso aparece cuando la persona ya pasó el hero, para no tapar el recorrido.
  const hero = document.getElementById('top');
  if (hero && 'IntersectionObserver' in window) {
    const watch = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio < 0.35) { watch.disconnect(); setTimeout(showChatBubble, 4000); }
    }, { threshold: [0, 0.35, 0.6] });
    watch.observe(hero);
  } else {
    setTimeout(showChatBubble, 20000);
  }
  chatBubble.addEventListener('click', event => {
    if (event.target.closest('.chat-bubble-close')) return;
    toggleChat(true);
  });
  chatBubble.addEventListener('keydown', event => {
    if (event.target === chatBubble && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleChat(true); }
  });
  chatBubbleClose.addEventListener('click', event => {
    event.stopPropagation();
    chatBubble.classList.remove('show');
  });
  chatToggle.addEventListener('click', () => toggleChat());
  chatClose.addEventListener('click', () => toggleChat(false));
  chatWindow.addEventListener('keydown', event => { if (event.key === 'Escape') toggleChat(false); });

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
  });
  chatInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });

  function ctaButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-cta-inline';
    button.innerHTML = 'Hablar con el estudio <span aria-hidden="true">→</span>';
    button.addEventListener('click', () => {
      toggleChat(false);
      setTimeout(() => openCalendly(), 200);
    });
    return button;
  }

  // La web no usa guiones para separar frases; si el modelo pone uno, se cambia por coma.
  const clean = text => text.replace(/\s*[—–]\s*/g, ', ');

  function appendMessage(role, text, opts = {}) {
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${role}`;
    text.split(/\n\n+/).forEach(paragraph => {
      const p = document.createElement('p');
      p.textContent = role === 'bot' ? clean(paragraph.trim()) : paragraph.trim();
      div.appendChild(p);
    });
    if (opts.cta) div.appendChild(ctaButton());
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  function appendTyping() {
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg-bot chat-msg-typing';
    div.id = 'chatTypingIndicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  function removeTyping() {
    const typing = document.getElementById('chatTypingIndicator');
    if (typing) typing.remove();
  }

  function detectsIntent(userText, botText) {
    const text = `${userText} ${botText}`.toLowerCase();
    return [
      'agendar', 'agendá', 'reunir', 'reunion', 'reunión', 'llamada', 'presupuesto', 'demo',
      'cuanto cuesta', 'cuánto cuesta', 'precio', 'propuesta',
      'me interesa', 'me sirve', 'cómo empiezo', 'como empiezo',
      'siguiente paso', 'cuándo podemos', 'cuando podemos', 'evaluar'
    ].some(trigger => text.includes(trigger));
  }

  function createStreamingBotMessage() {
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg-bot chat-msg-streaming';
    chatMessages.appendChild(div);
    let accumulated = '';
    let pending = 0;
    function paint() {
      pending = 0;
      div.replaceChildren(...accumulated.split(/\n\n+/).map(text => {
        const p = document.createElement('p');
        p.textContent = clean(text);
        return p;
      }));
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    return {
      append(chunk) { accumulated += chunk; if (!pending) pending = requestAnimationFrame(paint); },
      finalize(opts = {}) {
        if (pending) cancelAnimationFrame(pending);
        paint();
        div.classList.remove('chat-msg-streaming');
        if (opts.cta) { div.appendChild(ctaButton()); chatMessages.scrollTop = chatMessages.scrollHeight; }
        return accumulated;
      },
      get text() { return accumulated; }
    };
  }

  async function sendChatMessage(userText) {
    if (!userText.trim() || chatSend.disabled) return;
    appendMessage('user', userText);
    chatHistory.push({ role: 'user', content: userText });
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatSend.disabled = true;
    chatQuickActions.classList.add('hidden');
    appendTyping();

    let botMessage = null;
    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined
      });
      if (!res.ok) {
        removeTyping();
        appendMessage('bot', 'Tuve un problema técnico. Probá de nuevo en un momento o agendá una conversación con los socios.', { cta: true });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        if (!botMessage) { removeTyping(); botMessage = createStreamingBotMessage(); }
        botMessage.append(chunk);
      }
      if (!botMessage) {
        removeTyping();
        appendMessage('bot', 'No pude responder esto. ¿Querés que lo charlemos con los socios?', { cta: true });
        return;
      }
      const reply = botMessage.text.trim();
      botMessage.finalize({ cta: detectsIntent(userText, reply) });
      chatHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      removeTyping();
      console.warn('[chat] error:', err);
      if (botMessage) botMessage.finalize();
      else appendMessage('bot', 'No me pude conectar. Si querés, agendá directamente con los socios.', { cta: true });
    } finally {
      chatSend.disabled = false;
      if (chatWindow.classList.contains('open') && !overlay.open) chatInput.focus();
    }
  }

  chatForm.addEventListener('submit', event => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (text) sendChatMessage(text);
  });
  document.querySelectorAll('.chat-qa').forEach(button => {
    button.addEventListener('click', () => {
      const prompt = button.getAttribute('data-prompt');
      if (prompt) sendChatMessage(prompt);
    });
  });
})();
