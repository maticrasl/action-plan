/** Getting started: the self-ticking card on the Overview, its list in the Guide, and "Show me". */
import { t, type TextKey } from '../i18n/index';
import {
  WALK_VIEWS,
  checkTask,
  latch,
  walkView,
  type StageView,
  type TaskId,
  type TaskView,
  type Walk,
  type WalkInput,
  type WalkView,
} from '../core/guidance/walk';
import { today } from '../core/dates';
import { db, visions } from '../core/state';
import { ui, type ViewName } from '../store/state';
import { isDemo } from '../store/plans';
import { prefs } from '../store/prefs';
import { getSeen, markDay, markView } from '../store/seen';
import { getWalk, replaceWalk, setWalk } from '../store/walk';
import { syncConfigured } from '../sync/sync';
import { $, esc, trail, viewEl } from '../ui/dom';
import { setView } from '../ui/nav';
import { openForm } from '../ui/forms/form';
import { openSettings } from '../ui/settings';
import { openExport } from '../ui/plan-io';
import { installHintKey, installPrompt, isInstalled } from '../ui/install';
import { requestRender } from '../ui/render';
import { toast } from '../ui/toast';
import { openGuide } from '../views/guide';
import { firstVisible, spotlight } from './spotlight';

// The Guide article each task's "More on this" opens.
const ARTICLE: Record<TaskId, string> = {
  goal: 'what-goal',
  state: 'h-states',
  steps: 'first-steps',
  firstDone: 'not-starting',
  routine: 'h-routines',
  tick: 'h-routines',
  measure: 'h-graphs',
  days: 'review',
  backup: 'p-backup',
  install: 'h-install',
  views: 'h-map',
  vision: 'vision-how',
  review: 'review',
};

// What the card shows of itself, while the app is open (folding is stored).
export const walkUi: { shown: TaskId | null; stage: string | null; inGuide: boolean } = {
  shown: null,
  stage: null,
  inGuide: false,
};

const hint = () => installHintKey();
export const walkInput = (walk: Walk): WalkInput => ({
  db,
  visions: visions.list,
  seen: getSeen(),
  env: {
    syncOn: syncConfigured(),
    synced: prefs.get<unknown>('syncedOnce', false) === true,
    installed: isInstalled(),
    canInstall: !!installPrompt || (!!hint() && hint() !== 'install.hint'),
  },
  started: walk.started,
});

const title = (id: TaskId) => t(`walk.${id}.title` as TextKey);

/* ---------- Doing a task ---------- */

const firstGoal = () => db.goals[0]?.id;
// Goes to the view and rings the first visible of `sels` there.
function showMe(view: ViewName, sels: string[]) {
  if (!(ui.view === view && firstVisible(sels))) setView(view);
  spotlight(sels);
}
const nextView = () => WALK_VIEWS.find(v => !getSeen().views?.[v]) || 'map';

export const WALK_DO: Record<TaskId, () => void> = {
  goal: () => openForm('goal'),
  state: () => openForm('state', null, firstGoal() ? { measures: [firstGoal()] } : {}),
  steps: () => openForm('activity', null, firstGoal() ? { contributes: [firstGoal()] } : {}),
  firstDone: () => showMe('activities', ['#view .board .check']),
  routine: () => openForm('activity', null, { repeat: 'routine' }),
  tick: () => showMe(ui.view === 'dashboard' && firstVisible(['#view .rt-week']) ? 'dashboard' : 'activities', ['#view .rt-week']),
  measure: () => showMe('states', ['#view .card.state']),
  days: () => {},
  backup: () => (syncConfigured() ? openSettings('syncSection') : openExport()),
  install: () => (installPrompt ? $('#installBtn').click() : openSettings('installSection')),
  views: () => setView(nextView()),
  vision: () => openForm('vision'),
  review: () => openGuide('review'),
};

const btn = (act: string, label: string, cls = 'btn small', extra = '') =>
  `<button type="button" class="${cls}" data-walk="${act}"${extra}>${esc(label)}</button>`;

function taskButtons(id: TaskId) {
  const showMeTask = ['firstDone', 'tick', 'measure'].includes(id);
  if (id === 'days') return '';
  if (id === 'views') return btn(`do:${id}`, t(`walk.views.btn.${nextView()}` as TextKey), 'btn small primary');
  if (id === 'backup')
    return syncConfigured()
      ? btn(`do:${id}`, t('walk.backup.btn'), 'btn small primary') + btn('export', t('btn.export'))
      : btn('export', t('btn.export'), 'btn small primary');
  if (id === 'install' && !installPrompt)
    return hint() ? `<span class="walk-note">${esc(t(hint() as TextKey))}</span>` : '';
  const label = showMeTask ? t('walk.showMe') : t(`walk.${id}.btn` as TextKey);
  return btn(`do:${id}`, label, 'btn small primary');
}

/* ---------- Drawing ---------- */

function taskBody(x: TaskView) {
  const id = x.id;
  const text = id === 'backup' && !syncConfigured() ? t('walk.backup.textLocal') : t(`walk.${id}.text` as TextKey);
  const views =
    id === 'views'
      ? `<span class="walk-views">${WALK_VIEWS.map(
          v => `<span class="${getSeen().views?.[v] ? 'on' : ''}">${getSeen().views?.[v] ? '✓ ' : ''}${esc(t(`nav.${v}` as TextKey))}</span>`,
        ).join(' · ')}</span>`
      : '';
  return `<div class="walk-body" id="walk-body-${id}">
    <p>${esc(text)} ${views}</p>
    <div class="walk-acts">${taskButtons(id)}${btn(`skip:${id}`, t('walk.skip'), 'btn small ghost')}
      <button type="button" class="guide-ref" data-guide-open="${ARTICLE[id]}">${esc(t('walk.more'))}</button></div>
  </div>`;
}

function taskHtml(x: TaskView, shown: TaskId | null, v: WalkView) {
  const mark = x.status === 'done' || x.status === 'notNeeded' ? '✓' : x.status === 'skipped' ? '✓' : '';
  const note =
    x.status === 'notNeeded'
      ? `<span class="walk-note">${esc(t(`walk.${x.id}.notNeeded` as TextKey))}</span>`
      : x.status === 'skipped'
        ? `<span class="walk-note">${esc(t('walk.skipped'))}</span>`
        : '';
  const count = x.id === 'days' && x.status === 'open' ? `<span class="walk-n">${t('walk.days', { n: v.days })}</span>` : '';
  const optional = x.optional ? ` <em>(${esc(t('walk.optional'))})</em>` : '';
  const open = x.status === 'open';
  const isShown = open && x.id === shown;
  const head = open
    ? `<button type="button" class="walk-task-name" data-walk="show:${x.id}" aria-expanded="${isShown}"${isShown ? ` aria-controls="walk-body-${x.id}"` : ''}>${esc(title(x.id))}${optional}</button>`
    : `<span class="walk-task-name">${esc(title(x.id))}${optional}</span>`;
  return `<li class="walk-task ${x.status}" data-task="${x.id}">
    <span class="walk-tick" aria-hidden="true">${mark}</span>${head}${count}${note}
    ${isShown ? taskBody(x) : ''}
  </li>`;
}

// A stage done today says so for the rest of the day; otherwise its lead, or its count.
function stageHtml(s: StageView, walk: Walk, v: WalkView, shown: TaskId | null, open: boolean) {
  const complete = s.done === s.total;
  const doneToday = complete && s.tasks.some(x => walk.done[x.id] === today());
  const state = complete ? `✓ ${esc(t('walk.doneWord'))}` : t('walk.count', { done: s.done, total: s.total });
  return `<li class="walk-stage${complete ? ' complete' : ''}" data-stage="${s.id}">
    <button type="button" class="walk-stage-head" data-walk="stage:${s.id}" aria-expanded="${open}">
      <span>${esc(t(`walk.stage.${s.id}.title` as TextKey))}</span><span class="walk-n">${state}</span></button>
    ${
      open || doneToday
        ? `<p class="walk-lead">${esc(t(`walk.stage.${s.id}.${doneToday ? 'done' : 'lead'}` as TextKey))}</p>`
        : ''
    }
    ${open ? `<ul class="walk-tasks">${s.tasks.map(x => taskHtml(x, shown, v)).join('')}</ul>` : ''}
  </li>`;
}

// The stages with their tasks: the one holding the shown task unfolded (or the one tapped).
export function walkListHtml(walk: Walk, v: WalkView) {
  const shown = walkUi.shown && v.stages.some(s => s.tasks.some(x => x.id === walkUi.shown && x.status === 'open'))
    ? walkUi.shown
    : v.next;
  const holder = v.stages.find(s => s.tasks.some(x => x.id === shown))?.id ?? null;
  const openStage = walkUi.stage ?? holder;
  return `<ol class="walk-stages">${v.stages.map(s => stageHtml(s, walk, v, shown, s.id === openStage)).join('')}</ol>`;
}

function cardHtml(walk: Walk, v: WalkView) {
  const count = t('walk.count', { done: v.done, total: v.total });
  const pct = v.total ? (v.done / v.total) * 100 : 0;
  if (!v.next)
    return `<section class="walk card finished" aria-labelledby="walkTitle">
      <h2 id="walkTitle">${esc(t('walk.finished.title'))}</h2>
      <p>${esc(t('walk.finished.text'))}</p>
      <div class="walk-acts">${btn('close', t('walk.close'), 'btn small primary')}</div></section>`;
  const fold = (folded: boolean) =>
    `<button type="button" class="walk-fold" data-walk="fold" aria-expanded="${!folded}" aria-label="${esc(t(folded ? 'walk.unfold' : 'walk.fold'))}" title="${esc(t(folded ? 'walk.unfold' : 'walk.fold'))}">${folded ? '+' : '–'}</button>`;
  if (walk.folded)
    return `<section class="walk card folded" aria-label="${esc(t('walk.title'))}">
      <p class="walk-line"><strong>${esc(t('walk.title'))}</strong> · ${count} · ${esc(t('walk.next', { task: title(v.next) }))}</p>${fold(true)}</section>`;
  return `<section class="walk card" aria-labelledby="walkTitle">
    <header class="walk-head"><h2 id="walkTitle">${esc(t('walk.title'))}</h2><span class="walk-n">${count}</span>${fold(false)}</header>
    ${trail(pct, '', '')}
    ${walkListHtml(walk, v)}
    <p class="walk-foot">${btn('hide', t('walk.hide'), 'btn small ghost')}</p>
  </section>`;
}

// The Guide's line, and the list under it when opened.
function guideHtml(walk: Walk, v: WalkView) {
  const head = `<strong>${esc(t('walk.title'))}</strong>`;
  if (walk.state === 'off')
    return `<p class="walk-line">${head} · ${btn('start', t('walk.start'), 'btn small primary')}</p>`;
  const finished = walk.state === 'finished' || !v.next;
  const line = finished
    ? `${head} · ${esc(t('walk.doneWord'))} · ${btn('guide', t('walk.again'), 'btn small', ` aria-expanded="${walkUi.inGuide}"`)}`
    : `${head} · ${t('walk.count', { done: v.done, total: v.total })} · ${btn('guide', t('walk.continue'), 'btn small primary', ` aria-expanded="${walkUi.inGuide}"`)}`;
  return `<p class="walk-line">${line}</p>${
    walkUi.inGuide ? `${walkListHtml(walk, v)}<p class="walk-foot">${btn('over', t('walk.over'), 'guide-ref')}</p>` : ''
  }`;
}

/* ---------- After every draw ---------- */

// Ticks what the open plan shows; then the card on the Overview, or the list in the Guide.
export function decorateWalk() {
  if (isDemo()) return;
  let walk = getWalk();
  if (walk.state === 'on') {
    markDay(today());
    if ((WALK_VIEWS as readonly string[]).includes(ui.view)) markView(ui.view);
    const before = walk;
    walk = latch(walk, walkInput(walk), today());
    if (walk !== before) {
      setWalk(walk);
      const ticked = (Object.keys(walk.done) as TaskId[]).filter(id => !before.done[id]);
      const v = walkView(walk, walkInput(walk));
      const task = title(ticked[ticked.length - 1]);
      // After the toast of the edit that ticked it (a form saves, draws, then says "Goal added").
      if (ui.view !== 'dashboard')
        setTimeout(() => toast(v.next ? t('walk.tickedNext', { task, next: title(v.next) }) : t('walk.ticked', { task })));
    }
  }
  const slot = viewEl.querySelector('[data-walk-slot]');
  if (slot) slot.innerHTML = guideHtml(walk, walkView(walk, walkInput(walk)));
  if (ui.view === 'dashboard' && walk.state === 'on')
    viewEl.insertAdjacentHTML('afterbegin', cardHtml(walk, walkView(walk, walkInput(walk))));
}

/* ---------- Clicks ---------- */

export function walkAction(act: string) {
  const [what, arg] = act.split(':') as [string, TaskId];
  const walk = getWalk();
  if (what === 'do') return WALK_DO[arg]();
  if (what === 'export') return openExport();
  if (what === 'show') walkUi.shown = arg;
  else if (what === 'stage') walkUi.stage = walkUi.stage === arg ? '' : arg;
  else if (what === 'skip') setWalk({ ...walk, skipped: [...walk.skipped, arg] });
  else if (what === 'fold') setWalk({ ...walk, folded: !walk.folded });
  else if (what === 'close') setWalk({ ...walk, state: 'finished' });
  else if (what === 'guide') walkUi.inGuide = !walkUi.inGuide;
  else if (what === 'hide') {
    setWalk({ ...walk, state: 'off' });
    toast(t('walk.hidden'));
  } else if (what === 'start') {
    setWalk({ ...walk, state: 'on', started: walk.started || today() });
    walkUi.inGuide = true;
  } else if (what === 'over') {
    // Keeps the ticks the open plan still shows; the rest open again.
    const inp = walkInput(walk);
    const done = Object.fromEntries(
      (Object.entries(walk.done) as [TaskId, string][]).filter(([id]) => checkTask(id, inp)),
    );
    replaceWalk({ ...walk, state: 'on', done, skipped: [] });
  }
  if (what === 'skip' || what === 'show') walkUi.stage = null;
  requestRender();
  if (what === 'show' || what === 'stage' || what === 'fold' || what === 'guide')
    viewEl.querySelector<HTMLElement>(`[data-walk="${act}"]`)?.focus();
}

export function listenWalk() {
  viewEl.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-walk]');
    if (el) walkAction(el.dataset.walk!);
  });
}
