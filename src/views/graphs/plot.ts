/** The plot that bar and step graphs share (grid, dates, today, targets, hover layer), their legend and card. */
import { GR, dateAxis, grCharts, gridLines, niceTicks, todayCol, yAxisPinned, zoomedWidth } from './states';
import type { Axis, GraphPoint, GraphTarget, TipRow } from './states';
import { dayNum } from '../../core/days';
import { today } from '../../core/dates';
import { t } from '../../i18n/index';
import { withUnit } from '../../ui/text';
import { fmtNum } from '../../core/util';
import { esc } from '../../ui/dom';
import type { State } from '../../core/model';
import type { Routine } from '../../core/routines/schedule';

// A soft wash under a line, fading to the bottom of the plot.
export const areaFill = (
  id: string,
  d: string,
) => `<defs><linearGradient id="gr-fill-${id}" x1="0" y1="0" x2="0" y2="1"><stop class="gr-fill-stop" offset="0"/><stop class="gr-fill-stop" offset="1" style="stop-opacity: 0"/></linearGradient></defs>
  <path class="gr-area" d="${d}" fill="url(#gr-fill-${id})"/>`;

export const GR_SLOT = 12; // the narrowest a period's bar gets; longer histories scroll sideways
// A bar's left edge and width in a period running from day `a` to day `b`: it fills the period, with
// a thin gap between neighbours, so the bars sit side by side.
export function barBox(px: Axis, a: number, b: number) {
  const slot = px(b) - px(a),
    w = Math.max(slot - 2, 1);
  return { x: px(a) + (slot - w) / 2, w };
}

// The plot shared by bar and step graphs: grid, date axis, today, target lines and labels, and the
// hover layer. `marks` draws the data with the scales; `bars` widens a long history so it scrolls.
interface PlotOpts<P extends GraphPoint> {
  points: P[];
  targets?: GraphTarget[];
  unit: string;
  from: number;
  to: number;
  bars?: number;
  marks: (px: Axis, py: Axis, x0: number, x1: number) => string;
  tip(p: P): TipRow[];
  aria: string;
  ys?: number[];
  whole?: boolean;
}
export function plotSvg<P extends GraphPoint>(
  id: string,
  { points, targets = [], unit, from, to, bars = 0, marks, tip, aria, ys = [], whole = false }: PlotOpts<P>,
  width: number,
) {
  const todayN = dayNum(today());
  // Bars end with the period under way: weeks to a far deadline would only squeeze them.
  const x0 = from;
  let x1 = bars ? to : Math.max(to, ...targets.map(tg => tg.end || 0));
  if (x1 - x0 < 14) x1 = x0 + 14;
  const base = bars ? Math.max(width, GR.L + GR.R + Math.ceil(((x1 - x0) / ((to - from) / bars)) * GR_SLOT)) : width;
  const { W, zoom } = zoomedWidth(id, base, width, x1 - x0);
  const values = [0, ...points.map(p => p.value), ...targets.map(tg => tg.value), ...ys];
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4, whole);
  const y0 = ticks[0],
    y1 = ticks[ticks.length - 1];
  const px = (d: number) => GR.L + ((d - x0) / (x1 - x0)) * (W - GR.L - GR.R);
  const py = (v: number) => GR.T + (1 - (v - y0) / (y1 - y0)) * (GR.H - GR.T - GR.B);
  grCharts[id] = { points, targets, px, py, unit, tip, zoom };
  const grid = gridLines(ticks, py, W);
  const xAxis = dateAxis(px, x0, x1, W > width, !bars);
  // Over the bars, so today shows inside the period under way; behind a line.
  const todayLine = todayCol(px, bars ? todayN : todayN - 0.5, x0, x1, W, bars)?.svg || '';
  const targetLines = targets
    .map(tg => {
      const xe = px(tg.end && tg.end > x0 && tg.end < x1 ? tg.end : x1);
      const ty = py(tg.value) + (py(tg.value) - GR.T < 16 ? 14 : -6);
      const text =
        t('gr.targetLabel', { value: withUnit(fmtNum(tg.value), unit) }) +
        (targets.length > 1 ? ` (${tg.goal.title})` : '');
      return `<line class="gr-target" x1="${GR.L}" x2="${xe}" y1="${py(tg.value)}" y2="${py(tg.value)}"/>
      ${tg.end && tg.end > x0 && tg.end <= x1 ? `<circle class="gr-target-end" cx="${xe}" cy="${py(tg.value)}" r="4"/>` : ''}
      <text class="gr-label muted" x="${GR.L + 6}" y="${ty}">${esc(text)}</text>`;
    })
    .join('');
  return `<div class="gr-plot${W > width ? ' scroll' : ''}" tabindex="0" role="img" aria-label="${esc(aria)}">
      <svg width="${W}" height="${GR.H}" viewBox="0 0 ${W} ${GR.H}" aria-hidden="true">
        ${grid}${bars ? '' : todayLine}${marks(px, py, x0, x1)}${bars ? todayLine : ''}${targetLines}${xAxis}
        <line class="gr-cross" y1="${GR.T}" y2="${GR.H - GR.B}" hidden/>
        <circle class="gr-focus" r="6" hidden/>
      </svg>${W > width ? yAxisPinned(ticks, py) : ''}
      <div class="gr-tip" hidden></div>
    </div>`;
}

export const grLegend = (items: TipRow[]) =>
  `<div class="gr-legend">${items.map(([cls, text]) => `<span><i class="key ${cls}"></i>${esc(text)}</span>`).join('')}</div>`;
export const targetKey = (targets: GraphTarget[]): TipRow => [
  'key-target',
  targets.length > 1 ? t('gr.targets') : t('gr.targetOf', { goal: targets[0].goal.title }),
];

export function grCardHtml(
  item: State | Routine,
  stats: string,
  legend: string,
  plot: string,
  table: string,
  scales = '',
) {
  return `<article class="card glass gr-card" data-gr="${item.id}" data-ctx-item="${item.id}">
    <div class="card-head"><h3>${esc(item.title)}</h3><button class="btn small ghost" data-open="${item.id}">${t('btn.edit')}</button></div>
    <div class="gr-stats">${stats}</div>
    ${scales}
    ${legend}
    ${plot}
    <details class="gr-table"><summary>${t('gr.table')}</summary>${table}</details>
  </article>`;
}
