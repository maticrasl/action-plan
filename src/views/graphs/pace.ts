/** Pace on a graph: the dashed line from the goal's start to its target, the dotted trend, and the facts above. */
import { dayNum, dayStr } from '../../core/days';
import { fmtDate, today } from '../../core/dates';
import { fmtNum } from '../../core/util';
import { goalPace, paceAt, trend, type PacePoint } from '../../core/pace';
import { t, tp } from '../../i18n/index';
import { withUnit } from '../../ui/text';
import { esc } from '../../ui/dom';
import { GR, type Axis, type GraphTarget, type TipRow } from './states';
import type { Goal } from '../../core/model';

// The goals among a graph's targets that have a pace to show.
export const paceGoals = (targets: GraphTarget[]): Goal[] =>
  targets.map(tg => tg.goal).filter(g => goalPace(g, today())?.kind === 'measure');

const named = (text: string, g: Goal, many: boolean) => (many ? `${g.title}: ${text}` : text);

// One line per goal: what is needed from here, and when the present rate would arrive.
export function paceFacts(goals: Goal[], unit: string): string {
  return goals
    .map(g => {
      const p = goalPace(g, today());
      if (p?.kind !== 'measure') return '';
      const parts: string[] = [];
      if (p.rate)
        parts.push(
          t(p.rate.per === 'day' ? 'pace.needsDay' : 'pace.needsWeek', { value: withUnit(fmtNum(p.rate.value), unit) }),
        );
      const f = p.forecast;
      if (f === 'never') parts.push(t('pace.never'));
      else if (f) {
        const date = fmtDate(dayStr(f.day));
        parts.push(
          f.late
            ? tp('pace.forecastLate', f.late, { date })
            : `${t('pace.forecast', { date })} ${t('pace.deadline', { date: fmtDate(g.deadline) })}`,
        );
      }
      return parts.length ? `<p class="gr-pace-facts">${esc(named(parts.join(' · '), g, goals.length > 1))}</p>` : '';
    })
    .join('');
}

// The pace lines (clipped at the plot's left edge `x0`) and the trend from the latest point to `x1`.
export function paceMarks(goals: Goal[], points: PacePoint[], px: Axis, py: Axis, x0: number, x1: number): string {
  if (!goals.length) return '';
  const lines = goals
    .map(g => {
      const a = Math.max(dayNum(g.startDate || g.createdAt!), x0),
        b = dayNum(g.deadline!);
      return `<line class="gr-pace" x1="${px(a).toFixed(1)}" y1="${py(paceAt(g, a)!).toFixed(1)}" x2="${px(b).toFixed(1)}" y2="${py(paceAt(g, b)!).toFixed(1)}"/>`;
    })
    .join('');
  const tr = trend(points, today());
  if (!tr) return lines;
  // In pixels, cut where it leaves the plot at the top or bottom.
  const ax = px(tr.day),
    ay = py(tr.value);
  let bx = px(x1),
    by = py(tr.value + tr.slope * (x1 - tr.day));
  const edge = by < GR.T ? GR.T : by > GR.H - GR.B ? GR.H - GR.B : by;
  if (edge !== by) [bx, by] = [ax + ((bx - ax) * (edge - ay)) / (by - ay), edge];
  return `${lines}<line class="gr-trend" x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/>`;
}

// The tooltip's pace for a point's day, once the goal has started.
export const paceTips = (goals: Goal[], day: number, unit: string): TipRow[] =>
  goals
    .filter(g => day >= dayNum(g.startDate || g.createdAt!))
    .map(g => [
      'gr-tip-row',
      named(t('pace.tip', { value: withUnit(fmtNum(paceAt(g, day)!), unit) }), g, goals.length > 1),
    ]);
