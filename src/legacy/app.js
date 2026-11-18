/** The timeline and graphs views, and boot (phase 7 moves the two views; the map is in views/map). */
import { locale, t, tp } from '../i18n/index';
import { clamp, fmtNum, isNum } from '../core/util';
import { fmtDate, fmtDay, fmtRel, fmtSpan, today } from '../core/dates';
import { REL_TYPES, VISION_RELS, emptyDb } from '../core/model';
import { db, setDb } from '../core/state';
import { ancestors, findEntity, relLabel, relsFrom, relsTo } from '../core/relations';
import { addDays, isDueDay, isFlexible, isRoutine, periodOf, periodUnit, routineStart } from '../core/routines/schedule';
import { DAY_MS, dayNum, dayStr } from '../core/days';
import { SCALES, calPeriod, deleteEntry, deleteMeasurement, entriesOf, goalPeriod, graphEntries, graphScale, isCumulative, periodTotals, sumOf } from '../core/cumulative';
import { keptDay, periodProgress, routineStreak } from '../core/routines/keeping';
import { activityState, byActivities, goalActivities, goalProgress, goalState, isComplete, ownMetric } from '../core/progress';
import { saveUsers, userStorage, users } from '../store/users';
import { STORAGE_KEY, prefs } from '../store/prefs';
import { freshUi, plans, setPlans, ui } from '../store/state';
import { PLANS_KEY, load, save } from '../store/plans';
import { setOtherPlansCache } from '../store/visions';
import { drive } from '../sync/drive';
import { syncState } from '../sync/sync';
import { renderSync } from '../ui/sync-ui';
import { $, byDeadline, emptyState, esc, hideDoneToggle, linkTag, matchesSearch, neighbourhood, statusLegend, viewEl } from '../ui/dom';
import { periodText, scaleText, streakText, totalText, withUnit } from '../ui/text';
import { closeCtxMenu, ctxMenu, showCtxMenu } from '../ui/menu';
import { applyNavCollapsed } from '../ui/nav';
import { closeAmountPop } from '../ui/amount-popover';
import { reachedQueue } from '../ui/reached';
import { hideToast, toast } from '../ui/toast';
import { modal } from '../ui/forms/form';
import { THEMES, applyTheme, renderSettings, setTheme, settings } from '../ui/settings';
import { renderPlanSwitch, storedHealth } from '../ui/plan-switcher';
import { endTour, isTourRunning } from '../tutorial/tour';
import { categoryChips, goalSelect, scopeFor, searchBox } from '../views/filters';
import { fmtRange } from '../views/routines';
import { VIEWS, render } from '../views/index';
import { zoomGraph } from '../views/map/zoom';
import { MAP } from '../views/map/layout';
import { arrowMarker, lineGlow, mapLineColour, mapRelSelection, mapSelection, relText } from '../views/map/render';

// The ▸/▾ button that folds a goal (or the 'rest' group) in the timeline.
export const foldBtn = (key, name, folded, tip = esc(t(folded ? 'tl.expand' : 'tl.collapse', { name }))) => `<button type="button" class="tl-fold" data-tl-fold="${key}" aria-expanded="${!folded}" aria-label="${tip}" title="${tip}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${folded ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'}"/></svg></button>`;

export function toggleTlFold(key) {
  const set = tlCollapsed();
  set.has(key) ? set.delete(key) : set.add(key);
  setTlCollapsed(set);
  render();
  $(`[data-tl-fold="${key}"]`)?.focus();
}
// What can fold: every goal with something under it, and the 'rest' group.
export const tlFoldKeys = () => timelineRows(scopeFor(ui.timelineGoal)).filter(r => r.fold || r.kind === 'group').map(r => r.kind === 'group' ? 'rest' : r.item.id);
// The one button reads Expand all once everything is folded, and Collapse all otherwise.
export function tlAllFolded() {
  const keys = tlFoldKeys(), set = tlCollapsed();
  return keys.length > 0 && keys.every(k => set.has(k));
}
export function foldAllTl(collapse) {
  setTlCollapsed(new Set(collapse ? tlFoldKeys() : []));
  render();
  $('[data-tl-fold-all]')?.focus();
}

/* ---------- Timeline (Gantt chart of goals and activities) ---------- */

// ZOOM presets and the MIN–MAX range for free zooming are in pixels per day.
export const TL = { ROW: 40, ZOOM: { week: 30, month: 8, quarter: 2.6 }, MIN: 1.5, MAX: 80 };
export const endOf = (kind, item) => (kind === 'goal' ? item.deadline : item.dueDate);
// A routine that runs a set number of times ends where its start puts it: only the whole bar moves.
export const fixedEnd = item => isRoutine(item) && !!item.repeat.count;
// The grips at the ends of the selected bar reach a little past it, so even a thin bar has room to grab.
export const tlGrip = (edge, left, width) => {
  const inner = Math.min(6, width / 4);
  return `left:${edge === 'start' ? left - 12 : left + width - inner}px;width:${12 + inner}px`;
};

// A routine that falls on set days marks each of them along the bottom of its bar: done, missed, or
// still to come (today too, until it is ticked). One without an end marks them to the timeline's end.
// Narrow days merge into one band of colour.
export function tlRoutineDays(a, from, to, x, px) {
  if (!isRoutine(a) || isFlexible(a)) return '';
  const now = today(), w = px > 4 ? px - 2 : px, out = [], kept = keptDay(a);
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

// Rows in plan order: each top-level goal, its activity trees, then its sub-goals (recursively).
// Prerequisites that work toward no goal themselves are listed under the activity that waits for them.
// An activity that serves several goals is listed under each of them (its rows carry `also`: the
// other goals it is under). A goal in `collapsed` keeps its own row but hides what is under it;
// what it hides still counts as placed. Activities under no shown goal come last in their own
// group ('rest', which can be collapsed too).
export function timelineRows(scope, collapsed = new Set()) {
  const rows = [], placedGoals = new Set(), placed = new Set(), under = new Map(); // activity → goals it is listed under
  const visible = (kind, x) => !scope || scope[kind].has(x.id);
  const startKey = x => x.startDate || x.dueDate || x.deadline || '9999';
  const byStart = (a, b) => startKey(a).localeCompare(startKey(b));
  const kids = a => relsTo(a.id, 'subactivity').map(r => db.activities.find(x => x.id === r.from)).filter(Boolean).sort(byStart);
  // An activity's prerequisites that serve no shown goal, each as its whole tree (from its top).
  const goals = db.goals.filter(g => visible('goal', g));
  const owned = new Set(goals.flatMap(g => goalActivities(g).map(a => a.id)));
  const prereqs = a => [...new Set(relsFrom(a.id, 'depends').map(r => ancestors(r.to, 'subactivity').pop() || r.to))]
    .filter(id => !owned.has(id)).map(id => db.activities.find(x => x.id === id)).filter(Boolean).sort(byStart);
  // `rel` is how a row hangs off the row at index `parent` (drawn as a connector in that relation's colour).
  // A hidden activity passes its own place in the tree on to its children; `hidden` walks without adding rows.
  const addActivity = (a, depth, rel, parent, goal, hidden, seen = new Set()) => {
    if (seen.has(a.id)) return;
    seen.add(a.id);
    placed.add(a.id);
    if (goal) under.set(a.id, [...(under.get(a.id) || []), goal]);
    const show = !hidden && visible('activity', a) && !(ui.hideDone && a.status === 'done');
    const here = show ? rows.push({ kind: 'activity', item: a, depth, rel, parent, goal }) - 1 : parent;
    const nest = (c, childRel) => (show ? addActivity(c, depth + 1, childRel, here, goal, hidden, seen) : addActivity(c, depth, rel, parent, goal, hidden, seen));
    kids(a).forEach(c => nest(c, 'subactivity'));
    if (goal) prereqs(a).forEach(p => nest(p, 'depends'));
  };
  const addGoal = (g, depth, rel, parent, hidden) => {
    if (placedGoals.has(g.id)) return;
    placedGoals.add(g.id);
    const contributors = new Set(relsTo(g.id, 'contributes').map(r => r.from));
    const acts = db.activities.filter(a => contributors.has(a.id) && !ancestors(a.id, 'subactivity').some(p => contributors.has(p))).sort(byStart);
    const subs = relsTo(g.id, 'subgoal').map(r => db.goals.find(x => x.id === r.from)).filter(x => x && visible('goal', x)).sort((a, b) => byDeadline(a, b) || byStart(a, b));
    const folded = collapsed.has(g.id);
    // An achieved goal hidden with the done items passes its place on to what is under it, like an activity.
    const skip = !hidden && ui.hideDone && isComplete('goal', g);
    const here = hidden || skip ? parent : rows.push({ kind: 'goal', item: g, depth, rel, parent, fold: acts.length + subs.length > 0, collapsed: folded }) - 1;
    const inner = skip ? depth : depth + 1;
    acts.forEach(a => addActivity(a, inner, skip ? rel : 'contributes', here, g.id, hidden || folded));
    subs.forEach(sg => addGoal(sg, inner, skip ? rel : 'subgoal', here, hidden || folded));
  };
  const goalIds = new Set(goals.map(g => g.id));
  goals.filter(g => !ancestors(g.id, 'subgoal').some(p => goalIds.has(p))).sort((a, b) => byDeadline(a, b) || byStart(a, b)).forEach(g => addGoal(g, 0));

  const rest = db.activities.filter(a => !placed.has(a.id) && visible('activity', a));
  const restIds = new Set(rest.map(a => a.id));
  const group = { kind: 'group', key: 'rest', label: t(scope ? 'tl.related' : 'tl.unlinked'), depth: 0, collapsed: collapsed.has('rest') };
  const before = rows.push(group);
  rest.filter(a => !ancestors(a.id, 'subactivity').some(p => restIds.has(p))).sort(byStart).forEach(a => addActivity(a, 1, undefined, undefined, '', group.collapsed));
  if (rows.length === before && !group.collapsed) rows.pop();
  if (group.collapsed && !rest.length) rows.pop();
  // Each copy of an activity names the other goals it is listed under.
  rows.forEach(r => {
    const goalsOf = r.kind === 'activity' && [...new Set(under.get(r.item.id) || [])];
    if (goalsOf && goalsOf.length > 1) r.also = goalsOf.filter(id => id !== r.goal).map(id => findEntity(id).item.title);
  });
  return rows;
}

// Goals (and the 'rest' group) folded in the timeline: per plan, on this device.
export const tlCollapsed = () => new Set(prefs.get('tlCollapsed.' + plans.current, []));
export const setTlCollapsed = set => prefs.set('tlCollapsed.' + plans.current, [...set]);

export function renderTimeline() {
  if (!db.goals.length && !db.activities.length) return emptyState(t('tl.emptyTitle'), t('tl.emptyText'), 'goal');
  const rows = timelineRows(scopeFor(ui.timelineGoal), tlCollapsed());
  const { ROW } = TL;
  const px = ui.tlPx;
  const todayN = dayNum(today());

  // Date range: everything shown plus today, padded and starting on the 1st of a month.
  const dates = rows.flatMap(r => (r.item ? [r.item.startDate, endOf(r.kind, r.item)] : [])).filter(Boolean).map(dayNum);
  const pad = Math.ceil(160 / px);
  const from = dayNum(dayStr(Math.min(todayN, ...dates) - pad).slice(0, 8) + '01');
  const to = Math.max(todayN, ...dates) + pad;
  const W = (to - from + 1) * px;
  const x = n => (n - from) * px;

  // Scale: months on top; days (week zoom) or Mondays (month zoom) below; grid lines behind the rows.
  const months = [], ticks = [], lines = [];
  for (let n = from; n <= to;) {
    const d = new Date(n * DAY_MS);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS;
    const label = d.toLocaleDateString(locale(), { month: px < 5 ? 'short' : 'long', year: d.getUTCMonth() === 0 || n === from ? 'numeric' : undefined, timeZone: 'UTC' });
    months.push(`<div class="tl-month" style="left:${x(n)}px;width:${(Math.min(next, to + 1) - n) * px}px"><span>${esc(label)}</span></div>`);
    lines.push(`<i class="tl-line major" style="left:${x(n)}px"></i>`);
    n = next;
  }
  for (let n = from; n <= to; n++) {
    const d = new Date(n * DAY_MS), dow = d.getUTCDay(), dom = d.getUTCDate();
    if (px >= 18) {
      ticks.push(`<span class="tl-tick${dow === 0 || dow === 6 ? ' weekend' : ''}" style="left:${x(n)}px;width:${px}px">${dom}</span>`);
      if (dow === 6) lines.push(`<i class="tl-weekend" style="left:${x(n)}px;width:${px * 2}px"></i>`);
    } else if (px >= 4 && dow === 1) {
      ticks.push(`<span class="tl-tick" style="left:${x(n)}px">${dom}</span>`);
      if (dom !== 1) lines.push(`<i class="tl-line" style="left:${x(n)}px"></i>`);
    }
  }

  // A bar or (with dependencies shown) a dependency arrow can be selected, as in the map.
  const relSel = ui.tlDeps && db.relations.find(r => r.id === ui.mapRel && r.type === 'depends' && rows.some(x => x.item?.id === r.from) && rows.some(x => x.item?.id === r.to)) || null;
  const sel = !relSel && ui.mapSelected && rows.some(r => r.item?.id === ui.mapSelected) ? ui.mapSelected : null;
  const near = relSel ? new Set([relSel.from, relSel.to]) : neighbourhood(sel, db.relations);
  // Dates only for the item whose bar was clicked, while it stays selected.
  if (ui.tlDates !== sel) ui.tlDates = null;

  const geo = {};
  const body = rows.map((r, i) => {
    if (r.kind === 'group') return `<div class="tl-row tl-group"><div class="tl-label">${foldBtn('rest', r.label, r.collapsed)}${esc(r.label)}</div><div class="tl-track"></div></div>`;
    const { item, kind, depth } = r;
    const st = kind === 'goal' ? goalState(item) : activityState(item);
    const s = item.startDate, e = endOf(kind, item);
    const dateText = fmtSpan(s, e, true) || t('tl.noDates');
    let bar = `<span class="tl-nodates">${t('tl.noDates')}</span>`;
    if (s || e) {
      const a = dayNum(s || e), b = dayNum(e || s);
      const left = x(a), width = (b - a + 1) * px;
      const overdue = st === 'late' && e && dayNum(e) < todayN;
      const lateHtml = overdue ? `<i class="tl-overdue" style="left:${x(dayNum(e) + 1)}px;width:${(todayN - dayNum(e)) * px}px" title="${esc(t('tl.overdue', { date: fmtRel(e) }))}"></i>` : '';
      const tip = `${item.title}: ${dateText} (${t('nodeState.' + st)})`;
      // The selected item's bar can be dragged to new dates (see "Moving dates in the timeline").
      const drag = item.id === ui.tlDates ? ` tl-drag" data-tl-drag="${item.id}` : '';
      // Every row of an item, so an activity listed under several goals gets its arrows on each copy.
      const spot = s && e ? { start: left, end: left + width } : { start: left + px / 2 - 7, end: left + px / 2 + 7 };
      (geo[item.id] ||= []).push({ ...spot, y: i * ROW + ROW / 2, goal: r.goal });
      if (!s || !e) {
        const cx = left + px / 2;
        bar = `${lateHtml}<i class="tl-milestone glass ${kind} st-${st}${drag}" style="left:${cx}px" title="${esc(tip)}"></i><span class="tl-bar-label" style="left:${Math.max(cx + 14, overdue ? x(todayN + 1) + 6 : 0)}px">${esc(item.title)}</span>`;
      } else {
        const inside = width > item.title.length * 7.2 + 26;
        const pct = kind === 'goal' ? goalProgress(item) : null;
        const grips = drag && !fixedEnd(item) ? ['start', 'end'].map(edge => `<i class="tl-grip" data-tl-drag="${item.id}" data-tl-edge="${edge}" style="${tlGrip(edge, left, width)}"></i>`).join('') : '';
        bar = `${lateHtml}${grips}<div class="tl-bar glass ${kind} st-${st}${drag}" style="left:${left}px;width:${width}px" title="${esc(tip)}">${pct === null ? '' : `<i class="tl-progress" style="width:${pct.toFixed(1)}%"></i>`}${inside ? `<span>${esc(item.title)}</span>` : ''}</div>${inside ? '' : `<span class="tl-bar-label" style="left:${Math.max(left + width, overdue ? x(todayN + 1) : 0) + 8}px">${esc(item.title)}</span>`}`;
      }
    }
    if (s || e) bar += tlRoutineDays(item, from, to, x, px);
    const dim = (sel || relSel) && !near.has(item.id) ? 'dim' : '';
    const also = r.also ? t('tl.alsoUnder', { goals: r.also.join(', ') }) : '';
    const fold = r.fold ? foldBtn(item.id, item.title, r.collapsed) : '';
    return `<div class="tl-row ${kind} ${dim}${item.id === sel ? ' selected' : ''}" data-tl-node="${item.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc([item.title, dateText, also].filter(Boolean).join(', '))}">
      <div class="tl-label" style="--depth:${depth}">${r.rel && r.parent !== undefined ? `<i class="tl-elbow${REL_TYPES[r.rel].dash ? ' dash' : ''}" style="--rel:${mapLineColour(REL_TYPES[r.rel].color)};--w:${REL_TYPES[r.rel].width || 1.1}px;--up:${i - r.parent - 1}" title="${esc(relLabel(r.rel))}"></i>` : ''}${fold}<span class="tl-dot ${kind} st-${st}"></span><span class="tl-text"><span class="tl-head-line"><span class="tl-title">${esc(item.title)}</span>${also ? `<span class="tl-also" title="${esc(also)}" aria-hidden="true">↻</span>` : ''}</span><span class="tl-dates">${esc(dateText)}</span></span></div>
      <div class="tl-track">${bar}</div>
    </div>`;
  }).join('');

  // Copies of the two ends that an arrow joins: each copy of either end gets one, to the other
  // end's copy under the same goal, or else to its nearest copy.
  const copyPairs = (froms, tos) => {
    const match = (c, list) => list.find(o => o.goal === c.goal) || list.reduce((a, b) => (Math.abs(b.y - c.y) < Math.abs(a.y - c.y) ? b : a));
    const pairs = [...froms.map(d => [match(d, tos), d]), ...tos.map(p => [p, match(p, froms)])];
    return pairs.filter(([p, d], i) => pairs.findIndex(([q, e]) => q === p && e === d) === i);
  };
  // Finish-to-start arrows: from the end of a prerequisite to the start of what depends on it, in straight runs with
  // square corners, drawn like the map's lines: each ends with a straight stretch (LEAD) and stops inside its arrowhead (TIP).
  const { LEAD, TIP } = MAP, depLine = REL_TYPES.depends;
  const deps = !ui.tlDeps ? '' : db.relations.filter(r => r.type === 'depends' && geo[r.from] && geo[r.to]).flatMap(r => copyPairs(geo[r.from], geo[r.to]).map(([p, d]) => {
    const x1 = p.end, y1 = p.y, x2 = d.start, y2 = d.y;
    const path = x2 - LEAD >= x1 + 6
      ? `M${x1},${y1} H${x2 - LEAD} V${y2} H${x2 - TIP}`
      : `M${x1},${y1} h8 V${y2 + (y2 > y1 ? -ROW / 2 : ROW / 2)} H${x2 - LEAD} V${y2} H${x2 - TIP}`;
    const dim = (sel && !(r.from === sel || r.to === sel)) || (relSel && r.id !== relSel.id) ? ' dim' : '';
    // A wide invisible twin makes the thin arrow easy to hit.
    return `<g class="tl-dep-g${dim}${r.id === relSel?.id ? ' sel' : ''}" data-rel-edit="${r.id}" tabindex="0" role="button" aria-pressed="${r.id === relSel?.id}" aria-label="${esc(t('map.relLabel', { rel: relText(r) }))}">
      <path class="tl-dep" d="${path}" style="stroke:${mapLineColour(depLine.color)};stroke-width:${depLine.width || 1.1}" stroke-dasharray="4 3" marker-end="url(#tl-arrow)"></path><path class="tl-dep-hit" d="${path}"></path><title>${esc(relText(r))}</title></g>`;
  })).join('');

  const zoom = Object.entries(TL.ZOOM).map(([z, p]) => `<button class="chip ${Math.abs(px - p) < 0.01 ? 'active' : ''}" data-tl-zoom="${z}">${t('tl.zoom.' + z)}</button>`).join('');
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
    ${rows.some(r => isRoutine(r.item) && !isFlexible(r.item)) ? `<div class="map-legend tl-legend"><span class="ctl-label">${t('tl.days')}</span>${['done', 'missed', 'due'].map(k => `<span><i class="swatch tl-day ${k}"></i>${esc(t('tl.day.' + k))}</span>`).join('')}</div>` : ''}
    <div class="map-legend tl-legend"><span class="ctl-label">${t('tl.links')}</span>${['contributes', 'subactivity', 'subgoal', ...(ui.tlDeps || rows.some(r => r.rel === 'depends') ? ['depends'] : [])].map(k =>
      `<span><i class="line-key${REL_TYPES[k].dash ? ' dash' : ''}" style="--rel:${mapLineColour(REL_TYPES[k].color)}"></i>${esc(relLabel(k))}</span>`).join('')}</div>
    ${rows.length ? `<div class="tl-scroll" data-focus-x="${Math.round(x(todayN) + 145)}" data-from="${from}" data-to="${to}">
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
    </div>` : `<div class="empty">${t('tl.noneShown')}</div>`}
    ${relSel ? mapRelSelection(relSel) : sel ? mapSelection(sel) + (geo[sel] ? `<p class="meta" style="margin-top:8px">${t(sel !== ui.tlDates ? 'tl.datesHint' : fixedEnd(findEntity(sel).item) ? 'tl.dragHintMove' : 'tl.dragHint')}</p>` : '') : `<p class="meta" style="margin-top:10px">${t('tl.hint')}</p>`}`;
}

/* ---------- Graphs (measurement history of each current state) ----------
   One line chart per current state: its measurements over time, a target line for every goal it
   measures (running to the goal's deadline), and the change since the first measurement. */

export const GR = { H: 210, L: 48, R: 14, T: 14, B: 26, MIN_W: 280, MAX_W: 960 };
export const grCharts = {}; // state id → points and scales, for the hover layer

// About `count` clean steps (1, 2 or 5 × 10ⁿ) covering lo–hi.
// `whole`: counts, so no step smaller than 1.
export function niceTicks(lo, hi, count = 4, whole = false) {
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
  const raw = whole ? Math.max((hi - lo) / count, 1) : (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw);
  const ticks = [];
  for (let v = Math.floor(lo / step) * step; ; v += step) {
    ticks.push(Number(v.toFixed(10)));
    if (v >= hi - step * 1e-9) break;
  }
  return ticks;
}

export function stateSeries(s) {
  return (s.history || []).filter(h => h.date && isNum(h.value))
    .map(h => ({ day: dayNum(h.date), date: h.date, value: Number(h.value) }))
    .sort((a, b) => a.day - b.day);
}

export function removeMeasurement(id, iso) {
  const s = db.states.find(x => x.id === id);
  const h = s?.history?.find(x => x.date === iso);
  if (!h || !confirm(t('confirm.deleteMeasurement', { value: withUnit(fmtNum(h.value), s.unit || ''), date: fmtDate(iso) }))) return;
  deleteMeasurement(s, iso);
  save();
  render();
  toast(t('toast.measurementDeleted'));
  // Keep the table open where it was.
  const card = $(`[data-gr="${id}"]`);
  if (card) { card.querySelector('.gr-table').open = true; card.querySelector('.gr-table summary').focus(); }
  else $(`[data-open="${id}"]`)?.focus();
}

// Change from the first to the latest measurement; `good` is null when no goal says which way is better.
export function stateChange(s, points, targets) {
  if (points.length < 2) return null;
  const first = points[0], last = points[points.length - 1];
  const delta = last.value - first.value;
  const pct = first.value ? delta / Math.abs(first.value) * 100 : null;
  const aim = targets.length ? Math.sign(targets[0].value - first.value) : 0;
  return { first, delta, pct, good: aim && delta ? Math.sign(delta) === aim : null };
}

export function signed(n) {
  let sign = '±';
  if (n > 0) sign = '+';
  else if (n < 0) sign = '−';
  return sign + fmtNum(Math.abs(n));
}

export function changeTag(s, change) {
  if (!change) return `<span class="tag">${t('gr.oneMeasurement')}</span>`;
  const { delta, pct, good, first } = change;
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '→';
  const cls = good === null ? '' : good ? 'ok' : 'bad';
  const text = withUnit(signed(delta), esc(s.unit || '')) + (pct === null ? '' : ` (${signed(Math.round(pct * 10) / 10)} %)`);
  return `<span class="tag gr-delta ${cls}"><span aria-hidden="true">${arrow}</span> ${text}</span>
    <span class="meta">${t('gr.since', { date: fmtRel(first.date) })}</span>`;
}

export function graphCard(s, width) {
  const points = stateSeries(s);
  const targets = relsFrom(s.id, 'measures').map(r => db.goals.find(g => g.id === r.to))
    .filter(g => g && !byActivities(g) && isNum(g.target))
    .map(g => ({ goal: g, value: Number(g.target), end: g.deadline ? dayNum(g.deadline) : null }));
  const change = stateChange(s, points, targets);
  const unit = s.unit || '';
  const last = points[points.length - 1];

  // Scales: time from the first measurement to the latest of today / last measurement / deadlines.
  const x0 = points[0].day;
  // Half a day past the latest, so today's column and the last dot are not cut in half at the edge.
  let x1 = Math.max(last.day + 0.5, dayNum(today()) + 0.5, ...targets.map(tg => tg.end || 0));
  if (x1 - x0 < 14) x1 = x0 + 14;
  const { W, zoom } = zoomedWidth(s.id, width, width, x1 - x0);
  const ticks = niceTicks(Math.min(...points.map(p => p.value), ...targets.map(tg => tg.value)), Math.max(...points.map(p => p.value), ...targets.map(tg => tg.value)));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const px = d => GR.L + (d - x0) / (x1 - x0) * (W - GR.L - GR.R);
  const py = v => GR.T + (1 - (v - y0) / (y1 - y0)) * (GR.H - GR.T - GR.B);
  grCharts[s.id] = { s, points, targets, change, px, py, unit, zoom };

  const grid = gridLines(ticks, py, W);
  const todayN = dayNum(today());
  const xAxis = dateAxis(px, x0, x1, W > width, true);
  const todayMark = todayCol(px, todayN - 0.5, x0, x1, W);
  const todayLine = todayMark?.svg || '';

  const targetLines = targets.map(tg => {
    const xe = px(tg.end && tg.end > x0 ? tg.end : x1);
    return `<line class="gr-target" x1="${GR.L}" x2="${xe}" y1="${py(tg.value)}" y2="${py(tg.value)}"/>
      ${tg.end && tg.end > x0 ? `<circle class="gr-target-end" cx="${xe}" cy="${py(tg.value)}" r="4"/>` : ''}`;
  }).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.day).toFixed(1)},${py(p.value).toFixed(1)}`).join(' ');
  const area = areaFill(s.id, `${path} L${px(last.day).toFixed(1)},${py(y0)} L${px(x0).toFixed(1)},${py(y0)} Z`);
  const dots = points.map(p => grDot(px(p.day), py(p.value), p === last)).join('');

  // Direct labels: each target at the start of its line, the latest value next to its dot – in the first
  // spot (above, below, right, left) that stays inside the plot and clear of the target labels.
  const textW = s => s.length * 7;
  const tLabels = targets.map(tg => {
    const ty = py(tg.value) + (py(tg.value) - GR.T < 16 ? 14 : -6);
    const text = t('gr.targetLabel', { value: withUnit(fmtNum(tg.value), unit) }) + (targets.length > 1 ? ` (${tg.goal.title})` : '');
    return { text, x: GR.L + 6, y: ty, box: [GR.L + 6, ty - 12, GR.L + 6 + textW(text), ty + 2] };
  });
  const targetLabels = tLabels.map(l => `<text class="gr-label muted" x="${l.x}" y="${l.y}">${esc(l.text)}</text>`).join('');
  const lx = px(last.day), ly = py(last.value);
  const vText = withUnit(fmtNum(last.value), unit), vw = textW(vText);
  const spots = [
    { x: lx, y: ly - 10, anchor: 'middle', box: [lx - vw / 2, ly - 22, lx + vw / 2, ly - 8] },
    { x: lx, y: ly + 20, anchor: 'middle', box: [lx - vw / 2, ly + 8, lx + vw / 2, ly + 22] },
    { x: lx + 9, y: ly + 4, anchor: 'start', box: [lx + 9, ly - 8, lx + 9 + vw, ly + 6] },
    { x: lx - 9, y: ly + 4, anchor: 'end', box: [lx - 9 - vw, ly - 8, lx - 9, ly + 6] },
  ];
  const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const inside = b => b[0] >= GR.L && b[2] <= W - GR.R && b[1] >= 0 && b[3] <= GR.H - GR.B;
  // Hard obstacles: target labels and the measurement line itself (sampled every few pixels).
  // The faint today line is avoided too when there is another free spot.
  const hard = tLabels.map(l => l.box);
  points.slice(1).forEach((p, i) => {
    const a = points[i], ax = px(a.day), ay = py(a.value), bx = px(p.day), by = py(p.value);
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
    for (let k = 0; k <= steps; k++) { const x = ax + (bx - ax) * k / steps, y = ay + (by - ay) * k / steps; hard.push([x - 1, y - 1, x + 1, y + 1]); }
  });
  const todayBox = todayMark ? [todayMark.box] : [];
  const free = (s, obstacles) => inside(s.box) && !obstacles.some(o => overlaps(s.box, o));
  const spot = spots.find(s => free(s, [...hard, ...todayBox])) || spots.find(s => free(s, hard)) || spots[0];
  const valueLabel = `<text class="gr-label" x="${spot.x}" y="${spot.y}" text-anchor="${spot.anchor}">${esc(vText)}</text>`;

  const legend = targets.length ? `<div class="gr-legend">
      <span><i class="key key-measure"></i>${t('gr.measurements')}</span>
      <span><i class="key key-target"></i>${esc(targets.length > 1 ? t('gr.targets') : t('gr.targetOf', { goal: targets[0].goal.title }))}</span>
    </div>` : '';

  // Newest first, each with a button to delete it.
  const rowsHtml = points.slice().reverse().map(p => {
    const del = t('gr.delete', { date: fmtDate(p.date) });
    return `<tr><td>${fmtRel(p.date, true)}</td><td>${esc(withUnit(fmtNum(p.value), unit))}</td><td>${p === points[0] ? '—' : esc(withUnit(signed(p.value - points[0].value), unit))}</td><td class="gr-del"><button type="button" class="btn small ghost" data-del-measure="${s.id}" data-date="${p.date}" title="${esc(del)}" aria-label="${esc(del)}">×</button></td></tr>`;
  }).join('');

  return `<article class="card glass gr-card" data-gr="${s.id}" data-ctx-item="${s.id}">
    <div class="card-head"><h3>${esc(s.title)}</h3><button class="btn small ghost" data-open="${s.id}">${t('btn.edit')}</button></div>
    <div class="gr-stats"><strong class="gr-value">${esc(withUnit(fmtNum(last.value), unit))}</strong>${changeTag(s, change)}</div>
    ${legend}
    <div class="gr-plot${W > width ? ' scroll' : ''}" tabindex="0" role="img" aria-label="${esc(t('gr.aria', { name: s.title }))}">
      <svg width="${W}" height="${GR.H}" viewBox="0 0 ${W} ${GR.H}" aria-hidden="true">
        ${grid}${todayLine}${area}${targetLines}<path class="gr-line" d="${path}"/>${dots}${targetLabels}${valueLabel}${xAxis}
        <line class="gr-cross" y1="${GR.T}" y2="${GR.H - GR.B}" hidden/>
        <circle class="gr-focus" r="6" hidden/>
      </svg>${W > width ? yAxisPinned(ticks, py) : ''}
      <div class="gr-tip" hidden></div>
    </div>
    <details class="gr-table"><summary>${t('gr.table')}</summary>
      <table><thead><tr><th>${t('gr.col.date')}</th><th>${t('gr.col.value')}</th><th>${t('gr.col.change')}</th><th><span class="sr-only">${t('gr.col.delete')}</span></th></tr></thead><tbody>${rowsHtml}</tbody></table>
    </details>
  </article>`;
}

// A routine's graph adds up its check-ins like a state's amounts, but on its own period's scale it
// shows what each period asks for.
export const graphFor = (item, width) => (isRoutine(item) && graphScale(item) === periodUnit(item) ? routineGraphCard(item, width)
  : !isRoutine(item) && !isCumulative(item) ? graphCard(item, width)
  : graphScale(item) === 'total' ? totalGraphCard(item, width) : periodGraphCard(item, width));
export let grDrawW = 0; // the width graphs were last drawn to fit

// Zoomed in, a graph is drawn wider and scrolls sideways; zoomed out, it is never narrower than the card,
// nor stretched past the timeline's closest zoom. `base` is its width unzoomed; `zoom` the range allowed.
export function zoomedWidth(id, base, width, days) {
  const zoom = [Math.min(width / base, 1), Math.max((GR.L + GR.R + days * TL.MAX) / base, 1)];
  return { W: Math.round(base * clamp(ui.grZoom[id] || 1, ...zoom)), zoom };
}

// Today is a faint column as wide as the day (never thinner than 3 px), a line down its middle, behind the data. `from` is where the day
// starts on the axis: a bar's day starts at its number, a measurement sits in the middle of its day.
export function todayCol(px, from, x0, x1, W, over = false) {
  if (from + 1 <= x0 || from >= x1) return null;
  // Over bars, the day keeps the bars' thin gap, so on a period's first or last day it stays inside the bar.
  const gap = over ? 1 : 0;
  const a = clamp(px(from), GR.L, W - GR.R) + gap, b = clamp(px(from + 1), GR.L, W - GR.R) - gap;
  const w = Math.max(b - a, 3), x = (a + b - w) / 2;
  return { svg: `<rect class="gr-today${over ? ' over' : ''}" x="${x}" y="${GR.T}" width="${w}" height="${GR.H - GR.T - GR.B}"/>
    <line class="gr-today-line" x1="${x + w / 2}" x2="${x + w / 2}" y1="${GR.T}" y2="${GR.H - GR.B}"/>`, box: [x, GR.T, x + w, GR.H - GR.B] };
}

// The value grid, its bottom line a little stronger, with the values beside it.
export const gridLines = (ticks, py, W) => ticks.map((v, i) => `<line class="gr-grid${i ? '' : ' base'}" x1="${GR.L}" x2="${W - GR.R}" y1="${py(v)}" y2="${py(v)}"/>`).join('') + yLabels(ticks, py);
// A point's dot on a line; the latest is larger.
export const grDot = (x, y, last) => `<circle class="gr-dot${last ? ' last' : ''}" cx="${x}" cy="${y}" r="${last ? 5 : 3.5}"/>`;
export const yLabels = (ticks, py) => ticks.map(v => `<text class="gr-axis" x="${GR.L - 8}" y="${py(v) + 4}" text-anchor="end">${esc(fmtNum(v))}</text>`).join('');
// A graph wider than the card scrolls under its values, which stay at the left like the timeline's labels.
export const yAxisPinned = (ticks, py) => `<svg class="gr-yaxis" width="${GR.L}" height="${GR.H}" style="margin-top:-${GR.H}px" aria-hidden="true">${yLabels(ticks, py)}</svg>`;

// Dates under a graph: where it starts and ends, and today when there is room. One wider than the card
// (zoomed in, or a long history of bars) also marks days, Mondays, months, quarters or years, about
// every 110 px – the first of these steps that leaves that much room.
export function dateAxis(px, x0, x1, wide, withToday) {
  const todayN = dayNum(today()), perDay = (px(x1) - px(x0)) / (x1 - x0);
  const ticks = [[x0, 'start', fmtDate(dayStr(x0))], [x1, 'end', fmtDate(dayStr(x1))]];
  const room = n => ticks.every(([m]) => Math.abs(px(m) - px(n)) > 80);
  if (withToday && todayN > x0 && todayN < x1 && room(todayN)) ticks.push([todayN, 'middle', fmtDate(today())]);
  if (wide) {
    const steps = [[1, () => true], [7, d => d.getUTCDay() === 1], [30, d => d.getUTCDate() === 1],
      [91, d => d.getUTCDate() === 1 && d.getUTCMonth() % 3 === 0], [365, d => d.getUTCDate() === 1 && d.getUTCMonth() === 0]];
    const [days, starts] = steps.find(([n]) => n * perDay >= 110) || steps.at(-1);
    const opts = days < 30 ? { day: 'numeric', month: 'short' } : days < 365 ? { month: 'short', year: 'numeric' } : { year: 'numeric' };
    for (let n = Math.ceil(x0); n < x1; n++) {
      if (starts(new Date(n * DAY_MS)) && room(n)) ticks.push([n, 'middle', fmtDay(dayStr(n), opts)]);
    }
  }
  return ticks.map(([n, anchor, text]) => `<text class="gr-axis" x="${px(n)}" y="${GR.H - 6}" text-anchor="${anchor}">${esc(text)}</text>`).join('');
}

// States with measurements or amounts, and routines with check-ins, have a graph.
export const hasGraph = item => (isRoutine(item) ? Object.values(item.checkins || {}).includes(1)
  : isCumulative(item) ? entriesOf(item).length > 0 : stateSeries(item).length > 0);

export function renderGraphs() {
  const routines = db.activities.filter(hasGraph);
  if (!db.states.length && !routines.length) return emptyState(t('states.emptyTitle'), t('states.emptyText'), 'state');
  const scope = scopeFor(ui.graphGoal);
  const list = db.states.filter(s => !scope || scope.state.has(s.id)).filter(matchesSearch);
  const withData = list.filter(hasGraph);
  const without = list.filter(s => !hasGraph(s));
  const kept = routines.filter(a => !scope || scope.activity.has(a.id)).filter(matchesSearch);
  // Cards take the full width of the view; charts are drawn at that pixel width so text stays crisp.
  const viewStyle = getComputedStyle(viewEl);
  const width = clamp(viewEl.clientWidth - parseFloat(viewStyle.paddingLeft) - parseFloat(viewStyle.paddingRight) - 38, GR.MIN_W, GR.MAX_W);
  Object.keys(grCharts).forEach(k => delete grCharts[k]);
  grDrawW = width;
  const cards = [...withData, ...kept].map(item => graphFor(item, width));
  return `${categoryChips()}
    <div class="toolbar">${goalSelect('graphs', ui.graphGoal)}${searchBox()}</div>
    ${cards.length ? `<div class="gr-list">${cards.join('')}</div>` : `<div class="empty">${t('gr.none')}</div>`}
    ${without.length ? `<p class="meta gr-without">${t('gr.without')} ${without.map(s => linkTag(s.id)).join(' ')}</p>` : ''}`;
}

/* ---------- Graphs of amounts that add up, and of routines ----------
   A state that adds up per period gets a bar for each period (the one under way lighter), one that
   adds up in total a step line of its running total; a routine gets a bar of check-ins for each of
   its periods, against what the period asks for. They share the line graph's hover layer: each
   point has its `day` (where the crosshair snaps) and its own tooltip rows (`tip`). */

// A soft wash under a line, fading to the bottom of the plot.
export const areaFill = (id, d) => `<defs><linearGradient id="gr-fill-${id}" x1="0" y1="0" x2="0" y2="1"><stop class="gr-fill-stop" offset="0"/><stop class="gr-fill-stop" offset="1" style="stop-opacity: 0"/></linearGradient></defs>
  <path class="gr-area" d="${d}" fill="url(#gr-fill-${id})"/>`;

export const GR_SLOT = 12; // the narrowest a period's bar gets; longer histories scroll sideways
// A bar's left edge and width in a period running from day `a` to day `b`: it fills the period, with
// a thin gap between neighbours, so the bars sit side by side.
export function barBox(px, a, b) {
  const slot = px(b) - px(a), w = Math.max(slot - 2, 1);
  return { x: px(a) + (slot - w) / 2, w };
}

// "Week of 20 Oct", "October 2026", "2026", "20 Oct 2026", or a range for longer periods.
export function periodLabel(unit, from, to) {
  if (calPeriod(unit, from).to !== to) return fmtRange(from, to);
  if (unit === 'week') return t('cu.weekOf', { date: fmtDay(from, { day: 'numeric', month: 'short' }) });
  if (unit === 'month') return fmtDay(from, { month: 'long', year: 'numeric' });
  if (unit === 'year') return from.slice(0, 4);
  return fmtDate(from);
}

// Goals a state measures with a target, for target lines. On a state that adds up, only those
// counting it as the graph shows it: a weekly target on monthly bars would mislead.
export const stateTargets = (s, scale) => relsFrom(s.id, 'measures').map(r => db.goals.find(g => g.id === r.to))
  .filter(g => g && ownMetric(g) && isNum(g.target) && (!scale || goalPeriod(g) === scale))
  .map(g => ({ goal: g, value: Number(g.target), end: g.deadline ? dayNum(g.deadline) : null }));

// The plot shared by bar and step graphs: grid, date axis, today, target lines and labels, and the
// hover layer. `marks` draws the data with the scales; `bars` widens a long history so it scrolls.
export function plotSvg(id, { points, targets = [], unit, from, to, bars = 0, marks, tip, aria, ys = [], whole = false }, width) {
  const todayN = dayNum(today());
  // Bars end with the period under way: weeks to a far deadline would only squeeze them.
  let x0 = from, x1 = bars ? to : Math.max(to, ...targets.map(tg => tg.end || 0));
  if (x1 - x0 < 14) x1 = x0 + 14;
  const base = bars ? Math.max(width, GR.L + GR.R + Math.ceil((x1 - x0) / ((to - from) / bars) * GR_SLOT)) : width;
  const { W, zoom } = zoomedWidth(id, base, width, x1 - x0);
  const values = [0, ...points.map(p => p.value), ...targets.map(tg => tg.value), ...ys];
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4, whole);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const px = d => GR.L + (d - x0) / (x1 - x0) * (W - GR.L - GR.R);
  const py = v => GR.T + (1 - (v - y0) / (y1 - y0)) * (GR.H - GR.T - GR.B);
  grCharts[id] = { points, targets, px, py, unit, tip, zoom };
  const grid = gridLines(ticks, py, W);
  const xAxis = dateAxis(px, x0, x1, W > width, !bars);
  // Over the bars, so today shows inside the period under way; behind a line.
  const todayLine = todayCol(px, bars ? todayN : todayN - 0.5, x0, x1, W, bars)?.svg || '';
  const targetLines = targets.map(tg => {
    const xe = px(tg.end && tg.end > x0 && tg.end < x1 ? tg.end : x1);
    const ty = py(tg.value) + (py(tg.value) - GR.T < 16 ? 14 : -6);
    const text = t('gr.targetLabel', { value: withUnit(fmtNum(tg.value), unit) }) + (targets.length > 1 ? ` (${tg.goal.title})` : '');
    return `<line class="gr-target" x1="${GR.L}" x2="${xe}" y1="${py(tg.value)}" y2="${py(tg.value)}"/>
      ${tg.end && tg.end > x0 && tg.end <= x1 ? `<circle class="gr-target-end" cx="${xe}" cy="${py(tg.value)}" r="4"/>` : ''}
      <text class="gr-label muted" x="${GR.L + 6}" y="${ty}">${esc(text)}</text>`;
  }).join('');
  return `<div class="gr-plot${W > width ? ' scroll' : ''}" tabindex="0" role="img" aria-label="${esc(aria)}">
      <svg width="${W}" height="${GR.H}" viewBox="0 0 ${W} ${GR.H}" aria-hidden="true">
        ${grid}${bars ? '' : todayLine}${marks(px, py)}${bars ? todayLine : ''}${targetLines}${xAxis}
        <line class="gr-cross" y1="${GR.T}" y2="${GR.H - GR.B}" hidden/>
        <circle class="gr-focus" r="6" hidden/>
      </svg>${W > width ? yAxisPinned(ticks, py) : ''}
      <div class="gr-tip" hidden></div>
    </div>`;
}

export const grLegend = items => `<div class="gr-legend">${items.map(([cls, text]) => `<span><i class="key ${cls}"></i>${esc(text)}</span>`).join('')}</div>`;
export const targetKey = targets => ['key-target', targets.length > 1 ? t('gr.targets') : t('gr.targetOf', { goal: targets[0].goal.title })];

export function grCardHtml(item, stats, legend, plot, table, scales = '') {
  return `<article class="card glass gr-card" data-gr="${item.id}" data-ctx-item="${item.id}">
    <div class="card-head"><h3>${esc(item.title)}</h3><button class="btn small ghost" data-open="${item.id}">${t('btn.edit')}</button></div>
    <div class="gr-stats">${stats}</div>
    ${scales}
    ${legend}
    ${plot}
    <details class="gr-table"><summary>${t('gr.table')}</summary>${table}</details>
  </article>`;
}

// Sums per day, week, month or year, or the running total, for a state that adds up or a routine.
export const scaleSwitch = s => `<div class="chips gr-scale" role="group" aria-label="${esc(t(isRoutine(s) ? 'cu.scaleLabelRoutine' : 'cu.scaleLabel'))}">${SCALES.map(k =>
  `<button class="chip ${k === graphScale(s) ? 'active' : ''}" data-gr-scale="${k}" data-state="${s.id}" aria-pressed="${k === graphScale(s)}">${t('cu.scale.' + k)}</button>`).join('')}</div>`;

export const entryDel = (s, e) => {
  const del = t('cu.deleteEntry', { value: withUnit(fmtNum(e.amount), s.unit || ''), date: fmtDate(e.date) });
  return `<td class="gr-del"><button type="button" class="btn small ghost" data-del-entry="${s.id}" data-entry="${e.id}" title="${esc(del)}" aria-label="${esc(del)}">×</button></td>`;
};

// A bar for each period; the change tag compares the last complete period with the one before.
// A routine's bars count its check-ins.
export function periodGraphCard(s, width) {
  const rt = isRoutine(s), unit = s.unit || '', now = today(), scale = graphScale(s), periods = periodTotals(s, scale), targets = rt ? [] : stateTargets(s, scale);
  const amount = n => (rt ? tp('rt.checkins', n) : withUnit(fmtNum(n), unit));
  const points = periods.map(p => {
    const a = dayNum(p.from), b = dayNum(p.to) + 1;
    return { ...p, value: p.total, day: (a + b) / 2, a, b, now: p.from <= now && p.to >= now };
  });
  const tip = p => [['gr-tip-value', amount(p.value)], ['gr-tip-date', periodLabel(scale, p.from, p.to)],
    ...(rt ? [] : [['gr-tip-row', tp('cu.entries', p.entries.length)]]),
    ...targets.map(tg => ['gr-tip-row', t('gr.tipTarget', { goal: tg.goal.title, value: withUnit(fmtNum(tg.value), unit) })])];
  const plot = plotSvg(s.id, {
    points, targets, unit, tip, from: points[0].a, to: points.at(-1).b, bars: points.length, whole: rt,
    aria: t(rt ? 'cu.routineAria' : 'cu.aria', { name: s.title }),
    marks: (px, py) => points.map(p => {
      const { x, w } = barBox(px, p.a, p.b), y = py(Math.max(0, p.value)), h = Math.abs(py(p.value) - py(0));
      return `<rect class="gr-bar${p.now ? ' now' : ''}" x="${x}" y="${p.value < 0 ? py(0) : y}" width="${w}" height="${h}" rx="2"/>`;
    }).join(''),
  }, width);
  // The last complete period against the one before it.
  const done = points.filter(p => p.to < now);
  const last = done.at(-1), prev = done.at(-2);
  let change = '';
  if (last && prev) {
    const delta = Number((last.value - prev.value).toFixed(9));
    const aim = targets.length ? Math.sign(targets[0].value - prev.value) : 0;
    const cls = !aim || !delta ? '' : Math.sign(delta) === aim ? 'ok' : 'bad';
    change = `<span class="tag gr-delta ${cls}"><span aria-hidden="true">${delta > 0 ? '▲' : delta < 0 ? '▼' : '→'}</span> ${esc(withUnit(signed(delta), unit))}</span>
      <span class="meta">${esc(t('cu.vsPrev.' + scale, { period: periodLabel(scale, last.from, last.to) }))}</span>`;
  }
  const legend = grLegend([['key-bar', t(rt ? 'cu.legendRoutine' : 'cu.legend.' + scale)], ...(targets.length ? [targetKey(targets)] : [])]);
  // A routine's check-ins are ticked on the routine, so its table lists only the periods.
  const rows = points.slice().reverse().map(p => rt ? `<tr><td>${esc(periodLabel(scale, p.from, p.to))}</td><td>${esc(amount(p.value))}</td></tr>`
    : `<tr class="gr-period"><td>${esc(periodLabel(scale, p.from, p.to))}</td><td><strong>${esc(amount(p.value))}</strong></td><td></td></tr>
    ${p.entries.slice().reverse().map(e => `<tr class="gr-entry"><td>${fmtRel(e.date, true)}</td><td>${esc(withUnit(fmtNum(e.amount), unit))}</td>${entryDel(s, e)}</tr>`).join('')}`).join('');
  const table = rt ? `<table><thead><tr><th>${t('cu.col.period')}</th><th>${t('cu.col.checkins')}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<table><thead><tr><th>${t('cu.col.period')}</th><th>${t('cu.col.amount')}</th><th><span class="sr-only">${t('gr.col.delete')}</span></th></tr></thead><tbody>${rows}</tbody></table>`;
  const value = rt ? t('cu.now.' + scale, { value: amount(points.find(p => p.now)?.value || 0) }) : scaleText(s, scale);
  return grCardHtml(s, `<strong class="gr-value">${esc(value)}</strong>${change}`, legend, plot, table, scaleSwitch(s));
}

// A step line of the running total; the tag shows what was added in the last 30 days.
export function totalGraphCard(s, width) {
  const rt = isRoutine(s), unit = s.unit || '', targets = rt ? [] : stateTargets(s, 'total'), entries = graphEntries(s).slice().sort((a, b) => a.date.localeCompare(b.date));
  const amount = n => (rt ? tp('rt.checkins', n) : withUnit(fmtNum(n), unit));
  const byDay = {};
  entries.forEach(e => (byDay[e.date] = (byDay[e.date] || 0) + Number(e.amount)));
  let sum = 0;
  const points = Object.keys(byDay).sort().map(date => ({ date, day: dayNum(date), added: Number(byDay[date].toFixed(9)), value: (sum = Number((sum + byDay[date]).toFixed(9))) }));
  const todayN = dayNum(today()), end = Math.max(points.at(-1).day, todayN);
  const tip = p => [['gr-tip-value', amount(p.value)], ['gr-tip-date', fmtRel(p.date, true)],
    ...(rt ? [] : [['gr-tip-row', t('cu.tipAdded', { value: withUnit(signed(p.added), unit) })]]),
    ...targets.map(tg => ['gr-tip-row', t('gr.tipTarget', { goal: tg.goal.title, value: withUnit(fmtNum(tg.value), unit) })])];
  const plot = plotSvg(s.id, {
    points, targets, unit, tip, from: points[0].day, to: end + 0.5, whole: rt, aria: t(rt ? 'cu.routineAria' : 'cu.aria', { name: s.title }),
    marks: (px, py) => {
      const path = points.map((p, i) => (i ? `H${px(p.day).toFixed(1)}V${py(p.value).toFixed(1)}` : `M${px(p.day).toFixed(1)},${py(p.value).toFixed(1)}`)).join('') + `H${px(end).toFixed(1)}`;
      const area = areaFill(s.id, `${path}V${py(0).toFixed(1)}H${px(points[0].day).toFixed(1)}Z`);
      return `${area}<path class="gr-line" d="${path}"/>${points.map((p, i) => grDot(px(p.day), py(p.value), i === points.length - 1)).join('')}`;
    },
  }, width);
  const recent = sumOf(entries.filter(e => e.date > dayStr(todayN - 30) && e.date <= today()));
  const total = rt ? t('cu.inTotal', { value: amount(entries.length) }) : totalText(s);
  const stats = `<strong class="gr-value">${esc(total)}</strong><span class="tag gr-delta ${recent > 0 ? 'ok' : ''}">${esc(withUnit(signed(recent), unit))}</span><span class="meta">${t('cu.last30')}</span>`;
  const legend = grLegend([['key-measure', t('cu.legend.total')], ...(targets.length ? [targetKey(targets)] : [])]);
  let running = sumOf(entries);
  // A routine's table lists the days it was done, with the count so far.
  const rows = entries.slice().reverse().map(e => {
    const row = rt ? `<tr><td>${fmtRel(e.date, true)}</td><td>${esc(fmtNum(running))}</td></tr>`
      : `<tr><td>${fmtRel(e.date, true)}</td><td>${esc(withUnit(fmtNum(e.amount), unit))}</td><td>${esc(withUnit(fmtNum(running), unit))}</td>${entryDel(s, e)}</tr>`;
    running = Number((running - Number(e.amount)).toFixed(9));
    return row;
  }).join('');
  const table = rt ? `<table><thead><tr><th>${t('gr.col.date')}</th><th>${t('cu.col.total')}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<table><thead><tr><th>${t('gr.col.date')}</th><th>${t('cu.col.amount')}</th><th>${t('cu.col.total')}</th><th><span class="sr-only">${t('gr.col.delete')}</span></th></tr></thead><tbody>${rows}</tbody></table>`;
  return grCardHtml(s, stats, legend, plot, table, scaleSwitch(s));
}

// Check-ins in each of a routine's periods, against what the period asks for (met: filled in).
export function routineGraphCard(a, width) {
  const now = today(), end = a.dueDate && a.dueDate < now ? a.dueDate : now;
  const ticked = Object.keys(a.checkins || {}).filter(d => a.checkins[d] === 1).sort();
  const first = ticked[0] < routineStart(a) ? ticked[0] : routineStart(a);
  const points = [];
  for (let p = periodOf(a, first); p.from <= end && points.length < 2000; p = periodOf(a, addDays(p.to, 1))) {
    const pr = periodProgress(a, p.from), x0 = dayNum(p.from), x1 = dayNum(p.to) + 1;
    points.push({ ...p, value: pr.done, target: pr.target, met: pr.met, day: (x0 + x1) / 2, a: x0, b: x1, now: p.from <= now && p.to >= now });
  }
  const unit = periodUnit(a);
  const tip = p => [['gr-tip-value', t('cu.ofTarget', { done: p.value, target: p.target })], ['gr-tip-date', periodLabel(unit, p.from, p.to)]];
  const plot = plotSvg(a.id, {
    points, unit: '', tip, ys: points.map(p => p.target), whole: true,
    from: points[0].a, to: points.at(-1).b, bars: points.length, aria: t('cu.routineAria', { name: a.title }),
    marks: (px, py) => points.map(p => {
      const { x, w } = barBox(px, p.a, p.b);
      return `<rect class="gr-bar${p.met ? ' met' : ''}${p.now ? ' now' : ''}" x="${x}" y="${py(p.value)}" width="${w}" height="${py(0) - py(p.value)}" rx="2"/>
        ${p.target ? `<line class="gr-goal" x1="${x}" x2="${x + w}" y1="${py(p.target)}" y2="${py(p.target)}"/>` : ''}`;
    }).join(''),
  }, width);
  const streak = routineStreak(a);
  const stats = `<strong class="gr-value">${esc(periodText(a))}</strong>${streak.n ? `<span class="tag ok">${esc(streakText(streak))}</span>` : ''}`;
  const legend = grLegend([['key-bar', t('cu.legendRoutine')], ['key-goal', t('cu.legendAsks')]]);
  const rows = points.slice().reverse().map(p => `<tr><td>${esc(periodLabel(unit, p.from, p.to))}</td><td>${esc(t('cu.ofTarget', { done: p.value, target: p.target }))}</td><td>${p.met ? '✓' : ''}</td></tr>`).join('');
  const table = `<table><thead><tr><th>${t('cu.col.period')}</th><th>${t('cu.col.checkins')}</th><th>${t('cu.col.met')}</th></tr></thead><tbody>${rows}</tbody></table>`;
  return grCardHtml(a, stats, legend, plot, table, scaleSwitch(a));
}

// Hover / touch / keyboard: a crosshair snaps to the nearest measurement and a tooltip lists its values.
export function showGraphPoint(plot, i) {
  const c = grCharts[plot.closest('[data-gr]').dataset.gr];
  const p = c.points[clamp(i, 0, c.points.length - 1)];
  plot.dataset.i = c.points.indexOf(p);
  const cx = c.px(p.day), cy = c.py(p.value);
  const cross = plot.querySelector('.gr-cross'), focus = plot.querySelector('.gr-focus'), tip = plot.querySelector('.gr-tip');
  cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.hidden = false;
  focus.setAttribute('cx', cx); focus.setAttribute('cy', cy); focus.hidden = false;
  // Built with textContent: titles and units are user text.
  tip.replaceChildren();
  const row = (cls, text) => { const el = document.createElement('div'); el.className = cls; el.textContent = text; tip.append(el); };
  if (c.tip) c.tip(p).forEach(([cls, text]) => row(cls, text));
  else {
    row('gr-tip-value', withUnit(fmtNum(p.value), c.unit));
    row('gr-tip-date', fmtRel(p.date, true));
    if (p !== c.points[0]) row('gr-tip-row', t('gr.tipChange', { value: withUnit(signed(p.value - c.points[0].value), c.unit) }));
    c.targets.forEach(tg => row('gr-tip-row', t('gr.tipTarget', { goal: tg.goal.title, value: withUnit(fmtNum(tg.value), c.unit) })));
  }
  tip.hidden = false;
  // The chart's own width: a long one scrolls inside the plot.
  const w = Number(plot.querySelector('svg').getAttribute('width'));
  tip.style.left = `${clamp(cx + 12, 0, w - tip.offsetWidth)}px`;
  tip.style.top = `${clamp(cy - tip.offsetHeight - 10, 0, GR.H - tip.offsetHeight)}px`;
  if (cx + 12 + tip.offsetWidth > w) tip.style.left = `${Math.max(0, cx - 12 - tip.offsetWidth)}px`;
  // Keys can move to a bar scrolled out of sight.
  if (cx < plot.scrollLeft + GR.L || cx > plot.scrollLeft + plot.clientWidth - GR.R) plot.scrollLeft = cx - plot.clientWidth / 2;
}

export function hideGraphPoint(plot) {
  plot.querySelectorAll('.gr-cross, .gr-focus, .gr-tip').forEach(el => (el.hidden = true));
  delete plot.dataset.i;
}

export function nearestPoint(plot, clientX) {
  const c = grCharts[plot.closest('[data-gr]').dataset.gr];
  const x = clientX - plot.querySelector('svg').getBoundingClientRect().left;
  let best = 0;
  c.points.forEach((p, i) => { if (Math.abs(c.px(p.day) - x) < Math.abs(c.px(c.points[best].day) - x)) best = i; });
  return best;
}

['pointermove', 'pointerdown'].forEach(type => viewEl.addEventListener(type, e => {
  const plot = e.target.closest('.gr-plot');
  if (plot) showGraphPoint(plot, nearestPoint(plot, e.clientX));
}));
viewEl.addEventListener('pointerout', e => {
  const plot = e.target.closest('.gr-plot');
  if (plot && !plot.contains(e.relatedTarget) && document.activeElement !== plot) hideGraphPoint(plot);
});
viewEl.addEventListener('focusin', e => {
  if (e.target.matches('.gr-plot')) showGraphPoint(e.target, grCharts[e.target.closest('[data-gr]').dataset.gr].points.length - 1);
});
viewEl.addEventListener('focusout', e => { if (e.target.matches('.gr-plot')) hideGraphPoint(e.target); });
viewEl.addEventListener('keydown', e => {
  const plot = e.target.closest?.('.gr-plot');
  if (!plot) return;
  const n = grCharts[plot.closest('[data-gr]').dataset.gr].points.length;
  const i = Number(plot.dataset.i ?? n - 1);
  const factor = { '+': 1.25, '=': 1.25, '-': 0.8 }[e.key];
  if (factor && !e.ctrlKey && !e.metaKey) {
    // Around the point the crosshair is on.
    e.preventDefault();
    const c = grCharts[plot.closest('[data-gr]').dataset.gr];
    zoomGraph(plot, factor, plot.querySelector('svg').getBoundingClientRect().left + c.px(c.points[clamp(i, 0, n - 1)].day));
    return showGraphPoint(plot, i);
  }
  const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  showGraphPoint(plot, next);
});
// Charts are drawn at the view's pixel width, so redraw them when it changes.
export let grResize = null;
addEventListener('resize', () => {
  clearTimeout(grResize);
  grResize = setTimeout(() => { if (ui.view === 'graphs' && !modal.open) render(); }, 150);
});

/* =========================================================
   Events
   ========================================================= */

// The graph of a state that adds up, or of a routine, shows another scale; it is kept on the item.
export function setGraphScale(id, scale) {
  const s = db.states.find(x => x.id === id) || db.activities.find(x => x.id === id && isRoutine(x));
  if (!s || !SCALES.includes(scale)) return;
  s.scale = scale;
  save();
  render();
  $(`[data-gr="${id}"] [data-gr-scale="${scale}"]`)?.focus();
}

export function removeEntry(id, entryId) {
  const s = db.states.find(x => x.id === id);
  const e = s?.entries?.find(x => x.id === entryId);
  if (!e || !confirm(t('confirm.deleteMeasurement', { value: withUnit(fmtNum(e.amount), s.unit || ''), date: fmtDate(e.date) }))) return;
  deleteEntry(s, entryId);
  save();
  render();
  toast(t('toast.measurementDeleted'));
  // Keep the table (or the form's list) open where it was.
  const card = $(`[data-gr="${id}"]`);
  if (card) { card.querySelector('.gr-table').open = true; card.querySelector('.gr-table summary').focus(); }
}

// On the map and the timeline (where links are drawn between kinds), what to add: under the Add button, or at x, y
// for a right-click on the map's empty space.
export function openAddMenu(x, y, byKey) {
  Object.assign(ctxMenu.dataset, { id: '', rel: '', add: '1' });
  ctxMenu.setAttribute('aria-label', t('add.item'));
  showCtxMenu('', '', '', ['goal', 'activity', 'state', ...(ui.view === 'map' ? ['vision'] : [])].map(k => ({ act: 'new:' + k, label: t('add.' + k) })), x, y, byKey);
}

/* ---------- Boot ---------- */

// Loads the current user's plans, visions and preferences and shows them; true on their first visit.
export function bootUser() {
  // First visit = nothing stored yet; load() creates the first plan, so check before it.
  let firstVisit = false;
  try { firstVisit = !userStorage.getItem(PLANS_KEY) && !userStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  setTheme(THEMES.includes(prefs.get('theme')) ? prefs.get('theme') : 'system');
  applyTheme();
  load();
  renderPlanSwitch();
  if (VIEWS[prefs.get('view')]) ui.view = prefs.get('view');
  ui.mapHidden = new Set([].concat(prefs.get('mapHidden', [])).filter(k => REL_TYPES[k] || VISION_RELS[k]));
  ui.hideDone = prefs.get('hideDone', false) === true;
  ui.hideVisions = prefs.get('hideVisions', false) === true;
  ui.nextAll = prefs.get('nextAll', false) === true;
  ui.tlDeps = prefs.get('tlDeps', true) !== false;
  ui.planBadges = prefs.get('planBadges', true) !== false;
  ui.tlPx = clamp(Number(prefs.get('tlPx', TL.ZOOM[prefs.get('tlZoom')] || TL.ZOOM.month)) || TL.ZOOM.month, TL.MIN, TL.MAX);
  ui.mapScale = clamp(Number(prefs.get('mapScale', 1)) || 1, MAP.MIN_SCALE, MAP.MAX_SCALE);
  ui.category = typeof prefs.get('category') === 'string' ? prefs.get('category') : '';
  ui.help = prefs.get('help', false) === true;
  ui.navCollapsed = prefs.get('navCollapsed', false) === true;
  applyNavCollapsed();
  $('#helpBtn').setAttribute('aria-pressed', ui.help);
  render();
  return firstVisit;
}

// Another user takes over this device: nothing of the one before stays in memory, on screen or
// in a sync on its way (syncNow stops itself). Returns true on that user's first visit.
export function enterUser(id) {
  if (isTourRunning()) endTour(false);
  closeCtxMenu();
  closeAmountPop();
  reachedQueue.length = 0; // "goal reached" popups still waiting were the other user's
  hideToast(); // an undo in it would act on the other user's plan
  document.querySelectorAll('dialog[open]').forEach(d => { if (d !== settings) d.close(); });
  clearTimeout(syncState.timer);
  Object.assign(syncState, { status: 'idle', again: false, timer: null });
  drive.token = null;
  users.current = id;
  saveUsers();
  Object.keys(ui).forEach(k => delete ui[k]);
  Object.assign(ui, freshUi());
  storedHealth.clear();
  setOtherPlansCache({ key: '', list: [] });
  setPlans({ current: null, list: [] });
  setDb(emptyDb());
  const firstVisit = bootUser();
  renderSettings();
  renderSync();
  return firstVisit;
}
