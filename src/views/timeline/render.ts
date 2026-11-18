/** The timeline view: a Gantt chart of goals and activities (rows.ts orders them), and its dependency lines. */
import { emptyState, esc, hideDoneToggle, neighbourhood, statusLegend } from '../../ui/dom';
import { locale, t } from '../../i18n/index';
import { categoryChips, goalSelect, scopeFor } from '../filters';
import { ui } from '../../store/state';
import { isDueDay, isFlexible, isRoutine, routineStart } from '../../core/routines/schedule';
import { fmtRel, fmtSpan, today } from '../../core/dates';
import { keptDay } from '../../core/routines/keeping';
import { DAY_MS, dayNum, dayStr } from '../../core/days';
import { findEntity, relLabel } from '../../core/relations';
import { db } from '../../core/state';
import { activityState, goalProgress, goalState } from '../../core/progress';
import { REL_TYPES } from '../../core/model';
import { arrowMarker, lineGlow, mapLineColour, mapRelSelection, mapSelection, relText } from '../map/render';
import { MAP } from '../map/layout';
import type { Activity, Goal, RelSpec, RelType } from '../../core/model';
import type { Entity } from '../../core/relations';
import type { TextKey } from '../../i18n/index';
import { type Dated, timelineRows, tlAllFolded, tlCollapsed } from './rows';

// Where an item's bar sits in one of its rows, for the dependency arrows.
interface BarSpot {
  start: number;
  end: number;
  y: number;
  goal?: string;
}

// The ▸/▾ button that folds a goal (or the 'rest' group) in the timeline.
export const foldBtn = (
  key: string,
  name: string,
  folded: boolean,
  tip = esc(t(folded ? 'tl.expand' : 'tl.collapse', { name })),
) =>
  `<button type="button" class="tl-fold" data-tl-fold="${key}" aria-expanded="${!folded}" aria-label="${tip}" title="${tip}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${folded ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'}"/></svg></button>`;

/* ---------- Timeline (Gantt chart of goals and activities) ---------- */

// ZOOM presets and the MIN–MAX range for free zooming are in pixels per day.
export const TL = { ROW: 40, ZOOM: { week: 30, month: 8, quarter: 2.6 }, MIN: 1.5, MAX: 80 };
export const endOf = (kind: string, item: Dated) => (kind === 'goal' ? item.deadline : item.dueDate);
// A routine that runs a set number of times ends where its start puts it: only the whole bar moves.
export const fixedEnd = (item: Entity['item']) => isRoutine(item) && !!item.repeat.count;
// What dragging the selected bar does: move both dates, or only the start (a routine's end follows
// its count; a goal without a deadline has no end).
const dragHint = ({ kind, item }: Entity): TextKey =>
  fixedEnd(item)
    ? 'tl.dragHintMove'
    : kind === 'goal' && !endOf(kind, item as Goal)
      ? 'tl.dragHintOpen'
      : 'tl.dragHint';
// The grips at the ends of the selected bar reach a little past it, so even a thin bar has room to grab.
export const tlGrip = (edge: string | undefined, left: number, width: number) => {
  const inner = Math.min(6, width / 4);
  return `left:${edge === 'start' ? left - 12 : left + width - inner}px;width:${12 + inner}px`;
};

// A routine that falls on set days marks each of them along the bottom of its bar: done, missed, or
// still to come (today too, until it is ticked). One without an end marks them to the timeline's end.
// Narrow days merge into one band of colour.
export function tlRoutineDays(a: Goal | Activity, from: number, to: number, x: (n: number) => number, px: number) {
  if (!isRoutine(a) || isFlexible(a)) return '';
  const now = today(),
    w = px > 4 ? px - 2 : px,
    out: string[] = [],
    kept = keptDay(a);
  const last = Math.min(to, a.dueDate ? dayNum(a.dueDate) : to);
  for (let n = Math.max(from, dayNum(routineStart(a))); n <= last; n++) {
    const iso = dayStr(n);
    if (!isDueDay(a, iso)) continue;
    // A day made up for on another day counts as done.
    const st = kept(iso) ? 'done' : iso < now ? 'missed' : 'due';
    out.push(`<i class="tl-day ${st}" style="left:${x(n) + (px - w) / 2}px;width:${w}px"></i>`);
  }
  return out.join('');
}

export function renderTimeline() {
  if (!db.goals.length && !db.activities.length) return emptyState(t('tl.emptyTitle'), t('tl.emptyText'), 'goal');
  const rows = timelineRows(scopeFor(ui.timelineGoal), tlCollapsed());
  const { ROW } = TL;
  const px = ui.tlPx;
  const todayN = dayNum(today());

  // Date range: everything shown plus today, padded and starting on the 1st of a month.
  const dates = (
    rows.flatMap(r => (r.item ? [r.item.startDate, endOf(r.kind, r.item)] : [])).filter(Boolean) as string[]
  ).map(dayNum);
  const pad = Math.ceil(160 / px);
  const from = dayNum(dayStr(Math.min(todayN, ...dates) - pad).slice(0, 8) + '01');
  const to = Math.max(todayN, ...dates) + pad;
  const W = (to - from + 1) * px;
  const x = (n: number) => (n - from) * px;

  // Scale: months on top; days (week zoom) or Mondays (month zoom) below; grid lines behind the rows.
  const months: string[] = [],
    ticks: string[] = [],
    lines: string[] = [];
  for (let n = from; n <= to;) {
    const d = new Date(n * DAY_MS);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS;
    const label = d.toLocaleDateString(locale(), {
      month: px < 5 ? 'short' : 'long',
      year: d.getUTCMonth() === 0 || n === from ? 'numeric' : undefined,
      timeZone: 'UTC',
    });
    months.push(
      `<div class="tl-month" style="left:${x(n)}px;width:${(Math.min(next, to + 1) - n) * px}px"><span>${esc(label)}</span></div>`,
    );
    lines.push(`<i class="tl-line major" style="left:${x(n)}px"></i>`);
    n = next;
  }
  for (let n = from; n <= to; n++) {
    const d = new Date(n * DAY_MS),
      dow = d.getUTCDay(),
      dom = d.getUTCDate();
    if (px >= 18) {
      ticks.push(
        `<span class="tl-tick${dow === 0 || dow === 6 ? ' weekend' : ''}" style="left:${x(n)}px;width:${px}px">${dom}</span>`,
      );
      if (dow === 6) lines.push(`<i class="tl-weekend" style="left:${x(n)}px;width:${px * 2}px"></i>`);
    } else if (px >= 4 && dow === 1) {
      ticks.push(`<span class="tl-tick" style="left:${x(n)}px">${dom}</span>`);
      if (dom !== 1) lines.push(`<i class="tl-line" style="left:${x(n)}px"></i>`);
    }
  }

  // A bar or (with dependencies shown) a dependency arrow can be selected, as in the map.
  const relSel =
    (ui.tlDeps &&
      db.relations.find(
        r =>
          r.id === ui.mapRel &&
          r.type === 'depends' &&
          rows.some(x => x.item?.id === r.from) &&
          rows.some(x => x.item?.id === r.to),
      )) ||
    null;
  const sel = !relSel && ui.mapSelected && rows.some(r => r.item?.id === ui.mapSelected) ? ui.mapSelected : null;
  const near = relSel ? new Set([relSel.from, relSel.to]) : neighbourhood(sel, db.relations);
  // Dates only for the item whose bar was clicked, while it stays selected.
  if (ui.tlDates !== sel) ui.tlDates = null;

  const geo: Record<string, BarSpot[]> = {};
  const body = rows
    .map((r, i) => {
      if (r.kind === 'group')
        return `<div class="tl-row tl-group"><div class="tl-label">${foldBtn('rest', r.label, r.collapsed)}${esc(r.label)}</div><div class="tl-track"></div></div>`;
      const { item, kind, depth } = r;
      const st = kind === 'goal' ? goalState(item as Goal) : activityState(item as Activity);
      const s = item.startDate,
        e = endOf(kind, item);
      const dateText = fmtSpan(s, e, true) || t('tl.noDates');
      let bar = `<span class="tl-nodates">${t('tl.noDates')}</span>`;
      // A goal with a start and no deadline yet runs to today and fades out there; it has no end to drag.
      const open = kind === 'goal' && !!s && !e;
      if (s || e) {
        const a = dayNum((s || e)!),
          b = open ? Math.max(a, todayN) : dayNum((e || s)!);
        const left = x(a),
          width = (b - a + 1) * px;
        const overdue = st === 'late' && e && dayNum(e) < todayN;
        const lateHtml = overdue
          ? `<i class="tl-overdue" style="left:${x(dayNum(e) + 1)}px;width:${(todayN - dayNum(e)) * px}px" title="${esc(t('tl.overdue', { date: fmtRel(e) }))}"></i>`
          : '';
        const tip = `${item.title}: ${dateText} (${t(('nodeState.' + st) as TextKey)})`;
        // The selected item's bar can be dragged to new dates (see "Moving dates in the timeline").
        const drag = item.id === ui.tlDates ? ` tl-drag" data-tl-drag="${item.id}` : '';
        // Every row of an item, so an activity listed under several goals gets its arrows on each copy.
        const spot =
          (s && e) || open ? { start: left, end: left + width } : { start: left + px / 2 - 7, end: left + px / 2 + 7 };
        (geo[item.id] ||= []).push({ ...spot, y: i * ROW + ROW / 2, goal: r.goal });
        if ((!s || !e) && !open) {
          const cx = left + px / 2;
          bar = `${lateHtml}<i class="tl-milestone glass ${kind} st-${st}${drag}" style="left:${cx}px" title="${esc(tip)}"></i><span class="tl-bar-label" style="left:${Math.max(cx + 14, overdue ? x(todayN + 1) + 6 : 0)}px">${esc(item.title)}</span>`;
        } else {
          const inside = width > item.title.length * 7.2 + 26;
          const pct = kind === 'goal' ? goalProgress(item as Goal) : null;
          const grips =
            drag && !fixedEnd(item) && !open
              ? ['start', 'end']
                  .map(
                    edge =>
                      `<i class="tl-grip" data-tl-drag="${item.id}" data-tl-edge="${edge}" style="${tlGrip(edge, left, width)}"></i>`,
                  )
                  .join('')
              : '';
          bar = `${lateHtml}${grips}<div class="tl-bar glass ${kind} st-${st}${open ? ' tl-open' : ''}${drag}" style="left:${left}px;width:${width}px" title="${esc(tip)}">${pct === null ? '' : `<i class="tl-progress" style="width:${pct.toFixed(1)}%"></i>`}${inside ? `<span>${esc(item.title)}</span>` : ''}</div>${inside ? '' : `<span class="tl-bar-label" style="left:${Math.max(left + width, overdue ? x(todayN + 1) : 0) + 8}px">${esc(item.title)}</span>`}`;
        }
      }
      if (s || e) bar += tlRoutineDays(item, from, to, x, px);
      const dim = (sel || relSel) && !near.has(item.id) ? 'dim' : '';
      const also = r.also ? t('tl.alsoUnder', { goals: r.also.join(', ') }) : '';
      const fold = r.fold ? foldBtn(item.id, item.title, r.collapsed!) : '';
      return `<div class="tl-row ${kind} ${dim}${item.id === sel ? ' selected' : ''}" data-tl-node="${item.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc([item.title, dateText, also].filter(Boolean).join(', '))}">
      <div class="tl-label" style="--depth:${depth}">${r.rel && r.parent !== undefined ? `<i class="tl-elbow${(REL_TYPES as Record<RelType, RelSpec>)[r.rel].dash ? ' dash' : ''}" style="--rel:${mapLineColour(REL_TYPES[r.rel].color)};--w:${(REL_TYPES as Record<RelType, RelSpec>)[r.rel].width || 1.1}px;--up:${i - r.parent - 1}" title="${esc(relLabel(r.rel))}"></i>` : ''}${fold}<span class="tl-dot ${kind} st-${st}"></span><span class="tl-text"><span class="tl-head-line"><span class="tl-title">${esc(item.title)}</span>${also ? `<span class="tl-also" title="${esc(also)}" aria-hidden="true">↻</span>` : ''}</span><span class="tl-dates">${esc(dateText)}</span></span></div>
      <div class="tl-track">${bar}</div>
    </div>`;
    })
    .join('');

  // Copies of the two ends that an arrow joins: each copy of either end gets one, to the other
  // end's copy under the same goal, or else to its nearest copy.
  const copyPairs = (froms: BarSpot[], tos: BarSpot[]) => {
    const match = (c: BarSpot, list: BarSpot[]) =>
      list.find(o => o.goal === c.goal) || list.reduce((a, b) => (Math.abs(b.y - c.y) < Math.abs(a.y - c.y) ? b : a));
    const pairs = [
      ...froms.map((d): [BarSpot, BarSpot] => [match(d, tos), d]),
      ...tos.map((p): [BarSpot, BarSpot] => [p, match(p, froms)]),
    ];
    return pairs.filter(([p, d], i) => pairs.findIndex(([q, e]) => q === p && e === d) === i);
  };
  // Finish-to-start arrows: from the end of a prerequisite to the start of what depends on it, in straight runs with
  // square corners, drawn like the map's lines: each ends with a straight stretch (LEAD) and stops inside its arrowhead (TIP).
  const { LEAD, TIP } = MAP,
    depLine: RelSpec = REL_TYPES.depends;
  const deps = !ui.tlDeps
    ? ''
    : db.relations
        .filter(r => r.type === 'depends' && geo[r.from] && geo[r.to])
        .flatMap(r =>
          copyPairs(geo[r.from], geo[r.to]).map(([p, d]) => {
            const x1 = p.end,
              y1 = p.y,
              x2 = d.start,
              y2 = d.y;
            const path =
              x2 - LEAD >= x1 + 6
                ? `M${x1},${y1} H${x2 - LEAD} V${y2} H${x2 - TIP}`
                : `M${x1},${y1} h8 V${y2 + (y2 > y1 ? -ROW / 2 : ROW / 2)} H${x2 - LEAD} V${y2} H${x2 - TIP}`;
            const dim = (sel && !(r.from === sel || r.to === sel)) || (relSel && r.id !== relSel.id) ? ' dim' : '';
            // A wide invisible twin makes the thin arrow easy to hit.
            return `<g class="tl-dep-g${dim}${r.id === relSel?.id ? ' sel' : ''}" data-rel-edit="${r.id}" tabindex="0" role="button" aria-pressed="${r.id === relSel?.id}" aria-label="${esc(t('map.relLabel', { rel: relText(r) }))}">
      <path class="tl-dep" d="${path}" style="stroke:${mapLineColour(depLine.color)};stroke-width:${depLine.width || 1.1}" stroke-dasharray="4 3" marker-end="url(#tl-arrow)"></path><path class="tl-dep-hit" d="${path}"></path><title>${esc(relText(r))}</title></g>`;
          }),
        )
        .join('');

  const zoom = Object.entries(TL.ZOOM)
    .map(
      ([z, p]) =>
        `<button class="chip ${Math.abs(px - p) < 0.01 ? 'active' : ''}" data-tl-zoom="${z}">${t(('tl.zoom.' + z) as TextKey)}</button>`,
    )
    .join('');
  return `
    ${categoryChips()}
    <div class="toolbar">
      ${goalSelect('timeline', ui.timelineGoal)}
      ${hideDoneToggle()}
      <button class="chip" data-tl-deps aria-pressed="${ui.tlDeps}">${t('tl.deps')}</button>
      ${tlAllFolded() ? `<button class="chip" data-tl-fold-all="expand">${t('tl.expandAll')}</button>` : `<button class="chip" data-tl-fold-all="collapse">${t('tl.collapseAll')}</button>`}
      <div class="chips" role="group" aria-label="${esc(t('tl.zoom'))}">${zoom}</div>
    </div>
    <div class="map-legend tl-legend"><span class="ctl-label">${t('map.status')}</span>${statusLegend()}<span><i class="swatch tl-overdue-swatch"></i>${esc(t('tl.overdueLegend'))}</span></div>
    ${rows.some(r => isRoutine(r.item) && !isFlexible(r.item)) ? `<div class="map-legend tl-legend"><span class="ctl-label">${t('tl.days')}</span>${['done', 'missed', 'due'].map(k => `<span><i class="swatch tl-day ${k}"></i>${esc(t(('tl.day.' + k) as TextKey))}</span>`).join('')}</div>` : ''}
    <div class="map-legend tl-legend"><span class="ctl-label">${t('tl.links')}</span>${[
      'contributes',
      'subactivity',
      'subgoal',
      ...(ui.tlDeps || rows.some(r => r.rel === 'depends') ? ['depends'] : []),
    ]
      .map(
        k =>
          `<span><i class="line-key${(REL_TYPES as Record<string, RelSpec>)[k].dash ? ' dash' : ''}" style="--rel:${mapLineColour((REL_TYPES as Record<string, RelSpec>)[k].color)}"></i>${esc(relLabel(k))}</span>`,
      )
      .join('')}</div>
    ${
      rows.length
        ? `<div class="tl-scroll" data-focus-x="${Math.round(x(todayN) + 145)}" data-from="${from}" data-to="${to}">
      <div class="tl-inner" style="--tl-w:${W}px">
        <div class="tl-head">
          <div class="tl-corner"></div>
          <div class="tl-scale"><div class="tl-months">${months.join('')}</div><div class="tl-ticks">${ticks.join('')}</div>
            <span class="tl-today-flag" style="left:${x(todayN) + px / 2}px">${t('tl.today')}</span></div>
        </div>
        <div class="tl-body">
          <div class="tl-grid">${lines.join('')}<i class="tl-today" style="left:${x(todayN) + px / 2}px;width:${Math.max(px, 3)}px"></i></div>
          <svg class="tl-deps" width="${W}" height="${rows.length * ROW}">
            <defs>${arrowMarker('tl-arrow', depLine.color, 'auto')}${lineGlow(W, rows.length * ROW)}</defs>${deps}
          </svg>
          ${body}
        </div>
      </div>
    </div>`
        : `<div class="empty">${t('tl.noneShown')}</div>`
    }
    ${relSel ? mapRelSelection(relSel) : sel ? mapSelection(sel) + (geo[sel] ? `<p class="meta" style="margin-top:8px">${t(sel !== ui.tlDates ? 'tl.datesHint' : dragHint(findEntity(sel)!))}</p>` : '') : `<p class="meta" style="margin-top:10px">${t('tl.hint')}</p>`}`;
}
