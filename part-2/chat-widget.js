(function () {
  'use strict';

  const API_PATH = '/api/chat';
  const BLEND_KEY = 'breezy.lastBlend';
  const CHAT_KEY = 'breezy.chat';
  const AUTO_ADVANCE_MS = 320;
  const MAX_CHAT_MESSAGES = 20;
  const MAX_CHAT_CONTENT = 500;

  const QUESTIONS = [
    {
      key: 'vibe',
      type: 'choice',
      question: "First things first. What's your current vibe?",
      options: [
        'Deeply unbothered',
        'Anxious but well-dressed',
        'Main character energy',
        'Functionally horizontal',
      ],
    },
    {
      key: 'setting',
      type: 'choice',
      question: 'Where would you rather be inhaling right now?',
      options: [
        'An alpine summit, obviously',
        'A coastal cliff at golden hour',
        'A converted warehouse loft',
        "The corner office I'm not in yet",
      ],
    },
    {
      key: 'pace',
      type: 'choice',
      question: 'Choose your operating speed.',
      options: [
        'Frantic but profitable',
        'Deliberate and well-moisturized',
        'Horizontal, with intention',
        'Caffeinated chaos',
      ],
    },
    {
      key: 'indulgence',
      type: 'choice',
      question: 'Be honest. How indulgent are you?',
      options: [
        'Yes.',
        'Only on weekdays',
        "Depends who's watching",
        'I once turned down a free dessert',
      ],
    },
    {
      key: 'idealTuesday',
      type: 'text',
      question: 'Describe your ideal Tuesday in one sentence.',
      placeholder: 'e.g., three espressos before a meeting that should have been an email',
      maxLength: 200,
    },
  ];

  const WELCOME_TEXT = [
    "Hey, it's Breezy.",
    "Ask me anything — preferably air-adjacent.",
  ];

  const STARTER_CHIPS = [
    "How does delivery actually work?",
    "Which plan should I pretend I need?",
    "Are you serious about all of this?",
  ];

  const state = {
    open: false,
    view: 'chat',          // 'chat' | 'quiz' | 'loading' | 'result' | 'error'
    // quiz
    step: 0,
    answers: {},
    // blend
    blend: null,
    degraded: false,
    // chat
    messages: [],          // [{ role: 'user'|'assistant', content, error? }]
    chatLoading: false,
    // quiz error
    error: null,
  };

  let root;
  let advanceTimer = null;

  /* ── Lifecycle ── */

  function init() {
    if (document.getElementById('breezy-quiz-root')) return;

    root = document.createElement('div');
    root.id = 'breezy-quiz-root';
    document.body.appendChild(root);

    const savedBlend = readSavedBlend();
    if (savedBlend && savedBlend.blend) {
      state.blend = savedBlend.blend;
      state.degraded = !!savedBlend.degraded;
    }
    const savedChat = readSavedChat();
    if (savedChat && savedChat.length) {
      state.messages = savedChat.slice(-MAX_CHAT_MESSAGES);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.open) closePanel();
    });

    render();
  }

  /* ── localStorage helpers ── */

  function readSavedBlend() {
    try {
      const raw = localStorage.getItem(BLEND_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveBlend(blend, degraded) {
    try {
      localStorage.setItem(BLEND_KEY, JSON.stringify({ blend, degraded }));
    } catch {}
  }

  function readSavedChat() {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      return arr.filter((m) =>
        m && typeof m === 'object'
        && (m.role === 'user' || m.role === 'assistant')
        && typeof m.content === 'string'
        && m.content.length > 0
      );
    } catch { return null; }
  }

  function saveChat() {
    try {
      const serializable = state.messages
        .slice(-MAX_CHAT_MESSAGES)
        .map(({ role, content }) => ({ role, content }));
      localStorage.setItem(CHAT_KEY, JSON.stringify(serializable));
    } catch {}
  }

  function clearSavedChat() {
    try { localStorage.removeItem(CHAT_KEY); } catch {}
  }

  /* ── Panel open/close ── */

  function openPanel() {
    state.open = true;
    render();
    focusFirstControl();
  }

  function closePanel() {
    state.open = false;
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    // Reset to chat view + wipe quiz progress; keep messages and blend.
    state.view = 'chat';
    state.step = 0;
    state.answers = {};
    state.error = null;
    render();
  }

  /* ── View transitions ── */

  function backToChat() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    state.view = 'chat';
    state.step = 0;
    state.answers = {};
    state.error = null;
    render();
    focusFirstControl();
  }

  function toggleBlendView() {
    if (state.blend) {
      state.view = 'result';
    } else {
      state.view = 'quiz';
      state.step = 0;
      state.answers = {};
    }
    render();
    focusFirstControl();
  }

  function retakeQuiz() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    state.view = 'quiz';
    state.step = 0;
    state.answers = {};
    state.error = null;
    // Keep existing blend in localStorage until a new one overwrites it.
    render();
    focusFirstControl();
  }

  /* ── Quiz behavior ── */

  function selectChoice(key, value) {
    state.answers[key] = value;
    updateChoiceSelection(key, value);
    updateFooterButtons();
    if (advanceTimer) clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      if (state.step < QUESTIONS.length - 1) {
        state.step++;
        render();
        focusFirstControl();
      }
    }, AUTO_ADVANCE_MS);
  }

  function updateChoiceSelection(key, value) {
    const q = QUESTIONS[state.step];
    if (!q || q.key !== key) return;
    const buttons = root.querySelectorAll('.bq-panel .bq-options .bq-option');
    buttons.forEach((btn, i) => {
      const isSelected = q.options[i] === value;
      btn.classList.toggle('bq-option--selected', isSelected);
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });
  }

  function updateFooterButtons() {
    const footer = root.querySelector('.bq-panel .bq-footer');
    if (!footer) return;
    const back = footer.querySelector('.bq-btn--ghost');
    const primary = footer.querySelector('.bq-btn--primary');
    if (back) back.disabled = state.step === 0;
    if (primary) primary.disabled = !canAdvance();
  }

  function setText(key, value) { state.answers[key] = value; }

  function goBack() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    if (state.step > 0) {
      state.step--;
      render();
      focusFirstControl();
    }
  }

  function canAdvance() {
    const q = QUESTIONS[state.step];
    const v = state.answers[q.key];
    if (q.type === 'choice') return typeof v === 'string' && v.length > 0;
    if (q.type === 'text')   return typeof v === 'string' && v.trim().length > 0;
    return false;
  }

  function isLastStep() { return state.step === QUESTIONS.length - 1; }

  function advance() {
    if (!canAdvance()) return;
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    if (isLastStep()) {
      submitQuiz();
    } else {
      state.step++;
      render();
      focusFirstControl();
    }
  }

  async function submitQuiz() {
    state.view = 'loading';
    state.error = null;
    render();

    try {
      const res = await fetch(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'quiz', quizAnswers: state.answers }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok && res.status !== 502) {
        throw new Error((data && data.error) || `Request failed (${res.status})`);
      }
      if (!data || !data.blend) throw new Error('Unexpected response from server.');

      state.blend = data.blend;
      state.degraded = !!data.degraded;
      saveBlend(state.blend, state.degraded);
      // Only surface if the user is still waiting on the loading screen.
      if (state.view === 'loading') {
        state.view = 'result';
        render();
      }
    } catch (err) {
      if (state.view !== 'loading') return;
      state.error = err && err.message ? err.message : 'Something went wrong.';
      state.view = 'error';
      render();
    }
  }

  /* ── Chat behavior ── */

  async function sendMessage(rawText) {
    const text = (rawText || '').trim();
    if (!text || state.chatLoading) return;
    if (text.length > MAX_CHAT_CONTENT) return;

    state.messages.push({ role: 'user', content: text });
    state.chatLoading = true;
    saveChat();
    render();

    // Snapshot the conversation length used for this request — if the user
    // clears chat mid-flight, the snapshot won't match and we'll bail.
    const sentSnapshot = state.messages.length;

    try {
      const res = await fetch(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          messages: state.messages
            .slice(-MAX_CHAT_MESSAGES)
            .map(({ role, content }) => ({ role, content })),
          blend: state.blend || undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      // User cleared chat or otherwise canceled
      if (state.messages.length < sentSnapshot || !state.chatLoading) return;

      if (!res.ok && res.status !== 502) {
        throw new Error((data && data.error) || `Request failed (${res.status})`);
      }
      if (!data || typeof data.reply !== 'string') {
        throw new Error('No reply received.');
      }

      state.messages.push({ role: 'assistant', content: data.reply });
      state.chatLoading = false;
      saveChat();
      render();
    } catch (err) {
      if (state.messages.length < sentSnapshot || !state.chatLoading) return;
      state.messages.push({
        role: 'assistant',
        content: "Our oxygen briefly cut out. Try that again.",
        error: true,
      });
      state.chatLoading = false;
      saveChat();
      render();
    }
  }

  function retryLastSend() {
    // Drop the last assistant error bubble, find the preceding user message, re-send.
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.role === 'assistant' && m.error) {
        state.messages.splice(i, 1);
        // The user message before it is the one to retry
        const lastUser = [...state.messages].reverse().find((x) => x.role === 'user');
        if (!lastUser) { render(); return; }
        // Remove that user message too — sendMessage will re-push it.
        const lastUserIdx = state.messages.lastIndexOf(lastUser);
        if (lastUserIdx >= 0) state.messages.splice(lastUserIdx, 1);
        saveChat();
        sendMessage(lastUser.content);
        return;
      }
    }
  }

  function clearChat() {
    state.messages = [];
    state.chatLoading = false;
    clearSavedChat();
    render();
    focusFirstControl();
  }

  /* ── Render orchestration ── */

  function render() {
    if (!root) return;

    let fab = root.querySelector('.bq-fab');
    if (!fab) {
      fab = createFab();
      root.appendChild(fab);
    } else {
      updateFab(fab);
    }

    let panel = root.querySelector('.bq-panel');
    if (state.open && !panel) {
      panel = createPanel();
      root.appendChild(panel);
    } else if (!state.open && panel) {
      panel.remove();
    } else if (state.open && panel) {
      panel.innerHTML = '';
      fillPanel(panel);
    }

    // Post-render side effects
    if (state.open && state.view === 'chat') {
      const msgs = root.querySelector('.bq-chat-messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
  }

  function createFab() {
    const fab = el('button', {
      class: 'bq-fab',
      type: 'button',
      'aria-label': 'Ask Breezy',
    }, [
      el('span', { class: 'bq-fab-pulse', 'aria-hidden': 'true' }),
      el('span', { class: 'bq-fab-icon', 'aria-hidden': 'true' }, ['💨']),
      el('span', { class: 'bq-fab-label' }, ['Ask Breezy']),
    ]);
    fab.addEventListener('click', openPanel);
    updateFab(fab);
    return fab;
  }

  function updateFab(fab) {
    fab.classList.toggle('bq-fab--hidden', state.open);
  }

  function createPanel() {
    const panel = el('div', {
      class: 'bq-panel',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Breezy Concierge',
    });
    fillPanel(panel);
    return panel;
  }

  function fillPanel(panel) {
    panel.appendChild(renderHeader());

    if (state.view === 'chat') {
      panel.appendChild(renderChat());
    } else if (state.view === 'quiz') {
      panel.appendChild(renderProgress());
      panel.appendChild(renderQuiz());
      panel.appendChild(renderFooter());
    } else if (state.view === 'loading') {
      panel.appendChild(renderLoading());
    } else if (state.view === 'result') {
      panel.appendChild(renderResult());
    } else if (state.view === 'error') {
      panel.appendChild(renderError());
    }
  }

  /* ── Header ── */

  function renderHeader() {
    let eyebrow, title, subtitle;
    if (state.view === 'chat') {
      eyebrow = 'Breezy support';
      title   = 'Ask Breezy';
      subtitle = 'Probably more useful than your group chat.';
    } else if (state.view === 'result') {
      eyebrow = 'Your blend';
      title   = 'Your Air Blend';
      subtitle = 'We made this for you. From the sky.';
    } else if (state.view === 'loading') {
      eyebrow = 'One sec';
      title   = 'Mixing your air';
      subtitle = 'Pretending to think real hard.';
    } else if (state.view === 'error') {
      eyebrow = 'Hiccup';
      title   = 'Slight turbulence';
      subtitle = 'The air is fine. The system, less so.';
    } else {
      eyebrow = 'Quiz';
      title   = 'Find Your Blend';
      subtitle = 'A short, mildly nosy questionnaire.';
    }

    const icons = el('div', { class: 'bq-header-icons' });

    if (state.view === 'chat' && state.messages.length > 0) {
      const clearBtn = el('button', {
        class: 'bq-icon-btn',
        type: 'button',
        title: 'Clear conversation',
        'aria-label': 'Clear conversation',
      }, [resetIcon()]);
      clearBtn.addEventListener('click', clearChat);
      icons.appendChild(clearBtn);
    } else if (state.view !== 'chat') {
      const backBtn = el('button', {
        class: 'bq-icon-btn',
        type: 'button',
        title: 'Back to chat',
        'aria-label': 'Back to chat',
      }, [backIcon()]);
      backBtn.addEventListener('click', backToChat);
      icons.appendChild(backBtn);
    }

    const closeBtn = el('button', {
      class: 'bq-icon-btn bq-close',
      type: 'button',
      'aria-label': 'Close',
      title: 'Close',
    }, ['×']);
    closeBtn.addEventListener('click', closePanel);
    icons.appendChild(closeBtn);

    return el('div', { class: 'bq-header' }, [
      el('div', { class: 'bq-header-text' }, [
        el('div', { class: 'bq-eyebrow' }, [eyebrow]),
        el('div', { class: 'bq-title' }, [title]),
        el('div', { class: 'bq-subtitle' }, [subtitle]),
      ]),
      icons,
    ]);
  }

  function backIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = '<path d="M15 18l-6-6 6-6"/>';
    return svg;
  }
  function resetIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>';
    return svg;
  }
  function sendIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>';
    return svg;
  }

  /* ── Chat view ── */

  function renderChat() {
    const wrap = el('div', { class: 'bq-chat' });
    const messages = el('div', { class: 'bq-chat-messages' });

    if (state.messages.length === 0) {
      messages.appendChild(renderWelcome());
      messages.appendChild(renderChips());
    } else {
      state.messages.forEach((m) => {
        messages.appendChild(renderBubble(m));
      });
    }

    if (state.chatLoading) {
      messages.appendChild(renderTypingBubble());
    }

    wrap.appendChild(messages);
    wrap.appendChild(renderBlendToggle());
    wrap.appendChild(renderInputRow());
    return wrap;
  }

  function renderWelcome() {
    return el('div', { class: 'bq-welcome' }, [
      el('strong', {}, [WELCOME_TEXT[0]]),
      ' ',
      WELCOME_TEXT[1],
    ]);
  }

  function renderChips() {
    const wrap = el('div', { class: 'bq-chips' });
    STARTER_CHIPS.forEach((text) => {
      const chip = el('button', {
        class: 'bq-chip',
        type: 'button',
      }, [text]);
      chip.addEventListener('click', () => sendMessage(text));
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function renderBubble(m) {
    const cls = ['bq-bubble'];
    if (m.role === 'user') cls.push('bq-bubble--user');
    else cls.push('bq-bubble--bot');
    if (m.error) cls.push('bq-bubble--error');

    const children = [el('div', { class: 'bq-bubble-text' }, [m.content])];

    if (m.error) {
      const retry = el('button', {
        class: 'bq-bubble-retry',
        type: 'button',
      }, ['↻ Retry']);
      retry.addEventListener('click', retryLastSend);
      children.push(retry);
    }

    return el('div', { class: cls.join(' ') }, children);
  }

  function renderTypingBubble() {
    return el('div', { class: 'bq-typing', 'aria-label': 'Breezy is typing' }, [
      el('span', { class: 'bq-typing-dot' }),
      el('span', { class: 'bq-typing-dot' }),
      el('span', { class: 'bq-typing-dot' }),
    ]);
  }

  function renderBlendToggle() {
    const hasBlend = !!state.blend;
    const variant = hasBlend ? 'bq-blend-toggle--view' : 'bq-blend-toggle--find';
    const btn = el('button', {
      class: `bq-blend-toggle ${variant}`,
      type: 'button',
    }, [
      el('span', { class: 'bq-blend-toggle-icon', 'aria-hidden': 'true' }, [hasBlend ? '✓' : '✨']),
      hasBlend ? 'View Your Blend' : 'Find Your Blend',
    ]);
    btn.addEventListener('click', toggleBlendView);
    return btn;
  }

  function renderInputRow() {
    const ta = el('textarea', {
      class: 'bq-chat-textarea',
      placeholder: 'Ask about the air, the plans, the lifestyle…',
      rows: '1',
      maxlength: String(MAX_CHAT_CONTENT),
      'aria-label': 'Message Breezy',
    });

    const sendBtn = el('button', {
      class: 'bq-send',
      type: 'button',
      'aria-label': 'Send',
      title: 'Send',
    }, [sendIcon()]);
    sendBtn.disabled = true;

    const setDisabled = () => {
      sendBtn.disabled = ta.value.trim().length === 0 || state.chatLoading;
    };

    const submit = () => {
      const text = ta.value;
      ta.value = '';
      setDisabled();
      sendMessage(text);
    };

    ta.addEventListener('input', setDisabled);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) submit();
      }
    });
    sendBtn.addEventListener('click', () => { if (!sendBtn.disabled) submit(); });

    return el('div', { class: 'bq-input-row' }, [ta, sendBtn]);
  }

  /* ── Quiz views (unchanged from prior) ── */

  function renderProgress() {
    const dots = QUESTIONS.map((_, i) => {
      let cls = 'bq-progress-dot';
      if (i < state.step) cls += ' bq-progress-dot--done';
      else if (i === state.step) cls += ' bq-progress-dot--active';
      return el('span', { class: cls, 'aria-hidden': 'true' });
    });
    return el('div', {
      class: 'bq-progress',
      role: 'progressbar',
      'aria-valuemin': '1',
      'aria-valuemax': String(QUESTIONS.length),
      'aria-valuenow': String(state.step + 1),
    }, dots);
  }

  function renderQuiz() {
    const q = QUESTIONS[state.step];
    const body = el('div', { class: 'bq-body' });
    const wrap = el('div', { class: 'bq-question-wrap' });

    wrap.appendChild(el('div', { class: 'bq-eyebrow' }, [
      `Question ${state.step + 1} of ${QUESTIONS.length}`,
    ]));
    wrap.appendChild(el('h3', { class: 'bq-question' }, [q.question]));

    if (q.type === 'choice') {
      const list = el('div', { class: 'bq-options', role: 'radiogroup' });
      q.options.forEach((opt) => {
        const isSelected = state.answers[q.key] === opt;
        const btn = el('button', {
          class: 'bq-option' + (isSelected ? ' bq-option--selected' : ''),
          type: 'button',
          role: 'radio',
          'aria-checked': isSelected ? 'true' : 'false',
        }, [opt]);
        btn.addEventListener('click', () => selectChoice(q.key, opt));
        list.appendChild(btn);
      });
      wrap.appendChild(list);
    } else if (q.type === 'text') {
      const max = q.maxLength || 200;
      const current = state.answers[q.key] || '';
      const ta = el('textarea', {
        class: 'bq-textarea',
        placeholder: q.placeholder || '',
        maxlength: String(max),
        rows: '4',
        'aria-label': q.question,
      });
      ta.value = current;
      const counter = el('div', { class: 'bq-char-count' }, [`${current.length} / ${max}`]);
      ta.addEventListener('input', (e) => {
        const v = e.target.value;
        setText(q.key, v);
        counter.textContent = `${v.length} / ${max}`;
        const submitBtn = root.querySelector('.bq-footer .bq-btn--primary');
        if (submitBtn) submitBtn.disabled = !canAdvance();
      });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          advance();
        }
      });
      const textWrap = el('div', { class: 'bq-text-wrap' }, [ta, counter]);
      wrap.appendChild(textWrap);
    }

    body.appendChild(wrap);
    return body;
  }

  function renderFooter() {
    const backBtn = el('button', {
      class: 'bq-btn bq-btn--ghost',
      type: 'button',
    }, ['← Back']);
    backBtn.disabled = state.step === 0;
    backBtn.addEventListener('click', goBack);

    const primaryLabel = isLastStep() ? 'Reveal My Blend' : 'Next →';
    const primaryBtn = el('button', {
      class: 'bq-btn bq-btn--primary',
      type: 'button',
    }, [primaryLabel]);
    primaryBtn.disabled = !canAdvance();
    primaryBtn.addEventListener('click', advance);

    return el('div', { class: 'bq-footer' }, [backBtn, primaryBtn]);
  }

  function renderLoading() {
    return el('div', { class: 'bq-loading' }, [
      el('div', { class: 'bq-spinner', 'aria-hidden': 'true' }),
      el('div', { class: 'bq-loading-text' }, ['Curating your bespoke blend…']),
      el('div', { class: 'bq-loading-sub' }, ['Hand-selecting molecules. Allegedly.']),
    ]);
  }

  function renderResult() {
    const b = state.blend;
    const seePlansBtn = el('button', {
      class: 'bq-btn bq-btn--primary',
      type: 'button',
    }, ['See Matching Plan']);
    seePlansBtn.addEventListener('click', () => {
      const target = document.getElementById('pricing');
      closePanel();
      if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    });

    const restartBtn = el('button', {
      class: 'bq-btn bq-btn--ghost',
      type: 'button',
    }, ['Retake']);
    restartBtn.addEventListener('click', retakeQuiz);

    const children = [
      el('div', { class: 'bq-result-eyebrow' }, ['Your personalized blend']),
      el('h3', { class: 'bq-result-name' }, [b.name]),
      el('div', { class: 'bq-result-tier' }, [b.tier]),
      el('div', {}, [
        el('div', { class: 'bq-result-section-label' }, ['Atmospheric composition']),
        el('div', { class: 'bq-result-ratio' }, [b.ratio]),
      ]),
      el('div', {}, [
        el('div', { class: 'bq-result-section-label' }, ['Tasting notes']),
        el('div', { class: 'bq-result-notes' },
          (b.notes || []).map((n) => el('span', { class: 'bq-note' }, [n]))
        ),
      ]),
      el('p', { class: 'bq-result-tagline' }, [`"${b.tagline}"`]),
    ];

    if (state.degraded) {
      children.push(el('div', { class: 'bq-degraded-note' }, [
        'Standard Issue served — our system briefly stepped out.',
      ]));
    }

    children.push(el('div', { class: 'bq-result-actions' }, [restartBtn, seePlansBtn]));

    return el('div', { class: 'bq-result' }, children);
  }

  function renderError() {
    const retryBtn = el('button', {
      class: 'bq-btn bq-btn--primary',
      type: 'button',
    }, ['Try again']);
    retryBtn.addEventListener('click', submitQuiz);

    return el('div', { class: 'bq-error' }, [
      el('div', { class: 'bq-error-icon', 'aria-hidden': 'true' }, ['⚠']),
      el('div', { class: 'bq-error-title' }, ['The air thinned briefly']),
      el('div', { class: 'bq-error-message' }, [
        state.error || 'Something went wrong on our end.',
      ]),
      el('div', { class: 'bq-result-actions', style: 'margin-top: 8px;' }, [retryBtn]),
    ]);
  }

  function focusFirstControl() {
    setTimeout(() => {
      const panel = document.querySelector('.bq-panel');
      if (!panel) return;
      if (state.view === 'chat') {
        const ta = panel.querySelector('.bq-chat-textarea');
        if (ta) { ta.focus({ preventScroll: true }); return; }
      }
      const target = panel.querySelector('.bq-option, .bq-textarea, .bq-btn--primary, .bq-close');
      if (target) target.focus({ preventScroll: true });
    }, 60);
  }

  /* ── tiny DOM helper ── */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'style') node.setAttribute('style', attrs[k]);
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (const c of children) {
        if (c == null) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
