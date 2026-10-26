'use strict';

/* =========================================================
   Tutorial mode: a guided tour and a help mode
   ---------------------------------------------------------
   Loaded before app.js but only runs once app.js has booted:
   initTutorial() is called from its boot section, and decorateHelp()
   at the end of every render().
   ========================================================= */

/* ---------- Guided tour ----------
   Runs on a temporary sample plan so the user's own data is never touched.
   Each step may switch view and spotlights the first visible target;
   steps without a visible target show a centred card. Optional steps are left out when their
   target is hidden at the start (the sidebar toggle on phones, the sync button when sync is off). */

const TOUR_STEPS = [
  { key: 'welcome' },
  { key: 'dashboard', view: 'dashboard', target: ['.summary'] },
  { key: 'goals', view: 'goals', target: ['.card.goal'] },
  { key: 'states', view: 'states', target: ['.card.state'] },
  { key: 'graphs', view: 'graphs', target: ['.gr-card'] },
  { key: 'activities', view: 'activities', target: ['.board'] },
  { key: 'timeline', view: 'timeline', target: ['.tl-scroll'] },
  { key: 'map', view: 'map', target: ['.map-wrap'] },
  { key: 'add', target: ['#addBtn'] },
  { key: 'sidebar', target: ['#navToggle'], optional: true },
  { key: 'more', target: ['#navMore'], optional: true },
  { key: 'settings', target: ['#settingsBtn'] },
  { key: 'sync', target: ['#syncBtn'], optional: true },
  { key: 'help', target: ['#helpBtn'] },
  { key: 'done' },
];

const tour = { step: -1, steps: TOUR_STEPS, planId: null, prevPlan: null, prevView: null };
const SPOT_PAD = 6;
const EDGE = 16;

const isVisible = el => !!el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
const firstVisible = sels => (sels || []).map(s => document.querySelector(s)).find(isVisible) || null;

function startTour() {
  if (tour.step >= 0) return;
  closeHelpTip();
  closeCtxMenu();
  if (modal.open) modal.close();
  if (settings.open) settings.close();
  prefs.set('tourSeen', true);
  tour.steps = TOUR_STEPS.filter(s => !s.optional || firstVisible(s.target));
  tour.prevPlan = plans.current;
  tour.prevView = ui.view;
  createPlan(t('tour.planName'), sampleData());
  tour.planId = plans.current;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="tour-block"></div>
    <div class="tour-spot" hidden></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText"></div>`);
  addEventListener('keydown', tourKeys, true);
  addEventListener('resize', placeTour);
  addEventListener('scroll', placeTour, true);
  showStep(0);
}

function showStep(i) {
  tour.step = clamp(i, 0, tour.steps.length - 1);
  const s = tour.steps[tour.step];
  if (s.view && ui.view !== s.view) setView(s.view);
  const first = tour.step === 0;
  const last = tour.step === tour.steps.length - 1;
  const btn = (act, cls, label) => `<button type="button" class="btn ${cls}" data-tour="${act}">${label}</button>`;
  let actions;
  if (last) actions = `${btn('keep', 'ghost', t('tour.keep'))}<span class="grow"></span>${btn('finish', 'primary', t('tour.finish'))}`;
  else {
    actions = `${btn('skip', 'ghost', t('tour.skip'))}<span class="grow"></span>` +
      `${first ? '' : btn('back', 'ghost', t('tour.back'))}${btn('next', 'primary', t(first ? 'tour.start' : 'tour.next'))}`;
  }
  $('.tour-card').innerHTML = `
    <p class="tour-count">${t('tour.count', { n: tour.step + 1, total: tour.steps.length })}</p>
    <h2 id="tourTitle">${t(`tour.${s.key}.title`)}</h2>
    <p id="tourText">${t(`tour.${s.key}.text`)}</p>
    <div class="tour-actions">${actions}
    </div>`;
  bringIntoView(firstVisible(s.target));
  placeTour();
  $('.tour-card .btn.primary').focus();
}

// Scroll so the target's top sits just under the (sticky) top bar.
function bringIntoView(el) {
  if (!el || el.closest('.topbar, .nav') || getComputedStyle(el).position === 'fixed') return;
  const r = el.getBoundingClientRect();
  const top = $('.topbar').getBoundingClientRect().bottom + 8;
  if (r.top < top || r.bottom > innerHeight) window.scrollBy(0, r.top - top);
}

function placeTour() {
  if (tour.step < 0) return;
  const card = $('.tour-card');
  const spot = $('.tour-spot');
  const target = firstVisible(tour.steps[tour.step].target);
  $('.tour-block').classList.toggle('dim', !target);
  spot.hidden = !target;
  card.classList.toggle('centered', !target);
  if (!target) return;

  // Spotlight the target, clipped to the viewport (the map and timeline can be huge).
  const vw = document.documentElement.clientWidth;
  const vh = innerHeight;
  const r = target.getBoundingClientRect();
  const box = {
    left: Math.max(r.left - SPOT_PAD, 4), top: Math.max(r.top - SPOT_PAD, 4),
    right: Math.min(r.right + SPOT_PAD, vw - 4), bottom: Math.min(r.bottom + SPOT_PAD, vh - 4),
  };
  // A target taller than the screen (the board on a phone) is cut off to leave room for the card below it.
  const room = vh - card.offsetHeight - EDGE - 12;
  if (box.bottom > room && room - box.top > 80) box.bottom = room;
  Object.assign(spot.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });

  // The card goes below the target, else above, else beside it, else at the bottom of the screen.
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  let left = clamp(box.left, EDGE, vw - cw - EDGE);
  let top;
  if (box.bottom + 12 + ch <= vh - EDGE) top = box.bottom + 12;
  else if (box.top - 12 - ch >= EDGE) top = box.top - 12 - ch;
  else if (box.right + 12 + cw <= vw - EDGE) { left = box.right + 12; top = clamp(box.top, EDGE, vh - ch - EDGE); }
  else top = vh - ch - EDGE;
  Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
}

function endTour(keep) {
  if (tour.step < 0) return;
  tour.step = -1;
  removeEventListener('keydown', tourKeys, true);
  removeEventListener('resize', placeTour);
  removeEventListener('scroll', placeTour, true);
  document.querySelectorAll('.tour-block, .tour-spot, .tour-card').forEach(el => el.remove());
  if (keep) {
    setView('dashboard');
    toast(t('tour.kept'));
    return;
  }
  if (plans.list.some(p => p.id === tour.planId)) deletePlan(tour.planId);
  if (plans.list.some(p => p.id === tour.prevPlan)) openPlan(tour.prevPlan);
  setView(tour.prevView);
}

function tourKeys(e) {
  if (e.key === 'Escape') endTour(false);
  else if (e.key === 'ArrowRight' && tour.step < tour.steps.length - 1) showStep(tour.step + 1);
  else if (e.key === 'ArrowLeft' && tour.step > 0) showStep(tour.step - 1);
  else if (e.key === 'Tab') {
    // Keep focus inside the tour card.
    const btns = [...document.querySelectorAll('.tour-card button')];
    const i = btns.indexOf(document.activeElement);
    btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
  } else return;
  e.preventDefault();
  e.stopPropagation();
}

document.addEventListener('click', e => {
  const act = e.target.closest('[data-tour]')?.dataset.tour;
  if (act === 'next') showStep(tour.step + 1);
  else if (act === 'back') showStep(tour.step - 1);
  else if (act === 'skip' || act === 'finish') endTour(false);
  else if (act === 'keep') endTour(true);
});

/* ---------- Help mode ----------
   While on, each view opens with a banner explaining what it is for, and the
   first instance of each key control gets an ⓘ button with a one-line tip. */

const HELP_TIPS = [
  { sel: '.summary-line', key: 'summary', where: 'beforeend' },
  { sel: '.cat-chips', key: 'categories', where: 'beforeend' },
  { sel: '.card.goal .smart', key: 'smart' },
  { sel: '.trail-ends', key: 'trail', where: 'beforeend' },
  { sel: '.card.state .tag.state', key: 'stateValue' },
  { sel: '.check', key: 'check' },
  { sel: '.board .col h3', key: 'board', where: 'beforeend' },
  { sel: '[data-hide-done]', key: 'hideDone' },
  { sel: '[data-tl-deps]', key: 'tlDeps' },
  { sel: '.tl-legend + .tl-legend', key: 'tlLinks', where: 'beforeend' },
  { sel: '.gr-delta', key: 'grChange' },
  { sel: '.gr-legend', key: 'grLegend', where: 'beforeend' },
  { sel: '.map-controls .chips', key: 'mapShow', where: 'beforeend' },
  { sel: '.map-legend', key: 'status', where: 'beforeend' },
];

function decorateHelp() {
  closeHelpTip();
  if (!ui.help) return;
  const view = $('#view');
  view.insertAdjacentHTML('afterbegin', `<aside class="help-banner">
    <span class="help-mark" aria-hidden="true">?</span><p>${t('help.view.' + ui.view)}</p>
    <button type="button" class="btn ghost" data-help-off>${t('help.off')}</button></aside>`);
  HELP_TIPS.forEach(({ sel, key, where = 'afterend' }) => {
    view.querySelector(sel)?.insertAdjacentHTML(where,
      `<button type="button" class="help-dot" data-help-tip="${key}" aria-expanded="false" aria-label="${esc(t('help.tipLabel'))}" title="${esc(t('help.tipLabel'))}">i</button>`);
  });
}

function setHelp(on) {
  ui.help = on;
  prefs.set('help', on);
  $('#helpBtn').setAttribute('aria-pressed', on);
  render();
}

function openHelpTip(dot) {
  closeHelpTip();
  const tip = document.createElement('div');
  tip.className = 'help-tip';
  tip.id = 'helpTip';
  tip.setAttribute('role', 'tooltip');
  tip.textContent = t('help.tip.' + dot.dataset.helpTip);
  document.body.append(tip);
  dot.setAttribute('aria-expanded', 'true');
  dot.setAttribute('aria-describedby', 'helpTip');
  const r = dot.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const below = r.bottom + 8 + tip.offsetHeight <= innerHeight - EDGE;
  tip.style.left = `${clamp(r.left + r.width / 2 - tip.offsetWidth / 2, EDGE, vw - tip.offsetWidth - EDGE)}px`;
  tip.style.top = `${below ? r.bottom + 8 : r.top - 8 - tip.offsetHeight}px`;
}

function closeHelpTip() {
  $('#helpTip')?.remove();
  document.querySelectorAll('[data-help-tip][aria-expanded="true"]').forEach(d => {
    d.setAttribute('aria-expanded', 'false');
    d.removeAttribute('aria-describedby');
  });
}

// Capture phase: an ⓘ inside a card must not also open the card's edit form.
document.addEventListener('click', e => {
  const dot = e.target.closest('[data-help-tip]');
  if (dot) {
    e.preventDefault();
    e.stopPropagation();
    if (dot.getAttribute('aria-expanded') === 'true') closeHelpTip();
    else openHelpTip(dot);
    return;
  }
  closeHelpTip();
  if (e.target.closest('[data-help-off]')) setHelp(false);
}, true);
addEventListener('keydown', e => { if (e.key === 'Escape') closeHelpTip(); });
addEventListener('resize', closeHelpTip);
addEventListener('scroll', closeHelpTip, true);

/* ---------- First visit: choose a language before the tour ---------- */

// Switch language; the still-empty starter plan takes the new language's default name.
function pickLanguage(code) {
  const starter = plans.list.length === 1 && !itemCount() && plans.list[0].name === t('plan.defaultName');
  changeLanguage(code);
  if (!starter) return;
  plans.list[0].name = t('plan.defaultName');
  save();
  renderPlanSwitch();
}

function chooseLanguage(done) {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="tour-block dim lang-pick-block"></div>
    <div class="tour-card centered lang-pick" role="dialog" aria-modal="true" aria-labelledby="langPickTitle" aria-describedby="langPickText"></div>`);
  const card = $('.lang-pick');
  const draw = () => {
    card.innerHTML = `
      <h2 id="langPickTitle">${t('langPick.title')}</h2>
      <p id="langPickText">${t('langPick.text')}</p>
      <div class="lang-options" role="group" aria-labelledby="langPickTitle">${Object.entries(I18N).map(([code, l]) =>
        `<button type="button" class="btn" data-lang-pick="${code}" lang="${code}" aria-pressed="${code === lang}">${esc(l.name)}</button>`).join('')}</div>
      <div class="tour-actions"><span class="grow"></span><button type="button" class="btn primary" data-lang-done>${t('langPick.continue')}</button></div>`;
  };
  const keys = e => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Tab') {
      // Keep focus inside the card.
      const btns = [...card.querySelectorAll('button')];
      const i = btns.indexOf(document.activeElement);
      btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const close = () => {
    removeEventListener('keydown', keys, true);
    document.querySelectorAll('.lang-pick, .lang-pick-block').forEach(el => el.remove());
    done();
  };
  card.addEventListener('click', e => {
    const code = e.target.closest('[data-lang-pick]')?.dataset.langPick;
    if (code) {
      pickLanguage(code);
      draw();
      card.querySelector(`[data-lang-pick="${code}"]`).focus();
    } else if (e.target.closest('[data-lang-done]')) close();
  });
  addEventListener('keydown', keys, true);
  draw();
  card.querySelector('[data-lang-done]').focus();
}

/* ---------- Boot (called from app.js) ---------- */

function initTutorial(firstVisit) {
  $('#helpBtn').setAttribute('aria-pressed', ui.help);
  $('#helpBtn').addEventListener('click', () => setHelp(!ui.help));
  $('#tutorialBtn').addEventListener('click', startTour);
  if (firstVisit && !prefs.get('tourSeen', false)) requestAnimationFrame(() => chooseLanguage(startTour));
}
