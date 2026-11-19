/** A first visit: the language picker, then the welcome card; and the banner over a sample plan. */
import { I18N, Lang, lang, t } from '../i18n/index';
import { offerWalk } from '../core/guidance/walk';
import { today } from '../core/dates';
import { plans } from '../store/state';
import { prefs } from '../store/prefs';
import { createPlan, deletePlan, isDemo, openPlan, save } from '../store/plans';
import { setWalk, storedWalk } from '../store/walk';
import { $, esc, itemCount, viewEl } from '../ui/dom';
import { changeLanguage } from '../ui/settings';
import { renderPlanSwitch } from '../ui/plan-switcher';
import { setView } from '../ui/nav';
import { toast } from '../ui/toast';
import { loadSample } from '../ui/sample';
import { openTemplates } from '../ui/templates-dialog';

// Switch language; the still-empty starter plan takes the new language's default name.
export function pickLanguage(code: Lang) {
  const starter = plans.list.length === 1 && !itemCount() && plans.list[0].name === t('plan.defaultName');
  changeLanguage(code);
  if (!starter) return;
  plans.list[0].name = t('plan.defaultName');
  save();
  renderPlanSwitch();
}

export function chooseLanguage(done: () => void) {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
    <div class="tour-block dim lang-pick-block"></div>
    <div class="tour-card centered lang-pick" role="dialog" aria-modal="true" aria-labelledby="langPickTitle" aria-describedby="langPickText"></div>`,
  );
  const card = $('.lang-pick');
  const draw = () => {
    card.innerHTML = `
      <h2 id="langPickTitle">${t('langPick.title')}</h2>
      <p id="langPickText">${t('langPick.text')}</p>
      <div class="lang-options" role="group" aria-labelledby="langPickTitle">${Object.entries(I18N)
        .map(
          ([code, l]) =>
            `<button type="button" class="btn" data-lang-pick="${code}" lang="${code}" aria-pressed="${code === lang}">${esc(l.name)}</button>`,
        )
        .join('')}</div>
      <div class="tour-actions"><span class="grow"></span><button type="button" class="btn primary" data-lang-done>${t('langPick.continue')}</button></div>`;
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Tab') {
      // Keep focus inside the card.
      const btns = [...card.querySelectorAll('button')];
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
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
    const code = (e.target as HTMLElement).closest<HTMLElement>('[data-lang-pick]')?.dataset.langPick as
      Lang | undefined;
    if (code) {
      pickLanguage(code);
      draw();
      card.querySelector<HTMLElement>(`[data-lang-pick="${code}"]`)!.focus();
    } else if ((e.target as HTMLElement).closest('[data-lang-done]')) close();
  });
  addEventListener('keydown', keys, true);
  draw();
  card.querySelector<HTMLElement>('[data-lang-done]')!.focus();
}

/* ---------- The welcome card ---------- */

type Begin = 'own' | 'template' | 'sample' | 'self';

// Getting started is on after every choice but "I'll find my own way"; on a sample it waits.
export function beginWith(how: Begin) {
  closeWelcome();
  setWalk({ state: how === 'self' ? 'off' : 'on', started: today(), done: {}, skipped: [] });
  setView('dashboard');
  if (how === 'template') openTemplates();
  else if (how === 'sample') loadSample();
  else if (how === 'self') toast(t('walk.hidden'));
}

const welcomeKeys = (e: KeyboardEvent) => {
  if (e.key === 'Escape') beginWith('own');
  else if (e.key === 'Tab') {
    // Keep focus inside the card.
    const btns = [...document.querySelectorAll<HTMLElement>('.welcome button')];
    const i = btns.indexOf(document.activeElement as HTMLElement);
    btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
  } else return;
  e.preventDefault();
  e.stopPropagation();
};

export function showWelcome() {
  const b = (how: Begin, cls: string) =>
    `<button type="button" class="btn ${cls}" data-begin="${how}">${esc(t(`welcome.${how}`))}</button>`;
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="tour-block dim welcome-block" data-begin="own"></div>
    <div class="tour-card centered welcome" role="dialog" aria-modal="true" aria-labelledby="welcomeTitle" aria-describedby="welcomeText">
      <h2 id="welcomeTitle">${esc(t('welcome.title'))}</h2>
      <p id="welcomeText">${esc(t('welcome.text'))}</p>
      <div class="welcome-options">${b('own', 'primary')}${b('template', '')}${b('sample', '')}</div>
      <p class="welcome-self">${b('self', 'ghost small')}</p>
    </div>`,
  );
  addEventListener('keydown', welcomeKeys, true);
  $<HTMLElement>('.welcome .btn.primary').focus();
}

export function closeWelcome() {
  removeEventListener('keydown', welcomeKeys, true);
  document.querySelectorAll('.welcome, .welcome-block, .lang-pick, .lang-pick-block').forEach(el => el.remove());
}

document.addEventListener('click', e => {
  const how = (e.target as HTMLElement).closest<HTMLElement>('[data-begin]')?.dataset.begin as Begin | undefined;
  if (how) beginWith(how);
  const demo = (e.target as HTMLElement).closest<HTMLElement>('[data-demo]')?.dataset.demo;
  if (demo) leaveDemo(demo === 'remove');
});

// On a first visit (also a new user's first sign-in): the language picker, then the welcome card.
export let offerWelcome = () => {
  if (offerWalk(true, storedWalk(), prefs.get<unknown>('tourSeen', false) === true) === 'welcome')
    requestAnimationFrame(() => chooseLanguage(showWelcome));
};
// Tests replace offerWelcome; callers see the replacement through the live import.
export function setOfferWelcome(f: () => void) {
  offerWelcome = f;
}

/* ---------- The banner over a sample plan ---------- */

// The own plan drawn last: leaving the sample goes back to it.
let lastOwn: string | null = null;

export function decorateDemo() {
  if (!isDemo()) {
    lastOwn = plans.current;
    return;
  }
  viewEl.insertAdjacentHTML(
    'afterbegin',
    `<aside class="demo-banner" role="note"><p>${esc(t('demo.banner'))}</p>
      <button type="button" class="btn small primary" data-demo="own">${esc(t('demo.own'))}</button>
      <button type="button" class="btn small ghost" data-demo="remove">${esc(t('demo.remove'))}</button></aside>`,
  );
}

// To the user's own plan: the one they came from, else the first that is not a sample, else a new one.
export function leaveDemo(remove: boolean) {
  const back = lastOwn; // deleting opens (and draws) another plan first
  if (remove) deletePlan(plans.current!);
  const own = plans.list.find(p => p.id === back && !p.demo) || plans.list.find(p => !p.demo);
  if (own) openPlan(own.id);
  else createPlan(t('plan.defaultName'));
  setView('dashboard');
}
