(function () {
  'use strict';

  const API_PATH = '/api/chat';
  const STORAGE_KEY = 'breezy.lastBlend';
  const AUTO_ADVANCE_MS = 320;

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

  const state = {
    open: false,
    step: 0,
    answers: {},
    view: 'quiz', // 'quiz' | 'loading' | 'result' | 'error'
    blend: null,
    degraded: false,
    error: null,
  };

  let root;
  let advanceTimer = null;

  function init() {
    if (document.getElementById('breezy-quiz-root')) return;

    root = document.createElement('div');
    root.id = 'breezy-quiz-root';
    document.body.appendChild(root);

    const saved = readSavedBlend();
    if (saved && saved.blend) {
      state.blend = saved.blend;
      state.degraded = !!saved.degraded;
      state.view = 'result';
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.open) closePanel();
    });

    render();
  }

  function readSavedBlend() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveBlend(blend, degraded) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ blend, degraded }));
    } catch { /* localStorage may be disabled — silently ignore */ }
  }

  function clearSavedBlend() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function openPanel() {
    state.open = true;
    if (!state.blend) {
      state.view = 'quiz';
      state.step = 0;
      state.answers = {};
    }
    render();
    focusFirstControl();
  }

  function closePanel() {
    state.open = false;
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    render();
  }

  function restart() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    state.view = 'quiz';
    state.step = 0;
    state.answers = {};
    state.blend = null;
    state.degraded = false;
    state.error = null;
    clearSavedBlend();
    render();
    focusFirstControl();
  }

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

  function setText(key, value) {
    state.answers[key] = value;
  }

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
      if (!data || !data.blend) {
        throw new Error('Unexpected response from server.');
      }

      state.blend = data.blend;
      state.degraded = !!data.degraded;
      state.view = 'result';
      saveBlend(state.blend, state.degraded);
      render();
    } catch (err) {
      state.error = err && err.message ? err.message : 'Something went wrong.';
      state.view = 'error';
      render();
    }
  }

  /* ── Rendering ── */

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
  }

  function createFab() {
    const fab = el('button', {
      class: 'bq-fab',
      type: 'button',
    }, [
      el('span', { class: 'bq-fab-pulse', 'aria-hidden': 'true' }),
      el('span', { class: 'bq-fab-icon', 'aria-hidden': 'true' }, ['💨']),
      el('span', { class: 'bq-fab-label' }, ['']),
    ]);
    fab.addEventListener('click', openPanel);
    updateFab(fab);
    return fab;
  }

  function updateFab(fab) {
    const hasBlend = !!state.blend;
    fab.classList.toggle('bq-fab--hidden', state.open);
    fab.setAttribute(
      'aria-label',
      hasBlend ? 'Open your Air Blend' : 'Take the quiz to find your Air Blend'
    );
    const label = fab.querySelector('.bq-fab-label');
    if (label) label.textContent = hasBlend ? 'Your Air Blend' : 'Find Your Blend';
  }

  function createPanel() {
    const panel = el('div', {
      class: 'bq-panel',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Air Blend Quiz',
    });
    fillPanel(panel);
    return panel;
  }

  function fillPanel(panel) {
    panel.appendChild(renderHeader());

    if (state.view === 'quiz') {
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

  function renderHeader() {
    let eyebrow, title, subtitle;
    if (state.view === 'result') {
      eyebrow = 'Hand-curated';
      title   = 'Your Air Blend';
      subtitle = 'Probably more accurate than your horoscope.';
    } else if (state.view === 'loading') {
      eyebrow = 'Curating';
      title   = 'One moment';
      subtitle = 'Our Air Sommeliers are pretending to think.';
    } else if (state.view === 'error') {
      eyebrow = 'Hiccup';
      title   = 'Slight turbulence';
      subtitle = 'The air is fine. The system, less so.';
    } else {
      eyebrow = 'Air Sommelier';
      title   = 'Find Your Blend';
      subtitle = 'A short, mildly nosy questionnaire.';
    }

    const closeBtn = el('button', {
      class: 'bq-close',
      type: 'button',
      'aria-label': 'Close',
    }, ['×']);
    closeBtn.addEventListener('click', closePanel);

    return el('div', { class: 'bq-header' }, [
      el('div', { class: 'bq-header-text' }, [
        el('div', { class: 'bq-eyebrow' }, [eyebrow]),
        el('div', { class: 'bq-title' }, [title]),
        el('div', { class: 'bq-subtitle' }, [subtitle]),
      ]),
      closeBtn,
    ]);
  }

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
    restartBtn.addEventListener('click', restart);

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
        'House Reserve served — our sommelier briefly stepped out.',
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

    const startOverBtn = el('button', {
      class: 'bq-btn bq-btn--ghost',
      type: 'button',
    }, ['Start over']);
    startOverBtn.addEventListener('click', restart);

    return el('div', { class: 'bq-error' }, [
      el('div', { class: 'bq-error-icon', 'aria-hidden': 'true' }, ['⚠']),
      el('div', { class: 'bq-error-title' }, ['The air thinned briefly']),
      el('div', { class: 'bq-error-message' }, [
        state.error || 'Something went wrong on our end.',
      ]),
      el('div', { class: 'bq-result-actions', style: 'margin-top: 8px;' }, [startOverBtn, retryBtn]),
    ]);
  }

  function focusFirstControl() {
    setTimeout(() => {
      const panel = document.querySelector('.bq-panel');
      if (!panel) return;
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
