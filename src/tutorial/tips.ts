/** Tips: the tip of the day as a card on the Overview and on the view it is about, its buttons, and tips asked for. */
import { t, type TextKey } from '../i18n/index';
import {
  CATALOGUE,
  askTip,
  closeTip,
  recheck,
  showsHint,
  snooze,
  tipOfDay,
  type Chosen,
} from '../core/guidance/tip-choice';
import type { TipAction, TipInput } from '../core/guidance/tip-facts';
import { WALK_VIEWS, walkView } from '../core/guidance/walk';
import { today } from '../core/dates';
import { db, visions } from '../core/state';
import { findEntity } from '../core/relations';
import { ui, type ViewName } from '../store/state';
import { isDemo } from '../store/plans';
import { getSeen, markDay, markView } from '../store/seen';
import { getTips, saveTips } from '../store/tips';
import { getWalk } from '../store/walk';
import { syncConfigured, syncConnected } from '../sync/sync';
import { $, esc, viewEl } from '../ui/dom';
import { setView } from '../ui/nav';
import { openForm } from '../ui/forms/form';
import { openStateValue } from '../ui/state-value';
import { openSettings } from '../ui/settings';
import { openExport, planExp } from '../ui/plan-io';
import { installHintKey, installPrompt, isInstalled } from '../ui/install';
import { openTemplates } from '../ui/templates-dialog';
import { openReplan } from '../ui/replan';
import { lateSteps } from '../core/replan';
import { requestRender } from '../ui/render';
import { openGuide } from '../views/guide';
import { walkInput } from './walkthrough';

// The tip drawn on the last render (its buttons act on it).
let drawn: Chosen | null = null;
// A tip the user asked for (Another tip, or Show me a tip in the Guide), until the page reloads;
// `key` null: nothing was left to say. `skip`: the tips already offered.
export let asked: { key: string | null; skip: string[] } | null = null;
export function setAsked(v: typeof asked) {
  asked = v;
}

function tipInput(): TipInput {
  const seen = getSeen();
  const device = {
    synced: syncConnected(),
    canInstall: !!installHintKey(),
    installed: isInstalled(),
    fine: matchMedia('(pointer: fine)').matches,
  };
  return { db, visions: visions.list, today: today(), lastReview: seen.lastReview, seen, device };
}

// Getting started is on and its first stage is open: one voice at a time.
function walkFirstOpen(): boolean {
  const walk = getWalk();
  if (walk.state !== 'on') return false;
  const first = walkView(walk, walkInput(walk)).stages[0];
  return !!first && first.done < first.total;
}

const target = (c: Chosen) => c.hit.target || c.hit.id || '';
const goTo = (view: ViewName) => () => setView(view);

export const TIP_DO: Record<TipAction, (c: Chosen, el: HTMLElement) => void> = {
  timeline: goTo('timeline'),
  // The back tip can show with nothing late: then the Timeline, as before.
  replan: () => (lateSteps(db, today()).length ? openReplan() : setView('timeline')),
  goals: goTo('goals'),
  activities: goTo('activities'),
  states: goTo('states'),
  graphs: goTo('graphs'),
  map: goTo('map'),
  editItem: c => {
    const e = findEntity(target(c));
    if (e && (e.kind === 'goal' || e.kind === 'activity' || e.kind === 'state')) openForm(e.kind, target(c));
  },
  addActivity: c => openForm('activity', null, { contributes: [target(c)] }),
  addRoutine: c => openForm('activity', null, { repeat: 'routine', contributes: [target(c)] }),
  addRoutineList: () => openForm('activity', null, { repeat: 'listRoutine' }),
  addState: c => openForm('state', null, { measures: [target(c)] }),
  addSubgoal: c => openForm('goal', null, { subgoal: [target(c)] }),
  addVision: () => openForm('vision'),
  recordValue: (c, el) => openStateValue(target(c), el),
  review: () => openGuide('review'),
  templates: () => openTemplates(),
  backup: () => (syncConfigured() ? openSettings('syncSection') : openExport()),
  install: () => (installPrompt ? $('#installBtn').click() : openSettings('installSection')),
  share: () => {
    openExport();
    planExp.querySelector<HTMLInputElement>('input[name="exportKind"][value="template"]')!.checked = true;
  },
};

// A tip's text or button with its names and numbers; `part` is a SMART letter, shown by its name.
function tipSays(c: Chosen, what: 'text' | 'btn'): string {
  const vars = { ...c.hit.vars };
  if (typeof vars.part === 'string') vars.part = t(`smart.${vars.part}` as TextKey);
  return t(`tip.${c.tip.id}.${what}` as TextKey, vars);
}

// A light bulb, the familiar sign for a tip.
const BULB =
  '<svg class="tip-bulb" viewBox="0 0 24 24" aria-hidden="true"><path class="glass" d="M12 2.8a6.2 6.2 0 0 0-3.7 11.2c.8.6 1.2 1.4 1.2 2.3h5c0-.9.4-1.7 1.2-2.3A6.2 6.2 0 0 0 12 2.8z"/><path d="M9.6 18.8h4.8M10.6 21.3h2.8"/></svg>';
const head = () => `<p class="tip-label" id="tipLabel">${BULB}${esc(t('tip.label'))}</p>`;
// × puts the tip off for a week (Not now); "Don't show this again" is a button of its own.
const closeX = () =>
  `<button type="button" class="tip-close" data-tip="later" aria-label="${esc(t('tip.later'))}" title="${esc(t('tip.later'))}">×</button>`;
const btn = (act: string, label: string, cls: string) =>
  `<button type="button" class="${cls}" data-tip="${act}">${esc(label)}</button>`;

export function tipHtml(c: Chosen, hint: boolean): string {
  return `<section class="tip" data-tip-key="${esc(c.key)}" aria-labelledby="tipLabel">
    ${head()}${closeX()}
    <p class="tip-text">${esc(tipSays(c, 'text'))}</p>
    ${hint ? `<p class="tip-hint">${esc(t('tip.settingsHint'))}</p>` : ''}
    <div class="tip-acts">
      ${c.tip.action ? btn('do', tipSays(c, 'btn'), 'btn small primary') : ''}
      ${c.tip.guide ? `<button type="button" class="guide-ref" data-guide-open="${c.tip.guide}">${esc(t('tip.why'))}</button>` : ''}
      ${btn('another', t('tip.another'), 'btn small ghost')}
      ${btn('never', t('tip.close'), 'btn small ghost')}
    </div>
  </section>`;
}

// After the last asked-for tip: nothing more to say about the plan; the Guide lists the rest.
const noneHtml = () => `<section class="tip tip-none" aria-labelledby="tipLabel">
    ${head()}${closeX()}
    <p class="tip-text">${esc(t('tip.none'))}</p>
    <div class="tip-acts"><button type="button" class="guide-ref" data-guide-open="tips-all">${esc(t('tip.all'))}</button></div>
  </section>`;

/* ---------- After every draw ---------- */

// Notes the day and the view; chooses the tip of the day (once a day) and draws it, or the tip
// asked for, on the Overview and at the top of the view it is about.
export function decorateTips() {
  drawn = null;
  const before = getTips();
  if (!before.off && !isDemo()) {
    markDay(today());
    if ((WALK_VIEWS as readonly string[]).includes(ui.view)) markView(ui.view);
  }
  if (ui.view === 'guide' || document.querySelector('dialog[open]')) return;
  const inp = tipInput();
  const { tips, show: ofDay } = tipOfDay(CATALOGUE, inp, before, { demo: isDemo(), walkOpen: walkFirstOpen() });
  const stored = tips !== before ? saveTips(tips) : tips;
  // An asked-for tip shows while it holds and was not put off; then the tip of the day is back.
  const mine = asked?.key ? recheck(CATALOGUE, inp, asked.key, stored) : null;
  if (asked?.key && !mine) asked = null;
  if (asked && !asked.key) return ui.view === 'dashboard' && place(noneHtml());
  const show = mine || ofDay;
  if (!show || (ui.view !== 'dashboard' && ui.view !== show.tip.view)) return;
  drawn = show;
  place(tipHtml(show, showsHint(stored)));
}

// On the Overview under the summary and Getting started; elsewhere at the top of the view.
function place(html: string) {
  const after = ui.view === 'dashboard' && (viewEl.querySelector('.summary') || viewEl.querySelector('.walk.card'));
  if (after) after.insertAdjacentHTML('afterend', html);
  else viewEl.insertAdjacentHTML('afterbegin', html);
}

/* ---------- Clicks ---------- */

// The next tip: past the one on screen and those offered already, in the usual order. It shows on the Overview.
export function askForTip() {
  const tips = getTips();
  const now = [drawn?.key, tips.day === today() ? tips.current : null].filter((k): k is string => !!k);
  const skip = [...new Set([...(asked?.skip || []), ...now])];
  const key = askTip(CATALOGUE, tipInput(), tips, skip)?.key ?? null;
  asked = { key, skip: key ? [...skip, key] : skip };
  if (ui.view === 'dashboard') requestRender();
  else setView('dashboard');
}

export function tipAction(act: string, el: HTMLElement) {
  const c = drawn;
  if (act === 'another') return askForTip();
  if (!c) {
    asked = null; // × on "nothing left"
    return requestRender();
  }
  if (act === 'do' && c.tip.action) return TIP_DO[c.tip.action](c, el);
  if (act === 'later') saveTips(snooze(getTips(), c.key, today()));
  else if (act === 'never') saveTips(closeTip(getTips(), c.key, today()));
  requestRender();
}

export function listenTips() {
  viewEl.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (el) tipAction(el.dataset.tip!, el);
  });
}
