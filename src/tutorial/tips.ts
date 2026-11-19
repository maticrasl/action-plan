/** Tips: the tip of the day as a card on the Overview and on the view it is about, and its buttons. */
import { t, type TextKey } from '../i18n/index';
import { CATALOGUE, closeTip, showsHint, snooze, tipOfDay, type Chosen } from '../core/guidance/tip-choice';
import type { TipAction, TipInput } from '../core/guidance/tip-facts';
import { walkView } from '../core/guidance/walk';
import { today } from '../core/dates';
import { db, visions } from '../core/state';
import { findEntity } from '../core/relations';
import { ui, type ViewName } from '../store/state';
import { isDemo } from '../store/plans';
import { getSeen } from '../store/seen';
import { getTips, saveTips } from '../store/tips';
import { getWalk } from '../store/walk';
import { esc, viewEl } from '../ui/dom';
import { setView } from '../ui/nav';
import { openForm } from '../ui/forms/form';
import { openStateValue } from '../ui/state-value';
import { requestRender } from '../ui/render';
import { openGuide } from '../views/guide';
import { walkInput } from './walkthrough';

// The tip drawn on the last render (its buttons act on it).
let drawn: Chosen | null = null;

const tipInput = (): TipInput => ({ db, visions: visions.list, today: today(), lastReview: getSeen().lastReview });

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
  goals: goTo('goals'),
  activities: goTo('activities'),
  states: goTo('states'),
  graphs: goTo('graphs'),
  editItem: c => {
    const e = findEntity(target(c));
    if (e && (e.kind === 'goal' || e.kind === 'activity' || e.kind === 'state')) openForm(e.kind, target(c));
  },
  addActivity: c => openForm('activity', null, { contributes: [target(c)] }),
  addRoutine: c => openForm('activity', null, { repeat: 'routine', contributes: [target(c)] }),
  addState: c => openForm('state', null, { measures: [target(c)] }),
  addSubgoal: c => openForm('goal', null, { subgoal: [target(c)] }),
  addVision: () => openForm('vision'),
  recordValue: (c, el) => openStateValue(target(c), el),
  review: () => openGuide('review'),
};

// A tip's text or button with its names and numbers; `part` is a SMART letter, shown by its name.
function tipSays(c: Chosen, what: 'text' | 'btn'): string {
  const vars = { ...c.hit.vars };
  if (typeof vars.part === 'string') vars.part = t(`smart.${vars.part}` as TextKey);
  return t(`tip.${c.tip.id}.${what}` as TextKey, vars);
}

export function tipHtml(c: Chosen, hint: boolean): string {
  const btn = (act: string, label: string, cls: string) =>
    `<button type="button" class="${cls}" data-tip="${act}">${esc(label)}</button>`;
  return `<section class="tip" data-tip-key="${esc(c.key)}" aria-labelledby="tipLabel">
    <p class="tip-label" id="tipLabel">${esc(t('tip.label'))}</p>
    <button type="button" class="tip-close" data-tip="close" aria-label="${esc(t('tip.close'))}" title="${esc(t('tip.close'))}">×</button>
    <p class="tip-text">${esc(tipSays(c, 'text'))}</p>
    ${hint ? `<p class="tip-hint">${esc(t('tip.settingsHint'))}</p>` : ''}
    <div class="tip-acts">
      ${c.tip.action ? btn('do', tipSays(c, 'btn'), 'btn small primary') : ''}
      ${c.tip.guide ? `<button type="button" class="guide-ref" data-guide-open="${c.tip.guide}">${esc(t('tip.why'))}</button>` : ''}
      ${btn('later', t('tip.later'), 'btn small ghost')}
    </div>
  </section>`;
}

/* ---------- After every draw ---------- */

// Chooses the tip of the day (once a day) and draws it on the Overview, under the summary and
// Getting started, and at the top of the view it is about.
export function decorateTips() {
  drawn = null;
  if (ui.view === 'guide' || document.querySelector('dialog[open]')) return;
  const before = getTips();
  const { tips, show } = tipOfDay(CATALOGUE, tipInput(), before, { demo: isDemo(), walkOpen: walkFirstOpen() });
  const stored = tips !== before ? saveTips(tips) : tips;
  if (!show || (ui.view !== 'dashboard' && ui.view !== show.tip.view)) return;
  drawn = show;
  const html = tipHtml(show, showsHint(stored));
  const after = ui.view === 'dashboard' && (viewEl.querySelector('.summary') || viewEl.querySelector('.walk.card'));
  if (after) after.insertAdjacentHTML('afterend', html);
  else viewEl.insertAdjacentHTML('afterbegin', html);
}

/* ---------- Clicks ---------- */

export function tipAction(act: string, el: HTMLElement) {
  const c = drawn;
  if (!c) return;
  if (act === 'do' && c.tip.action) return TIP_DO[c.tip.action](c, el);
  if (act === 'later') saveTips(snooze(getTips(), c.key, today()));
  else if (act === 'close') saveTips(closeTip(getTips(), c.key, today()));
  requestRender();
}

export function listenTips() {
  viewEl.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (el) tipAction(el.dataset.tip!, el);
  });
}
