/** The graphs view: each current state's measurements as a line graph, with axes, targets and zoom width. */
import { clamp, fmtNum, isNum } from '../../core/util';
import { DAY_MS, dayNum, dayStr } from '../../core/days';
import { db } from '../../core/state';
import { t } from '../../i18n/index';
import { withUnit } from '../../ui/text';
import { fmtDate, fmtDay, fmtRel, today } from '../../core/dates';
import { deleteMeasurement, graphScale, isCumulative } from '../../core/cumulative';
import { save } from '../../store/plans';
import { requestRender as render } from '../../ui/render';
import { toast } from '../../ui/toast';
import { $, emptyState, esc, matchesSearch, viewEl } from '../../ui/dom';
import { relsFrom } from '../../core/relations';
import { byActivities } from '../../core/progress';
import { isRoutine, periodUnit } from '../../core/routines/schedule';
import { TL } from '../timeline/render';
import { ui } from '../../store/state';
import { categorySelect, goalSelect, scopeFor, searchBox } from '../filters';
import { periodGraphCard, routineGraphCard, totalGraphCard } from './sums';
import type { Goal, ISODate, State } from '../../core/model';
import type { Routine } from '../../core/routines/schedule';
import { areaFill, grCardHtml } from './plot';
import { noDataCard } from './state-info';
import { hasGraph, stateSeries } from '../../core/series';
import { paceFacts, paceGoals, paceMarks } from './pace';

/* ---------- Graphs (measurement history of each current state) ----------
   One line chart per current state: its measurements over time, a target line for every goal it
   measures (running to the goal's deadline), and the change since the first measurement. */

// A point on a graph: where it sits on the time axis (in days) and its value.
export interface GraphPoint {
  day: number;
  value: number;
  date?: ISODate;
}
// A goal's target line: its value, to the goal's deadline (a day number) if it has one.
export interface GraphTarget {
  goal: Goal;
  value: number;
  end: number | null;
}
export type TipRow = [cls: string, text: string];
// A day or value to pixels.
export type Axis = (n: number) => number;
// What the hover layer and zoom keep of a drawn graph; `tip` gives a point's own tooltip rows.
export interface GraphChart<P extends GraphPoint = GraphPoint> {
  points: P[];
  targets: GraphTarget[];
  px: Axis;
  py: Axis;
  unit: string;
  zoom: [number, number];
  tip?(p: P): TipRow[];
  s?: State;
  change?: Change;
  paces?: Goal[]; // goals with a pace line, for the tooltip
}
export type Change = ReturnType<typeof stateChange>;

export const GR = { H: 210, L: 48, R: 14, T: 14, B: 26, MIN_W: 280, MAX_W: 960 };
export const grCharts: Record<string, GraphChart> = {}; // state id → points and scales, for the hover layer

// About `count` clean steps (1, 2 or 5 × 10ⁿ) covering lo–hi.
// `whole`: counts, so no step smaller than 1.
export function niceTicks(lo: number, hi: number, count = 4, whole = false) {
  if (lo === hi) {
    lo -= Math.abs(lo) * 0.1 || 1;
    hi += Math.abs(hi) * 0.1 || 1;
  }
  const raw = whole ? Math.max((hi - lo) / count, 1) : (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; ; v += step) {
    ticks.push(Number(v.toFixed(10)));
    if (v >= hi - step * 1e-9) break;
  }
  return ticks;
}

export function removeMeasurement(id: string, iso: ISODate) {
  const s = db.states.find(x => x.id === id);
  const h = s?.history?.find(x => x.date === iso);
  if (
    !h ||
    !confirm(t('confirm.deleteMeasurement', { value: withUnit(fmtNum(h.value), s!.unit || ''), date: fmtDate(iso) }))
  )
    return;
  deleteMeasurement(s!, iso);
  save();
  render();
  toast(t('toast.measurementDeleted'));
  // Keep the table open where it was.
  const card = $(`[data-gr="${id}"]`);
  if (card) {
    card.querySelector<HTMLDetailsElement>('.gr-table')!.open = true;
    card.querySelector<HTMLElement>('.gr-table summary')!.focus();
  } else $(`[data-open="${id}"]`)?.focus();
}

// Change from the first to the latest measurement; `good` is null when no goal says which way is better.
export function stateChange(s: State, points: GraphPoint[], targets: GraphTarget[]) {
  if (points.length < 2) return null;
  const first = points[0],
    last = points[points.length - 1];
  const delta = last.value - first.value;
  const pct = first.value ? (delta / Math.abs(first.value)) * 100 : null;
  const aim = targets.length ? Math.sign(targets[0].value - first.value) : 0;
  return { first, delta, pct, good: aim && delta ? Math.sign(delta) === aim : null };
}

export function signed(n: number) {
  let sign = '±';
  if (n > 0) sign = '+';
  else if (n < 0) sign = '−';
  return sign + fmtNum(Math.abs(n));
}

export function changeTag(s: State, change: Change) {
  if (!change) return `<span class="tag">${t('gr.oneMeasurement')}</span>`;
  const { delta, pct, good, first } = change;
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '→';
  const cls = good === null ? '' : good ? 'ok' : 'bad';
  const text =
    withUnit(signed(delta), esc(s.unit || '')) + (pct === null ? '' : ` (${signed(Math.round(pct * 10) / 10)} %)`);
  return `<span class="tag gr-delta ${cls}"><span aria-hidden="true">${arrow}</span> ${text}</span>
    <span class="meta">${t('gr.since', { date: fmtRel(first.date) })}</span>`;
}

export function graphCard(s: State, width: number) {
  const points = stateSeries(s);
  const targets = relsFrom(s.id, 'measures')
    .map(r => db.goals.find(g => g.id === r.to))
    .filter((g): g is Goal => !!g && !byActivities(g) && isNum(g.target))
    .map(g => ({ goal: g, value: Number(g.target), end: g.deadline ? dayNum(g.deadline) : null }));
  const change = stateChange(s, points, targets);
  const needs = paceGoals(targets);
  // One measurement is no line yet: the pace drawn against it reads as a wrong pace.
  const paces = points.length > 1 ? needs : [];
  const unit = s.unit || '';
  const last = points[points.length - 1];

  // Scales: time from the first measurement to the latest of today / last measurement / deadlines.
  const x0 = points[0].day;
  // Half a day past the latest, so today's column and the last dot are not cut in half at the edge.
  let x1 = Math.max(last.day + 0.5, dayNum(today()) + 0.5, ...targets.map(tg => tg.end || 0));
  if (x1 - x0 < 14) x1 = x0 + 14;
  const { W, zoom } = zoomedWidth(s.id, width, width, x1 - x0);
  const ticks = niceTicks(
    Math.min(...points.map(p => p.value), ...targets.map(tg => tg.value)),
    Math.max(...points.map(p => p.value), ...targets.map(tg => tg.value)),
  );
  const y0 = ticks[0],
    y1 = ticks[ticks.length - 1];
  const px = (d: number) => GR.L + ((d - x0) / (x1 - x0)) * (W - GR.L - GR.R);
  const py = (v: number) => GR.T + (1 - (v - y0) / (y1 - y0)) * (GR.H - GR.T - GR.B);
  grCharts[s.id] = { s, points, targets, change, px, py, unit, zoom, paces };

  const grid = gridLines(ticks, py, W);
  const todayN = dayNum(today());
  const xAxis = dateAxis(px, x0, x1, W > width, true);
  const todayMark = todayCol(px, todayN - 0.5, x0, x1, W);
  const todayLine = todayMark?.svg || '';

  const targetLines = targets
    .map(tg => {
      const xe = px(tg.end && tg.end > x0 ? tg.end : x1);
      return `<line class="gr-target" x1="${GR.L}" x2="${xe}" y1="${py(tg.value)}" y2="${py(tg.value)}"/>
      ${tg.end && tg.end > x0 ? `<circle class="gr-target-end" cx="${xe}" cy="${py(tg.value)}" r="4"/>` : ''}`;
    })
    .join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.day).toFixed(1)},${py(p.value).toFixed(1)}`).join(' ');
  const area = areaFill(s.id, `${path} L${px(last.day).toFixed(1)},${py(y0)} L${px(x0).toFixed(1)},${py(y0)} Z`);
  const dots = points.map(p => grDot(px(p.day), py(p.value), p === last)).join('');

  // Direct labels: each target at the start of its line, the latest value next to its dot – in the first
  // spot (above, below, right, left) that stays inside the plot and clear of the target labels.
  const textW = (s: string) => s.length * 7;
  const tLabels = targets.map(tg => {
    const ty = py(tg.value) + (py(tg.value) - GR.T < 16 ? 14 : -6);
    const text =
      t('gr.targetLabel', { value: withUnit(fmtNum(tg.value), unit) }) +
      (targets.length > 1 ? ` (${tg.goal.title})` : '');
    return { text, x: GR.L + 6, y: ty, box: [GR.L + 6, ty - 12, GR.L + 6 + textW(text), ty + 2] };
  });
  const targetLabels = tLabels
    .map(l => `<text class="gr-label muted" x="${l.x}" y="${l.y}">${esc(l.text)}</text>`)
    .join('');
  const lx = px(last.day),
    ly = py(last.value);
  const vText = withUnit(fmtNum(last.value), unit),
    vw = textW(vText);
  const spots = [
    { x: lx, y: ly - 10, anchor: 'middle', box: [lx - vw / 2, ly - 22, lx + vw / 2, ly - 8] },
    { x: lx, y: ly + 20, anchor: 'middle', box: [lx - vw / 2, ly + 8, lx + vw / 2, ly + 22] },
    { x: lx + 9, y: ly + 4, anchor: 'start', box: [lx + 9, ly - 8, lx + 9 + vw, ly + 6] },
    { x: lx - 9, y: ly + 4, anchor: 'end', box: [lx - 9 - vw, ly - 8, lx - 9, ly + 6] },
  ];
  const overlaps = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const inside = (b: number[]) => b[0] >= GR.L && b[2] <= W - GR.R && b[1] >= 0 && b[3] <= GR.H - GR.B;
  // Hard obstacles: target labels and the measurement line itself (sampled every few pixels).
  // The faint today line is avoided too when there is another free spot.
  const hard = tLabels.map(l => l.box);
  points.slice(1).forEach((p, i) => {
    const a = points[i],
      ax = px(a.day),
      ay = py(a.value),
      bx = px(p.day),
      by = py(p.value);
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
    for (let k = 0; k <= steps; k++) {
      const x = ax + ((bx - ax) * k) / steps,
        y = ay + ((by - ay) * k) / steps;
      hard.push([x - 1, y - 1, x + 1, y + 1]);
    }
  });
  const todayBox = todayMark ? [todayMark.box] : [];
  const free = (s: (typeof spots)[number], obstacles: number[][]) =>
    inside(s.box) && !obstacles.some(o => overlaps(s.box, o));
  const spot = spots.find(s => free(s, [...hard, ...todayBox])) || spots.find(s => free(s, hard)) || spots[0];
  const valueLabel = `<text class="gr-label" x="${spot.x}" y="${spot.y}" text-anchor="${spot.anchor}">${esc(vText)}</text>`;

  // Newest first, each with a button to delete it.
  const rowsHtml = points
    .slice()
    .reverse()
    .map(p => {
      const del = t('gr.delete', { date: fmtDate(p.date) });
      return `<tr><td>${fmtRel(p.date, true)}</td><td>${esc(withUnit(fmtNum(p.value), unit))}</td><td>${p === points[0] ? '—' : esc(withUnit(signed(p.value - points[0].value), unit))}</td><td class="gr-del"><button type="button" class="btn small ghost" data-del-measure="${s.id}" data-date="${p.date}" title="${esc(del)}" aria-label="${esc(del)}">×</button></td></tr>`;
    })
    .join('');

  return grCardHtml(
    s,
    `<strong class="gr-value">${esc(withUnit(fmtNum(last.value), unit))}</strong>${changeTag(s, change)}`,
    paceFacts(needs, unit),
    `<div class="gr-plot${W > width ? ' scroll' : ''}" tabindex="0" role="img" aria-label="${esc(t('gr.aria', { name: s.title }))}">
      <svg width="${W}" height="${GR.H}" viewBox="0 0 ${W} ${GR.H}" aria-hidden="true">
        ${grid}${todayLine}${area}${targetLines}${paceMarks(paces, points, px, py, x0, x1)}<path class="gr-line" d="${path}"/>${dots}${targetLabels}${valueLabel}${xAxis}
        <line class="gr-cross" y1="${GR.T}" y2="${GR.H - GR.B}" hidden/>
        <circle class="gr-focus" r="6" hidden/>
      </svg>${W > width ? yAxisPinned(ticks, py) : ''}
      <div class="gr-tip" hidden></div>
    </div>`,
    `<table><thead><tr><th>${t('gr.col.date')}</th><th>${t('gr.col.value')}</th><th>${t('gr.col.change')}</th><th><span class="sr-only">${t('gr.col.delete')}</span></th></tr></thead><tbody>${rowsHtml}</tbody></table>
    `,
  );
}

// A routine's graph adds up its check-ins like a state's amounts, but on its own period's scale it
// shows what each period asks for.
export const graphFor = (item: State | Routine, width: number): string =>
  isRoutine(item) && graphScale(item) === periodUnit(item)
    ? routineGraphCard(item, width)
    : !isRoutine(item) && !isCumulative(item)
      ? graphCard(item, width)
      : graphScale(item) === 'total'
        ? totalGraphCard(item, width)
        : periodGraphCard(item, width);
export let grDrawW = 0; // the width graphs were last drawn to fit

// Zoomed in, a graph is drawn wider and scrolls sideways; zoomed out, it is never narrower than the card,
// nor stretched past the timeline's closest zoom. `base` is its width unzoomed; `zoom` the range allowed.
export function zoomedWidth(id: string, base: number, width: number, days: number) {
  const zoom: [number, number] = [Math.min(width / base, 1), Math.max((GR.L + GR.R + days * TL.MAX) / base, 1)];
  return { W: Math.round(base * clamp(ui.grZoom[id] || 1, ...zoom)), zoom };
}

// Today is a faint column as wide as the day (never thinner than 3 px), a line down its middle, behind the data. `from` is where the day
// starts on the axis: a bar's day starts at its number, a measurement sits in the middle of its day.
export function todayCol(px: Axis, from: number, x0: number, x1: number, W: number, over: boolean | number = false) {
  if (from + 1 <= x0 || from >= x1) return null;
  // Over bars, the day keeps the bars' thin gap, so on a period's first or last day it stays inside the bar.
  const gap = over ? 1 : 0;
  const a = clamp(px(from), GR.L, W - GR.R) + gap,
    b = clamp(px(from + 1), GR.L, W - GR.R) - gap;
  const w = Math.max(b - a, 3),
    x = (a + b - w) / 2;
  return {
    svg: `<rect class="gr-today${over ? ' over' : ''}" x="${x}" y="${GR.T}" width="${w}" height="${GR.H - GR.T - GR.B}"/>
    <line class="gr-today-line" x1="${x + w / 2}" x2="${x + w / 2}" y1="${GR.T}" y2="${GR.H - GR.B}"/>`,
    box: [x, GR.T, x + w, GR.H - GR.B],
  };
}

// The value grid, its bottom line a little stronger, with the values beside it.
export const gridLines = (ticks: number[], py: Axis, W: number) =>
  ticks
    .map(
      (v, i) => `<line class="gr-grid${i ? '' : ' base'}" x1="${GR.L}" x2="${W - GR.R}" y1="${py(v)}" y2="${py(v)}"/>`,
    )
    .join('') + yLabels(ticks, py);
// A point's dot on a line; the latest is larger.
export const grDot = (x: number, y: number, last: boolean) =>
  `<circle class="gr-dot${last ? ' last' : ''}" cx="${x}" cy="${y}" r="${last ? 5 : 3.5}"/>`;
export const yLabels = (ticks: number[], py: Axis) =>
  ticks
    .map(v => `<text class="gr-axis" x="${GR.L - 8}" y="${py(v) + 4}" text-anchor="end">${esc(fmtNum(v))}</text>`)
    .join('');
// A graph wider than the card scrolls under its values, which stay at the left like the timeline's labels.
export const yAxisPinned = (ticks: number[], py: Axis) =>
  `<svg class="gr-yaxis" width="${GR.L}" height="${GR.H}" style="margin-top:-${GR.H}px" aria-hidden="true">${yLabels(ticks, py)}</svg>`;

// Dates under a graph: where it starts and ends, and today when there is room. One wider than the card
// (zoomed in, or a long history of bars) also marks days, Mondays, months, quarters or years, about
// every 110 px – the first of these steps that leaves that much room.
export function dateAxis(px: Axis, x0: number, x1: number, wide: boolean, withToday: boolean) {
  const todayN = dayNum(today()),
    perDay = (px(x1) - px(x0)) / (x1 - x0);
  const ticks: [number, string, string][] = [
    [x0, 'start', fmtDate(dayStr(x0))],
    [x1, 'end', fmtDate(dayStr(x1))],
  ];
  const room = (n: number) => ticks.every(([m]) => Math.abs(px(m) - px(n)) > 80);
  if (withToday && todayN > x0 && todayN < x1 && room(todayN)) ticks.push([todayN, 'middle', fmtDate(today())]);
  if (wide) {
    const steps: [number, (d: Date) => boolean][] = [
      [1, () => true],
      [7, d => d.getUTCDay() === 1],
      [30, d => d.getUTCDate() === 1],
      [91, d => d.getUTCDate() === 1 && d.getUTCMonth() % 3 === 0],
      [365, d => d.getUTCDate() === 1 && d.getUTCMonth() === 0],
    ];
    const [days, starts] = steps.find(([n]) => n * perDay >= 110) || steps.at(-1)!;
    const opts: Intl.DateTimeFormatOptions =
      days < 30
        ? { day: 'numeric', month: 'short' }
        : days < 365
          ? { month: 'short', year: 'numeric' }
          : { year: 'numeric' };
    for (let n = Math.ceil(x0); n < x1; n++) {
      if (starts(new Date(n * DAY_MS)) && room(n)) ticks.push([n, 'middle', fmtDay(dayStr(n), opts)]);
    }
  }
  return ticks
    .map(
      ([n, anchor, text]) =>
        `<text class="gr-axis" x="${px(n)}" y="${GR.H - 6}" text-anchor="${anchor}">${esc(text)}</text>`,
    )
    .join('');
}

export function renderGraphs() {
  const routines = db.activities.filter(hasGraph) as Routine[];
  if (!db.states.length && !routines.length) return emptyState(t('states.emptyTitle'), t('states.emptyText'), 'state');
  const scope = scopeFor(ui.graphGoal);
  const list = db.states.filter(s => !scope || scope.state.has(s.id)).filter(matchesSearch);
  const withData = list.filter(hasGraph);
  const without = list.filter(s => !hasGraph(s));
  const kept = routines.filter(a => !scope || scope.activity.has(a.id)).filter(matchesSearch);
  // Cards take the full width of the view; charts are drawn at that pixel width so text stays crisp.
  const viewStyle = getComputedStyle(viewEl);
  const width = clamp(
    viewEl.clientWidth - parseFloat(viewStyle.paddingLeft) - parseFloat(viewStyle.paddingRight) - 38,
    GR.MIN_W,
    GR.MAX_W,
  );
  Object.keys(grCharts).forEach(k => delete grCharts[k]);
  grDrawW = width;
  const cards = [...withData.map(item => graphFor(item, width)), ...kept.map(item => graphFor(item, width)), ...without.map(noDataCard)];
  return `
    <div class="toolbar">${categorySelect()}${goalSelect('graphs', ui.graphGoal)}${searchBox()}</div>
    ${cards.length ? `<div class="gr-list">${cards.join('')}</div>` : `<div class="empty">${t('gr.none')}</div>`}`;
}
