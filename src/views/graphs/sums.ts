/** Graphs of amounts that add up (per period or in total) and of routines, their scale switch and entries. */
import {
  SCALES,
  calPeriod,
  deleteEntry,
  goalPeriod,
  graphEntries,
  graphScale,
  periodTotals,
  sumOf,
} from '../../core/cumulative';
import { fmtRange } from '../routines';
import { t, tp } from '../../i18n/index';
import { fmtDate, fmtDay, fmtRel, today } from '../../core/dates';
import { relsFrom } from '../../core/relations';
import { db } from '../../core/state';
import { ownMetric } from '../../core/progress';
import { fmtNum, isNum } from '../../core/util';
import { dayNum, dayStr } from '../../core/days';
import { grDot, signed } from './states';
import { periodText, scaleText, streakText, totalText, withUnit } from '../../ui/text';
import { $, esc } from '../../ui/dom';
import { addDays, isRoutine, periodOf, periodUnit, routineStart } from '../../core/routines/schedule';
import { periodProgress, routineStreak } from '../../core/routines/keeping';
import { save } from '../../store/plans';
import { requestRender as render } from '../../ui/render';
import { toast } from '../../ui/toast';
import { GraphPoint, GraphTarget, TipRow } from './states';
import type { Entry, Goal, ISODate, Period, Scale, State } from '../../core/model';
import type { Routine, Span } from '../../core/routines/schedule';
import type { TextKey } from '../../i18n/index';
import { areaFill, barBox, grCardHtml, grLegend, plotSvg, targetKey } from './plot';

/* ---------- Graphs of amounts that add up, and of routines ----------
   A state that adds up per period gets a bar for each period (the one under way lighter), one that
   adds up in total a step line of its running total; a routine gets a bar of check-ins for each of
   its periods, against what the period asks for. They share the line graph's hover layer: each
   point has its `day` (where the crosshair snaps) and its own tooltip rows (`tip`). */

// "Week of 20 Oct", "October 2026", "2026", "20 Oct 2026", or a range for longer periods.
export function periodLabel(unit: Period, from: ISODate, to: ISODate) {
  if (calPeriod(unit, from).to !== to) return fmtRange(from, to);
  if (unit === 'week') return t('cu.weekOf', { date: fmtDay(from, { day: 'numeric', month: 'short' }) });
  if (unit === 'month') return fmtDay(from, { month: 'long', year: 'numeric' });
  if (unit === 'year') return from.slice(0, 4);
  return fmtDate(from);
}

// Goals a state measures with a target, for target lines. On a state that adds up, only those
// counting it as the graph shows it: a weekly target on monthly bars would mislead.
export const stateTargets = (s: State, scale?: Scale): GraphTarget[] =>
  relsFrom(s.id, 'measures')
    .map(r => db.goals.find(g => g.id === r.to))
    .filter((g): g is Goal => !!g && ownMetric(g) && isNum(g.target) && (!scale || goalPeriod(g) === scale))
    .map(g => ({ goal: g, value: Number(g.target), end: g.deadline ? dayNum(g.deadline) : null }));

// Sums per day, week, month or year, or the running total, for a state that adds up or a routine.
export const scaleSwitch = (s: State | Routine) =>
  `<div class="chips gr-scale" role="group" aria-label="${esc(t(isRoutine(s) ? 'cu.scaleLabelRoutine' : 'cu.scaleLabel'))}">${SCALES.map(
    k =>
      `<button class="chip ${k === graphScale(s) ? 'active' : ''}" data-gr-scale="${k}" data-state="${s.id}" aria-pressed="${k === graphScale(s)}">${t(('cu.scale.' + k) as TextKey)}</button>`,
  ).join('')}</div>`;

export const entryDel = (s: State, e: Entry) => {
  const del = t('cu.deleteEntry', { value: withUnit(fmtNum(e.amount), s.unit || ''), date: fmtDate(e.date) });
  return `<td class="gr-del"><button type="button" class="btn small ghost" data-del-entry="${s.id}" data-entry="${e.id}" title="${esc(del)}" aria-label="${esc(del)}">×</button></td>`;
};

// A bar for each period; the change tag compares the last complete period with the one before.
// A routine's bars count its check-ins.
export function periodGraphCard(s: State | Routine, width: number) {
  const rt = isRoutine(s),
    unit = (s as State).unit || '',
    now = today(),
    scale = graphScale(s) as Period,
    periods = periodTotals(s, scale),
    targets = rt ? [] : stateTargets(s, scale);
  const amount = (n: number) => (rt ? tp('rt.checkins', n) : withUnit(fmtNum(n), unit));
  const points = periods.map(p => {
    const a = dayNum(p.from),
      b = dayNum(p.to) + 1;
    return { ...p, value: p.total, day: (a + b) / 2, a, b, now: p.from <= now && p.to >= now };
  });
  const tip = (p: (typeof points)[number]): TipRow[] => [
    ['gr-tip-value', amount(p.value)],
    ['gr-tip-date', periodLabel(scale, p.from, p.to)],
    ...(rt ? [] : [['gr-tip-row', tp('cu.entries', p.entries.length)] as TipRow]),
    ...targets.map((tg): TipRow => [
      'gr-tip-row',
      t('gr.tipTarget', { goal: tg.goal.title, value: withUnit(fmtNum(tg.value), unit) }),
    ]),
  ];
  const plot = plotSvg(
    s.id,
    {
      points,
      targets,
      unit,
      tip,
      from: points[0].a,
      to: points.at(-1)!.b,
      bars: points.length,
      whole: rt,
      aria: t(rt ? 'cu.routineAria' : 'cu.aria', { name: s.title }),
      marks: (px, py) =>
        points
          .map(p => {
            const { x, w } = barBox(px, p.a, p.b),
              y = py(Math.max(0, p.value)),
              h = Math.abs(py(p.value) - py(0));
            return `<rect class="gr-bar${p.now ? ' now' : ''}" x="${x}" y="${p.value < 0 ? py(0) : y}" width="${w}" height="${h}" rx="2"/>`;
          })
          .join(''),
    },
    width,
  );
  // The last complete period against the one before it.
  const done = points.filter(p => p.to < now);
  const last = done.at(-1),
    prev = done.at(-2);
  let change = '';
  if (last && prev) {
    const delta = Number((last.value - prev.value).toFixed(9));
    const aim = targets.length ? Math.sign(targets[0].value - prev.value) : 0;
    const cls = !aim || !delta ? '' : Math.sign(delta) === aim ? 'ok' : 'bad';
    change = `<span class="tag gr-delta ${cls}"><span aria-hidden="true">${delta > 0 ? '▲' : delta < 0 ? '▼' : '→'}</span> ${esc(withUnit(signed(delta), unit))}</span>
      <span class="meta">${esc(t(('cu.vsPrev.' + scale) as TextKey, { period: periodLabel(scale, last.from, last.to) }))}</span>`;
  }
  const legend = grLegend([
    ['key-bar', t((rt ? 'cu.legendRoutine' : 'cu.legend.' + scale) as TextKey)],
    ...(targets.length ? [targetKey(targets)] : []),
  ]);
  // A routine's check-ins are ticked on the routine, so its table lists only the periods.
  const rows = points
    .slice()
    .reverse()
    .map(p =>
      rt
        ? `<tr><td>${esc(periodLabel(scale, p.from, p.to))}</td><td>${esc(amount(p.value))}</td></tr>`
        : `<tr class="gr-period"><td>${esc(periodLabel(scale, p.from, p.to))}</td><td><strong>${esc(amount(p.value))}</strong></td><td></td></tr>
    ${p.entries
      .slice()
      .reverse()
      .map(
        e =>
          `<tr class="gr-entry"><td>${fmtRel(e.date, true)}</td><td>${esc(withUnit(fmtNum(e.amount), unit))}</td>${entryDel(s, e)}</tr>`,
      )
      .join('')}`,
    )
    .join('');
  const table = rt
    ? `<table><thead><tr><th>${t('cu.col.period')}</th><th>${t('cu.col.checkins')}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<table><thead><tr><th>${t('cu.col.period')}</th><th>${t('cu.col.amount')}</th><th><span class="sr-only">${t('gr.col.delete')}</span></th></tr></thead><tbody>${rows}</tbody></table>`;
  const value = rt
    ? t(('cu.now.' + scale) as TextKey, { value: amount(points.find(p => p.now)?.value || 0) })
    : scaleText(s, scale);
  return grCardHtml(s, `<strong class="gr-value">${esc(value)}</strong>${change}`, legend, plot, table, scaleSwitch(s));
}

// A step line of the running total; the tag shows what was added in the last 30 days.
export function totalGraphCard(s: State | Routine, width: number) {
  const rt = isRoutine(s),
    unit = (s as State).unit || '',
    targets = rt ? [] : stateTargets(s, 'total'),
    entries = graphEntries(s)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
  const amount = (n: number) => (rt ? tp('rt.checkins', n) : withUnit(fmtNum(n), unit));
  const byDay: Record<ISODate, number> = {};
  entries.forEach(e => (byDay[e.date] = (byDay[e.date] || 0) + Number(e.amount)));
  let sum = 0;
  const points = Object.keys(byDay)
    .sort()
    .map(date => ({
      date,
      day: dayNum(date),
      added: Number(byDay[date].toFixed(9)),
      value: (sum = Number((sum + byDay[date]).toFixed(9))),
    }));
  const todayN = dayNum(today()),
    end = Math.max(points.at(-1)!.day, todayN);
  const tip = (p: (typeof points)[number]): TipRow[] => [
    ['gr-tip-value', amount(p.value)],
    ['gr-tip-date', fmtRel(p.date, true)],
    ...(rt ? [] : [['gr-tip-row', t('cu.tipAdded', { value: withUnit(signed(p.added), unit) })] as TipRow]),
    ...targets.map((tg): TipRow => [
      'gr-tip-row',
      t('gr.tipTarget', { goal: tg.goal.title, value: withUnit(fmtNum(tg.value), unit) }),
    ]),
  ];
  const plot = plotSvg(
    s.id,
    {
      points,
      targets,
      unit,
      tip,
      from: points[0].day,
      to: end + 0.5,
      whole: rt,
      aria: t(rt ? 'cu.routineAria' : 'cu.aria', { name: s.title }),
      marks: (px, py) => {
        const path =
          points
            .map((p, i) =>
              i
                ? `H${px(p.day).toFixed(1)}V${py(p.value).toFixed(1)}`
                : `M${px(p.day).toFixed(1)},${py(p.value).toFixed(1)}`,
            )
            .join('') + `H${px(end).toFixed(1)}`;
        const area = areaFill(s.id, `${path}V${py(0).toFixed(1)}H${px(points[0].day).toFixed(1)}Z`);
        return `${area}<path class="gr-line" d="${path}"/>${points.map((p, i) => grDot(px(p.day), py(p.value), i === points.length - 1)).join('')}`;
      },
    },
    width,
  );
  const recent = sumOf(entries.filter(e => e.date > dayStr(todayN - 30) && e.date <= today()));
  const total = rt ? t('cu.inTotal', { value: amount(entries.length) }) : totalText(s);
  const stats = `<strong class="gr-value">${esc(total)}</strong><span class="tag gr-delta ${recent > 0 ? 'ok' : ''}">${esc(withUnit(signed(recent), unit))}</span><span class="meta">${t('cu.last30')}</span>`;
  const legend = grLegend([['key-measure', t('cu.legend.total')], ...(targets.length ? [targetKey(targets)] : [])]);
  let running = sumOf(entries);
  // A routine's table lists the days it was done, with the count so far.
  const rows = entries
    .slice()
    .reverse()
    .map(e => {
      const row = rt
        ? `<tr><td>${fmtRel(e.date, true)}</td><td>${esc(fmtNum(running))}</td></tr>`
        : `<tr><td>${fmtRel(e.date, true)}</td><td>${esc(withUnit(fmtNum(e.amount), unit))}</td><td>${esc(withUnit(fmtNum(running), unit))}</td>${entryDel(s, e)}</tr>`;
      running = Number((running - Number(e.amount)).toFixed(9));
      return row;
    })
    .join('');
  const table = rt
    ? `<table><thead><tr><th>${t('gr.col.date')}</th><th>${t('cu.col.total')}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<table><thead><tr><th>${t('gr.col.date')}</th><th>${t('cu.col.amount')}</th><th>${t('cu.col.total')}</th><th><span class="sr-only">${t('gr.col.delete')}</span></th></tr></thead><tbody>${rows}</tbody></table>`;
  return grCardHtml(s, stats, legend, plot, table, scaleSwitch(s));
}

// Check-ins in each of a routine's periods, against what the period asks for (met: filled in).
export function routineGraphCard(a: Routine, width: number) {
  const now = today(),
    end = a.dueDate && a.dueDate < now ? a.dueDate : now;
  const ticked = Object.keys(a.checkins || {})
    .filter(d => a.checkins![d] === 1)
    .sort();
  const first = ticked[0] < routineStart(a) ? ticked[0] : routineStart(a);
  const points: (Span & GraphPoint & { target: number; met: boolean; a: number; b: number; now: boolean })[] = [];
  for (let p = periodOf(a, first); p.from <= end && points.length < 2000; p = periodOf(a, addDays(p.to, 1))) {
    const pr = periodProgress(a, p.from),
      x0 = dayNum(p.from),
      x1 = dayNum(p.to) + 1;
    points.push({
      ...p,
      value: pr.done,
      target: pr.target,
      met: pr.met,
      day: (x0 + x1) / 2,
      a: x0,
      b: x1,
      now: p.from <= now && p.to >= now,
    });
  }
  const unit = periodUnit(a);
  const tip = (p: (typeof points)[number]): TipRow[] => [
    ['gr-tip-value', t('cu.ofTarget', { done: p.value, target: p.target })],
    ['gr-tip-date', periodLabel(unit, p.from, p.to)],
  ];
  const plot = plotSvg(
    a.id,
    {
      points,
      unit: '',
      tip,
      ys: points.map(p => p.target),
      whole: true,
      from: points[0].a,
      to: points.at(-1)!.b,
      bars: points.length,
      aria: t('cu.routineAria', { name: a.title }),
      marks: (px, py) =>
        points
          .map(p => {
            const { x, w } = barBox(px, p.a, p.b);
            return `<rect class="gr-bar${p.met ? ' met' : ''}${p.now ? ' now' : ''}" x="${x}" y="${py(p.value)}" width="${w}" height="${py(0) - py(p.value)}" rx="2"/>
        ${p.target ? `<line class="gr-goal" x1="${x}" x2="${x + w}" y1="${py(p.target)}" y2="${py(p.target)}"/>` : ''}`;
          })
          .join(''),
    },
    width,
  );
  const streak = routineStreak(a);
  const stats = `<strong class="gr-value">${esc(periodText(a))}</strong>${streak.n ? `<span class="tag ok">${esc(streakText(streak))}</span>` : ''}`;
  const legend = grLegend([
    ['key-bar', t('cu.legendRoutine')],
    ['key-goal', t('cu.legendAsks')],
  ]);
  const rows = points
    .slice()
    .reverse()
    .map(
      p =>
        `<tr><td>${esc(periodLabel(unit, p.from, p.to))}</td><td>${esc(t('cu.ofTarget', { done: p.value, target: p.target }))}</td><td>${p.met ? '✓' : ''}</td></tr>`,
    )
    .join('');
  const table = `<table><thead><tr><th>${t('cu.col.period')}</th><th>${t('cu.col.checkins')}</th><th>${t('cu.col.met')}</th></tr></thead><tbody>${rows}</tbody></table>`;
  return grCardHtml(a, stats, legend, plot, table, scaleSwitch(a));
}

// The graph of a state that adds up, or of a routine, shows another scale; it is kept on the item.
export function setGraphScale(id: string, scale: string) {
  const s = db.states.find(x => x.id === id) || db.activities.find(x => x.id === id && isRoutine(x));
  if (!s || !SCALES.includes(scale as Scale)) return;
  s.scale = scale as Scale;
  save();
  render();
  $(`[data-gr="${id}"] [data-gr-scale="${scale}"]`)?.focus();
}

export function removeEntry(id: string, entryId: string) {
  const s = db.states.find(x => x.id === id);
  const e = s?.entries?.find(x => x.id === entryId);
  if (
    !e ||
    !confirm(
      t('confirm.deleteMeasurement', { value: withUnit(fmtNum(e.amount), s!.unit || ''), date: fmtDate(e.date) }),
    )
  )
    return;
  deleteEntry(s!, entryId);
  save();
  render();
  toast(t('toast.measurementDeleted'));
  // Keep the table (or the form's list) open where it was.
  const card = $(`[data-gr="${id}"]`);
  if (card) {
    card.querySelector<HTMLDetailsElement>('.gr-table')!.open = true;
    card.querySelector<HTMLElement>('.gr-table summary')!.focus();
  }
}
