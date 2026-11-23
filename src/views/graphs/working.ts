/** The "Is it working?" fold under a state's or routine's graph, shown when a pair has enough weeks; remembered until the plan changes. */
import { db } from '../../core/state';
import { fmtNum } from '../../core/util';
import { today } from '../../core/dates';
import { relsFrom, relsTo } from '../../core/relations';
import { hasGraph } from '../../core/series';
import { isCumulative } from '../../core/cumulative';
import { isRoutine, type Routine } from '../../core/routines/schedule';
import { compare, type Work } from '../../core/working';
import { t, tp } from '../../i18n/index';
import { shortSchedule, withUnit } from '../../ui/text';
import { $, esc } from '../../ui/dom';
import { plansVersion } from '../../store/state';
import { setView } from '../../ui/nav';
import type { Goal, State } from '../../core/model';

// The routine–state pairs an item takes part in, each with data on both sides; amounts that come
// from the routine's own ticks are left out (more ticks are more amounts).
function pairs(item: State | Routine): [Routine, State][] {
  const list: [Routine, State][] = isRoutine(item)
    ? relsFrom(item.id, 'improves')
        .map(r => db.states.find(s => s.id === r.to))
        .filter((s): s is State => !!s)
        .map(s => [item, s])
    : relsTo(item.id, 'improves')
        .map(r => db.activities.find(a => a.id === r.from))
        .filter(isRoutine)
        .map(a => [a, item]);
  return list.filter(
    ([a, s]) => hasGraph(a) && hasGraph(s) && !(isCumulative(s) && s.entries!.some(e => e.routine === a.id)),
  );
}
// A pair has data to show when there are enough weeks of both kinds to compare.
const shown = (item: State | Routine) =>
  pairs(item)
    .map(([a, s]) => [a, s, work(a, s)] as const)
    .filter((x): x is readonly [Routine, State, Work] => !!x[2] && !['few', 'seldom'].includes(x[2].kind));
export const hasWork = (item: State | Routine) => shown(item).length > 0;

// The fold, filled when it is opened.
export const workFold = (item: State | Routine) =>
  hasWork(item)
    ? `<details class="gr-work" data-work="${item.id}"><summary>${t('work.title')}</summary><div class="gr-work-body"></div></details>`
    : '';

let cacheKey = '';
const cache = new Map<string, Work | null>();
function work(a: Routine, s: State): Work | null {
  const key = `${plansVersion}|${today()}`;
  if (key !== cacheKey) {
    cache.clear();
    cacheKey = key;
  }
  const id = `${a.id}|${s.id}`;
  if (!cache.has(id)) {
    const goals = relsFrom(s.id, 'measures')
      .map(r => db.goals.find(g => g.id === r.to))
      .filter((g): g is Goal => !!g);
    cache.set(id, compare(a, s, goals, today()));
  }
  return cache.get(id)!;
}

// Two bars to one scale from a centre line; a fall is drawn to the left of it.
function bar(v: number, max: number, cls: string) {
  const len = max ? (Math.abs(v) / max) * 58 : 0;
  return `<svg class="work-bar" viewBox="0 0 120 12" width="120" height="12" aria-hidden="true"><line x1="60" x2="60" y1="0" y2="12"/><rect class="${cls}" x="${v < 0 ? 60 - len : 60}" y="2" width="${len}" height="8" rx="2"/></svg>`;
}
function sideText(s: State, mean: number, unit: string) {
  const vars = { state: s.title, value: withUnit(fmtNum(Math.abs(mean)), unit) };
  if (isCumulative(s)) return t('work.total', vars);
  return t(mean > 0 ? 'work.rose' : mean < 0 ? 'work.fell' : 'work.flat', vars);
}

// On a state's card each block names a routine and its schedule; on a routine's card, a state.
function block(a: Routine, s: State, onRoutine: boolean, w: Work) {
  const counts = { kept: w.kept.n, missed: w.missed.n };
  const head = onRoutine
    ? `<p class="work-name"><strong>${esc(s.title)}</strong></p>`
    : `<p class="work-name"><strong>${esc(a.title)}</strong> <span class="meta">(${esc(shortSchedule(a))})</span></p>`;
  if (w.kind === 'seldom' || w.kind === 'few' || w.kind === 'none')
    return `<div class="work-pair">${head}<p>${esc(t(`work.${w.kind}`, counts))}</p></div>`;
  const max = Math.max(Math.abs(w.kept.mean), Math.abs(w.missed.mean));
  const row = (label: string, mean: number, cls: string) =>
    `<div class="work-row"><span class="work-label">${esc(label)}</span><span>${esc(sideText(s, mean, w.unit))}</span>${bar(mean, max, cls)}</div>`;
  return `<div class="work-pair">${head}
    ${row(tp('work.kept', w.kept.n), w.kept.mean, 'work-kept')}
    ${row(tp('work.missed', w.missed.n), w.missed.mean, 'work-missed')}
    <p class="work-verdict">${esc(t(`work.${w.kind}`))}</p></div>`;
}

// Fills an opened fold (once per draw; the results themselves are remembered).
export function fillWork(el: HTMLDetailsElement) {
  const body = el.querySelector<HTMLElement>('.gr-work-body')!;
  if (!el.open || body.childElementCount) return;
  const item = [...db.states, ...db.activities].find(x => x.id === el.dataset.work) as State | Routine | undefined;
  if (!item) return;
  const blocks = shown(item).map(([a, s, w]) => block(a, s, isRoutine(item), w));
  body.innerHTML = `${blocks.join('')}<p class="meta work-caution">${esc(t('work.caution'))}</p>`;
}

// From the tip `wrong-way`: Graphs, with the state's fold open.
export function openWork(id: string) {
  setView('graphs');
  const el = $<HTMLDetailsElement>(`[data-gr="${id}"] .gr-work`);
  if (!el) return;
  el.open = true;
  fillWork(el);
  el.scrollIntoView({ block: 'start' });
}
