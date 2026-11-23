/** The Review view (feature 14): the switch between the reviews, and the done log (feature 13): what was finished, by week and day, in this plan or all plans. */
import { db } from '../core/state';
import { fmtDay, today } from '../core/dates';
import { addDays, weekday } from '../core/routines/schedule';
import { doneLog, weekCounts, type DoneEntry, type DoneKind } from '../core/done-log';
import { findEntity } from '../core/relations';
import { esc } from '../ui/dom';
import type { Db } from '../core/model';
import { t, tp } from '../i18n/index';
import { plans } from '../store/state';
import { openPlan, readPlan } from '../store/plans';
import { openForm } from '../ui/forms/form';
import { toast } from '../ui/toast';
import { setView } from '../ui/nav';
import { requestRender as render } from '../ui/render';
import { reviewView, tabsHtml, type ReviewTab } from './review-frame';
import { finishWeek, renderWeekReview, shiftWeek } from './review-week';
import { openFocusPicker, openIn } from './focus';
import { openReplan } from '../ui/replan';
import { addEntry, isCumulative, recordMeasurement } from '../core/cumulative';
import { parseNum } from '../core/util';
import { save } from '../store/plans';

const FILTERS = {
  all: null,
  steps: ['step', 'item'],
  routines: ['routine'],
  values: ['value', 'amount'],
  goals: ['goal'],
} satisfies Record<string, DoneKind[] | null>;
type LogFilter = keyof typeof FILTERS;
const WEEKS = 8; // shown at first, and added by "Show earlier"

// What the log shows; the same for every user and plan, so not stored.
export const logView = { all: false, filter: 'all' as LogFilter, weeks: WEEKS };

const MARK: Record<DoneKind, string> = {
  step: '✓',
  item: '✓',
  routine: '⟳',
  value: '◐',
  amount: '◐',
  goal: '★',
  note: '✎',
};

// Opens the Review view on one of its tabs (tips, Getting started and the Guide's buttons).
export function openReview(tab: ReviewTab) {
  reviewView.tab = tab;
  reviewView.open = '';
  setView('review');
}

// The switch, then the tab shown.
export function renderReview(): string {
  const tab = reviewView.tab;
  const body = tab === 'week' ? renderWeekReview() : renderLog();
  return `<div class="rv-view">${tabsHtml()}${body}</div>`;
}

function renderLog(): string {
  const now = today(),
    monday = addDays(now, -weekday(now)),
    from = addDays(monday, -7 * (logView.weeks - 1));
  const sources = logView.all
    ? plans.list.filter(p => !p.demo).map(p => ({ plan: p.id, data: p.id === plans.current ? db : readPlan(p.id) }))
    : [{ plan: plans.current || '', data: db }];
  const data = new Map(sources.map(s => [s.plan, s.data]));
  const kinds: DoneKind[] | null = FILTERS[logView.filter];
  // The whole history, to know whether anything is earlier; cheap next to drawing (npm run perf, "review").
  const all = doneLog(sources, '0000-01-01', now).filter(e => !kinds || kinds.includes(e.kind));
  const shown = all.filter(e => e.day >= from);
  const chips = (Object.keys(FILTERS) as LogFilter[])
    .map(
      f =>
        `<button class="chip ${logView.filter === f ? 'active' : ''}" data-log="filter" data-v="${f}">${t(`log.filter.${f}`)}</button>`,
    )
    .join('');
  const scope = `<select data-log-scope aria-label="${esc(t('log.title'))}">${['plan', 'all']
    .map(
      v =>
        `<option value="${v}"${logView.all === (v === 'all') ? ' selected' : ''}>${t(`log.scope.${v as 'plan' | 'all'}`)}</option>`,
    )
    .join('')}</select>`;
  const body = shown.length
    ? weeks(shown, monday, data) +
      (all.length > shown.length ? `<button class="btn log-more" data-log="more">${t('log.more')}</button>` : '')
    : `<div class="empty">${t('log.empty')}</div>`;
  return `<section class="done-log">
    <div class="toolbar"><h2 class="log-title-h">${t('log.title')}</h2>${scope}<div class="chips">${chips}</div></div>
    ${body}
  </section>`;
}

const groupBy = <T>(xs: T[], key: (x: T) => string) => {
  const out = new Map<string, T[]>();
  xs.forEach(x => out.set(key(x), [...(out.get(key(x)) || []), x]));
  return out;
};

export function weeks(entries: DoneEntry[], monday: string, data: Map<string, Db>): string {
  const span = (start: string) =>
    `${fmtDay(start, { day: 'numeric', month: 'short' })} – ${fmtDay(addDays(start, 6), { day: 'numeric', month: 'short' })}`;
  return [...groupBy(entries, e => addDays(e.day, -weekday(e.day)))]
    .map(([start, list]) => {
      const name =
        start === monday ? t('log.thisWeek') : start === addDays(monday, -7) ? t('log.lastWeek') : span(start);
      const c = weekCounts(list);
      const counts = [
        c.steps && tp('log.steps', c.steps),
        c.routineDays && tp('log.ticks', c.routineDays),
        c.values && tp('log.values', c.values),
      ].filter(Boolean);
      const days = [...groupBy(list, e => e.day)]
        .map(([day, es]) => {
          const many = new Set(es.map(e => e.plan)).size > 1;
          return `<h4 class="log-day">${fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' })}</h4>
            <ul class="log-lines">${lines(es, data, many)}</ul>`;
        })
        .join('');
      return `<div class="log-week"><h3 class="log-week-h"><span>${name}</span><small>${counts.join(' · ')}</small></h3>${days}</div>`;
    })
    .join('');
}

const open = (plan: string, id: string, label: string, cls = 'log-open') =>
  `<button class="${cls}" data-log="open" data-plan="${esc(plan)}" data-id="${esc(id)}">${label}</button>`;

// One day's lines; its routine ticks share one line per plan.
function lines(es: DoneEntry[], data: Map<string, Db>, many: boolean): string {
  const planTag = (plan: string) =>
    many ? `<span class="log-plan">${esc(plans.list.find(p => p.id === plan)?.name || '')}</span>` : '';
  const routines = groupBy(
    es.filter(e => e.kind === 'routine'),
    e => e.plan,
  );
  const line = (e: DoneEntry, what: string, tag = '') =>
    `<li class="log-line k-${e.kind}"><span class="log-mark" aria-hidden="true">${MARK[e.kind]}</span><span class="log-what">${what}</span>${tag}${planTag(e.plan)}</li>`;
  return es
    .map(e => {
      if (e.kind === 'routine') {
        const rs = routines.get(e.plan)!;
        return rs[0] === e ? line(e, rs.map(r => open(r.plan, r.id, esc(r.title))).join(' · ')) : '';
      }
      const detail =
        e.detail === undefined
          ? ''
          : `<span class="log-detail">${e.kind === 'amount' ? '+' : ''}${esc(e.detail)}</span>`;
      const goals = e.goals || [],
        goal = goals.length ? data.get(e.plan)?.goals.find(g => g.id === goals[0]) : undefined;
      const tag = goal
        ? open(e.plan, goal.id, `▸ ${esc(goal.title)}${goals.length > 1 ? ` +${goals.length - 1}` : ''}`, 'log-goal')
        : '';
      return line(e, open(e.plan, e.id, esc(e.title)) + detail, tag);
    })
    .join('');
}

// A tap in the log: a filter chip, "Show earlier", a line (in another plan: open that plan first), the Overview's line.
export function logClick(el: HTMLElement) {
  const what = el.dataset.log;
  if (what === 'filter') Object.assign(logView, { filter: el.dataset.v as LogFilter, weeks: WEEKS });
  else if (what === 'more') logView.weeks += WEEKS;
  else if (what === 'view') {
    reviewView.tab = 'log'; // the This week line opens the done log
    return setView('review');
  } else if (what === 'open') {
    const plan = el.dataset.plan!;
    if (plan && plan !== plans.current) {
      openPlan(plan);
      toast(t('log.openedPlan', { name: plans.list.find(p => p.id === plan)?.name || '' }));
    }
    const ent = findEntity(el.dataset.id!);
    return ent && openForm(ent.kind, ent.item.id);
  }
  render();
}
// A tap on a review's own buttons (data-review). Buttons of another plan's rows run in that plan (see events.ts).
export function reviewClick(el: HTMLElement) {
  const what = el.dataset.review;
  if (what === 'tab') {
    reviewView.tab = el.dataset.v as ReviewTab;
    reviewView.open = '';
  } else if (what === 'shift') shiftWeek(Number(el.dataset.dir));
  else if (what === 'edit') reviewView.editing = el.closest<HTMLElement>('[data-period]')?.dataset.period || '';
  else if (what === 'finish') finishWeek();
  else if (what === 'focus') return openFocusPicker(el.dataset.week);
  else if (what === 'states') return setView('graphs');
  else if (what === 'record') return recordValue(el);
  else if (what === 'open') return openIn(el.dataset.plan!, el.dataset.id!);
  else if (what === 'replan') {
    if (el.dataset.plan && el.dataset.plan !== plans.current) openPlan(el.dataset.plan);
    return openReplan();
  }
  render();
}

// Record in "Measure": the value typed beside the state, dated today. Runs in the state's plan.
function recordValue(el: HTMLElement) {
  const s = db.states.find(x => x.id === el.dataset.id);
  const box = el.closest('.rv-measure')?.querySelector<HTMLInputElement>('[data-rv-value]');
  const n = parseNum(box?.value);
  if (!s || !box) return;
  if (isNaN(n)) {
    box.setCustomValidity(t('err.number'));
    box.reportValidity();
    return box.focus();
  }
  if (isCumulative(s)) addEntry(s, today(), n);
  else recordMeasurement(s, today(), String(n));
  save();
  toast(t('review.recorded', { name: s.title }));
  render();
}

export function setLogScope(v: string) {
  Object.assign(logView, { all: v === 'all', weeks: WEEKS });
  render();
}
