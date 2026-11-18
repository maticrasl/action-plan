/** The app: data model, storage, views, forms and event wiring. */
import { decorateHelp, endTour, setHelp, tour } from './tutorial.js';
import { I18N, lang, locale, t, tp } from '../i18n/index';
import { applyStaticI18n, setLanguage } from '../ui/i18n-dom';
import { clamp, doneLast, fmtNum, formatter, isNum, numInput, parseNum, uid } from '../core/util';
import { dateInput, daysUntil, fmtDate, fmtDay, fmtRel, fmtSpan, isoDate, parseDateInput, today } from '../core/dates';
import { ACTIVITY_STATUS, GOAL_STATUS, KINDS, REL_TYPES, VISION_RELS, emptyDb } from '../core/model';
import { db, setDb, visions } from '../core/state';
import { canParent, contributingIds, findVision, ownVisions, setGoalVisions, visionAncestors, visionParents, visionRel, visionRelId, visionRoots } from '../core/visions';
import { addRelation, ancestors, canRelate, collection, descendants, findEntity, kindList, possibleTypes, reaches, relLabel, relSignature, relsFrom, relsTo } from '../core/relations';
import { addDays, daysBetween, isDueDay, isFlexible, isRoutine, lastOccurrence, monthDay, monthRule, nextDueDay, nthInMonth, periodOf, periodUnit, routineStart, runsOn, sched, weekday } from '../core/routines/schedule';
import { checkedOn, dayItemsDone, followList, isList, isListRoutine, itemOn, listDone, setCheckin, setDayItems, tickable } from '../core/routines/checkins';
import { DAY_MS, dayNum, dayStr, isoOf } from '../core/days';
import { PERIODS, SCALES, addEntry, calPeriod, convertState, deleteEntry, deleteMeasurement, dropRoutineEntries, entriesOf, goalPeriod, graphEntries, graphScale, improvedStates, isCumulative, lastPeriodTotal, periodTotals, recordMeasurement, refreshTotal, stateDate, stateScale, stateTotal, sumOf } from '../core/cumulative';
import { consistency, keptDay, makesUp, periodProgress, routineState, routineStreak, routineToday } from '../core/routines/keeping';
import { activityState, blockers, byActivities, byRoutines, countedActivities, goalActivities, goalCurrent, goalProgress, goalReached, goalRoutines, goalScope, goalState, isComplete, measuringState, ownMetric, smartCheck, startDueActivities } from '../core/progress';
import { PLAN_FORMAT, PLAN_VERSION, dropRoutineDeps, hasProgress, parsePlanFile, progressCounts, resetProgress } from '../core/normalize';
import { TEMPLATES, TPL_AREAS, templateData, tplText } from '../core/templates/index';
import { saveUsers, userStorage, users } from '../store/users';
import { STORAGE_KEY, prefs } from '../store/prefs';
import { currentPlan, freshUi, plans, setPlans, ui } from '../store/state';
import { PLANS_KEY, createPlan, deletePlan, load, mergePlanInto, nameTaken, openPlan, planKey, readPlan, removeEntity, save, uniqueName } from '../store/plans';
import { goalsReaching, purposeState, reachedVisions, saveVisions, servingGoals, setOtherPlansCache } from '../store/visions';
import { drive } from '../sync/drive';
import { syncConnected, syncState } from '../sync/sync';
import { renderSync } from './sync-ui.js';
import { $, byDeadline, byDueDate, deadlineTag, emptyState, esc, hideDoneToggle, itemCount, linkTag, matchesSearch, neighbourhood, progressBar, smartBadge, statusCheck, statusLegend, trail, viewEl, waitsForTag } from '../ui/dom';
import { categories, categorySuggestions } from '../core/categories';
import { nthWord, periodText, scaleText, scheduleText, shortSchedule, statusLabels, streakText, totalText, weekdayName, withUnit } from '../ui/text';
import { requestRender } from '../ui/render';

// Asks for a plan name until it is free (or the user cancels); `exceptId` is the plan being renamed.
export function askPlanName(question, suggestion, exceptId) {
  let name = prompt(question, suggestion)?.trim();
  while (name && nameTaken(name, exceptId)) name = prompt(`${t('plan.nameTaken', { name })}\n${question}`, name)?.trim();
  return name;
}

/* ---------- Relations ---------- */

// Replace all outgoing links of one type from an entity.
export function setLinks(fromId, type, toIds) {
  db.relations = db.relations.filter(r => !(r.from === fromId && r.type === type));
  const errors = toIds.map(to => addRelation(fromId, to, type)).filter(Boolean);
  if (errors.length) toast(errors[0]);
}

// Replace all incoming links of one type to an entity, e.g. the activities that contribute to a goal.
export function setIncoming(toId, type, fromIds) {
  db.relations = db.relations.filter(r => !(r.to === toId && r.type === type));
  const errors = fromIds.map(from => addRelation(from, toId, type)).filter(Boolean);
  if (errors.length) toast(errors[0]);
}

export function tickListItem(id, itemId, iso = today()) {
  const a = db.activities.find(x => x.id === id);
  if (a && isListRoutine(a)) return tickRoutineItem(a, itemId, iso);
  const it = a && isList(a) && a.list.find(i => i.id === itemId);
  if (!it) return;
  Object.assign(it, { done: !it.done, at: new Date().toISOString() });
  const was = a.status;
  followList(a);
  const waits = blockers(a);
  if (a.status === 'done' && was !== 'done') toast(waits.length ? t('acts.notDone', { name: waits[0].title }) : t('list.complete', { name: a.title }));
  save();
  render();
  // The card is drawn anew (perhaps in another column): keep the keyboard on the item.
  justTicked($(`[data-li-tick="${id}"][data-li="${itemId}"]`))?.focus();
}

export function tickRoutineItem(a, itemId, iso) {
  if (!tickable(a, iso) || !a.list.some(i => i.id === itemId)) return;
  const on = !itemOn(a, iso, itemId);
  const all = on && dayItemsDone(a, iso) === a.list.length - 1;
  const item = () => $(`[data-li-tick="${a.id}"][data-li="${itemId}"]`);
  // The last item ticks the day, asking how much first as the strip does; until then it stays unticked.
  if (all && !checkedOn(a, iso) && improvedStates(a).length) return openTickAmount(a, iso, item());
  setDayItems(a, iso, { [itemId]: on ? 1 : 0 });
  if (all !== checkedOn(a, iso) && (all || !on)) {
    // A met week (or month) says so; otherwise the day's list does.
    if (!setRoutineDay(a, iso, all) && all) toast(t('list.dayDone', { name: a.title }));
  } else {
    save();
    render();
  }
  justTicked(item())?.focus();
}
// A ticked item's box pops once; the class is only added here, so a later render does not replay it.
export const justTicked = el => { if (el?.matches('.done')) el.classList.add('just'); return el; };

export const TODAY_TAG = { done: 'ok', due: 'warn', makeUp: 'warn', any: '', met: 'ok', rest: '' };
export function todayTag(a) {
  const k = routineToday(a);
  if (!k) return '';
  const next = k === 'rest' && nextDueDay(a, addDays(today(), 1));
  const text = next ? t('rt.today.restNext', { date: fmtDay(next, { weekday: 'short', day: 'numeric', month: 'short' }) }) : t('rt.today.' + k);
  return `<span class="tag rt-today ${TODAY_TAG[k]}" data-today="${k}">${esc(text)}</span>`;
}

// Ticking a day of a routine that improves states that add up first asks how much (from `anchor`,
// the button that was clicked); unticking also removes the amounts its tick added that day.
export function toggleCheckin(id, iso, anchor = null) {
  const a = db.activities.find(x => x.id === id);
  if (!a || !isRoutine(a) || !tickable(a, iso)) return;
  if (anchor && !checkedOn(a, iso) && improvedStates(a).length) return openTickAmount(a, iso, anchor);
  setRoutineDay(a, iso, !checkedOn(a, iso));
}

// `amounts`: [state, amount] pairs to add to the states, tagged with the routine.
export function setRoutineDay(a, iso, on, amounts = []) {
  const id = a.id;
  const wasMet = periodProgress(a, iso).met;
  setCheckin(a, iso, on);
  // Ticking a list routine's day ticks its items; unticking the day (not one item) unticks them all.
  if (isListRoutine(a) && (on || dayItemsDone(a, iso) === a.list.length)) setDayItems(a, iso, Object.fromEntries(a.list.map(i => [i.id, on ? 1 : 0])));
  if (!on) dropRoutineEntries(a, iso);
  amounts.forEach(([s, n]) => addEntry(s, iso, n, a));
  save();
  render();
  // Only the period running now is "this week done"; filling in an earlier one says nothing.
  const current = periodOf(a, today()).from === periodOf(a, iso).from;
  const met = current && !wasMet && periodProgress(a, iso).met;
  if (met) toast(t({ month: 'rt.metMonth', year: 'rt.metYear' }[periodUnit(a)] || 'rt.metWeek'));
  $(`[data-checkin="${id}"][data-date="${iso}"]`)?.focus();
  return met;
}

export const mondayOf = iso => addDays(iso, -weekday(iso));
// "13–19 Oct" in the app's language.
export const fmtRange = (from, to) => formatter(Intl.DateTimeFormat, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  .formatRange(new Date(from + 'T00:00Z'), new Date(to + 'T00:00Z'));

// The weeks a routine's strip can show: from the week it started in to the week of its end date or
// today, whichever comes first (a routine that has not started stays on this week).
export function routineWeeks(a) {
  const now = today(), end = a.dueDate && a.dueDate < now ? a.dueDate : now;
  const last = mondayOf(end), first = mondayOf(routineStart(a));
  return { first: first < last ? first : last, last, end };
}
// The week the strip shows (`w`, or else this one), kept within those weeks.
export function shownWeek(a, w = ui.rtWeek[a.id]) {
  const { first, last } = routineWeeks(a);
  if (!w || w > last) return last;
  return w < first ? first : w;
}
export function shiftRoutineWeek(id, dir) {
  const a = db.activities.find(x => x.id === id);
  if (!a) return;
  ui.rtWeek[id] = shownWeek(a, addDays(shownWeek(a), dir * 7));
  render();
  // Keep focus on the arrow, or on the other one once this one has reached the end.
  const btn = d => $(`[data-rt-week="${id}"][data-dir="${d}"]`);
  (btn(dir)?.disabled ? btn(-dir) : btn(dir))?.focus();
}

// A week, Monday to Sunday, between arrows to earlier and later weeks: tap a day the routine runs
// on, up to today, to tick or untick it. Every day names its date on hover.
export function routineWeek(a, from = shownWeek(a)) {
  const now = today(), { first, last } = routineWeeks(a);
  const fmt = iso => fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const arrow = (dir, off, tip = esc(t(dir < 0 ? 'rt.prevWeek' : 'rt.nextWeek'))) => `<button type="button" class="icon-btn rt-arrow" data-rt-week="${a.id}" data-dir="${dir}" title="${tip}" aria-label="${tip}" ${off ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg></button>`;
  // Each day is one of: done, due (outlined), missed (hatched), not due (fixed routines' other days)
  // or any day (flexible routines); today is ringed.
  // A missed day that a tick on another day made up for shows as made up.
  const kept = keptDay(a);
  const strip = daysBetween(from, addDays(from, 6)).map(d => {
    const on = checkedOn(a, d), off = d > now || !runsOn(a, d), fixed = !isFlexible(a), due = fixed && isDueDay(a, d);
    const past = due && !on && !off && d < now;
    const kind = on ? 'on' : past ? (kept(d) ? 'made' : 'missed') : due ? 'due' : fixed ? 'rest' : '';
    const cls = ['rt-day', due ? 'due' : '', kind, d === now ? 'today' : ''].filter(Boolean).join(' ');
    const said = t({ on: 'rt.dayOn', missed: 'rt.dayMissed', made: 'rt.dayMadeUp', due: 'rt.dayDue', rest: 'rt.dayRest' }[kind] || 'rt.dayOff', { date: fmt(d) });
    const label = esc(d === now ? t('rt.dayToday', { label: said }) : said);
    return `<button type="button" class="${cls}" data-checkin="${a.id}" data-date="${d}" aria-pressed="${on}" ${off ? 'aria-disabled="true"' : ''} title="${label}" aria-label="${label}"><span aria-hidden="true">${esc(weekdayName(weekday(d), 'narrow'))}</span></button>`;
  }).join('');
  return `<div class="rt-nav">${arrow(-1, from <= first)}<div class="rt-week" role="group" aria-label="${esc(from === mondayOf(now) ? t('rt.weekLabel') : fmtRange(from, addDays(from, 6)))}">${strip}</div>${arrow(1, from >= last)}</div>`;
}

export function routineCard(a) {
  // The bar follows the week on the strip: this period as usual, or an earlier one with its dates.
  const week = shownWeek(a), { end } = routineWeeks(a), lastDay = addDays(week, 6) < end ? addDays(week, 6) : end;
  const p = periodProgress(a, lastDay), streak = routineStreak(a), st = activityState(a);
  const earlier = periodOf(a, lastDay).from !== periodOf(a, today()).from;
  const label = earlier ? t(p.target ? 'rt.past' : 'rt.pastNone', { range: fmtRange(p.from, p.to), done: p.done, target: p.target }) : periodText(a, p);
  const goals = relsFrom(a.id, 'contributes').map(r => linkTag(r.to)).join('');
  const blocked = blockers(a), now = today();
  const when = a.dueDate && a.dueDate < now ? `<span class="tag">${t('rt.ended')}</span>`
    : routineStart(a) > now ? `<span class="tag">${t('rt.starts', { date: fmtRel(routineStart(a)) })}</span>` : '';
  return `<article class="card glass activity routine st-${st}" data-open="${a.id}" data-ctx-item="${a.id}">
    <div class="card-head"><h3>${esc(a.title)}</h3><span class="tag rt-sched" title="${esc(scheduleText(a))}">${esc(shortSchedule(a))}</span></div>
    ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
    ${progressBar(p.target ? clamp(p.done / p.target * 100, 0, 100) : 0, `<span class="rt-progress">${esc(label)}</span>`)}
    ${routineWeek(a, week)}
    ${todayTag(a) ? `<div class="meta rt-now">${todayTag(a)}</div>` : ''}
    ${isListRoutine(a) && tickable(a, now) ? routineItems(a, now) : ''}
    <div class="meta">
      ${streak.n ? `<span class="tag ok">${esc(streakText(streak))}</span>` : ''}
      ${when}
      ${blocked.length ? waitsForTag(blocked) : ''}
    </div>
    ${goals ? `<div class="links">${goals}</div>` : ''}
  </article>`;
}

// A list routine's items for a day, ticked off one by one under how many are done.
export function routineItems(a, iso) {
  const n = dayItemsDone(a, iso);
  const pips = a.list.map((_, k) => `<i${k < n ? ' class="on"' : ''}></i>`).join('');
  return `<div class="rt-items"><div class="rt-items-head"><span class="label">${esc(t('list.today', { done: n, total: a.list.length }))}</span><span class="li-pips" aria-hidden="true">${pips}</span></div>
    <div class="li-ticks" role="group" aria-label="${esc(t('list.todayLabel'))}">${doneLast(a.list, i => itemOn(a, iso, i.id)).map(i => {
      const on = itemOn(a, iso, i.id);
      return `<button type="button" class="li-tick${on ? ' done' : ''}" role="checkbox" aria-checked="${on}" data-li-tick="${a.id}" data-li="${i.id}" data-date="${iso}"><span class="li-box" aria-hidden="true">${on ? '✓' : ''}</span><span class="li-text">${esc(i.text)}</span></button>`;
    }).join('')}</div></div>`;
}

// What the week strip's days mean; due, missed and not-due days only when some routine falls on set days.
export function routineLegend(routines) {
  const fixed = routines.some(a => !isFlexible(a)), made = routines.some(makesUp);
  const keys = ['on', ...(fixed ? ['due', 'missed', ...(made ? ['made'] : []), 'rest'] : []), 'today'];
  const look = { today: 'rest today', missed: 'due missed', made: 'due made' };
  return `<div class="map-legend rt-legend">${keys.map(k => `<span><i class="rt-day rt-swatch ${look[k] || k}" aria-hidden="true"></i>${esc(t('rt.legend.' + k))}</span>`).join('')}</div>`;
}

// A routine on the overview: tick today off and see this period at a glance.
export function routineRow(a) {
  const now = today(), on = checkedOn(a, now), p = periodProgress(a), streak = routineStreak(a);
  return `<div class="row glass routine-row st-${activityState(a)}" data-open="${a.id}" data-ctx-item="${a.id}">
    <button type="button" class="check ${on ? 'done' : ''}" data-checkin="${a.id}" data-date="${now}" aria-pressed="${on}" aria-label="${esc(t('rt.doneToday', { name: a.title }))}" title="${esc(t('rt.doneToday', { name: a.title }))}">${on ? '✓' : ''}</button>
    <span class="grow">${esc(a.title)} <span class="meta">${esc(scheduleText(a))}</span></span>
    ${isListRoutine(a) && a.list.length && !on ? `<span class="tag">${t('list.count', { done: dayItemsDone(a, now), total: a.list.length })}</span>` : ''}
    <span class="tag ${p.met ? 'ok' : ''}">${esc(periodText(a, p))}</span>
    ${streak.n ? `<span class="tag">${esc(streakText(streak))}</span>` : ''}
  </div>`;
}

/* =========================================================
   Views
   ========================================================= */

export const VIEWS = {
  dashboard: { add: 'goal', render: renderDashboard },
  goals: { add: 'goal', render: renderGoals },
  activities: { add: 'activity', render: renderActivities },
  states: { add: 'state', render: renderStates },
  visions: { add: 'vision', render: renderVisions },
  map: { add: 'item', render: renderMap },
  timeline: { add: 'item', render: renderTimeline },
  graphs: { add: 'state', render: renderGraphs },
};

export function render() {
  // A period ending can reach a goal without any edit.
  if (startDueActivities() + offerReached()) save();
  const v = VIEWS[ui.view];
  if (ui.category && !categories().includes(ui.category)) ui.category = '';
  const title = t('view.' + ui.view);
  $('#viewTitle').textContent = title;
  document.title = `${title} – ${t('app.name')}`;
  $('#addBtn').innerHTML = `<span class="plus" aria-hidden="true">+</span><span class="lbl">${t('add.' + v.add)}</span>`;
  $('#addBtn').setAttribute('aria-label', t('add.' + v.add));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  $('#navMore').classList.toggle('active', !!$(`.nav-extra[data-view="${ui.view}"]`));
  closeCtxMenu();
  closeAmountPop();
  const old = ui.mapRefocus ? null : $('.map-wrap, .tl-scroll');
  const prevScroll = old && { left: old.scrollLeft, top: old.scrollTop };
  ui.mapRefocus = false;
  viewEl.dataset.view = ui.view;
  // A graph redrawn at the same width stays scrolled where it was.
  const grScroll = {};
  viewEl.querySelectorAll('[data-gr] .gr-plot').forEach(p => (grScroll[p.closest('[data-gr]').dataset.gr] = { left: p.scrollLeft, w: p.scrollWidth }));
  viewEl.innerHTML = v.render();
  if (ui.view === 'activities') bindDragDrop();
  // Long charts start at their latest bars.
  viewEl.querySelectorAll('.gr-plot.scroll').forEach(p => {
    const was = grScroll[p.closest('[data-gr]').dataset.gr];
    p.scrollLeft = was && was.w === p.scrollWidth ? was.left : p.scrollWidth;
  });
  // Keep the map / timeline where the user left it; on first show, centre on the goals / today.
  const wrap = $('.map-wrap, .tl-scroll');
  if (wrap) {
    wrap.scrollLeft = prevScroll ? prevScroll.left : Number(wrap.dataset.focusX) - wrap.clientWidth / 2;
    if (prevScroll) wrap.scrollTop = prevScroll.top;
  }
  markVisions();
  decorateHelp();
  updatePlanBadges();
}
// Coming back to the app on a later day starts the activities due by then, and may find goals
// that a period's end has brought to their target.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !(startDueActivities() + offerReached())) return;
  save();
  render();
});

export function renderDashboard() {
  if (!itemCount()) return emptyState(t('dash.emptyTitle'), t('dash.emptyText'), 'goal');

  const active = db.goals.filter(g => g.status !== 'achieved' && g.status !== 'paused').sort(byDeadline);
  const avg = active.length ? active.reduce((s, g) => s + goalProgress(g), 0) / active.length : 0;
  // Routines have no status of their own: they get their own list, and the counts leave them out.
  const oneOff = db.activities.filter(a => !isRoutine(a));
  // Only the routines today still asks for: a set day (or a missed one to make up), or a flexible
  // routine whose week or month is not met yet; not those ticked today, resting or not running.
  const now = today();
  const routines = db.activities.filter(a => isRoutine(a) && ['due', 'makeUp', 'any'].includes(routineToday(a)));
  const doneActs = oneOff.filter(a => a.status === 'done').length;
  const todo = oneOff.filter(a => a.status !== 'done').sort(byDueDate);
  const overdue = todo.filter(a => a.dueDate && daysUntil(a.dueDate) < 0).length;
  // Only active activities: collapsed, those due by today (overdue included); expanded, also the
  // others in progress.
  const due = todo.filter(a => a.dueDate && a.dueDate <= now);
  const going = todo.filter(a => due.includes(a) || a.status === 'doing');
  const next = ui.nextAll ? going : due;
  const more = going.length > due.length ? `<button type="button" class="list-more" data-next-more aria-expanded="${ui.nextAll}">${
    ui.nextAll ? t('dash.showFewer') : t('dash.showAll', { n: going.length })}</button>` : '';

  const waiting = todo.filter(a => blockers(a).length).length;
  return `
    <section class="summary">
      <p class="summary-line">${tp('dash.headline', active.length, { pct: `<strong>${Math.round(avg)}&nbsp;%</strong>` })}</p>
      <ul class="facts">
        <li>${t('dash.factDone', { done: doneActs, total: oneOff.length })}</li>
        ${overdue ? `<li class="fact-late">${tp('dash.factLate', overdue)}</li>` : ''}
        ${waiting ? `<li class="fact-waiting">${tp('dash.factWaiting', waiting)}</li>` : ''}
      </ul>
    </section>

    <h2 class="section-title">${t('dash.next')} <small>${next.length ? t('dash.sorted') : ''}</small></h2>
    ${next.length ? `<div class="list">${next.map(activityRow).join('')}${more}</div>`
    : more ? `<div class="list"><div class="empty">${t('dash.noneDue')}</div>${more}</div>`
    : `<div class="empty">${t(todo.length ? 'dash.noneActive' : 'dash.allDone')}</div>`}

    ${routines.length ? `<h2 class="section-title">${t('rt.title')} <small>${t('rt.dashHint')}</small></h2>
    <div class="list routine-list">${routines.map(routineRow).join('')}</div>` : ''}

    <h2 class="section-title">${t('dash.goalsInProgress')} <small>${active.length ? t('dash.clickToEdit') : ''}</small></h2>
    ${active.length ? `<div class="grid">${active.map(goalCard).join('')}</div>` : `<div class="empty">${t('dash.noActive')}</div>`}
  `;
}

export function activityRow(a) {
  const goals = relsFrom(a.id, 'contributes').map(r => linkTag(r.to)).join('');
  const blocked = blockers(a).length;
  return `<div class="row glass st-${activityState(a)}" data-open="${a.id}" data-ctx-item="${a.id}">
    ${statusCheck(a)}
    <span class="grow ${a.status === 'done' ? 'done-text' : ''}">${esc(a.title)}</span>
    ${isList(a) && a.list.length ? `<span class="tag">${t('list.count', { done: listDone(a), total: a.list.length })}</span>` : ''}
    ${blocked ? `<span class="tag bad" title="${esc(tp('blocked.title', blocked))}">${t('blocked')}</span>` : ''}
    <span class="links">${goals}</span>
    ${deadlineTag(a.dueDate, a.status === 'done')}
  </div>`;
}

export function goalCard(g) {
  const pct = goalProgress(g);
  const linked = goalActivities(g);
  const acts = linked.filter(a => !isRoutine(a));
  const done = acts.filter(a => a.status === 'done').length;
  const routines = byRoutines(g) ? goalRoutines(g) : linked.filter(isRoutine);
  const st = measuringState(g);
  const unit = g.unit ? ' ' + esc(g.unit) : '';
  const parent = relsFrom(g.id, 'subgoal')[0];
  const waits = g.status === 'achieved' ? [] : blockers(g, 'goal');
  const measured = byActivities(g), counted = measured ? countedActivities(g).length : 0;
  return `<article class="card glass goal st-${goalState(g)}" data-open="${g.id}" data-ctx-item="${g.id}">
    <div class="card-head"><h3>${esc(g.title)}</h3>${smartBadge(g)}</div>
    ${g.category ? `<div><button type="button" class="tag cat" data-category="${esc(g.category)}">${esc(g.category)}</button></div>` : ''}
    <p class="desc">${esc(g.specific)}</p>
    ${byRoutines(g)
    ? `${trail(pct, '0 %', '100 %')}
    <div class="meta"><span>${t('goals.consistency')}: <strong>${Math.round(pct)} %</strong></span></div>`
    : measured
    ? `${trail(pct, '0', esc(tp('goals.actsTotal', counted)))}
    <div class="meta"><span>${t('f.progressActs')}: <strong>${goalCurrent(g)} / ${counted}</strong></span></div>`
    : `${trail(pct, `${fmtNum(isNum(g.baseline) ? g.baseline : 0)}${unit}`, `${fmtNum(g.target)}${unit}`)}
    <div class="meta"><span>${esc(g.metric)}: <strong>${fmtNum(goalCurrent(g))}${unit}</strong></span></div>
    ${isCumulative(st) && goalPeriod(g) !== 'total' ? `<div class="meta cu-periods">${esc(t('cu.goalLine.' + goalPeriod(g), { now: withUnit(fmtNum(stateTotal(st, goalPeriod(g))), st.unit || g.unit || ''), last: withUnit(fmtNum(lastPeriodTotal(st, goalPeriod(g))), st.unit || g.unit || '') }))}</div>` : ''}`}
    <div class="meta">
      ${g.status !== 'active' ? `<span class="tag ${g.status === 'achieved' ? 'ok' : ''}">${t('goal.' + g.status)}</span>` : ''}
      ${waits.length ? waitsForTag(waits) : ''}
      ${deadlineTag(g.deadline, g.status === 'achieved')}
      ${measured || (!acts.length && routines.length) ? '' : `<span>${t('goals.activities', { done, total: acts.length })}</span>`}
      ${routines.length ? `<span title="${esc(routines.map(a => `${a.title}: ${periodText(a)}`).join('\n'))}">⟳ ${esc(tp('goals.routines', routines.length))}</span>` : ''}
      ${st ? `<span title="${esc(t('goals.measuredBy'))}">◐ ${esc(st.title)}</span>` : ''}
    </div>
    ${parent ? `<div class="links"><span class="meta">${t('goals.partOf')}</span>${linkTag(parent.to)}</div>` : ''}
  </article>`;
}

export function renderGoals() {
  if (!db.goals.length) return emptyState(t('goals.emptyTitle'), t('goals.emptyText'), 'goal');
  const filters = statusLabels(['all', ...GOAL_STATUS], 'goal.');
  const inCat = db.goals.filter(inCategory);
  const list = inCat
    .filter(g => ui.goalFilter === 'all' || g.status === ui.goalFilter)
    .filter(matchesSearch)
    .sort(byDeadline);
  return `
    ${categoryChips()}
    <div class="toolbar">
      <div class="chips">${Object.entries(filters).map(([k, v]) => `<button class="chip ${ui.goalFilter === k ? 'active' : ''}" data-goal-filter="${k}">${v} <span class="count">${k === 'all' ? inCat.length : inCat.filter(g => g.status === k).length}</span></button>`).join('')}</div>
      ${searchBox()}
    </div>
    ${list.length ? `<div class="grid">${list.map(goalCard).join('')}</div>` : `<div class="empty">${t('goals.noMatch')}</div>`}`;
}

export function searchBox() {
  return `<input type="search" class="search" placeholder="${esc(t('search'))}" value="${esc(ui.search)}" data-search>`;
}

export function renderStates() {
  if (!db.states.length) return emptyState(t('states.emptyTitle'), t('states.emptyText'), 'state');
  const list = db.states.filter(matchesSearch).sort((a, b) => (stateDate(b) || '').localeCompare(stateDate(a) || ''));
  return `<div class="toolbar">${searchBox()}</div>
    <div class="grid">${list.map(s => {
      const goals = relsFrom(s.id, 'measures').map(r => linkTag(r.to)).join('');
      const improvers = relsTo(s.id, 'improves').length;
      const add = esc(t('cu.addTo', { name: s.title }));
      // A state that adds up shows its total and takes a new amount right here.
      const head = isCumulative(s)
        ? `<span class="cu-head">${stateScale(s) !== 'total' ? `<span class="tag cu-now">${esc(scaleText(s, stateScale(s)))}</span>` : ''}<span class="tag state cu-total">${esc(totalText(s))}</span><button type="button" class="icon-btn cu-add" data-add-amount="${s.id}" title="${add}" aria-label="${add}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></span>`
        : isNum(s.value) ? `<span class="tag state">${fmtNum(s.value)}${s.unit ? ' ' + esc(s.unit) : ''}</span>` : '';
      const count = isCumulative(s) ? (entriesOf(s).length ? tp('cu.entries', entriesOf(s).length) : '') : (s.history?.length || 0) > 1 ? tp('states.measurements', s.history.length) : '';
      const when = isCumulative(s) ? (stateDate(s) ? t('cu.lastEntry', { date: fmtRel(stateDate(s)) }) : t('cu.noEntries')) : t('states.asOf', { date: fmtRel(s.date) || '—' });
      return `<article class="card glass state" data-open="${s.id}" data-ctx-item="${s.id}">
        <div class="card-head"><h3>${esc(s.title)}</h3>${head}</div>
        ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ''}
        <div class="meta"><span>${when}</span>${improvers ? `<span>${tp('states.improvers', improvers)}</span>` : ''}${count ? `<span>${count}</span>` : ''}</div>
        ${goals ? `<div class="links">${goals}</div>` : ''}
      </article>`;
    }).join('')}</div>`;
}

export function renderActivities() {
  if (!db.activities.length) return emptyState(t('acts.emptyTitle'), t('acts.emptyText'), 'activity');
  const scope = scopeFor(ui.activityGoal);
  const all = db.activities.filter(matchesSearch).filter(a => !scope || scope.activity.has(a.id));
  const list = all.filter(a => !isRoutine(a));
  const routines = all.filter(a => isRoutine(a) && !(ui.hideDone && isComplete('activity', a)));
  const statuses = ACTIVITY_STATUS.filter(s => !(ui.hideDone && s === 'done'));
  const cols = statuses.map(status => {
    const items = list.filter(a => a.status === status).sort(byDueDate);
    return `<div class="col col-${status}" data-status="${status}"><h3>${t('activity.' + status)}<span>${items.length}</span></h3>${items.map(activityCard).join('')}</div>`;
  }).join('');
  return `${categoryChips()}
    <div class="toolbar">
      ${goalSelect('activity', ui.activityGoal)}
      ${hideDoneToggle()}
      ${searchBox()}
    </div>
    ${routines.length ? `<section class="routines" aria-labelledby="routinesTitle"><h3 class="routines-title" id="routinesTitle">${t('rt.title')}<span>${routines.length}</span></h3>
      ${routineLegend(routines)}
      <div class="routine-grid">${routines.map(routineCard).join('')}</div></section>` : ''}
    <div class="board" style="--cols:${statuses.length}">${cols}</div>`;
}

/* ---------- Goal categories & shared filters ---------- */

export const inCategory = g => !ui.category || g.category === ui.category;

// What a view shows: one goal's scope if a goal is picked, otherwise everything under
// the selected category (null means no filter at all).
export function scopeFor(goalId) {
  const goal = db.goals.find(g => g.id === goalId);
  if (goal && inCategory(goal)) return goalScope(goal.id);
  if (!ui.category) return null;
  const scope = { goal: new Set(), activity: new Set(), state: new Set() };
  db.goals.filter(inCategory).forEach(g => {
    const s = goalScope(g.id);
    KINDS.forEach(k => s[k].forEach(id => scope[k].add(id)));
  });
  return scope;
}

export function categoryChips() {
  const cats = categories();
  if (!cats.length) return '';
  const chip = (value, label, count) =>
    `<button class="chip ${ui.category === value ? 'active' : ''}" data-category="${esc(value)}" aria-pressed="${ui.category === value}">${esc(label)}${count === undefined ? '' : ` <span class="count">${count}</span>`}</button>`;
  return `<div class="chips cat-chips" role="group" aria-label="${esc(t('f.category'))}">${chip('', t('cat.all'))}${cats.map(c => chip(c, c, db.goals.filter(g => g.category === c).length)).join('')}</div>`;
}

// The ui field holding each view's goal filter, by the goal picker's data-goal-select value.
export const GOAL_FILTERS = { activity: 'activityGoal', map: 'mapGoal', timeline: 'timelineGoal', graphs: 'graphGoal' };

// Goal picker limited to the selected category, grouped by category otherwise.
export function goalSelect(target, value) {
  const option = g => `<option value="${g.id}" ${value === g.id ? 'selected' : ''}>${esc(g.title)}</option>`;
  const goals = db.goals.filter(inCategory).sort(byDeadline);
  const groups = ui.category || !categories().length
    ? goals.map(option).join('')
    : [...categories(), ''].map(c => {
      const list = goals.filter(g => (g.category || '') === c);
      return list.length ? `<optgroup label="${esc(c || t('cat.none'))}">${list.map(option).join('')}</optgroup>` : '';
    }).join('');
  return `<select data-goal-select="${target}" style="max-width:280px" aria-label="${esc(t('f.goal'))}">
    <option value="">${t(ui.category ? 'cat.allInCategory' : 'acts.allGoals')}</option>${groups}
  </select>`;
}

export function listTicks(a) {
  const n = listDone(a);
  return `${a.list.length ? progressBar(n / a.list.length * 100, t('list.done', { done: n, total: a.list.length })) : ''}
    <div class="li-ticks">${doneLast(a.list).map(i => `<button type="button" class="li-tick${i.done ? ' done' : ''}" role="checkbox" aria-checked="${!!i.done}" data-li-tick="${a.id}" data-li="${i.id}"><span class="li-box" aria-hidden="true">${i.done ? '✓' : ''}</span><span class="li-text">${esc(i.text)}</span></button>`).join('')}</div>`;
}

export function activityCard(a) {
  const goals = relsFrom(a.id, 'contributes').map(r => linkTag(r.to)).join('');
  const blocked = blockers(a);
  const parent = relsFrom(a.id, 'subactivity')[0];
  const children = descendants(a.id, 'subactivity').map(id => db.activities.find(x => x.id === id)).filter(Boolean);
  const childrenDone = children.filter(c => c.status === 'done').length;
  return `<article class="card glass activity st-${activityState(a)}" data-open="${a.id}" data-ctx-item="${a.id}" draggable="true" data-drag="${a.id}">
    <div class="card-head"><h3 class="${a.status === 'done' ? 'done-text' : ''}">${esc(a.title)}</h3>${statusCheck(a)}</div>
    ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
    ${children.length ? progressBar(childrenDone / children.length * 100, t('acts.subDone', { done: childrenDone, total: children.length })) : ''}
    ${isList(a) ? listTicks(a) : ''}
    <div class="meta">
      ${deadlineTag(a.dueDate, a.status === 'done')}
      ${blocked.length ? waitsForTag(blocked) : ''}
    </div>
    ${parent ? `<div class="links"><span class="meta">${t('acts.partOf')}</span>${linkTag(parent.to)}</div>` : ''}
    ${goals ? `<div class="links">${goals}</div>` : ''}
  </article>`;
}

/* ---------- Visions ---------- */

// Visions top down: each one under its first parent, children by title; one with more parents names the others.
export function visionOrder() {
  const out = [], seen = new Set(), byTitle = (a, b) => a.title.localeCompare(b.title, locale());
  const walk = (v, depth) => {
    if (seen.has(v.id)) return;
    seen.add(v.id);
    out.push({ v, depth });
    visions.list.filter(c => visionParents(c)[0] === v.id).sort(byTitle).forEach(c => walk(c, depth + 1));
  };
  visionRoots().sort(byTitle).forEach(v => walk(v, 0));
  visions.list.forEach(v => walk(v, 0));
  return out;
}

// How far the visions are from a Purpose, or that it is found.
export function purposeStatus(ps) {
  if (ps.on) return `<div class="vis-status found" role="status">${esc(t('vis.found', { name: ps.root.title }))}</div>`;
  const lines = [];
  if (ps.roots.length > 1) lines.push(tp('vis.manyRoots', ps.roots.length, { names: ps.roots.map(v => `“${v.title}”`).join(', ') }));
  if (!ps.active) lines.push(t('vis.noGoals'));
  else if (ps.unlinked.length) lines.push(tp('vis.unlinked', ps.unlinked.length, { names: ps.unlinked.map(({ plan, goal }) => plans.list.length > 1 ? t('vis.goalInPlan', { goal: goal.title, plan: plan.name }) : goal.title).join(', ') }));
  return lines.length ? `<div class="vis-status">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : '';
}

export const purposeTag = () => `<span class="tag purpose">${esc(t('vis.purpose'))}</span>`;

export function visionCard(v, depth, ps, reached) {
  const also = visionParents(v).slice(1).map(findVision);
  const goals = servingGoals(v.id).map(({ plan, goal }) => plan.id === plans.current ? linkTag(goal.id)
    : `<span class="tag goal other-plan" title="${esc(plan.name)}">${esc(t('vis.goalInPlan', { goal: goal.title, plan: plan.name }))}</span>`).join('');
  return `<article class="card vision${reached.has(v.id) ? ' reached' : ''}${ps.root?.id === v.id ? ' purpose' : ''}" style="--level:${depth}" data-open="${v.id}" data-ctx-item="${v.id}">
    <div class="card-head"><h3>${esc(v.title)}</h3>${ps.root?.id === v.id ? purposeTag() : ''}</div>
    ${v.description ? `<p class="desc">${esc(v.description)}</p>` : ''}
    ${also.length ? `<div class="links"><span class="meta">${t('vis.alsoUnder')}</span>${also.map(p => `<span class="tag vision" data-open="${p.id}">${esc(p.title)}</span>`).join('')}</div>` : ''}
    ${goals ? `<div class="links"><span class="meta">${t('vis.servedBy')}</span>${goals}</div>` : ''}
  </article>`;
}

export function renderVisions() {
  const note = `<p class="meta vis-note">${t('vis.shared')}</p>`;
  if (!visions.list.length) return `<div class="empty"><h3>${t('vis.emptyTitle')}</h3><div>${t('vis.emptyText')}</div>
    <button class="btn primary" data-new="vision"><span aria-hidden="true">+</span> ${t('add.vision')}</button></div>${note}`;
  const ps = purposeState(), reached = reachedVisions();
  return `${note}${purposeStatus(ps)}<div class="vision-tree">${visionOrder().map(({ v, depth }) => visionCard(v, depth, ps, reached)).join('')}</div>`;
}

export function visionForm(v) {
  const parents = v.id ? v.parents : v.links?.parents || [];
  // Not itself, nor any vision below it: that would make a loop.
  const options = visions.list.filter(x => x.id !== v.id && !(v.id && visionAncestors(x.id).has(v.id)));
  const goals = v.id ? db.goals.filter(g => ownVisions(g).includes(v.id)).map(g => g.id) : v.links?.goals || [];
  return `
    ${field('title', t('f.vision'), text('title', v.title, t('f.visionPh')))}
    ${field('description', t('f.visionDesc'), area('description', v.description, t('f.visionDescPh')))}
    ${checklist('parents', t('f.visionParents'), 'vision', options, parents, t('f.visionParentsHint'))}
    ${checklist('goals', t('f.visionGoals'), 'goal', db.goals, goals)}`;
}

/* ---------- Relationship map ---------- */

/* ---------- Map layout: layered graph drawing (Sugiyama method) ----------
   1. Layering   – goals, activities and current states each get their own band, top to bottom.
                   Inside a band, children sit below their parent and prerequisites below whatever
                   depends on them (longest-path layering), so chains read bottom-up toward the goal.
   2. Dummies    – an edge spanning several layers gets a virtual node in each layer it crosses,
                   so it is routed through the gaps between boxes instead of across them.
   3. Ordering   – from a start with linked boxes together, alternating barycenter sweeps plus adjacent
                   swaps minimise edge crossings, those of lines to visions first.
   4. Placement  – every box is pulled toward the median of its neighbours while keeping the order
                   and spacing (weighted isotonic regression), which keeps edges short and straight. */
// On the map, lines are fine and their colours muted toward grey, so they stay quieter than the glass boxes.
export const mapLineColour = color => `color-mix(in srgb, ${color} 72%, var(--ink-3))`;
// LEAD: the straight stretch each line ends with, a little longer than its arrowhead (10). TIP: how far short
// of where it points a line stops; its arrowhead covers the rest, so even a thick line ends inside the head's wide back.
export const MAP = { NW: 172, NH: 56, HG: 18, DG: 8, DW: 10, VG: 62, PAD: 20, HEAD: 34, BAND_GAP: 12, LEAD: 14, TIP: 8, MIN_SCALE: 0.25, MAX_SCALE: 3, VISION_LINE: 6 };

// Map boxes are slabs of milk glass, lit by a broad light (a panel, like a window) to the left of and a little
// above the map. Their side, along the bottom and the right and round the corners, is cut into slivers, each
// shaded by the way it faces the light and how far it is from it; the face shows the light's soft reflection.
// Goals are cut from thicker glass. The face's tint and clarity are in the CSS (--glass-tint, --glass-alpha).
export const GLASS = {
  R: 6, DEPTH: { goal: 6, other: 3.5 }, LIGHT: [-77, -11, 60], EYE: [86, 28, 300], GLOSS: 25,
  // quiet: the side of grey boxes still to do or waiting, as --glass-side-quiet does for cards (by night it matches sideTint).
  day: { sideTint: .26, quiet: .5, deepen: 0, ambient: .97, reflect: .55, spec: .75, faceShade: .03 },
  // By night only the brightness changes (on the dark base more tint would look lighter), and states take more colour.
  night: { sideTint: .38, stateTint: .46, deepen: 0, ambient: .75, reflect: .14, spec: .16, faceShade: .08 },
};
export const glassThickness = n => n.kind === 'goal' ? 'goal' : 'other';
export const glassDepth = n => GLASS.DEPTH[glassThickness(n)];

// What the light does, worked out once: how lit each sliver of the side is, for each thickness,
// and the face's reflection and shading in rings round the reflection's brightest point.
export let glassLight;
export function glassLighting() {
  if (glassLight) return glassLight;
  const { NW, NH } = MAP, { R, LIGHT, EYE, GLOSS } = GLASS;
  const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const toward = (p, q) => unit(p.map((v, i) => v - q[i]));
  // The panel as 7 × 4 × 2 small lights, 180 wide and 80 tall round LIGHT.
  const panel = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 2; k++)
    panel.push([LIGHT[0] + (i / 6 - .5) * 180, LIGHT[1] + (j / 3 - .5) * 80, LIGHT[2] + (k - .5) * 30]);
  const avg = fn => panel.reduce((sum, p) => sum + fn(p), 0) / panel.length;
  // On the face at (x, y): the light's reflection (Blinn-Phong), and how directly the light falls.
  const spec = (x, y) => { const V = toward(EYE, [x, y, 0]); return avg(p => { const L = toward(p, [x, y, 0]); return unit([L[0] + V[0], L[1] + V[1], L[2] + V[2]])[2] ** GLOSS; }); };
  const lit = (x, y) => avg(p => toward(p, [x, y, 0])[2]);
  // Where the reflection is brightest (it can lie off the box): a coarse search, then a fine one round the best.
  let peak = [0, 0], best = -1;
  const search = (x0, x1, y0, y1, step) => { for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) { const v = spec(x, y); if (v > best) { best = v; peak = [x, y]; } } };
  search(-250, 250, -125, 150, 25);
  search(peak[0] - 25, peak[0] + 25, peak[1] - 25, peak[1] + 25, 5);
  const far = Math.max(...[[0, 0], [NW, 0], [0, NH], [NW, NH]].map(([x, y]) => Math.hypot(x - peak[0], y - peak[1])));
  const dir = unit([NW / 2 - peak[0], NH / 2 - peak[1]]), litMax = Math.max(lit(0, 0), lit(0, NH));
  const rings = [...Array(25).keys()].map(k => {
    const x = peak[0] + dir[0] * far * k / 24, y = peak[1] + dir[1] * far * k / 24;
    return { spec: spec(x, y), shade: Math.max(0, 1 - lit(x, y) / litMax) };
  });
  // The visible side: the outline from the top-right corner (facing up and right, -45°) round to the
  // bottom-left one (facing down and left, 135°), in pieces that each face one way. The right side and
  // the bottom are each drawn as one strip, shaded along its length by a gradient through their pieces.
  const pieces = [];
  const arc = (cx, cy, a0, a1, n) => { for (let i = 0; i < n; i++) {
    const pts = [...Array(5).keys()].map(k => { const a = (a0 + (a1 - a0) * (i + k / 4) / n) * Math.PI / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    pieces.push({ pts, a: a0 + (a1 - a0) * (i + .5) / n });
  } };
  const line = (x0, y0, x1, y1, a, n, run) => { for (let i = 0; i < n; i++)
    pieces.push({ pts: [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n], [x0 + (x1 - x0) * (i + 1) / n, y0 + (y1 - y0) * (i + 1) / n]], a, run, t: (i + .5) / n }); };
  arc(NW - R, R, -45, 0, 2); line(NW, R, NW, NH - R, 0, 10, 'r'); arc(NW - R, NH - R, 0, 90, 6); line(NW - R, NH, R, NH, 90, 24, 'b'); arc(R, NH - R, 90, 135, 2);
  const centre = p => Math.hypot(p[0] - NW / 2, p[1] - NH / 2, p[2]);
  const pt = pts => `M${pts.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(' L')} Z`;
  const side = Object.fromEntries(Object.entries(GLASS.DEPTH).map(([kind, d]) => [kind, pieces.map(({ pts, a, run, t }) => {
    const n = [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180), 0], mid = pts[pts.length >> 1], P = [mid[0], mid[1], -d / 2];
    // Facing the light (half-Lambert), fading with distance: 1 is about as lit as the side gets.
    const light = avg(p => { const L = toward(p, P); return Math.max(0, Math.min(1, (.5 + .5 * (n[0] * L[0] + n[1] * L[1])) * (centre(p) / Math.hypot(...p.map((v, i) => v - P[i]))) ** 1.5 * 1.6)); });
    // Glass reflects its surroundings, which are brighter above than below.
    return { path: run ? '' : pt([...pts, ...pts.map(([x, y]) => [x + d, y + d]).reverse()]), light, sky: .5 - .5 * n[1], run, t };
  })]));
  // The two strips, and the line along each that its gradient follows.
  const strips = Object.fromEntries(Object.entries(GLASS.DEPTH).map(([kind, d]) => [kind, {
    r: { path: pt([[NW, R], [NW, NH - R], [NW + d, NH - R + d], [NW + d, R + d]]), along: `x1="0" y1="${R}" x2="0" y2="${NH - R}"` },
    b: { path: pt([[NW - R, NH], [R, NH], [R + d, NH + d], [NW - R + d, NH + d]]), along: `x1="${NW - R}" y1="0" x2="${R}" y2="0"` },
  }]));
  return (glassLight = { peak, far, rings, side, strips });
}

// The soft glow round a selected box, kept outside its face so the see-through glass stays clear, and round a
// selected line. Lines span the map in its own units: a straight line's box has no height for the filter to grow from.
export const lineGlow = (W, H) => `<filter id="line-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
// An arrowhead, its tip TIP past where its line stops, one size whatever the line's width.
export const arrowMarker = (id, color, orient = 'auto-start-reverse') => `<marker id="${id}" viewBox="0 0 10 10" refX="${10 - MAP.TIP}" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="${orient}"><path d="M1,1.5 L10,5 L1,8.5 L3,5 z" style="fill:${mapLineColour(color)}"/></marker>`;
export const glowDefs = (W, H) => `<filter id="node-glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/></feMerge><feComposite in2="SourceGraphic" operator="out"/></filter>`
  + lineGlow(W, H);

// The slab under each box and the light on its face, defined once per colour and thickness used.
export function glassDefs(used) {
  const root = getComputedStyle(document.documentElement), night = root.colorScheme === 'dark', g = GLASS[night ? 'night' : 'day'];
  const rgb = name => { const h = root.getPropertyValue(name).trim(); return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const css = c => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`;
  const { peak, far, rings, side, strips } = glassLighting(), base = rgb('--glass-base');
  const slabs = [...used].map(key => {
    const [tintVar, kind] = key.split('|'), tint = rgb(tintVar);
    // A map box with --activity or --grey glass is an activity still to do, or waiting.
    const tinted = tintVar === '--state' && g.stateTint || /^--(activity|grey)$/.test(tintVar) && g.quiet || g.sideTint;
    // In shade, coloured glass gets deeper in colour rather than grey: less light, more of the tint shows.
    const colour = ({ light, sky }) => {
      const share = Math.min(.95, tinted * (1 - .45 * g.deepen / 1.1 + g.deepen * (1 - light)));
      return css(mix(mix(base, tint, share).map(v => v * (g.ambient + (1 - g.ambient) * light)), [255, 255, 255], g.reflect * sky));
    };
    const id = `glass-${glassKey(key)}`, paint = (d, c) => `<path d="${d}" fill="${c}" stroke="${c}" stroke-width=".35" stroke-linejoin="round"/>`;
    const corners = side[kind].filter(x => !x.run).map(x => paint(x.path, colour(x))).join('');
    const runs = Object.entries(strips[kind]).map(([run, { path, along }]) => {
      const stops = side[kind].filter(x => x.run === run).map(x => `<stop offset="${+x.t.toFixed(3)}" stop-color="${colour(x)}"/>`).join('');
      return `<linearGradient id="${id}-${run}" gradientUnits="userSpaceOnUse" ${along}>${stops}</linearGradient>${paint(path, `url(#${id}-${run})`)}`;
    }).join('');
    return `<g id="${id}">${runs}${corners}</g>`;
  }).join('');
  const ring = (id, color, of) => `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${peak[0]}" cy="${peak[1]}" r="${+far.toFixed(1)}">${rings.map((x, k) => `<stop offset="${+(k / 24).toFixed(3)}" stop-color="${color}" stop-opacity="${+of(x).toFixed(3)}"/>`).join('')}</radialGradient>`;
  return slabs + ring('glass-spec', '#fff', x => g.spec * x.spec) + ring('glass-shade', '#000', x => g.faceShade * x.shade);
}
export const glassKey = key => key.replace('--', '').replace('|', '-');
// The colour a box takes, as in the CSS: its status's, or else its kind's.
export const glassTint = (kind, st) => ({ done: '--ok', doing: '--warn', late: '--bad', blocked: '--grey' })[st] || '--' + kind;

export function layoutMap(items, rels) {
  const { NW, NH, HG, DG, DW, VG, PAD, HEAD, BAND_GAP, LEAD, TIP, VISION_LINE } = MAP;
  const kindOf = {};
  Object.entries(items).forEach(([k, list]) => list.forEach(x => (kindOf[x.id] = k)));

  // 1. Layering (visions: a broader vision above those that serve it)
  const above = {};
  rels.forEach(r => {
    if (kindOf[r.from] !== kindOf[r.to] || kindOf[r.from] === 'state') return;
    if (r.type === 'subgoal' || r.type === 'subactivity' || r.type === 'subvision') (above[r.from] ||= []).push(r.to);
    if (r.type === 'depends') (above[r.to] ||= []).push(r.from);
  });
  const depth = {}, visiting = new Set();
  const depthOf = id => {
    if (depth[id] !== undefined) return depth[id];
    if (visiting.has(id)) return 0; // mixed parent/dependency loop – ignore the back edge
    visiting.add(id);
    const d = Math.max(-1, ...(above[id] || []).map(depthOf)) + 1;
    visiting.delete(id);
    return (depth[id] = d);
  };

  // Goals sit as low as they can, next to the activities: counted up from the bottom of their band.
  const below = {};
  Object.entries(above).forEach(([id, ups]) => ups.forEach(u => (below[u] ||= []).push(id)));
  const height = {};
  const heightOf = id => {
    if (height[id] !== undefined) return height[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const h = Math.max(-1, ...(below[id] || []).map(heightOf)) + 1;
    visiting.delete(id);
    return (height[id] = h);
  };

  const layers = [], bands = [], node = {};
  ['vision', 'goal', 'activity', 'state'].forEach(kind => {
    if (!items[kind]?.length) return;
    const base = layers.length;
    const levelOf = kind === 'goal' ? heightOf : depthOf;
    const maxDepth = Math.max(...items[kind].map(it => levelOf(it.id)));
    for (let i = 0; i <= maxDepth; i++) layers.push({ list: [] });
    items[kind].forEach(it => {
      const n = { id: it.id, kind, layer: base + (kind === 'goal' ? maxDepth - height[it.id] : depth[it.id]), w: NW };
      node[it.id] = n;
      layers[n.layer].list.push(n);
    });
    bands.push({ kind, first: base, last: layers.length - 1 });
  });

  // 2. Dummy nodes for edges that skip layers
  const chains = rels.map(r => {
    const a = node[r.from], b = node[r.to];
    if (a.layer === b.layer) return { r, a, b, same: true };
    const [top, bottom] = a.layer < b.layer ? [a, b] : [b, a];
    const chain = [top];
    for (let l = top.layer + 1; l < bottom.layer; l++) {
      const d = { id: `${r.id}:${l}`, dummy: true, layer: l, w: DW, toVision: top.kind === 'vision' };
      layers[l].list.push(d);
      chain.push(d);
    }
    chain.push(bottom);
    return { r, chain, reversed: top !== a };
  });
  const up = new Map(), down = new Map();
  const link = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);
  chains.forEach(c => c.chain?.forEach((n, i) => {
    if (i) { link(up, n, c.chain[i - 1]); link(down, c.chain[i - 1], n); }
  }));

  // Start with whatever is linked side by side, going through the lines from the top: boxes on their own come last.
  const seen = new Set(), visit = n => {
    if (seen.has(n)) return;
    seen.add(n);
    (down.get(n) || []).forEach(visit);
    (up.get(n) || []).forEach(visit);
  };
  layers.forEach(L => L.list.forEach(visit));
  layers.forEach(L => (L.list = []));
  seen.forEach(n => layers[n.layer].list.push(n));

  // 3. Crossing minimisation
  const reindex = () => layers.forEach(L => L.list.forEach((n, i) => (n.i = i)));
  reindex();
  // How much a line counts when it crosses another: a line to a vision counts most.
  const weight = (a, b) => (a.kind === 'vision' || a.toVision || b.kind === 'vision' || b.toVision ? VISION_LINE : 1);
  const crossings = () => {
    let c = 0;
    for (let l = 0; l < layers.length - 1; l++) {
      const segs = [];
      layers[l].list.forEach(n => (down.get(n) || []).forEach(m => segs.push([n.i, m.i, weight(n, m)])));
      for (let i = 0; i < segs.length; i++)
        for (let j = i + 1; j < segs.length; j++)
          if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) c += segs[i][2] * segs[j][2];
    }
    return c;
  };
  const sortLayer = (L, nbrs) => {
    L.list.forEach(n => {
      const ns = nbrs.get(n);
      n.b = ns?.length ? ns.reduce((s, x) => s + x.i, 0) / ns.length : n.i;
    });
    L.list.sort((a, b) => a.b - b.b || a.i - b.i);
    L.list.forEach((n, i) => (n.i = i));
  };
  let best = crossings(), bestOrder = layers.map(L => [...L.list]);
  for (let it = 0; it < 16 && best > 0; it++) {
    if (it % 2 === 0) for (let l = 1; l < layers.length; l++) sortLayer(layers[l], up);
    else for (let l = layers.length - 2; l >= 0; l--) sortLayer(layers[l], down);
    const c = crossings();
    if (c < best) { best = c; bestOrder = layers.map(L => [...L.list]); }
  }
  layers.forEach((L, l) => (L.list = bestOrder[l]));
  reindex();
  // Swap neighbours while that removes crossings.
  const pairCross = (u, v, nbrs) => {
    let c = 0;
    (nbrs.get(u) || []).forEach(a => (nbrs.get(v) || []).forEach(b => { if (a.i > b.i) c += weight(u, a) * weight(v, b); }));
    return c;
  };
  // The crossings between u's lines and v's when u is left of v.
  const cost = (u, v) => pairCross(u, v, up) + pairCross(u, v, down);
  const swap = (L, i) => { const u = L.list[i], v = L.list[i + 1]; L.list[i] = v; L.list[i + 1] = u; v.i = i; u.i = i + 1; };
  for (let pass = 0, improved = true; improved && pass < 8; pass++) {
    improved = false;
    layers.forEach(L => {
      for (let i = 0; i + 1 < L.list.length; i++) if (cost(L.list[i + 1], L.list[i]) < cost(L.list[i], L.list[i + 1])) { swap(L, i); improved = true; }
    });
  }

  // 4. Horizontal placement
  const sep = (a, b) => a.w / 2 + b.w / 2 + (a.dummy && b.dummy ? DG : HG);
  const offsets = L => L.list.reduce((off, n, i) => (off.push(i ? off[i - 1] + sep(L.list[i - 1], n) : 0), off), []);
  layers.forEach(L => offsets(L).forEach((x, i) => (L.list[i].x = x)));
  const median = xs => {
    const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const place = (L, refs) => {
    const off = offsets(L);
    const blocks = [];
    L.list.forEach((n, i) => {
      const ns = refs.flatMap(m => m.get(n) || []);
      // Dummies weigh more so long edges stay straight; unconnected boxes barely pull at all.
      const want = ns.length ? median(ns.map(x => x.x)) : n.x;
      const w = ns.length ? (n.dummy ? 3 : 1) : 0.2;
      blocks.push({ s: w * (want - off[i]), w, n: 1 });
      while (blocks.length > 1) {
        const [a, b] = blocks.slice(-2);
        if (a.s / a.w <= b.s / b.w) break;
        blocks.splice(-2, 2, { s: a.s + b.s, w: a.w + b.w, n: a.n + b.n });
      }
    });
    let i = 0;
    blocks.forEach(b => { for (let k = 0; k < b.n; k++, i++) L.list[i].x = b.s / b.w + off[i]; });
  };
  for (let it = 0; it < 8; it++) {
    for (let l = 1; l < layers.length; l++) place(layers[l], [up]);
    for (let l = layers.length - 2; l >= 0; l--) place(layers[l], [down]);
  }
  layers.forEach(L => place(L, [up, down]));
  // A long line runs straight down: its slots line up in one column wherever the rows leave room
  // (top to bottom, a new column starts only where they don't). Nothing else moves.
  const room = n => {
    const L = layers[n.layer].list, a = L[n.i - 1], b = L[n.i + 1];
    return [a ? a.x + sep(a, n) : -Infinity, b ? b.x - sep(n, b) : Infinity];
  };
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  for (let it = 0; it < 3; it++) chains.forEach(c => {
    const ds = c.chain?.slice(1, -1);
    if (!ds?.length) return;
    // Best between the line's two ends, so it bends one way only.
    const ends = [c.chain[0].x, c.chain[c.chain.length - 1].x].sort((a, b) => a - b);
    let run = [], lo = -Infinity, hi = Infinity;
    const align = () => {
      if (!run.length) return;
      const x = clamp(clamp(median(run.map(d => d.x)), ...ends), lo, hi);
      run.forEach(d => (d.x = x));
    };
    ds.forEach(d => {
      const [a, b] = room(d);
      if (Math.max(lo, a) > Math.min(hi, b)) { align(); run = []; lo = -Infinity; hi = Infinity; }
      run.push(d); lo = Math.max(lo, a); hi = Math.min(hi, b);
    });
    align();
  });
  const all = layers.flatMap(L => L.list);
  // Close empty vertical strips (e.g. between unrelated clusters) that placement leaves behind.
  const spans = all.map(n => [n.x - n.w / 2, n.x + n.w / 2]).sort((a, b) => a[0] - b[0]);
  const cuts = [];
  spans.reduce((reach, [l, r]) => {
    if (l - reach > HG * 2) cuts.push([reach + HG * 2, l]);
    return Math.max(reach, r);
  }, spans[0][1]);
  all.forEach(n => (n.x -= cuts.filter(([, end]) => n.x >= end).reduce((s, [start, end]) => s + end - start, 0)));
  const minX = Math.min(...all.map(n => n.x - n.w / 2));
  all.forEach(n => (n.x += PAD - minX));
  const W = Math.max(360, ...all.map(n => n.x + n.w / 2 + PAD));

  // Vertical positions
  let y = PAD;
  bands.forEach(b => {
    b.top = y;
    y += HEAD;
    for (let l = b.first; l <= b.last; l++) {
      layers[l].y = y;
      y += NH + (l < b.last ? VG : 0);
    }
    b.bottom = y + 14;
    y = b.bottom + BAND_GAP;
  });
  const H = y - BAND_GAP + PAD;

  // Edge geometry. Attachment points are spread along a box edge, ordered by where the line goes.
  const ports = new Map();
  const port = (n, side, entry) => {
    if (!ports.has(n)) ports.set(n, { top: [], bottom: [] });
    ports.get(n)[side].push(entry);
  };
  chains.forEach(c => {
    if (c.same) return;
    const ch = c.chain;
    c.pts = ch.map(() => null);
    port(ch[0], 'bottom', { c, k: 0, other: ch[1] });
    port(ch[ch.length - 1], 'top', { c, k: ch.length - 1, other: ch[ch.length - 2] });
  });
  ports.forEach((sides, n) => Object.entries(sides).forEach(([side, list]) => {
    list.sort((p, q) => p.other.x - q.other.x);
    // At the bottom, below the box's glass thickness, so an arrowhead there is not hidden under it.
    list.forEach((p, i) => (p.c.pts[p.k] = [n.x - NW / 2 + (NW * (i + 1)) / (list.length + 1), layers[n.layer].y + (side === 'bottom' ? NH + glassDepth(n) : 0)]));
  }));
  chains.forEach(c => {
    if (c.same) {
      // Same layer: straight between neighbours, otherwise an arc above the row.
      const dir = c.b.x > c.a.x ? 1 : -1, cy = layers[c.a.layer].y + NH / 2;
      // A box's right side ends beyond its glass thickness.
      const sx = c.a.x + (dir * NW) / 2 + (dir > 0 ? glassDepth(c.a) : 0), tx = c.b.x - (dir * NW) / 2 + (dir < 0 ? glassDepth(c.b) : 0);
      if (Math.abs(c.a.i - c.b.i) === 1) c.d = `M${sx},${cy} L${tx - dir * TIP},${cy}`;
      else {
        // The arc ends straight, along the way it comes in, so the arrowhead sits in line with it.
        const k = 1 / Math.hypot(50, 60), lx = dir * 50 * k, ly = 60 * k;
        c.d = `M${sx},${cy - 10} C${sx + dir * 50},${cy - 70} ${tx - (dir * 50 + lx * LEAD)},${cy - 70 - ly * LEAD} ${tx - lx * LEAD},${cy - 10 - ly * LEAD} L${tx - lx * TIP},${cy - 10 - ly * TIP}`;
      }
      return;
    }
    // Top to bottom: straight down through each column of slots, a curve in between.
    let pts = [c.pts[0]];
    c.chain.slice(1, -1).forEach((d, i, ds) => {
      if (ds[i - 1]?.x !== d.x) pts.push([d.x, layers[d.layer].y]);
      if (ds[i + 1]?.x !== d.x) pts.push([d.x, layers[d.layer].y + NH]);
    });
    pts.push(c.pts[c.pts.length - 1]);
    c.line = pts;
    if (c.reversed) pts = [...pts].reverse();
    // The last stretch into the arrowhead is straight, so the head sits in line with the line however steep its curve.
    const [ex, ey] = pts[pts.length - 1], py = pts[pts.length - 2][1];
    const back = Math.sign(py - ey), lead = Math.min(LEAD, Math.abs(py - ey) / 2);
    pts = [...pts.slice(0, -1), [ex, ey + back * lead], [ex, ey + back * (lead > TIP ? TIP : lead / 2)]];
    c.d = `M${pts[0][0]},${pts[0][1]}` + pts.slice(1).map((q, i) => {
      const p = pts[i];
      if (p[0] === q[0]) return ` L${q[0]},${q[1]}`;
      const my = (p[1] + q[1]) / 2;
      return ` C${p[0]},${my} ${q[0]},${my} ${q[0]},${q[1]}`;
    }).join('');
  });

  return { node, layers, bands, chains, W, H };
}

// Box text is cut to fit its box, ending in "…": measured on a canvas in the fonts the map's CSS sets,
// with 4 % to spare, as SVG text can come out a little wider than the canvas measures it.
export let fitCtx;
export function fitText(text, font, max) {
  fitCtx ||= document.createElement('canvas').getContext('2d');
  fitCtx.font = font;
  const fits = s => fitCtx.measureText(s).width * 1.04 <= max;
  if (fits(text)) return text;
  let s = text;
  while (s && !fits(s + '…')) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}
// The map can be drawn before the web font is in; it is drawn again then, to fit the font's widths.
document.fonts?.addEventListener('loadingdone', () => { if (ui.view === 'map' && ctxMenu.hidden && !modal.open) render(); });

// A rounded rectangle from x0, y0 to x1, y1 as a path.
export const roundedRect = (x0, y0, x1, y1, r) =>
  `M${x0 + r},${y0} H${x1 - r} A${r},${r} 0 0 1 ${x1},${y0 + r} V${y1 - r} A${r},${r} 0 0 1 ${x1 - r},${y1} H${x0 + r} A${r},${r} 0 0 1 ${x0},${y1 - r} V${y0 + r} A${r},${r} 0 0 1 ${x0 + r},${y0} Z`;

/* ---------- Visions on the map ----------
   Links to visions are not stored relationships: a goal keeps the visions it serves, a vision its
   parents. On the map they are drawn as lines with ids of their own, vl~<from>~<to>. */

// Why two boxes can't be linked through a vision (an i18n key), or null. Two visions: the first serves the second.
export function visionLinkError(a, b) {
  const A = findEntity(a), B = findEntity(b);
  if (!A || !B) return 'err.unknown';
  if (A.kind === 'vision' && B.kind === 'vision') return canParent(a, b);
  const goal = A.kind === 'goal' ? A.item : B.kind === 'goal' ? B.item : null;
  if (!goal) return 'err.visionGoalOnly';
  return ownVisions(goal).includes(A.kind === 'vision' ? a : b) ? 'err.relExists' : null;
}

export function linkVision(a, b) {
  const err = visionLinkError(a, b);
  if (err) return toast(t(err));
  const A = findEntity(a).item, B = findEntity(b).item;
  if (findVision(a) && findVision(b)) { A.parents.push(b); saveVisions(); }
  else { const [goal, vis] = findVision(b) ? [A, B] : [B, A]; setGoalVisions(goal, [...ownVisions(goal), vis.id]); save(); }
  render();
  const [x, y] = findVision(a) && !findVision(b) ? [B, A] : [A, B];
  toast(t('map.visionLinked', { a: x.title, b: y.title }));
}

export function unlinkVision(r) {
  if (r.type === 'subvision') {
    const v = findVision(r.from);
    v.parents = v.parents.filter(p => p !== r.to);
    saveVisions();
  } else {
    const g = db.goals.find(x => x.id === r.from);
    setGoalVisions(g, ownVisions(g).filter(x => x !== r.to));
    save();
  }
  if (ui.mapRel === r.id) ui.mapRel = null;
  render();
  toast(t('map.visionUnlinked'));
}

export const hideVisionsToggle = () => `<button class="chip" data-hide-visions aria-pressed="${ui.hideVisions}">${t('map.hideVisions')}</button>`;

// A vision is not glass but a cloud: the box's shape in silver with soft, blurred edges (gold for the Purpose,
// brighter once some goal serves it). Its line under the title counts the goals serving it, directly or through
// narrower visions, in all plans.
export function visionNode(n, v, { font, textW, face, sel, dim, purpose, reached, y }) {
  const { NW, NH } = MAP, count = goalsReaching(v.id);
  const goals = count ? tp('vis.goals', count) : t('vis.noGoalsShort');
  const sub = purpose ? `${t('vis.purpose')} · ${goals}` : goals;
  const title = fitText(v.title, `500 13px ${font}`, textW), subFit = fitText(sub, `400 11.5px ${font}`, textW);
  return `<g class="node vision${reached ? ' reached' : ''}${purpose ? ' purpose' : ''}${ui.mapLinkFrom === v.id ? ' link-source' : ''}${v.id === sel ? ' sel' : ''}${dim ? ' dim' : ''}" data-map-node="${v.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc(v.title)}" transform="translate(${n.x - NW / 2},${y})">
      <path class="node-lift" d="${face}"></path>
      <rect class="cloud-haze" width="${NW}" height="${NH}" rx="${GLASS.R}" filter="url(#vision-haze)"></rect>
      <rect class="cloud" width="${NW}" height="${NH}" rx="${GLASS.R}" filter="url(#vision-cloud)"></rect>
      <rect class="cloud-sheen" width="${NW}" height="${NH}" rx="${GLASS.R}" filter="url(#vision-cloud)"></rect>
      <text x="12" y="23">${esc(title)}</text>
      <text class="sub" x="12" y="41">${esc(subFit)}</text>
      <title>${esc(v.title)}${v.description ? '\n' + esc(v.description) : ''}\n${esc(sub)}</title>
    </g>`;
}

// The cloud's soft edge and haze, and the faint wide glow round whatever works toward a vision
// (wider and fainter than the glow round a selected box).
export const visionDefs = (W, H) => `<linearGradient id="vision-sheen" x1="0" y1="0" x2=".35" y2="1"><stop class="vision-sheen-top" offset="0"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>`
  + `<filter id="vision-cloud" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>`
  + `<filter id="vision-haze" x="-40%" y="-110%" width="180%" height="320%"><feGaussianBlur stdDeviation="9"/></filter>`
  + `<filter id="vision-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="12" result="b"/><feComposite in="b" in2="SourceGraphic" operator="out"/></filter>`
  + `<filter id="vision-line-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="8"/></filter>`;

// Items working toward a vision glow in every view. With a Purpose everything turns gold, the logo
// at the top left too, and the first time it is found the user is congratulated (once, on any device).
export function markVisions() {
  const ps = purposeState(), contrib = contributingIds();
  document.documentElement.classList.toggle('purpose', ps.on);
  viewEl.querySelectorAll('.glass[data-ctx-item], .tl-row[data-tl-node]').forEach(el => el.classList.toggle('vglow', contrib.has(el.dataset.ctxItem || el.dataset.tlNode)));
  if (!ps.on || visions.purposeFound || (typeof tour !== 'undefined' && tour.step >= 0)) return;
  visions.purposeFound = today();
  saveVisions();
  $('#purposeText').textContent = t('purpose.text', { name: ps.root.title });
  if (!$('#purposeDlg').open) $('#purposeDlg').showModal();
}

export function renderMap() {
  if (!itemCount() && !visions.list.length) return emptyState(t('map.emptyTitle'), t('map.emptyText'), 'goal');

  const scope = scopeFor(ui.mapGoal);
  const keep = kind => item => (!scope || scope[kind].has(item.id)) && !(ui.hideDone && (kind === 'goal' ? isComplete('goal', item) : kind === 'activity' && item.status === 'done'));
  const items = {
    goal: db.goals.filter(keep('goal')),
    activity: db.activities.filter(keep('activity')),
    state: db.states.filter(keep('state')),
  };
  // With a goal or category picked, or unrelated visions hidden, only the visions the goals shown serve, and those above them.
  let near = null;
  if (scope || ui.hideVisions) {
    near = new Set();
    items.goal.forEach(g => ownVisions(g).forEach(id => [id, ...visionAncestors(id)].forEach(x => near.add(x))));
  }
  items.vision = visions.list.filter(v => !near || near.has(v.id));
  const visible = new Set([...items.vision, ...items.goal, ...items.activity, ...items.state].map(x => x.id));
  const rels = db.relations.filter(r => REL_TYPES[r.type] && !ui.mapHidden.has(r.type) && visible.has(r.from) && visible.has(r.to));
  if (!ui.mapHidden.has('serves')) items.goal.forEach(g => ownVisions(g).forEach(id => visible.has(id) && rels.push({ id: visionRelId(g.id, id), from: g.id, to: id, type: 'serves' })));
  if (!ui.mapHidden.has('subvision')) items.vision.forEach(v => visionParents(v).forEach(p => visible.has(p) && rels.push({ id: visionRelId(v.id, p), from: v.id, to: p, type: 'subvision' })));
  // What works toward a vision glows, and so do the lines between such items.
  const contrib = contributingIds(), ps = purposeState(), reached = reachedVisions();
  const glows = r => (contrib.has(r.from) || visible.has(r.from) && findVision(r.from)) && (contrib.has(r.to) || !!findVision(r.to)) && r.type !== 'depends';
  const { NW, NH, PAD } = MAP;
  const { node, layers, bands, chains, W, H } = layoutMap(items, rels);

  // Either an item or a relationship line can be selected.
  const relSel = rels.find(r => r.id === ui.mapRel) || null;
  const sel = !relSel && ui.mapSelected && visible.has(ui.mapSelected) ? ui.mapSelected : null;
  const nearSel = relSel ? new Set([relSel.from, relSel.to]) : neighbourhood(sel, rels);

  // Each line sits in a group with a wide invisible twin, so it is easy to hit; a click selects it,
  // a second click (or Enter) edits the relationship and Delete removes it.
  const edges = chains.map(c => {
    const def = REL_TYPES[c.r.type] || VISION_RELS[c.r.type];
    const dim = (sel && !(c.r.from === sel || c.r.to === sel)) || (relSel && c.r.id !== relSel.id) ? 'dim' : '';
    const label = relText(c.r);
    return `<g class="edge-g ${dim} ${c.r.id === relSel?.id ? 'sel' : ''}${glows(c.r) ? ' vglow' : ''}" data-rel-edit="${c.r.id}" tabindex="0" role="button" aria-pressed="${c.r.id === relSel?.id}" aria-label="${esc(t('map.relLabel', { rel: label }))}">
      <path class="edge" d="${c.d}" style="stroke:${mapLineColour(def.color)};stroke-width:${def.width || 1.1}" ${def.dash ? 'stroke-dasharray="4 3"' : ''} marker-end="url(#arrow-${c.r.type})"></path>
      <path class="edge-hit" d="${c.d}"></path><title>${esc(label)}</title></g>`;
  }).join('');

  // A glow round the box when selected, focused or being linked, and the face's light over its fill, all one
  // rounded path (paths, so the box's rect rules don't reach them). Under the face, its glass slab.
  const { R } = GLASS, face = roundedRect(0, 0, NW, NH, R), slabs = new Set();
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font'), textW = NW - 18;
  const nodes = Object.values(node).map(n => {
    const { item } = findEntity(n.id);
    if (n.kind === 'vision') return visionNode(n, item, { font, textW, face, sel, dim: (sel || relSel) && !nearSel.has(n.id), purpose: ps.root?.id === n.id, reached: reached.has(n.id), y: layers[n.layer].y });
    let st = '', sub, full, bar = '', pct = '';
    if (n.kind === 'goal') {
      st = goalState(item);
      sub = st === 'blocked' ? t('acts.waitsFor', { n: blockers(item, 'goal').length }) : item.deadline ? fmtRel(item.deadline, true) : t('map.noDeadline');
      // Progress shows as a green bar along the bottom of the box; the number stays in the tooltip.
      const p = goalProgress(item);
      pct = ` – ${Math.round(p)} %`;
      const y = NH - 8, end = 14 + (NW - 28) * Math.min(p, 100) / 100;
      bar = `<line class="node-track" x1="14" x2="${NW - 14}" y1="${y}" y2="${y}"></line>${p > 0 ? `<line class="node-progress" x1="14" x2="${end.toFixed(1)}" y1="${y}" y2="${y}"></line>` : ''}`;
    } else if (isRoutine(item)) {
      st = activityState(item);
      const streak = routineStreak(item), p = periodProgress(item);
      // Short on the box, in full in its tooltip.
      full = periodText(item, p) + (streak.n ? ', ' + streakText(streak) : '');
      sub = (p.target ? t('map.rt.' + periodUnit(item), { done: p.done, target: p.target }) : periodText(item, p)) + (streak.n ? ', ' + t('map.rt.streak', { n: streak.n }) : '');
    } else if (n.kind === 'activity') {
      st = activityState(item);
      sub = (st === 'blocked' ? t('acts.waitsFor', { n: blockers(item).length }) : t('activity.' + item.status)) + (item.dueDate ? ', ' + fmtRel(item.dueDate) : '');
    } else {
      sub = isNum(item.value) ? `${fmtNum(item.value)} ${item.unit || ''}, ${fmtRel(item.date)}` : fmtRel(item.date, true);
    }
    // Sizes and weights as in the CSS for .node text and .node .sub.
    const title = fitText(item.title, `${n.kind === 'goal' ? 500 : 400} 13px ${font}`, textW);
    const subFit = fitText(sub, `400 11.5px ${font}`, textW);
    const dim = (sel || relSel) && !nearSel.has(n.id) ? 'dim' : '';
    const linking = ui.mapLinkFrom === n.id ? ' link-source' : '';
    const slab = `${glassTint(n.kind, st)}|${glassThickness(n)}`;
    slabs.add(slab);
    return `<g class="node ${n.kind}${st ? ' st-' + st : ''}${linking}${n.id === sel ? ' sel' : ''}${contrib.has(n.id) ? ' vglow' : ''} ${dim}" data-map-node="${n.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc(item.title)}" transform="translate(${n.x - NW / 2},${layers[n.layer].y})">
      <path class="node-lift" d="${face}"></path>
      <use href="#glass-${glassKey(slab)}"></use>
      <rect width="${NW}" height="${NH}" rx="${R}"></rect>
      <path class="glass-shade" d="${face}"></path><path class="glass-spec" d="${face}"></path>
      <text x="12" y="23">${esc(title)}</text>
      <text class="sub" x="12" y="${bar ? 38 : 41}">${esc(subFit)}</text>${bar}
      <title>${esc(item.title)}${pct}${st ? ' – ' + esc(t('nodeState.' + st)) : ''}\n${esc(full || sub)}</title>
    </g>`;
  }).join('');

  // Band labels go over the lines, so a line passing by never cuts through one.
  const bandSvg = bands.map(b => `<rect class="band ${b.kind}" x="6" y="${b.top}" width="${W - 12}" height="${b.bottom - b.top}" rx="14"></rect>`).join('');
  // The glow round what works toward a vision lies under every line and box, so it never dims a neighbour's text;
  // lines glow as softly and widely as boxes.
  const lineGlows = chains.filter(c => glows(c.r)).map(c => `<path class="edge-vglow" data-line-glow="${c.r.id}" d="${c.d}"></path>`).join('');
  const halos = Object.values(node).filter(n => contrib.has(n.id)).map(n => `<path class="node-vglow" data-halo="${n.id}" d="${face}" transform="translate(${n.x - NW / 2},${layers[n.layer].y})"></path>`).join('');
  const bandLabels = bands.map(b => {
    const levels = b.last - b.first + 1;
    return `<text class="col-label ${b.kind}" x="${PAD}" y="${b.top + 22}">${esc(t('kinds.' + b.kind))}${levels > 1 ? ` (${esc(tp('map.levels', levels))})` : ''}</text>`;
  }).join('');

  const markers = Object.entries({ ...REL_TYPES, ...VISION_RELS }).map(([k, d]) => arrowMarker(`arrow-${k}`, d.color)).join('');

  const toggles = Object.entries(REL_TYPES).map(([k, d]) => {
    const count = db.relations.filter(r => r.type === k).length;
    return `<button class="chip rel-toggle" data-rel-toggle="${k}" aria-pressed="${!ui.mapHidden.has(k)}" title="${esc(relSignature(k))}"><i class="${d.dash ? 'dash' : ''}" style="border-color:${mapLineColour(d.color)}"></i>${esc(relLabel(k))}<span class="count">${count}</span></button>`;
  }).join('') + (visions.list.length ? Object.entries(VISION_RELS).map(([k, d]) => {
    const count = k === 'serves' ? db.goals.reduce((n, g) => n + ownVisions(g).length, 0) : visions.list.reduce((n, v) => n + visionParents(v).length, 0);
    return `<button class="chip rel-toggle" data-rel-toggle="${k}" aria-pressed="${!ui.mapHidden.has(k)}" title="${esc(`${kindList(d.from)} → ${kindList(d.to)}`)}"><i style="border-color:${mapLineColour(d.color)}"></i>${esc(relLabel(k))}<span class="count">${count}</span></button>`;
  }).join('') : '');
  const goalNodes = items.goal.length ? items.goal : Object.values(items).flat();
  const focusX = Math.round(goalNodes.reduce((s, x) => s + node[x.id].x, 0) / goalNodes.length * ui.mapScale);
  let relNote = '';
  if (!rels.length) relNote = db.relations.length ? `<div class="empty">${t('map.noneShown')}</div>` : emptyState(t('map.relEmptyTitle'), t('map.relEmptyText'), 'relation');
  const zoomBtn = (dir, label) => `<button type="button" class="icon-btn" data-map-zoom="${dir}" aria-label="${esc(t('map.zoom.' + dir))}" title="${esc(t('map.zoom.' + dir))}">${label}</button>`;

  return `
    ${categoryChips()}
    <div class="toolbar">${goalSelect('map', ui.mapGoal)}${hideDoneToggle()}${visions.list.length ? hideVisionsToggle() : ''}</div>
    <div class="map-controls">
      <div class="chips" role="group" aria-label="${esc(t('map.toggles'))}"><span class="ctl-label">${t('map.show')}</span>${toggles}</div>
      <div class="map-legend"><span class="ctl-label">${t('map.status')}</span>${statusLegend()}
        <div class="zoom-ctl" role="group" aria-label="${esc(t('map.zoom'))}">${zoomBtn('out', '−')}${zoomBtn('reset', `<span class="zoom-pct">${Math.round(ui.mapScale * 100)} %</span>`)}${zoomBtn('in', '+')}</div>
      </div>
    </div>
    <div class="map-wrap" data-focus-x="${focusX}"><svg viewBox="0 0 ${W} ${H}" width="${W * ui.mapScale}" height="${H * ui.mapScale}" role="img" aria-label="${esc(t('map.aria'))}">
      <defs>${markers}${glassDefs(slabs)}${glowDefs(W, H)}${visions.list.length ? visionDefs(W, H) : ''}</defs>${bandSvg}${lineGlows ? `<g class="vglow-lines">${lineGlows}</g>` : ''}${halos ? `<g class="vglow-halos">${halos}</g>` : ''}${edges}${bandLabels}${nodes}
    </svg></div>
    ${ui.mapLinkFrom && visible.has(ui.mapLinkFrom) ? mapLinkBar(ui.mapLinkFrom) : ''}
    ${relSel ? mapRelSelection(relSel) : sel ? mapSelection(sel) : `<p class="meta" style="margin-top:10px">${t('map.hint')}</p>`}
    ${relNote}
  `;
}

// Shown while linking by tapping: the next box tapped becomes the other end.
export function mapLinkBar(id) {
  return `<div class="link-bar" role="status"><span class="grow">${esc(t('map.linkPick', { name: findEntity(id).item.title }))}</span>
    <button type="button" class="btn small ghost" data-map-link-cancel>${t('btn.cancel')}</button></div>`;
}

export function mapSelection(id) {
  const { kind, item } = findEntity(id);
  return `<div class="row" style="margin-top:12px;cursor:default">
    <span class="tag ${kind}">${t('kind.' + kind)}</span>
    <span class="grow"><strong>${esc(item.title)}</strong></span>
    <button class="btn small" data-open="${id}">${t('btn.edit')}</button>
    <button class="btn small ghost" data-map-clear>${t('btn.deselect')}</button>
  </div>`;
}

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

export const relText = r => `${findEntity(r.from).item.title} ${relLabel(r.type)} ${findEntity(r.to).item.title}`;

// The selected line, with buttons for touch screens (no Delete key there).
export function mapRelSelection(r) {
  return `<div class="row map-rel-selection" style="margin-top:12px;cursor:default">
    <span class="tag">${t('kind.relation')}</span>
    <span class="grow"><strong>${esc(relText(r))}</strong></span>
    <button class="btn small" data-rel-open="${r.id}">${t('btn.edit')}</button>
    <button class="btn small danger" data-rel-remove="${r.id}">${t('btn.remove')}</button>
    <button class="btn small ghost" data-map-clear>${t('btn.deselect')}</button>
  </div>`;
}

export function removeRelation(id) {
  const vr = visionRel(id);
  if (vr) return unlinkVision(vr);
  db.relations = db.relations.filter(r => r.id !== id);
  if (ui.mapRel === id) ui.mapRel = null;
  save();
  render();
  toast(t('toast.relRemoved'));
}

// Deleting an item from the map asks first, like the form's Delete button.
export function askDeleteItem(id) {
  const ent = findEntity(id);
  if (!ent || !confirm(t('confirm.delete', { name: ent.item.title }))) return;
  removeEntity(ent.kind, id);
  save();
  render();
  toast(t('toast.deleted.' + ent.kind));
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
   Forms
   ========================================================= */

export const modal = $('#modal');
export let formCtx = null; // { kind, id }

export function field(name, label, input, hint = '') {
  return `<div class="field" data-field="${name}"><label for="f-${name}">${label}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ''}<div class="err"></div></div>`;
}
export const text = (name, v, ph = '') => `<input type="text" id="f-${name}" name="${name}" value="${esc(v)}" placeholder="${esc(ph)}">`;
// A text field rather than type="number", so both a decimal dot and comma work in every browser.
export const num = (name, v, ph = '') => `<input type="text" data-num id="f-${name}" name="${name}" value="${esc(numInput(v))}" placeholder="${esc(ph)}" inputmode="decimal" autocomplete="off">`;
// A dd/mm/yyyy text field in every language, with the app's own calendar (weeks start on Monday);
// the browser's date field and picker follow the browser's language instead.
export const date = (name, v) => `<div class="date-field">
  <input type="text" data-date id="f-${name}" name="${name}" value="${esc(dateInput(v))}" placeholder="${esc(t('f.datePh'))}" inputmode="numeric" autocomplete="off" maxlength="10">
  <button type="button" class="date-pick" data-cal-open title="${esc(t('f.pickDate'))}" aria-label="${esc(t('f.pickDate'))}" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg></button>
</div>`;
export const area = (name, v, ph = '') => `<textarea id="f-${name}" name="${name}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
export const select = (name, opts, v) => `<select id="f-${name}" name="${name}">${Object.entries(opts).map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

// A link list: the chosen items are shown as removable tags; the search box below them opens
// a list of the other items (goals grouped by category) that typing filters and a click adds.
export function checklist(name, label, kind, items, selected, hint = '') {
  if (!items.length) return '';
  if (kind === 'goal') items = [...items].sort(byDeadline);
  const opt = i => `<button type="button" class="pick-opt" role="option" data-pick="${i.id}" data-pick-title="${esc(fold(i.title))}" ${selected.includes(i.id) ? 'data-picked' : ''}>${esc(i.title)}</button>`;
  const options = kind === 'goal' && items.some(i => i.category)
    ? [...categories(), ''].map(c => [c, items.filter(i => (i.category || '') === c)]).filter(([, list]) => list.length)
      .map(([c, list]) => `<div class="pick-group" role="group" aria-label="${esc(c || t('cat.none'))}"><div class="pick-head" aria-hidden="true">${esc(c || t('cat.none'))}</div>${list.map(opt).join('')}</div>`).join('')
    : items.map(opt).join('');
  const chips = items.filter(i => selected.includes(i.id)).map(i => pickedTag(name, kind, i)).join('');
  return `<div class="field picker" data-picker="${kind}" data-name="${name}"><span class="label">${label}</span>
    <div class="picked">${chips}<span class="hint pick-none">${t('pick.none')}</span></div>
    <input type="search" class="picker-search" placeholder="${esc(t('pick.add'))}" aria-label="${esc(t('pick.search', { name: label }))}" autocomplete="off" role="combobox" aria-expanded="false" aria-haspopup="listbox">
    <div class="pick-list" role="listbox" aria-label="${esc(label)}" hidden>${options}<div class="pick-empty"></div></div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

// A chosen item: its hidden input carries the link when the form is saved.
export const pickedTag = (name, kind, item) =>
  `<span class="tag ${kind}" data-picked-id="${item.id}"><input type="hidden" name="${name}" value="${item.id}">${esc(item.title)}<button type="button" data-unpick="${item.id}" title="${esc(t('pick.remove', { name: item.title }))}" aria-label="${esc(t('pick.remove', { name: item.title }))}">×</button></span>`;

// Lower case without accents, so "zivljenje" finds "Življenje".
export const fold = s => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Shows the items that match the search and are not chosen yet, and empty groups not at all.
export function filterPicker(picker) {
  const q = fold(picker.querySelector('.picker-search').value.trim());
  const opts = [...picker.querySelectorAll('.pick-opt')];
  opts.forEach(o => (o.hidden = o.hasAttribute('data-picked') || (!!q && !o.dataset.pickTitle.includes(q))));
  picker.querySelectorAll('.pick-group').forEach(g => (g.hidden = !g.querySelector('.pick-opt:not([hidden])')));
  const empty = picker.querySelector('.pick-empty');
  empty.hidden = opts.some(o => !o.hidden);
  empty.textContent = opts.every(o => o.hasAttribute('data-picked')) ? t('pick.allChosen') : t('pick.noMatch');
}

export function showPickList(picker, open) {
  const list = picker.querySelector('.pick-list');
  if (open) filterPicker(picker);
  list.hidden = !open;
  picker.querySelector('.picker-search').setAttribute('aria-expanded', open);
}

export function pickItem(opt) {
  const picker = opt.closest('[data-picker]');
  const { item } = findEntity(opt.dataset.pick);
  opt.setAttribute('data-picked', '');
  picker.querySelector('.pick-none').insertAdjacentHTML('beforebegin', pickedTag(picker.dataset.name, picker.dataset.picker, item));
  filterPicker(picker);
}

export function unpickItem(picker, id) {
  picker.querySelector(`[data-picked-id="${id}"]`).remove();
  picker.querySelector(`.pick-opt[data-pick="${id}"]`).removeAttribute('data-picked');
  filterPicker(picker);
}

export function smartSection(letter, body) {
  return `<fieldset class="smart-block" data-smart="${letter}"><legend><span class="letter">${letter}</span>${t('smart.' + letter)}</legend>${body}</fieldset>`;
}

// `links` pre-fills a new item's relations by type, e.g. { subactivity: [parentId] };
// for a new relationship, { from: id } pre-selects its source.
// A new activity first asks whether it is done once or repeats; `links.repeat` carries the answer.
export function openForm(kind, id = null, links = {}) {
  // A line to a vision opens the vision that holds the link: the one served by a goal, or the narrower of two.
  const vr = kind === 'relation' && visionRel(id);
  if (vr) return openForm('vision', vr.type === 'serves' ? vr.to : vr.from);
  formCtx = { kind, id };
  cal = null;
  let item = null;
  if (id) item = kind === 'relation' ? db.relations.find(r => r.id === id) : findEntity(id)?.item;
  $('#deleteBtn').hidden = !item;
  $('#saveBtn').hidden = false;
  $('#modalTitle').textContent = t((item ? 'edit.' : 'new.') + kind);
  if (kind === 'activity' && !item && !links.repeat) {
    formCtx.choose = links;
    $('#saveBtn').hidden = true;
    $('#modalBody').innerHTML = activityChoice();
    if (!modal.open) modal.showModal();
    setTimeout(() => modal.querySelector('[data-act-kind]')?.focus(), 30);
    return;
  }
  $('#modalBody').innerHTML = { goal: goalForm, state: stateForm, activity: activityForm, relation: relationForm, vision: visionForm }[kind](item || { links });
  if (kind === 'relation') {
    const r = item || links;
    if (r.from) $('#f-from').value = r.from;
    if (r.to) $('#f-to').value = r.to;
    fillRelTypes(r.type);
  }
  if (kind === 'goal') { updateProgressFields(); updateSmartLive(); }
  if (kind === 'activity') updateRepeatFields();
  if (kind === 'state') updateStateFields();
  if (!modal.open) modal.showModal();
  if (!item) setTimeout(() => modal.querySelector('input, select, textarea')?.focus(), 30);
}

// Targets an item links to by relation type – stored relations, or the presets of a new item.
export const linksOf = (item, type) => (item.id ? relsFrom(item.id, type).map(r => r.to) : item.links?.[type] || []);
// Sources that link to an item by relation type, e.g. the activities contributing to a goal.
export const linkedFrom = (item, type) => (item.id ? relsTo(item.id, type).map(r => r.from) : []);

export function goalForm(g) {
  const parent = linksOf(g, 'subgoal')[0] || '';
  const parents = { '': t('f.none') };
  db.goals.filter(x => x.id !== g.id && !(g.id && reaches(x.id, g.id, 'subgoal'))).forEach(x => (parents[x.id] = x.title));
  const st = g.id ? measuringState(g) : null;
  // A state that adds up but has no amounts yet does not measure anything, but the goal can already
  // pick how it will count it.
  const cu = isCumulative(st) ? st : !st && g.id ? relsTo(g.id, 'measures').map(r => db.states.find(s => s.id === r.from)).find(isCumulative) : null;
  return `
    <div class="smart-summary"><span id="smartLive"></span><span id="smartLiveText"></span></div>
    ${smartSection('S', `
      ${field('title', t('f.goal'), text('title', g.title, t('f.goalPh')))}
      ${field('specific', t('f.specific'), area('specific', g.specific, t('f.specificPh')))}`)}
    ${smartSection('M', `
      ${field('progress', t('f.progress'), select('progress', { measure: t('f.progressMeasure'), activities: t('f.progressActs'), routines: t('f.progressRoutines') }, g.progress || 'measure'))}
      <p class="hint" id="actsHint">${t('f.progressActsHint')}</p>
      <p class="hint" id="routinesHint">${t('f.progressRoutinesHint')}</p>
      <div id="measureFields">
      <div class="row2">
        ${field('metric', t('f.metric'), text('metric', g.metric, t('f.metricPh')))}
        ${field('unit', t('f.unit'), text('unit', g.unit, t('f.unitPh')))}
      </div>
      ${cu ? field('period', t('cu.counts'), select('period', Object.fromEntries(['total', ...PERIODS].map(k => [k, t('cu.count.' + k)])), goalPeriod(g)), esc(t('cu.countsHint', { name: cu.title }))) : ''}
      <div class="row3">
        ${field('baseline', t('f.baseline'), num('baseline', g.baseline ?? '', '0'),
          // A running total counts everything before the goal too; starting from it counts only what comes next.
          isCumulative(st) && goalPeriod(g) === 'total' ? esc(t('cu.baselineHint', { total: withUnit(fmtNum(stateTotal(st)), st.unit || '') })) : '')}
        ${field('current', t('f.current'), num('current', g.current ?? '', ''), st ? esc(t('f.currentFrom', { name: st.title })) : t('f.currentHint'))}
        ${field('target', t('f.target'), num('target', g.target ?? ''))}
      </div>
      </div>`)}
    ${smartSection('A', field('achievable', t('f.achievable'), area('achievable', g.achievable, t('f.achievablePh'))))}
    ${smartSection('R', field('relevant', t('f.relevant'), area('relevant', g.relevant, t('f.relevantPh'))))}
    ${smartSection('T', `<div class="row2">
        ${field('startDate', t('f.startDate'), date('startDate', g.startDate || today()))}
        ${field('deadline', t('f.deadline'), date('deadline', g.deadline))}
      </div>`)}
    <div class="row3">
      ${field('category', t('f.category'), `<input type="text" id="f-category" name="category" list="categoryList" value="${esc(g.category ?? g.links?.category ?? '')}" placeholder="${esc(t('f.categoryPh'))}">
        <datalist id="categoryList">${categorySuggestions().map(c => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      ${field('status', t('f.status'), select('status', statusLabels(GOAL_STATUS, 'goal.'), g.status || 'active'))}
      ${field('parent', t('f.parent'), select('parent', parents, parent))}
    </div>
    ${checklist('visions', t('f.goalVisions'), 'vision', visions.list, g.id ? ownVisions(g) : g.links?.visions || [])}
    ${checklist('activities', t('f.goalActivities'), 'activity', db.activities, linkedFrom(g, 'contributes'))}
    ${checklist('depends', t('f.goalDepends'), 'goal', db.goals.filter(x => x.id !== g.id), linksOf(g, 'depends'))}`;
}

export function stateForm(s) {
  const linked = s.id ? relsFrom(s.id, 'measures').map(r => r.to) : [];
  const history = (s.history || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  // The value field records a new measurement, so it starts empty and dated today.
  const latest = isNum(s.value) && !isCumulative(s) ? t('f.valueHint', { value: withUnit(fmtNum(s.value), s.unit || ''), date: fmtRel(s.date) || '—' }) : '';
  const addsUp = { '': t('cu.opt.no'), yes: t('cu.opt.yes') };
  return `
    ${field('title', t('f.title'), text('title', s.title, t('f.statePh')))}
    ${field('description', t('f.stateDesc'), area('description', s.description, t('f.stateDescPh')))}
    <div class="row2">
      ${field('addsUp', t('cu.addsUp'), select('addsUp', addsUp, isCumulative(s) ? 'yes' : ''), `<span id="addsUpHint"></span>`)}
      ${field('unit', t('f.unit'), text('unit', s.unit, t('f.unitPh')))}
    </div>
    <div class="row2">
      ${field('value', t('f.value'), num('value', '', t('f.optional')), `<span id="valueHint" data-plain="${esc(latest)}"></span>`)}
      ${field('date', t('f.asOf'), date('date', today()))}
    </div>
    ${checklist('goals', t('f.describesGoals'), 'goal', db.goals, linked, t('f.describesHint'))}
    ${history.length > 1 ? `<div class="field" id="historyList"><span class="label">${t('f.history')}</span><div class="history">${history.map(h => `<div><span>${fmtRel(h.date, true)}</span><strong>${fmtNum(h.value)} ${esc(s.unit || '')}</strong></div>`).join('')}</div></div>` : ''}
    ${isCumulative(s) && entriesOf(s).length ? entryList(s) : ''}`;
}

// A cumulative state's entries, newest day first; × marks one to delete when the form is saved.
export function entryList(s) {
  const days = {};
  entriesOf(s).forEach(e => (days[e.date] ||= []).push(e));
  const rows = Object.keys(days).sort().reverse().map(d => `<div class="entry-day"><span>${fmtRel(d, true)}</span><span class="entry-amounts">${days[d].map(e => {
    const del = esc(t('cu.deleteEntry', { value: withUnit(fmtNum(e.amount), s.unit || ''), date: fmtDate(d) }));
    return `<span class="entry" data-entry="${e.id}"><strong>${esc(withUnit(fmtNum(e.amount), s.unit || ''))}</strong><button type="button" class="entry-del" data-drop-entry="${e.id}" aria-pressed="false" title="${del}" aria-label="${del}">×</button></span>`;
  }).join('')}</span></div>`).join('');
  return `<div class="field" id="entryList"><span class="label">${t('cu.entryList')}</span><div class="history entries">${rows}</div><div class="hint">${t('cu.entryListHint')}</div></div>`;
}

// The labels and hints that follow "Adds up": a new amount or a new measurement, and what switching
// between the two does to what is there.
export function updateStateFields() {
  const sel = $('#f-addsUp');
  if (!sel || formCtx?.kind !== 'state') return;
  const s = formCtx.id ? db.states.find(x => x.id === formCtx.id) : null;
  const addsUp = sel.value, was = isCumulative(s) ? 'yes' : '';
  const unit = $('#f-unit').value.trim();
  $('[data-field="value"] label').textContent = t(addsUp ? 'cu.addAmount' : 'f.value');
  const hint = $('#valueHint');
  hint.textContent = !addsUp ? hint.dataset.plain
    : s && isCumulative(s) && entriesOf(s).length ? t('cu.valueHint', { total: totalText({ ...s, unit }) }) : t('cu.valueHintNew');
  const has = s && (isCumulative(s) ? entriesOf(s).length : (s.history || []).length);
  $('#addsUpHint').textContent = !has || !addsUp === !was ? '' : t(addsUp ? 'cu.toCumulative' : 'cu.toPlain');
  $('#historyList')?.toggleAttribute('hidden', !!addsUp);
  $('#entryList')?.toggleAttribute('hidden', !addsUp);
}

export function activityForm(a) {
  const pick = type => linksOf(a, type);
  const others = db.activities.filter(x => x.id !== a.id);
  // An activity cannot be placed under itself or one of its own sub-activities.
  const below = a.id ? descendants(a.id, 'subactivity') : [];
  const parents = { '': t('f.none') };
  others.filter(x => !below.includes(x.id)).forEach(x => (parents[x.id] = x.title));
  const children = a.id ? relsTo(a.id, 'subactivity').map(r => r.from) : [];
  // A list's status follows its items; a list that repeats is a list routine.
  const list = a.id ? Array.isArray(a.list) && a.list : ['list', 'listRoutine'].includes(a.links?.repeat) && [];
  return `
    ${field('title', t('f.activity'), text('title', a.title, t(list ? 'f.listPh' : 'f.activityPh')))}
    ${field('description', t('f.details'), area('description', a.description, t('f.detailsPh')))}
    ${list ? listEditor(list) : ''}
    <div class="${list ? 'row2' : 'row3'}">
      ${list ? '' : field('status', t('f.status'), select('status', statusLabels(ACTIVITY_STATUS, 'activity.'), a.status || 'todo'))}
      ${field('startDate', t('f.startDate'), date('startDate', isRoutine(a) ? routineStart(a) : a.id ? a.startDate : a.startDate || today()))}
      ${field('dueDate', t('f.dueDate'), date('dueDate', a.dueDate))}
    </div>
    ${repeatFields(a)}
    ${field('parent', t('f.parentActivity'), select('parent', parents, pick('subactivity')[0] || ''), t('f.parentActivityHint'))}
    ${children.length ? `<div class="field"><span class="label">${t('f.subActivities')}</span><div class="links">${children.map(linkTag).join('')}</div></div>` : ''}
    ${checklist('goals', t('f.contributes'), 'goal', db.goals, pick('contributes'))}
    ${checklist('states', t('f.improves'), 'state', db.states, pick('improves'))}
    ${checklist('depends', t('f.depends'), 'activity', others.filter(x => !isRoutine(x)), pick('depends'))}`;
}

// A list's items in its form: tick, rename or remove each; Enter in one adds the next below it.
// `pos` is the item's place in the list, so an unticked row can go back to it.
export const listRow = (i = { id: '', text: '', done: false }, pos = '') => `<div class="li-row" data-li-row="${i.id}" data-pos="${pos}">
  <input type="checkbox" class="li-check" ${i.done ? 'checked' : ''} aria-label="${esc(t('list.tick'))}">
  <input type="text" class="li-input" enterkeyhint="enter" value="${esc(i.text)}" placeholder="${esc(t('list.itemPh'))}" aria-label="${esc(t('list.item'))}">
  <button type="button" class="icon-btn li-del" data-li-del aria-label="${esc(t('list.remove'))}" title="${esc(t('list.remove'))}">×</button></div>`;
export function listEditor(list) {
  return `<div class="field" data-field="list"><span class="label">${t('list.items')}</span>
    <div class="li-rows" id="listRows">${(list.length ? doneLast(list) : [undefined]).map(i => listRow(i, list.indexOf(i))).join('')}</div>
    <button type="button" class="btn ghost li-add" data-li-add><span aria-hidden="true">+</span> ${t('list.add')}</button>
    <div class="err"></div><div class="hint">${t('list.hint')}</div></div>`;
}
// New rows go above the ticked ones; `focus` puts the cursor in the new row.
export function addListRow(after = null, focus = true) {
  const rows = $('#listRows'), firstDone = [...rows.children].find(r => r.querySelector('.li-check').checked);
  if (after) after.insertAdjacentHTML('afterend', listRow());
  else if (firstDone) firstDone.insertAdjacentHTML('beforebegin', listRow());
  else rows.insertAdjacentHTML('beforeend', listRow());
  const row = after ? after.nextElementSibling : firstDone ? firstDone.previousElementSibling : rows.lastElementChild;
  if (focus) row.querySelector('.li-input').focus();
}
// Ticking an item in the form moves it below the ones still to do; unticking moves it back above them.
export function placeListRow(row) {
  const rows = $('#listRows'), done = row.querySelector('.li-check').checked;
  row.remove();
  const firstDone = [...rows.children].find(r => r.querySelector('.li-check').checked);
  // Back above the first row still to do that came after it in the list, or else above the ticked ones.
  const pos = Number(row.dataset.pos), later = !done && row.dataset.pos !== '' && [...rows.children].find(r => !r.querySelector('.li-check').checked && r.dataset.pos !== '' && Number(r.dataset.pos) > pos);
  if (later) later.before(row);
  else if (done || !firstDone) rows.append(row);
  else firstDone.before(row);
  row.querySelector('.li-check').focus();
}

// The first step of a new activity: one done once, a list to tick off, a routine, or a list ticked off each time.
// Each kind has an icon: a tick, ticked lines, arrows going round, or ticked lines going round.
export const ACT_KIND_ICONS = {
  once: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/>',
  list: '<path d="M3.5 6.5l1.5 1.5 2.5-3M3.5 12.5l1.5 1.5 2.5-3M3.5 18.5l1.5 1.5 2.5-3M11 6.5h9.5M11 12.5h9.5M11 18.5h9.5"/>',
  routine: '<path d="M19.5 9.5A8 8 0 0 0 5 7.5M4.5 14.5A8 8 0 0 0 19 16.5"/><path d="M5 3.5v4h4M19 20.5v-4h-4"/>',
  listRoutine: '<path d="M3 5.5l1.5 1.5 2.5-3M3 11.5l1.5 1.5 2.5-3M10 5.5h10M10 11.5h4M3 17.5h7"/><path d="M21.5 17.5a4 4 0 1 1-1.4-3.1"/><path d="M20.6 11.6v2.9h-2.9"/>',
};
export const activityChoice = () => `<div class="act-choice" role="group" aria-label="${esc(t('f.actKind'))}">${['once', 'list', 'routine', 'listRoutine'].map(k =>
  `<button type="button" class="act-choice-btn kind-${k}" data-act-kind="${k}"><svg class="act-choice-icon" viewBox="0 0 24 24" aria-hidden="true">${ACT_KIND_ICONS[k]}</svg><strong>${esc(t('f.actKind.' + k))}</strong><span>${esc(t('f.actKind.' + k + 'Hint'))}</span></button>`).join('')}</div>`;

// Whether and how an activity repeats; a repeating activity is a routine. The common kinds – a number
// of times a week or month, or specific weekdays – or a custom recurrence, and when it ends.
// Each common kind is a unit and what it falls on, as in the custom recurrence.
export const REPEAT_PRESETS = { week: { unit: 'week', on: 'times' }, month: { unit: 'month', on: 'times' }, days: { unit: 'week', on: 'days' } };

export function repeatPreset(r) {
  if (!r) return 'none';
  if (r.every !== 1) return 'custom';
  if (r.times) return r.unit;
  return r.unit === 'week' && r.days ? 'days' : 'custom';
}

// What a custom recurrence falls on, for its unit: weekdays, a day or weekday of the month, or any days a number of times.
export function repeatOnOptions(unit) {
  if (unit === 'week') return { days: t('f.onDays'), times: t('f.onTimes') };
  if (unit !== 'month') return {};
  return { day: t('f.onMonthDay'), lastDay: t('f.onLastDay'), nth: t('f.onNth'), times: t('f.onTimes') };
}
// The n-th choices for a monthly weekday; a fifth only for older routines that use one.
export const nthOptions = nth => Object.fromEntries([1, 2, 3, 4, ...(nth === 5 ? [5] : []), -1].map(n => [n, nthWord(n, 0)]));

export const formStart = () => parseDateInput($('#f-startDate')?.value || '') || today();

export function repeatFields(a) {
  const r = isRoutine(a) ? sched(a) : null;
  const start = a.startDate || today();
  // A new routine starts as a number of times a week.
  const mode = ['routine', 'listRoutine'].includes(a.links?.repeat) ? 'week' : repeatPreset(r);
  const unit = r?.unit || 'week';
  const on = r?.times ? 'times' : unit === 'week' ? 'days' : r?.on || 'day';
  // A monthly day or n-th weekday, the start's until chosen (updateRepeatFields follows the start date).
  const month = r?.unit === 'month' && !r.times ? r : monthRule({ on: 'day' }, start);
  const nthPick = { ...month, ...monthRule({ on: 'nth' }, start), ...(month.on === 'nth' ? month : {}) };
  const weekdays = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [i, weekdayName(i, 'long')]));
  const picked = r?.unit === 'month' && !r.times ? 'data-picked' : '';
  const days = r?.days || [weekday(start)];
  // Every routine ends, on a day or after a number of times; one that never did is asked for a day.
  const ends = r?.count ? 'after' : 'on';
  const toggles = [0, 1, 2, 3, 4, 5, 6].map(i =>
    `<button type="button" class="chip day-toggle" data-day="${i}" aria-pressed="${days.includes(i)}" aria-label="${esc(weekdayName(i, 'long'))}">${esc(weekdayName(i, 'narrow'))}</button>`).join('');
  const radio = (value, label) => `<label class="rep-radio"><input type="radio" name="ends" value="${value}" ${ends === value ? 'checked' : ''}> ${label}</label>`;
  let stats = '';
  if (r && a.id) {
    const streak = routineStreak(a), kept = consistency(a);
    stats = [
      tp('rt.checkins', Object.values(a.checkins || {}).filter(v => v === 1).length),
      streak.n ? streakText(streak) : '',
      kept !== null ? t('rt.consistency', { pct: `${Math.round(kept * 100)} %` }) : '',
    ].filter(Boolean).join(' · ');
  }
  const presets = { none: t('f.repeatNone'), week: t('f.repeatWeek'), month: t('f.repeatMonth'), days: t('f.repeatDays'), custom: t('f.repeatCustom') };
  // Unit labels follow the interval; updateRepeatFields fills them in.
  const units = Object.fromEntries(['day', 'week', 'month', 'year'].map(u => [u, '']));
  return `<div class="repeat-box">
    ${field('repeat', t('f.repeat'), select('repeat', presets, mode), t('f.repeatHint'))}
    <div id="repeatCustom" class="rep-custom">
      <div class="field" data-field="every"><label for="f-every">${t('f.every')}</label>
        <div class="rep-every">${num('every', r?.every ?? 1)}${select('unit', units, unit).replace('<select', `<select aria-label="${esc(t('f.unit'))}"`)}</div><div class="err"></div></div>
      ${field('on', t('f.on'), select('on', repeatOnOptions(unit), on))}
      <div id="repMonthDay">${field('monthDay', t('f.monthDay'), num('monthDay', month.on === 'day' ? month.day : monthDay(start)).replace('<input', `<input ${picked}`), t('f.monthDayHint'))}</div>
      <div id="repNth" class="field" data-field="nth"><label for="f-nth">${t('f.nthLabel')}</label>
        <div class="rep-nth">${select('nth', nthOptions(nthPick.nth), String(nthPick.nth)).replace('<select', `<select ${picked}`)}${select('weekday', weekdays, String(nthPick.weekday)).replace('<select', `<select aria-label="${esc(t('f.weekday'))}" ${picked}`)}</div><div class="err"></div></div>
    </div>
    <div id="repDays">${field('days', t('f.days'), `<div class="day-toggles" role="group" aria-label="${esc(t('f.days'))}">${toggles}</div><input type="hidden" name="days" value="${days.join(',')}">`)}</div>
    <div id="repTimes">${field('times', t('f.times'), num('times', r?.times ?? 3), '<span id="timesHint"></span>')}</div>
    <div id="repMakeUp" class="field" data-field="makeUp"><label class="rep-check"><input type="checkbox" id="f-makeUp" name="makeUp" ${r?.makeUp ? 'checked' : ''}> ${t('f.makeUp')}</label><div class="err"></div><div class="hint">${t('f.makeUpHint')}</div></div>
    <fieldset id="repeatEnds" class="rep-ends"><legend class="label">${t('f.ends')}</legend>
      <div class="field rep-end" data-field="endDate">${radio('on', t('f.endsOn'))}${date('endDate', r?.count ? '' : a.dueDate)}<div class="err"></div></div>
      <div class="field rep-end" data-field="count">${radio('after', t('f.endsAfter'))}${num('count', r?.count ?? 10)}<span id="countUnit"></span><div class="err"></div></div>
    </fieldset>
    ${stats ? `<p class="hint rt-stats">${esc(stats)}</p>` : ''}
  </div>`;
}

// The metric fields, or the hint for measuring by activities or routines.
export function updateProgressFields() {
  const by = $('#f-progress').value;
  $('#measureFields').hidden = by !== 'measure';
  $('#actsHint').hidden = by !== 'activities';
  $('#routinesHint').hidden = by !== 'routines';
}

// A routine has no status or due date (when it ends takes its place); only the fields its kind of
// repeat needs show, and the labels follow the start date and the interval.
export function updateRepeatFields(e) {
  const sel = $('#f-repeat');
  if (!sel) return;
  const unitSel = $('#f-unit'), onSel = $('#f-on');
  // Switching from a common kind to custom starts from what it was.
  const was = REPEAT_PRESETS[sel.dataset.prev];
  if (e?.target === sel && sel.value === 'custom' && was) { unitSel.value = was.unit; onSel.dataset.want = was.on; }
  // Turning an activity into a routine, or back, carries its end date across when the other is empty.
  const flip = e?.target === sel && (sel.dataset.prev === 'none') !== (sel.value === 'none');
  if (flip) {
    const [from, to] = sel.value === 'none' ? ['#f-endDate', '#f-dueDate'] : ['#f-dueDate', '#f-endDate'];
    if ($(from).value.trim() && !$(to).value.trim()) $(to).value = $(from).value;
  }
  sel.dataset.prev = sel.value;
  // A routine runs from its start date: choosing one fills an empty start with today, in plain sight.
  if (e?.target === sel && sel.value !== 'none' && !$('#f-startDate').value.trim()) $('#f-startDate').value = dateInput(today());
  const mode = sel.value, preset = REPEAT_PRESETS[mode], start = formStart();
  const every = preset ? 1 : Math.max(1, parseInt($('#f-every').value, 10) || 1);
  [...unitSel.options].forEach(o => (o.textContent = tp('f.unit.' + o.value, every)));
  const opts = repeatOnOptions(unitSel.value), want = onSel.dataset.want || onSel.value;
  delete onSel.dataset.want;
  onSel.innerHTML = Object.entries(opts).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
  onSel.value = want in opts ? want : Object.keys(opts)[0] || '';
  const { unit, on } = preset || (mode === 'custom' ? { unit: unitSel.value, on: onSel.value } : {});
  // Until chosen by hand, the monthly day and weekday follow the start date.
  if (e?.target?.id === 'f-startDate') {
    const d = $('#f-monthDay'), n = $('#f-nth'), w = $('#f-weekday');
    if (!d.hasAttribute('data-picked')) d.value = monthDay(start);
    if (!n.hasAttribute('data-picked') && !w.hasAttribute('data-picked')) { n.value = nthInMonth(start) > 4 ? -1 : nthInMonth(start); w.value = weekday(start); }
  }
  $('#repeatCustom').hidden = mode !== 'custom';
  $('#repMonthDay').hidden = !(unit === 'month' && on === 'day');
  $('#repNth').hidden = !(unit === 'month' && on === 'nth');
  modal.querySelector('[data-field="on"]').hidden = !onSel.options.length;
  $('#repDays').hidden = !(unit === 'week' && on === 'days');
  $('#repTimes').hidden = on !== 'times';
  // Only set days can be made up on another day.
  $('#repMakeUp').hidden = mode === 'none' || on === 'times';
  $('#timesHint').textContent = t('f.timesHint', { every: tp('rt.every.' + unit, every) });
  $('#countUnit').textContent = tp('f.endsCount', Math.max(1, parseInt($('#f-count').value, 10) || 1));
  $('#repeatEnds').hidden = mode === 'none';
  const status = modal.querySelector('[data-field="status"]');
  if (status) status.hidden = mode !== 'none';
  // A list routine's items are ticked off each day on its card, not in the form.
  $('#listRows')?.classList.toggle('no-ticks', mode !== 'none');
  modal.querySelector('[data-field="dueDate"]').hidden = mode !== 'none';
}

// The recurrence the form describes, or an error for one of its fields.
export function readRepeat(v, start) {
  if (v.repeat === 'none') return {};
  const int = (x, max) => { const n = Number(x); return Number.isInteger(n) && n >= 1 && n <= max ? n : 0; };
  const { unit, on } = REPEAT_PRESETS[v.repeat] || v;
  const every = REPEAT_PRESETS[v.repeat] ? 1 : int(v.every, 99);
  if (!every) return { errors: { every: t('err.times', { max: 99 }) } };
  const repeat = { every, unit };
  if (on === 'times') {
    const max = every * (unit === 'week' ? 7 : 31), times = int(v.times, max);
    if (!times) return { errors: { times: t('err.times', { max }) } };
    repeat.times = times;
  } else if (unit === 'week') {
    const days = String(v.days || '').split(',').filter(Boolean).map(Number).sort();
    if (!days.length) return { errors: { days: t('err.days') } };
    repeat.days = days;
  } else if (unit === 'month') {
    repeat.on = on;
    if (on === 'day') {
      const day = int(v.monthDay, 31);
      if (!day) return { errors: { monthDay: t('err.times', { max: 31 }) } };
      repeat.day = day;
    }
    if (on === 'nth') Object.assign(repeat, { nth: Number(v.nth), weekday: Number(v.weekday) });
  }
  if (on !== 'times' && v.makeUp) repeat.makeUp = true;
  let dueDate = '';
  if (v.ends !== 'after') {
    if (!v.endDate) return { errors: { endDate: t('err.endDate') } };
    if (v.endDate < start) return { errors: { endDate: t('err.startAfterDue') } };
    dueDate = v.endDate;
  } else if (v.ends === 'after') {
    const count = int(v.count, 999);
    if (!count) return { errors: { count: t('err.times', { max: 999 }) } };
    repeat.count = count;
    dueDate = lastOccurrence({ repeat, startDate: start }, count);
  }
  return { repeat, dueDate };
}

export function relationForm() {
  const groups = KINDS.map(k => {
    const items = collection(k);
    return items.length ? `<optgroup label="${esc(t('kinds.' + k))}">${items.map(i => `<option value="${i.id}">${esc(i.title)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  return `
    ${field('from', t('f.from'), `<select id="f-from" name="from">${groups}</select>`)}
    ${field('type', t('f.relationship'), '<select id="f-type" name="type"></select>')}
    ${field('to', t('f.to'), `<select id="f-to" name="to">${groups}</select>`)}`;
}

// Only the relationship types that fit the chosen items are offered: those from → to, and under
// a second heading those to → from (picking one of these swaps the two items when saved).
export function fillRelTypes(keep = $('#f-type').value) {
  const from = $('#f-from').value, to = $('#f-to').value;
  const title = id => findEntity(id)?.item.title || '';
  const group = (a, b, types, pre) => types.length
    ? `<optgroup label="${esc(`${title(a)} → ${title(b)}`)}">${types.map(k => `<option value="${pre}${k}">${esc(relLabel(k))}</option>`).join('')}</optgroup>` : '';
  const fwd = possibleTypes(from, to, formCtx.id), rev = possibleTypes(to, from, formCtx.id);
  const box = $('#f-type');
  box.innerHTML = fwd.length || rev.length ? group(from, to, fwd, '') + group(to, from, rev, 'rev:') : `<option value="">${esc(t('rel.nonePossible'))}</option>`;
  if ([...box.options].some(o => o.value === keep)) box.value = keep;
  // Explain an empty list right away rather than on saving.
  const f = box.closest('.field');
  f.classList.toggle('invalid', !box.value);
  f.querySelector('.err').textContent = box.value ? '' : from === to ? t('err.self') : t('rel.noneBetween');
}

export function formValues() {
  const fd = new FormData($('#modalForm'));
  const v = {};
  for (const [k, val] of fd.entries()) {
    if (k in v) v[k] = [].concat(v[k], val);
    else v[k] = val;
  }
  // Number fields are stored with a dot and dates as yyyy-mm-dd; `bad` maps fields that hold neither to their error.
  const bad = {};
  modal.querySelectorAll('input[data-num]').forEach(i => {
    const n = parseNum(i.value);
    if (!i.value.trim()) v[i.name] = '';
    else if (isNaN(n)) { v[i.name] = ''; if (!i.closest('[hidden]')) bad[i.name] = t('err.number'); }
    else v[i.name] = String(n);
  });
  modal.querySelectorAll('input[data-date]').forEach(i => {
    v[i.name] = i.value.trim() ? parseDateInput(i.value) || '' : '';
    if (i.value.trim() && !v[i.name]) bad[i.name] = t('err.date');
  });
  const arr = k => (v[k] === undefined ? [] : [].concat(v[k]));
  return { v, arr, bad };
}

export function showErrors(errs) {
  modal.querySelectorAll('.field[data-field]').forEach(f => {
    const e = errs[f.dataset.field];
    f.classList.toggle('invalid', !!e);
    f.querySelector('.err').textContent = e || '';
  });
  const first = modal.querySelector('.field.invalid input, .field.invalid textarea, .field.invalid select');
  first?.focus();
}

export function updateSmartLive() {
  if (formCtx?.kind !== 'goal') return;
  const { v } = formValues();
  const c = smartCheck(v);
  modal.querySelectorAll('.smart-block').forEach(b => b.classList.toggle('ok', !!c[b.dataset.smart]));
  const okCount = 'SMART'.split('').filter(l => c[l]).length;
  $('#smartLive').innerHTML = smartBadge(v);
  $('#smartLiveText').textContent = okCount === 5 ? t('smart.ok') : t('smart.partial', { n: okCount });
}

export function submitForm() {
  const { kind, id } = formCtx;
  const { v, arr, bad } = formValues();
  const existing = id ? findEntity(id)?.item : null;

  if (kind === 'relation') {
    // An edited relationship is validated without itself, and put back unchanged if the edit is invalid.
    if (!v.type) return showErrors({ type: v.from === v.to ? t('err.self') : t('rel.noneBetween') });
    if (v.type.startsWith('rev:')) Object.assign(v, { type: v.type.slice(4), from: v.to, to: v.from });
    const at = id ? db.relations.findIndex(r => r.id === id) : -1;
    const old = at >= 0 ? db.relations.splice(at, 1)[0] : null;
    const err = canRelate(v.from, v.to, v.type);
    if (err) {
      if (old) db.relations.splice(at, 0, old);
      return showErrors({ to: err });
    }
    if (old) db.relations.splice(at, 0, Object.assign(old, { from: v.from, to: v.to, type: v.type }));
    else db.relations.push({ id: uid(), from: v.from, to: v.to, type: v.type });
    return finish(t(old ? 'toast.relUpdated' : 'toast.relAdded'));
  }

  if (Object.keys(bad).length) return showErrors(bad);
  if (!v.title || !v.title.trim()) return showErrors({ title: t('err.titleRequired') });

  if (kind === 'vision') {
    const vis = existing || { id: uid(), createdAt: today(), parents: [] };
    Object.assign(vis, { title: v.title.trim(), description: (v.description || '').trim(), parents: [] });
    if (!existing) visions.list.push(vis);
    arr('parents').forEach(p => { if (!canParent(vis.id, p)) vis.parents.push(p); });
    const chosen = new Set(arr('goals'));
    db.goals.forEach(g => {
      const own = ownVisions(g), has = own.includes(vis.id);
      if (chosen.has(g.id) !== has) setGoalVisions(g, has ? own.filter(x => x !== vis.id) : [...own, vis.id]);
    });
    saveVisions();
    return finish(t(existing ? 'toast.visionUpdated' : 'toast.visionAdded'));
  }

  if (kind === 'goal') {
    const c = smartCheck(v);
    if (Object.keys(c.errs).length) return showErrors(c.errs);
    const g = Object.assign(existing || { id: uid(), createdAt: today() }, {
      title: v.title.trim(), specific: v.specific.trim(), metric: v.metric.trim(), unit: v.unit.trim(),
      baseline: v.baseline, current: v.current, target: v.target,
      achievable: v.achievable.trim(), relevant: v.relevant.trim(),
      startDate: v.startDate, deadline: v.deadline, status: v.status, category: v.category.trim(),
    });
    // The metric fields are kept while measuring by activities, in case the goal switches back.
    if (ownMetric(v)) delete g.progress;
    else g.progress = v.progress;
    // How a state that adds up counts; kept when the field is not shown.
    if (v.period) g.period = v.period;
    if (!existing) db.goals.push(g);
    setLinks(g.id, 'subgoal', v.parent ? [v.parent] : []);
    setLinks(g.id, 'depends', arr('depends'));
    setIncoming(g.id, 'contributes', arr('activities'));
    setGoalVisions(g, arr('visions'));
    return finish(t(existing ? 'toast.goalUpdated' : 'toast.goalCreated'));
  }

  if (kind === 'state') {
    // Switching between adding up and single measurements turns what is there into the other kind.
    const had = existing && (isCumulative(existing) ? entriesOf(existing).length : (existing.history || []).length);
    if (had && !v.addsUp !== !isCumulative(existing) && !confirm(t(v.addsUp ? 'cu.confirmToCumulative' : 'cu.confirmToPlain', { name: existing.title }))) return;
    const s = Object.assign(existing || { id: uid(), history: [], value: '' }, {
      title: v.title.trim(), description: v.description.trim(), unit: v.unit.trim(),
    });
    s.history ||= [];
    if (!existing) db.states.push(s);
    setLinks(s.id, 'measures', arr('goals'));
    modal.querySelectorAll('[data-drop-entry][aria-pressed="true"]').forEach(b => deleteEntry(s, b.dataset.dropEntry));
    convertState(s, !!v.addsUp);
    // An empty value keeps the latest measurement; a value for a date that has one replaces it.
    // A state that adds up takes it as one more amount.
    if (isNum(v.value)) {
      if (isCumulative(s)) addEntry(s, v.date || today(), v.value);
      else recordMeasurement(s, v.date || today(), v.value);
    }
    return finish(t(existing ? 'toast.stateUpdated' : 'toast.stateAdded'));
  }

  if (kind === 'activity') {
    // Every activity has a start and an end: a one-off its due date, a routine its end (readRepeat).
    const startDate = v.startDate;
    const rows = $('#listRows');
    // Empty rows are left out; an item keeps its id so ticks and sync follow it.
    const list = rows && [...rows.querySelectorAll('.li-row')].map(r => ({ id: r.dataset.liRow || uid(), text: r.querySelector('.li-input').value.trim(), done: r.querySelector('.li-check').checked })).filter(i => i.text);
    if (list && !list.length) return showErrors({ list: t('err.listEmpty') });
    if (!startDate) return showErrors({ startDate: t('err.startRequired') });
    const { repeat, dueDate = v.dueDate, errors } = readRepeat(v, startDate);
    if (errors) return showErrors(errors);
    if (!repeat && !dueDate) return showErrors({ dueDate: t('err.dueRequired') });
    if (!repeat && startDate > dueDate) return showErrors({ dueDate: t('err.startAfterDue') });
    const a = Object.assign(existing || { id: uid(), createdAt: today() }, {
      // A list has no status field: it keeps its own (followList moves it on below).
      title: v.title.trim(), description: v.description.trim(), status: list ? existing?.status || 'todo' : v.status, startDate, dueDate,
    });
    // A routine keeps its check-ins even when it stops repeating, in case it is switched back.
    if (repeat) Object.assign(a, { repeat, status: 'todo', checkins: a.checkins || {} });
    else delete a.repeat;
    if (list) {
      // Only items that changed get a new time; removed ones are remembered for sync. A list
      // routine's items are ticked per day instead (listDays).
      if (repeat) list.forEach(i => (i.done = false));
      const now = new Date().toISOString(), before = new Map((existing?.list || []).map(i => [i.id, i]));
      a.list = list.map(i => {
        const was = before.get(i.id);
        return was && was.text === i.text && !!was.done === i.done ? { ...i, at: was.at } : { ...i, at: now };
      });
      const kept = new Set(a.list.map(i => i.id));
      const removed = [...before.keys()].filter(id => !kept.has(id));
      removed.forEach(id => ((a.droppedItems ||= {})[id] = 1));
      // A day left with only ticked items once one is removed is done (any amounts are not asked for).
      if (repeat && removed.length) Object.keys(a.listDays || {}).forEach(iso => {
        if (tickable(a, iso) && !checkedOn(a, iso) && dayItemsDone(a, iso) === a.list.length) setCheckin(a, iso, true);
      });
      if (!repeat) followList(a);
    }
    if (!existing) db.activities.push(a);
    setLinks(a.id, 'subactivity', v.parent ? [v.parent] : []);
    setLinks(a.id, 'contributes', arr('goals'));
    setLinks(a.id, 'improves', arr('states'));
    setLinks(a.id, 'depends', arr('depends'));
    // Nothing may depend on a routine, so an activity that becomes one lets go of what waited for it.
    const waited = db.relations.length;
    if (repeat) db.relations = dropRoutineDeps(db.relations, [a]);
    if (db.relations.length < waited) return finish(tp('toast.routineDepsDropped', waited - db.relations.length));
    return finish(t(existing ? 'toast.activityUpdated' : 'toast.activityAdded'));
  }
}

export function finish(msg) {
  save();
  modal.close();
  requestRender();
  toast(msg);
}

export let lastNodeClick = { id: null, t: 0 };
export function setLastNodeClick(v) { lastNodeClick = v; }

/* =========================================================
   Events
   ========================================================= */

// `action` ({ label, run }) adds a button, and the toast stays longer so there is time to use it.
export function toast(msg, action = null) {
  const box = $('#toast');
  box.textContent = msg;
  box.classList.toggle('has-action', !!action);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { hideToast(); action.run(); });
    box.append(' ', btn);
  }
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(hideToast, action ? 8000 : 2200);
}
export function hideToast() {
  clearTimeout(toast.timer);
  $('#toast').classList.remove('show', 'has-action');
  $('#toast').replaceChildren();
  // Goals waiting to be offered come next.
  if (reachedQueue.length) setTimeout(showReached, 250);
}

/* ---------- "Target reached": offer to mark a goal achieved ----------
   After a change, each active goal that has reached its target since it was last offered gets a
   toast with a button to mark it achieved, one goal at a time; `offeredAt` remembers the offer
   until the goal drops below its target again. The first check of a plan on a device only notes
   which goals are there already, so an existing plan does not greet you with a row of toasts. */

export const reachedQueue = [];

export function offerReached() {
  const key = 'reachedChecked.' + plans.current, quiet = !prefs.get(key, false);
  let changed = false;
  db.goals.forEach(g => {
    const reached = goalReached(g);
    if (reached && !g.offeredAt) {
      g.offeredAt = today();
      changed = true;
      if (!quiet && !reachedQueue.includes(g.id)) reachedQueue.push(g.id);
    } else if (!reached && g.offeredAt) {
      delete g.offeredAt;
      changed = true;
    }
  });
  if (quiet) prefs.set(key, true);
  if (reachedQueue.length && !$('#toast').classList.contains('has-action')) setTimeout(showReached, 0);
  return changed;
}

export function showReached() {
  if ($('#toast').classList.contains('has-action')) return;
  let g;
  while (reachedQueue.length && !(g = db.goals.find(x => x.id === reachedQueue[0] && goalReached(x)))) reachedQueue.shift();
  if (!g) return;
  reachedQueue.shift();
  toast(t('reached.text', { name: g.title }), { label: t('reached.mark'), run: () => {
    g.status = 'achieved';
    save();
    requestRender();
    toast(t('ctx.statusSet', { s: t('goal.achieved') }));
  } });
}

export function cycleStatus(id) {
  const a = db.activities.find(x => x.id === id);
  if (!a) return;
  const next = ACTIVITY_STATUS[(ACTIVITY_STATUS.indexOf(a.status) + 1) % ACTIVITY_STATUS.length];
  const waits = blockers(a);
  if (next === 'done' && waits.length) toast(t('acts.notDone', { name: waits[0].title }));
  a.status = next;
  save();
  render();
}

/* ---------- Amount popover: a quick amount for states that add up ----------
   A state card's + asks for an amount and its date; ticking a routine that improves such states
   asks for an amount for each (empty adds nothing). Enter adds. Escape or "Tick only" still ticks
   the day; a click elsewhere leaves everything as it was. */

export let amountPop = null; // { el, anchor, skip }

export function openAmountPop(anchor, { title, hint, fields, withDate, okLabel, skipLabel }, submit, skip = null) {
  closeAmountPop();
  const el = document.createElement('form');
  el.className = 'amount-pop';
  el.noValidate = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', title);
  el.innerHTML = `<strong class="amount-title">${esc(title)}</strong>${hint ? `<p class="amount-hint">${esc(hint)}</p>` : ''}
    ${fields.map((f, i) => `<label class="amount-field"><span>${esc(f.label)}</span><span class="amount-input">
      <input type="text" data-amount="${i}" inputmode="decimal" autocomplete="off" placeholder="0">${f.unit ? `<span class="amount-unit">${esc(f.unit)}</span>` : ''}</span></label>`).join('')}
    ${withDate ? `<label class="amount-field"><span>${t('f.asOf')}</span><input type="text" data-amount-date value="${esc(dateInput(today()))}" placeholder="${esc(t('f.datePh'))}" inputmode="numeric" autocomplete="off" maxlength="10"></label>` : ''}
    <div class="amount-err" role="alert"></div>
    <div class="amount-actions">${skipLabel ? `<button type="button" class="btn small ghost" data-amount-skip>${esc(skipLabel)}</button>` : ''}<button type="submit" class="btn small primary">${esc(okLabel)}</button></div>`;
  document.body.append(el);
  amountPop = { el, anchor, skip };
  const r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth;
  const below = r.bottom + 8 + el.offsetHeight <= innerHeight - 8;
  el.style.left = `${clamp(r.left + r.width / 2 - el.offsetWidth / 2, 8, vw - el.offsetWidth - 8)}px`;
  el.style.top = `${Math.max(8, below ? r.bottom + 8 : r.top - 8 - el.offsetHeight)}px`;
  el.querySelector('input').focus();
  el.addEventListener('submit', e => {
    e.preventDefault();
    const amounts = [...el.querySelectorAll('[data-amount]')].map(i => (i.value.trim() ? parseNum(i.value) : null));
    const dateBox = el.querySelector('[data-amount-date]');
    const date = dateBox ? parseDateInput(dateBox.value) : today();
    const err = amounts.some(n => Number.isNaN(n)) ? t('err.number') : !date ? t('err.date') : '';
    if (err) { el.querySelector('.amount-err').textContent = err; return; }
    closeAmountPop();
    submit(amounts, date);
  });
  el.addEventListener('click', e => { if (e.target.closest('[data-amount-skip]')) skipAmount(); });
  el.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    skipAmount();
  });
}

export function skipAmount() {
  const { skip, anchor } = amountPop;
  closeAmountPop();
  if (skip) skip();
  else anchor.focus();
}

export function closeAmountPop() {
  amountPop?.el.remove();
  amountPop = null;
}
document.addEventListener('pointerdown', e => { if (amountPop && !amountPop.el.contains(e.target) && e.target !== amountPop.anchor) closeAmountPop(); });

export function openStateAmount(id, anchor) {
  const s = db.states.find(x => x.id === id);
  if (!s) return;
  openAmountPop(anchor, { title: t('cu.addTo', { name: s.title }), fields: [{ label: t('cu.amount'), unit: s.unit }], withDate: true, okLabel: t('cu.add') }, ([n], date) => {
    if (n === null) return anchor.focus();
    addEntry(s, date, n);
    save();
    render();
    toast(t('cu.added', { value: withUnit(fmtNum(n), s.unit || ''), name: s.title }));
    $(`[data-add-amount="${id}"]`)?.focus();
  });
}

// A click on a state's card asks for a new measured value, dated today unless changed (one that adds
// up asks for an amount instead); editing the state is in the card's menu.
export function openStateValue(id, anchor) {
  const s = db.states.find(x => x.id === id);
  if (!s) return;
  if (isCumulative(s)) return openStateAmount(id, anchor);
  const hint = isNum(s.value) ? t('sv.latest', { value: withUnit(fmtNum(s.value), s.unit || ''), date: fmtRel(s.date) || '—' }) : '';
  openAmountPop(anchor, { title: t('sv.title', { name: s.title }), hint, fields: [{ label: t('f.value'), unit: s.unit }], withDate: true, okLabel: t('btn.save') }, ([n], date) => {
    if (n === null) return;
    recordMeasurement(s, date, String(n));
    save();
    render();
    toast(t('sv.saved', { value: withUnit(fmtNum(n), s.unit || ''), name: s.title }));
  });
}

export function openTickAmount(a, iso, anchor) {
  const states = improvedStates(a);
  const title = iso === today() ? t('cu.howMuch', { name: a.title }) : t('cu.howMuchOn', { name: a.title, date: fmtDay(iso, { weekday: 'short', day: 'numeric', month: 'short' }) });
  openAmountPop(anchor, { title, fields: states.map(s => ({ label: s.title, unit: s.unit })), okLabel: t('cu.add'), skipLabel: t('cu.tickOnly') },
    amounts => setRoutineDay(a, iso, true, states.map((s, i) => [s, amounts[i]]).filter(([, n]) => n !== null)),
    () => setRoutineDay(a, iso, true));
}

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

export function setView(view) {
  ui.view = view;
  ui.mapLinkFrom = null;
  ui.search = '';
  ui.mapRefocus = true;
  prefs.set('view', view);
  requestRender();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-item[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

/* ---------- "More" menu of the phone tab bar ---------- */

export function openNavSheet() {
  const sheet = $('#navSheet');
  sheet.innerHTML = [...document.querySelectorAll('.nav-extra')].map(b =>
    `<button type="button" role="menuitem" class="${b.dataset.view === ui.view ? 'active' : ''}" data-sheet-view="${b.dataset.view}">${b.innerHTML}</button>`).join('');
  sheet.hidden = false;
  $('#navMore').setAttribute('aria-expanded', 'true');
  (sheet.querySelector('.active') || sheet.querySelector('button')).focus();
}

export function closeNavSheet(refocus = false) {
  const sheet = $('#navSheet');
  if (sheet.hidden) return;
  sheet.hidden = true;
  $('#navMore').setAttribute('aria-expanded', 'false');
  if (refocus) $('#navMore').focus();
}

$('#navMore').addEventListener('click', () => ($('#navSheet').hidden ? openNavSheet() : closeNavSheet()));
$('#navSheet').addEventListener('click', e => {
  const b = e.target.closest('[data-sheet-view]');
  if (!b) return;
  closeNavSheet();
  setView(b.dataset.sheetView);
});
$('#navSheet').addEventListener('keydown', e => {
  const items = [...$('#navSheet').querySelectorAll('button')];
  const i = items.indexOf(document.activeElement);
  const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
  if (e.key === 'Escape' || e.key === 'Tab') {
    if (e.key === 'Escape') e.preventDefault();
    closeNavSheet(e.key === 'Escape');
  } else if (to !== undefined) {
    e.preventDefault();
    items[(to + items.length) % items.length].focus();
  }
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('#navSheet, #navMore')) closeNavSheet(); });
// The menu only exists on phones; close it when the window grows past that.
matchMedia('(max-width: 720px)').addEventListener('change', e => { if (!e.matches) closeNavSheet(); });

// On the map and the timeline (where links are drawn between kinds), what to add: under the Add button, or at x, y
// for a right-click on the map's empty space.
export function openAddMenu(x, y, byKey) {
  Object.assign(ctxMenu.dataset, { id: '', rel: '', add: '1' });
  ctxMenu.setAttribute('aria-label', t('add.item'));
  showCtxMenu('', '', '', ['goal', 'activity', 'state', ...(ui.view === 'map' ? ['vision'] : [])].map(k => ({ act: 'new:' + k, label: t('add.' + k) })), x, y, byKey);
}

$('#addBtn').addEventListener('click', e => {
  const kind = VIEWS[ui.view].add;
  if (kind !== 'item') return openForm(kind);
  const r = e.currentTarget.getBoundingClientRect();
  openAddMenu(r.right, r.bottom + 6, e.detail === 0);
  // Lined up with the button's right edge; above it when the button floats at the bottom (phones).
  const m = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(8, Math.min(r.right - m.width, innerWidth - m.width - 8))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(r.top > innerHeight / 2 ? r.top - m.height - 6 : r.bottom + 6, innerHeight - m.height - 8))}px`;
});

viewEl.addEventListener('click', e => {
  const el = e.target.closest('[data-tl-fold],[data-tl-fold-all],[data-rel-open],[data-rel-remove],[data-rt-week],[data-checkin],[data-li-tick],[data-add-amount],[data-del-measure],[data-del-entry],[data-gr-scale],[data-cycle],[data-open],[data-new],[data-sample],[data-templates],[data-goal-filter],[data-rel-edit],[data-map-node],[data-tl-node],[data-map-clear],[data-rel-toggle],[data-hide-done],[data-hide-visions],[data-category],[data-tl-zoom],[data-tl-deps],[data-map-zoom],[data-next-more]');
  // While linking by tapping, a box finishes the link and anything else (but zooming) cancels it.
  if (ui.mapLinkFrom && !e.target.closest('[data-map-zoom]')) {
    const from = ui.mapLinkFrom, to = el?.dataset.mapNode;
    e.stopPropagation();
    ui.mapLinkFrom = null;
    render();
    if (to && to !== from) linkItems(from, to);
    return;
  }
  if (!el) {
    // Clicking empty space in the map clears what is selected there.
    if (e.target.closest('.map-wrap, .tl-scroll') && (ui.mapSelected || ui.mapRel)) { ui.mapSelected = ui.mapRel = null; render(); }
    return;
  }
  e.stopPropagation();
  if (el.dataset.tlFold) return toggleTlFold(el.dataset.tlFold);
  if (el.dataset.tlFoldAll) return foldAllTl(el.dataset.tlFoldAll === 'collapse');
  if (el.dataset.relOpen) return openForm('relation', el.dataset.relOpen);
  if (el.dataset.relRemove) return removeRelation(el.dataset.relRemove);
  if (el.hasAttribute('data-next-more')) {
    ui.nextAll = !ui.nextAll;
    prefs.set('nextAll', ui.nextAll);
    render();
    // Keep the page where it is; the button moves to the end of the list.
    return $('[data-next-more]')?.focus({ preventScroll: true });
  }
  if (el.dataset.rtWeek) return el.disabled || shiftRoutineWeek(el.dataset.rtWeek, Number(el.dataset.dir));
  if (el.dataset.checkin) return toggleCheckin(el.dataset.checkin, el.dataset.date, el);
  if (el.dataset.liTick) return tickListItem(el.dataset.liTick, el.dataset.li, el.dataset.date);
  if (el.dataset.addAmount) return openStateAmount(el.dataset.addAmount, el);
  if (el.dataset.delMeasure) return removeMeasurement(el.dataset.delMeasure, el.dataset.date);
  if (el.dataset.delEntry) return removeEntry(el.dataset.delEntry, el.dataset.entry);
  if (el.dataset.grScale) return setGraphScale(el.dataset.state, el.dataset.grScale);
  if (el.dataset.cycle) return cycleStatus(el.dataset.cycle);
  if (el.dataset.open) {
    const ent = findEntity(el.dataset.open);
    if (ent?.kind === 'state' && el.matches('.card')) return openStateValue(ent.item.id, el);
    return ent && openForm(ent.kind, ent.item.id);
  }
  if (el.dataset.new) return el.dataset.new === 'relation' && itemCount() < 2 ? toast(t('err.needTwo')) : openForm(el.dataset.new);
  if (el.hasAttribute('data-sample')) return loadSample();
  if (el.hasAttribute('data-templates')) return openTemplates();
  if (el.dataset.goalFilter) { ui.goalFilter = el.dataset.goalFilter; return render(); }
  if (el.dataset.relEdit) {
    if (ui.mapRel === el.dataset.relEdit) return openForm('relation', el.dataset.relEdit);
    Object.assign(ui, { mapRel: el.dataset.relEdit, mapSelected: null });
    return render();
  }
  if (el.dataset.category !== undefined) {
    ui.category = ui.category === el.dataset.category ? '' : el.dataset.category;
    prefs.set('category', ui.category);
    return render();
  }
  if (el.dataset.tlZoom) { ui.tlPx = TL.ZOOM[el.dataset.tlZoom]; prefs.set('tlPx', ui.tlPx); ui.mapRefocus = true; return render(); }
  if (el.dataset.mapZoom) {
    const wrap = $('.map-wrap'), r = wrap.getBoundingClientRect();
    const scale = { in: ui.mapScale * 1.25, out: ui.mapScale / 1.25, reset: 1 }[el.dataset.mapZoom];
    return zoomMap(scale, r.left + wrap.clientWidth / 2, r.top + wrap.clientHeight / 2);
  }
  if (el.hasAttribute('data-tl-deps')) return setToggle('tlDeps', !ui.tlDeps);
  const node = nodeId(el);
  if (node) {
    // A second click on the same item soon after opens it. The map is redrawn between the clicks, so the
    // browser's own dblclick may not arrive; keyboard clicks (detail 0) never count.
    const now = performance.now(), double = e.detail > 0 && lastNodeClick.id === node && now - lastNodeClick.t < 450;
    lastNodeClick = e.detail > 0 && !double ? { id: node, t: now } : { id: null, t: 0 };
    ui.mapRel = null;
    // In the timeline, clicking the bar itself (the part that changes) also lets its dates be dragged.
    const dates = !!e.target.closest('.tl-bar, .tl-milestone, .tl-grip');
    if (double) {
      ui.mapSelected = node;
      render();
      const ent = findEntity(node);
      return ent && openForm(ent.kind, node);
    }
    // A second click on the same part deselects; the other part switches between the two.
    const same = ui.mapSelected === node && (ui.tlDates === node) === dates;
    ui.mapSelected = same ? null : node;
    ui.tlDates = !same && dates ? node : null;
    return render();
  }
  if (el.hasAttribute('data-map-clear')) { ui.mapSelected = ui.mapRel = null; return render(); }
  if (el.dataset.relToggle) {
    const type = el.dataset.relToggle;
    if (ui.mapHidden.has(type)) ui.mapHidden.delete(type);
    else ui.mapHidden.add(type);
    prefs.set('mapHidden', [...ui.mapHidden]);
    return render();
  }
  if (el.hasAttribute('data-hide-done')) return setToggle('hideDone', !ui.hideDone);
  if (el.hasAttribute('data-hide-visions')) return setToggle('hideVisions', !ui.hideVisions);
});

viewEl.addEventListener('input', e => {
  if (e.target.matches('[data-search]')) {
    ui.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const box = $('[data-search]');
    box.focus();
    box.setSelectionRange(pos, pos);
  }
});
viewEl.addEventListener('change', e => {
  if (e.target.matches('[data-goal-select]')) {
    ui[GOAL_FILTERS[e.target.dataset.goalSelect]] = e.target.value;
    ui.mapRefocus = true;
    render();
  }
});

export function bindDragDrop() {
  document.querySelectorAll('[data-drag]').forEach(card => {
    // Cards are dragged with the mouse; on touch screens a long-press opens their menu instead.
    card.addEventListener('pointerdown', e => { card.draggable = e.pointerType === 'mouse'; });
    card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.dataset.drag); e.dataTransfer.effectAllowed = 'move'; });
  });
  document.querySelectorAll('.col[data-status]').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', e => {
      e.preventDefault();
      const a = db.activities.find(x => x.id === e.dataTransfer.getData('text/plain'));
      if (a && a.status !== col.dataset.status) { a.status = col.dataset.status; save(); }
      render();
    });
  });
}

$('#modalForm').addEventListener('keydown', e => {
  // Ctrl+Enter (⌘+Enter on a Mac) saves from any field; the pickers and lists below never see it.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!$('#saveBtn').hidden) $('#modalForm').requestSubmit($('#saveBtn'));
    return;
  }
  // A phone keyboard sends Enter only for `enterkeyhint="enter"` (its Next key would jump to the next
  // field instead); Enter that finishes typing in an input method is left to it.
  if (e.key === 'Enter' && !e.isComposing && e.target.matches('.li-input')) { e.preventDefault(); addListRow(e.target.closest('.li-row')); }
});
$('#modalForm').addEventListener('submit', e => { e.preventDefault(); if (!formCtx?.choose) submitForm(); });
$('#modalBody').addEventListener('click', e => {
  if (e.target.closest('[data-li-add]')) return addListRow();
  const del = e.target.closest('[data-li-del]');
  if (del) {
    // Focus moves to the next row's remove button, not its text: on a phone that would open the keyboard.
    const row = del.closest('.li-row'), next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    if (!next) {
      addListRow(null, false);
      return modal.querySelector('[data-li-add]').focus();
    }
    return next.querySelector('[data-li-del]').focus();
  }
  const b = e.target.closest('[data-act-kind]');
  if (b && formCtx?.choose) openForm('activity', null, { ...formCtx.choose, repeat: b.dataset.actKind });
});
$('#modalForm').addEventListener('input', updateSmartLive);
$('#modalForm').addEventListener('input', e => {
  if (['f-every', 'f-count', 'f-startDate'].includes(e.target.id)) updateRepeatFields(e);
});
// Typing or picking when a routine ends chooses that option.
$('#modalForm').addEventListener('focusin', e => {
  const row = e.target.closest('.rep-end');
  if (row && e.target.type !== 'radio') row.querySelector('input[type="radio"]').checked = true;
});
$('#modalForm').addEventListener('change', e => {
  if (e.target.matches('.li-check')) return placeListRow(e.target.closest('.li-row'));
  if (e.target.id === 'f-from' || e.target.id === 'f-to') return fillRelTypes();
  if (['f-monthDay', 'f-nth', 'f-weekday'].includes(e.target.id)) e.target.setAttribute('data-picked', '');
  if (['f-addsUp', 'f-unit'].includes(e.target.id) && formCtx?.kind === 'state') return updateStateFields();
  if (['f-repeat', 'f-unit', 'f-on', 'f-startDate'].includes(e.target.id)) return updateRepeatFields(e);
  if (e.target.id !== 'f-progress') return;
  updateProgressFields();
  updateSmartLive();
});
// Weekday toggles of a routine: the chosen days are kept in a hidden field.
$('#modalForm').addEventListener('click', e => {
  const day = e.target.closest('.day-toggle');
  if (!day) return;
  day.setAttribute('aria-pressed', day.getAttribute('aria-pressed') !== 'true');
  const box = day.closest('.field');
  box.querySelector('input[name="days"]').value = [...box.querySelectorAll('.day-toggle[aria-pressed="true"]')].map(b => b.dataset.day).join(',');
});

// Link lists: the list opens while the search box (or one of its items) has focus, typing filters it,
// a click on an item adds it and a chosen item's × removes it.
export const shownOpts = picker => [...picker.querySelectorAll('.pick-opt:not([hidden])')];
['focusin', 'input'].forEach(type => $('#modalForm').addEventListener(type, e => {
  if (e.target.matches('.picker-search')) showPickList(e.target.closest('[data-picker]'), true);
}));
$('#modalForm').addEventListener('focusout', e => {
  const picker = e.target.closest('[data-picker]');
  if (picker && !(e.relatedTarget && picker.contains(e.relatedTarget) && e.relatedTarget.closest('.pick-list, .picker-search'))) showPickList(picker, false);
});
// Pressing an item must not move focus away from the search box first (that would close the list).
$('#modalForm').addEventListener('pointerdown', e => { if (e.target.closest('.pick-opt')) e.preventDefault(); });
$('#modalForm').addEventListener('keydown', e => {
  const picker = e.target.closest?.('[data-picker]');
  if (!picker || !e.target.closest('.picker-search, .pick-opt')) return;
  const search = picker.querySelector('.picker-search');
  const shown = shownOpts(picker);
  const i = shown.indexOf(e.target);
  if (e.key === 'Escape' && !picker.querySelector('.pick-list').hidden) {
    // Close the list, not the form.
    e.preventDefault();
    e.stopPropagation();
    search.focus();
    showPickList(picker, false);
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (picker.querySelector('.pick-list').hidden) return showPickList(picker, true);
    const next = i + (e.key === 'ArrowDown' ? 1 : -1);
    (next < 0 ? search : shown[Math.min(next, shown.length - 1)] || search).focus();
  } else if (e.key === 'Enter' && e.target === search) {
    // Enter adds the first match instead of saving the form.
    e.preventDefault();
    if (shown[0]) pickItem(shown[0]);
  }
});
$('#modalForm').addEventListener('click', e => {
  const opt = e.target.closest('.pick-opt');
  if (opt) {
    const picker = opt.closest('[data-picker]'), shown = shownOpts(picker), at = shown.indexOf(opt);
    const next = shown[at + 1] || shown[at - 1];
    pickItem(opt);
    // Keep the keyboard in the list; after a click, typing goes on in the search box.
    return (document.activeElement === opt && next ? next : picker.querySelector('.picker-search')).focus();
  }
  const x = e.target.closest('[data-unpick]');
  if (!x) return;
  const picker = x.closest('[data-picker]');
  const tags = [...picker.querySelectorAll('[data-unpick]')], at = tags.indexOf(x);
  unpickItem(picker, x.dataset.unpick);
  (tags[at + 1] || tags[at - 1] || picker.querySelector('.picker-search')).focus();
});
// Date fields: slashes are added while typing digits.
$('#modalForm').addEventListener('input', e => {
  const box = e.target;
  if (!box.matches('[data-date]') || e.inputType !== 'insertText' || !/^\d$/.test(e.data) || box.selectionStart !== box.value.length) return;
  if (/^\d{2}$|^\d{1,2}\/\d{2}$/.test(box.value)) box.value += '/';
});

/* ---------- Calendar for date fields ----------
   Opens below the field on the field's date, else (for an end date) on the form's start date, else today. */

export let cal = null; // { field, box, y, m, focus: 'yyyy-mm-dd' }

export function openCalendar(field) {
  closeCalendar();
  const box = field.querySelector('[data-date]');
  const start = box.id === 'f-startDate' ? null : parseDateInput($('#f-startDate')?.value);
  const focus = parseDateInput(box.value) || start || today();
  const [y, m] = focus.split('-').map(Number);
  cal = { field, box, y, m: m - 1, focus };
  field.insertAdjacentHTML('beforeend', `<div class="cal" role="dialog" aria-label="${esc(t('f.pickDate'))}"></div>`);
  field.querySelector('[data-cal-open]').setAttribute('aria-expanded', 'true');
  drawCalendar();
  // Keep the calendar inside the form: open it to the left when the field is near the right edge.
  const el = field.querySelector('.cal'), form = $('#modalForm').getBoundingClientRect();
  if (el.getBoundingClientRect().right > form.right - 8) el.classList.add('right');
  focusDay();
  el.scrollIntoView({ block: 'nearest' });
}

export function drawCalendar() {
  const { y, m, box } = cal;
  const lead = weekday(isoOf(y, m, 1)); // Monday first
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const chosen = parseDateInput(box.value), now = today();
  const weekdays = Array.from({ length: 7 }, (_, i) => `<span class="cal-wd" aria-hidden="true">${esc(weekdayName(i))}</span>`).join('');
  const cells = Array.from({ length: days }, (_, i) => {
    const iso = isoOf(y, m, i + 1);
    return `<button type="button" data-cal-day="${iso}" class="${iso === now ? 'today' : ''}" aria-pressed="${iso === chosen}" tabindex="${iso === cal.focus ? 0 : -1}" aria-label="${esc(fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}">${i + 1}</button>`;
  }).join('');
  cal.field.querySelector('.cal').innerHTML = `
    <div class="cal-head">
      <button type="button" data-cal-move="-1" aria-label="${esc(t('cal.prev'))}">‹</button>
      <strong aria-live="polite">${esc(fmtDay(isoOf(y, m, 1), { month: 'long', year: 'numeric' }))}</strong>
      <button type="button" data-cal-move="1" aria-label="${esc(t('cal.next'))}">›</button>
    </div>
    <div class="cal-grid">${weekdays}${'<span></span>'.repeat(lead)}${cells}</div>
    <div class="cal-foot">
      <button type="button" class="btn small ghost" data-cal-pick="${now}">${t('cal.today')}</button>
      <button type="button" class="btn small ghost" data-cal-pick="">${t('cal.clear')}</button>
    </div>`;
}

export const focusDay = () => cal.field.querySelector(`.cal-grid [data-cal-day="${cal.focus}"]`).focus();

// Show the month of `iso` with that day focused.
export function moveCalendar(iso) {
  const [y, m] = iso.split('-').map(Number);
  Object.assign(cal, { y, m: m - 1, focus: iso });
  drawCalendar();
}

export function closeCalendar(refocus = false) {
  if (!cal) return;
  const { field } = cal;
  cal = null;
  field.querySelector('.cal')?.remove();
  field.querySelector('[data-cal-open]')?.setAttribute('aria-expanded', 'false');
  if (refocus) field.querySelector('[data-cal-open]')?.focus();
}

// Focus goes back to the calendar button, not the text box: on a phone that would bring up the keyboard.
export function pickDate(iso) {
  const { box } = cal;
  box.value = dateInput(iso);
  closeCalendar(true);
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

$('#modalForm').addEventListener('click', e => {
  // An entry marked for deletion is deleted on saving (and kept on cancelling).
  const drop = e.target.closest('[data-drop-entry]');
  if (drop) {
    const on = drop.getAttribute('aria-pressed') !== 'true';
    drop.setAttribute('aria-pressed', on);
    drop.closest('.entry').classList.toggle('dropped', on);
    return;
  }
  const open = e.target.closest('[data-cal-open]');
  if (open) return cal?.field === open.closest('.date-field') ? closeCalendar() : openCalendar(open.closest('.date-field'));
  if (!cal) return;
  const day = e.target.closest('[data-cal-day], [data-cal-pick]');
  if (day) return pickDate(day.dataset.calDay ?? day.dataset.calPick);
  const move = e.target.closest('[data-cal-move]');
  if (move) {
    const n = Number(move.dataset.calMove);
    const d = Number(cal.focus.slice(8));
    // Same day in the other month, or its last day.
    const last = new Date(Date.UTC(cal.y, cal.m + n + 1, 0)).getUTCDate();
    moveCalendar(isoOf(cal.y, cal.m + n, Math.min(d, last)));
    cal.field.querySelector(`[data-cal-move="${n}"]`).focus();
  }
});
$('#modalForm').addEventListener('keydown', e => {
  if (!cal || !cal.field.querySelector('.cal').contains(e.target)) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    return closeCalendar(true);
  }
  if (!e.target.matches('[data-cal-day]')) return;
  const [y, m, d] = cal.focus.split('-').map(Number);
  const to = {
    ArrowLeft: [y, m - 1, d - 1], ArrowRight: [y, m - 1, d + 1], ArrowUp: [y, m - 1, d - 7], ArrowDown: [y, m - 1, d + 7],
    PageUp: [y, m - 2, Math.min(d, new Date(Date.UTC(y, m - 1, 0)).getUTCDate())],
    PageDown: [y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())],
  }[e.key];
  if (!to) return;
  e.preventDefault();
  moveCalendar(isoOf(...to));
  focusDay();
});
// Escape closes the calendar, not the whole form; so does a click anywhere else.
modal.addEventListener('cancel', e => {
  if (!cal) return;
  e.preventDefault();
  closeCalendar(true);
});
document.addEventListener('pointerdown', e => { if (cal && !cal.field.contains(e.target)) closeCalendar(); });
// A press that starts inside a dialog (selecting text) and ends on its backdrop
// fires a click on the dialog itself; swallow it so the dialog stays open.
export let pressTarget = null;
document.addEventListener('pointerdown', e => { pressTarget = e.target; }, true);
document.addEventListener('click', e => {
  if (e.target instanceof HTMLDialogElement && pressTarget && pressTarget !== e.target) e.stopImmediatePropagation();
}, true);
modal.addEventListener('click', e => {
  if (e.target === modal || e.target.closest('[data-close]')) modal.close();
});
$('#deleteBtn').addEventListener('click', () => {
  const { kind, id } = formCtx;
  if (kind === 'relation') {
    if (!confirm(t('confirm.deleteRel'))) return;
    db.relations = db.relations.filter(r => r.id !== id);
    return finish(t('toast.relRemoved'));
  }
  const item = findEntity(id)?.item;
  if (!item || !confirm(t('confirm.delete', { name: item.title }))) return;
  removeEntity(kind, id);
  finish(t('toast.deleted.' + kind));
});

/* ---------- Import / export / sample ---------- */

export function planFile(kind) {
  const data = kind === 'template' ? resetProgress(db, { shift: true }) : db;
  const { goals, states, activities, relations } = data;
  return { format: PLAN_FORMAT, version: PLAN_VERSION, kind, name: currentPlan().name, exportedAt: new Date().toISOString(), goals, states, activities, relations };
}

export const planFileName = kind => {
  const name = currentPlan().name.replace(/[\\/:*?"<>|]+/g, '').trim() || t('app.file');
  return `${name}${kind === 'template' ? '-' + t('export.templateFile') : ''}-${today()}.json`;
};

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Downloads the plan, or hands it to the system share sheet where files can be shared (phones).
// A cancelled share does nothing; a failed one falls back to a download.
export async function exportPlan(kind, share = false) {
  const blob = new Blob([JSON.stringify(planFile(kind), null, 2)], { type: 'application/json' });
  const name = planFileName(kind);
  if (share) {
    try {
      await navigator.share({ files: [new File([blob], name, { type: 'application/json' })], title: currentPlan().name });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  download(blob, name);
}
export const exportJson = () => exportPlan('full');
export const canShareFiles = () => {
  try { return !!navigator.canShare?.({ files: [new File(['{}'], 'plan.json', { type: 'application/json' })] }); } catch (e) { return false; }
};

export const planExp = $('#planExport');

export function openExport() {
  closeCtxMenu();
  $('#planExportName').textContent = currentPlan().name;
  planExp.querySelector('input[name="exportKind"][value="full"]').checked = true;
  $('#exportShareBtn').hidden = !canShareFiles();
  planExp.showModal();
}
planExp.addEventListener('click', e => {
  if (e.target === planExp || e.target.closest('[data-plan-export-close]')) return planExp.close();
  const share = e.target.closest('#exportShareBtn');
  if (!share && !e.target.closest('#exportDownloadBtn')) return;
  const kind = planExp.querySelector('input[name="exportKind"]:checked').value;
  planExp.close();
  exportPlan(kind, !!share);
});

// Imports always become a new plan, so nothing is overwritten. A full copy that holds progress asks
// first whether to keep it or start fresh (someone may have shared their own plan).
export const planImp = $('#planImport');
export let pendingImport = null;

export function addImported(name, data, msg = 'toast.imported') {
  createPlan(uniqueName(name), data);
  toast(t(msg));
}

export async function importJson(file) {
  let plan;
  try {
    plan = parsePlanFile(await file.text(), file.name);
  } catch (e) {
    return toast(t(e.code === 'version' ? 'err.importVersion' : 'err.import'));
  }
  if (plan.kind === 'template' || !hasProgress(plan.data)) return addImported(plan.name, plan.data);
  pendingImport = plan;
  const counts = progressCounts(plan.data);
  const items = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `<li>${esc(tp('import.' + k, n))}</li>`).join('');
  $('#planImportBody').innerHTML = `
    <p>${t('import.lead', { name: `<strong>${esc(plan.name)}</strong>` })}</p>
    <ul class="import-progress">${items}</ul>
    <p class="hint">${t('import.hint')}</p>`;
  planImp.showModal();
}
planImp.addEventListener('close', () => { pendingImport = null; });
planImp.addEventListener('click', e => {
  const keep = e.target.closest('#importKeepBtn'), fresh = e.target.closest('#importFreshBtn');
  if (e.target === planImp || e.target.closest('[data-plan-import-close]')) return planImp.close();
  if (!(keep || fresh) || !pendingImport || !planImp.open) return;
  const { name, data } = pendingImport;
  planImp.close();
  if (keep) addImported(name, data);
  else addImported(name, resetProgress(data), 'toast.importedFresh');
});

// A plan that exercises every feature: all relationship types, sub-goals, three levels of
// sub-activities, dependency chains, and every status (not started, in progress, late, waiting, done).
// The sample plan's data (also used by the guided tour in tutorial.js).
export function sampleData() {
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoDate(x); };
  const [halfMarathon, fund, tenK, weight, course, spanish, sell, trip, bathroom, heating, exercise, weeklyKm] = Array.from({ length: 12 }, uid);
  const [fitness, savings, spending, bodyWeight, itemsSold, heatingBill, distance] = Array.from({ length: 7 }, uid);
  const a = Array.from({ length: 25 }, uid);
  // Routine check-ins on the past days `from`..yesterday that `keep(daysAgo, weekday)` picks.
  const ticks = (from, keep) => Object.fromEntries(Array.from({ length: -from }, (_, i) => from + i)
    .filter(n => keep(n, weekday(d(n)))).map(n => [d(n), 1]));
  // Strength training on Mondays and Thursdays, one session missed two weeks ago.
  const missed = Array.from({ length: 7 }, (_, i) => -14 + i).find(n => [0, 3].includes(weekday(d(n))));
  // A state's measurements from [days from today, value] pairs, oldest first; the last is its value.
  const readings = list => {
    const history = list.map(([n, v]) => ({ date: d(n), value: String(v) }));
    return { value: history.at(-1).value, date: history.at(-1).date, history };
  };
  // Numbers and dates live here; the wording (and word units) come from the active language (i18n.js → sample).
  const txt = I18N[lang].sample;
  const withText = (list, texts) => list.map((x, i) => ({ ...x, ...texts[i] }));
  const data = {
    goals: withText([
      { id: halfMarathon, unit: 'km', baseline: '5', current: '', target: '21.1', startDate: d(-30), deadline: d(90), status: 'active' },
      { id: fund, unit: '€', baseline: '1000', current: '', target: '6000', startDate: d(-60), deadline: d(240), status: 'active' },
      { id: tenK, unit: 'km', baseline: '5', current: '', target: '10', startDate: d(-30), deadline: d(30), status: 'active' },
      { id: weight, unit: 'kg', baseline: '81', current: '', target: '75', startDate: d(-30), deadline: d(120), status: 'active' },
      { id: course, baseline: '0', current: '8', target: '8', startDate: d(-90), deadline: d(-10), status: 'achieved' },
      { id: spanish, baseline: '0', current: '', target: '1500', startDate: d(30), deadline: d(300), status: 'active' },
      { id: sell, baseline: '0', current: '', target: '10', startDate: d(-40), deadline: d(-3), status: 'active' },
      { id: trip, baseline: '0', current: '', target: '14', startDate: d(60), deadline: d(400), status: 'active' },
      { id: bathroom, progress: 'activities', startDate: d(-25), deadline: d(45), status: 'active' },
      { id: heating, unit: '€', baseline: '180', current: '', target: '120', startDate: d(-60), deadline: d(180), status: 'active' },
      { id: exercise, progress: 'routines', startDate: d(-35), deadline: d(150), status: 'active' },
      { id: weeklyKm, unit: 'km', baseline: '12', current: '', target: '30', period: 'week', startDate: d(-35), deadline: d(150), status: 'active' },
    ], txt.goals),
    // Enough measurements for the graphs to tell a story: each starts before its goal (at the goal's
    // starting value on the goal's start date) and wobbles on its way, as real readings do.
    states: withText([
      { id: fitness, unit: 'km', ...readings([[-58, 4], [-51, 4.5], [-44, 4.5], [-37, 5], [-30, 5], [-23, 6], [-16, 6.5], [-9, 7.5], [-2, 8]]) },
      { id: savings, unit: '€', ...readings([[-120, 550], [-90, 800], [-75, 760], [-60, 1000], [-45, 1080], [-30, 1450], [-20, 1520], [-5, 1900]]) },
      { id: spending, unit: '€', ...readings([[-185, 2450], [-155, 2380], [-125, 2520], [-95, 2300], [-65, 2250], [-35, 2100], [-5, 2000]]) },
      { id: bodyWeight, unit: 'kg', ...readings([[-63, 82.4], [-56, 82.1], [-49, 82.3], [-42, 81.8], [-35, 81.4], [-30, 81], [-23, 80.3], [-16, 79.6], [-9, 78.9], [-1, 78]]) },
      { id: itemsSold, ...readings([[-38, 0], [-33, 1], [-27, 2], [-20, 2], [-15, 3], [-11, 4], [-7, 5], [-4, 6]]) },
      { id: heatingBill, unit: '€', ...readings([[-150, 195], [-120, 188], [-90, 184], [-60, 180], [-30, 172], [-5, 165]]) },
      { id: distance, unit: 'km', cumulative: true, scale: 'week', entries: [], value: '', date: '', history: [] },
    ], txt.states),
    activities: withText([
      { id: a[0], status: 'done', startDate: d(-30), dueDate: d(-20) },   // running shoes
      { id: a[1], status: 'doing', startDate: d(-30), dueDate: d(88) },   // training plan
      { id: a[2], status: 'todo', startDate: d(-3), dueDate: d(5) },     // register for the race
      { id: a[3], status: 'todo', startDate: d(21), dueDate: d(28) },    // 10 km test race
      { id: a[4], status: 'done', startDate: d(-60), dueDate: d(-55) },   // automate savings
      { id: a[5], status: 'todo', startDate: d(-14), dueDate: d(-1) },    // cancel subscriptions (late)
      { id: a[6], status: 'todo', startDate: d(-20), dueDate: d(60), repeat: { every: 1, unit: 'week', times: 5 },   // cook at home (routine)
        checkins: ticks(-20, (n, wd) => wd < 5 && n % 9 !== 0) },
      { id: a[7], status: 'doing', startDate: d(-30), dueDate: d(26) },   // weeks 1–8
      { id: a[8], status: 'todo', startDate: d(27), dueDate: d(88) },    // weeks 9–16
      { id: a[9], status: 'todo', dueDate: d(75) },    // long run
      { id: a[10], status: 'done', startDate: d(-14), dueDate: d(-10) },  // review statements
      { id: a[11], status: 'todo', startDate: d(-9), dueDate: d(-1) },   // cancel streaming (late)
      { id: a[12], status: 'doing', startDate: d(-25), dueDate: d(60) },  // cut evening snacks
      { id: a[13], status: 'doing', startDate: d(-15), dueDate: d(10) },  // list items for sale (a list, the first one done)
      { id: a[14], status: 'done', startDate: d(-90), dueDate: d(-12) },  // finish course modules
      { id: a[15], status: 'todo', startDate: d(30), dueDate: d(35) },   // choose a language app
      { id: a[16], status: 'done', startDate: d(-25), dueDate: d(-15) },  // contractor quotes
      { id: a[17], status: 'done', startDate: d(-12), dueDate: d(-4) },   // remove old tiles
      { id: a[18], status: 'doing', startDate: d(-3), dueDate: d(30) },   // bathroom works
      { id: a[19], status: 'doing', startDate: d(-3), dueDate: d(8) },    // new plumbing
      { id: a[20], status: 'todo', startDate: d(9), dueDate: d(20) },    // tiling
      { id: a[21], status: 'todo', startDate: d(21), dueDate: d(30) },   // fittings
      { id: a[22], status: 'todo', startDate: d(40), dueDate: d(60) },   // insulate the attic
      { id: a[23], status: 'todo', startDate: d(-35), repeat: { every: 1, unit: 'week', times: 3 },   // run 3 times a week (routine)
        checkins: ticks(-35, (n, wd) => (n > -22 && n <= -15 ? wd === 2 : [1, 3, 5].includes(wd))) },   // one lean week
      { id: a[24], status: 'todo', startDate: d(-28), repeat: { every: 1, unit: 'week', days: [0, 3] },   // strength training (routine)
        checkins: ticks(-28, (n, wd) => [0, 3].includes(wd) && n !== missed) },   // a routine list
    ], txt.activities),
    relations: [],
  };
  data.activities[13].list = txt.activities[13].list.map((text, i) => ({ id: uid(), text, done: i === 0 }));
  // Strength training is a routine list: every ticked day has all its exercises ticked.
  const strength = data.activities[24];
  strength.list = txt.activities[24].list.map(text => ({ id: uid(), text, done: false }));
  strength.listDays = Object.fromEntries(Object.keys(strength.checkins).map(day => [day, Object.fromEntries(strength.list.map(i => [i.id, 1]))]));
  // Each run adds its kilometres to the weekly distance, a little longer as the weeks go by.
  const runs = data.activities.find(x => x.id === a[23]), km = data.states.find(x => x.id === distance);
  km.entries = Object.keys(runs.checkins).sort().map((date, i) => ({ id: uid(), date, amount: String(Math.round((4.5 + (dayNum(date) - dayNum(d(-35))) * 0.08 + (i % 3 === 2 ? 2 : 0)) * 2) / 2), routine: a[23] }));
  refreshTotal(km);
  const rel = (from, type, to) => data.relations.push({ id: uid(), from, to, type });
  // Goals: two sub-goals under the half marathon, a late sub-goal under the fund,
  // and a trip that waits for two other goals.
  rel(tenK, 'subgoal', halfMarathon); rel(weight, 'subgoal', halfMarathon); rel(sell, 'subgoal', fund);
  rel(fund, 'depends', course); rel(trip, 'depends', spanish); rel(trip, 'depends', fund);
  // Current states
  rel(fitness, 'measures', halfMarathon); rel(fitness, 'measures', tenK); rel(savings, 'measures', fund);
  rel(bodyWeight, 'measures', weight); rel(itemsSold, 'measures', sell);
  rel(heatingBill, 'measures', heating);
  rel(distance, 'measures', weeklyKm); rel(weeklyKm, 'subgoal', halfMarathon); rel(a[23], 'improves', distance);
  // Activities → goals
  rel(a[0], 'contributes', halfMarathon); rel(a[1], 'contributes', halfMarathon); rel(a[1], 'contributes', tenK);
  rel(a[2], 'contributes', halfMarathon); rel(a[3], 'contributes', tenK); rel(a[4], 'contributes', fund);
  rel(a[5], 'contributes', fund); rel(a[6], 'contributes', fund); rel(a[12], 'contributes', weight);
  rel(a[13], 'contributes', sell); rel(a[14], 'contributes', course); rel(a[15], 'contributes', spanish);
  rel(a[16], 'contributes', bathroom); rel(a[17], 'contributes', bathroom); rel(a[18], 'contributes', bathroom);
  rel(a[22], 'contributes', heating);
  rel(a[23], 'contributes', exercise); rel(a[24], 'contributes', exercise);
  rel(a[23], 'improves', fitness);
  // Activities → current states
  rel(a[1], 'improves', fitness); rel(a[5], 'improves', spending); rel(a[6], 'improves', spending);
  rel(a[12], 'improves', bodyWeight); rel(a[13], 'improves', itemsSold);
  rel(a[22], 'improves', heatingBill);
  // Training plan → two phases → a key session in phase two (three levels deep).
  rel(a[7], 'subactivity', a[1]); rel(a[8], 'subactivity', a[1]); rel(a[9], 'subactivity', a[8]);
  rel(a[10], 'subactivity', a[5]); rel(a[11], 'subactivity', a[5]);
  rel(a[19], 'subactivity', a[18]); rel(a[20], 'subactivity', a[18]); rel(a[21], 'subactivity', a[18]);
  // Dependency chains
  rel(a[1], 'depends', a[0]); rel(a[8], 'depends', a[7]); rel(a[3], 'depends', a[7]); rel(a[11], 'depends', a[10]);
  rel(a[17], 'depends', a[16]); rel(a[18], 'depends', a[16]); rel(a[20], 'depends', a[19]); rel(a[21], 'depends', a[20]);
  return data;
}

export function loadSample() {
  createPlan(uniqueName(t('plan.sampleName')), sampleData());
  toast(t('toast.sample'));
}

/* ---------- Templates (core/templates): ready-made plans to start from ---------- */

export function useTemplate(tpl) {
  const name = uniqueName(tplText(tpl.name));
  createPlan(name, templateData(tpl));
  toast(t('toast.template', { name }));
}

// How long a template runs: weeks up to three months, then months, then whole years.
export function tplSpan(tpl) {
  const days = Math.max(...tpl.goals.map(g => g.end));
  if (days <= 91) return tp('tpl.weeks', Math.round(days / 7));
  const months = Math.round(days / 30.44);
  return months % 12 ? tp('tpl.months', months) : tp('tpl.years', months / 12);
}

export const tplDialog = $('#templates');
export let tplArea = '';

export function tplCard(tpl) {
  const routines = tpl.activities.filter(a => a.repeat);
  const steps = tpl.activities.filter(a => !a.repeat && !a.parent);
  const counts = [tp('tpl.goals', tpl.goals.length), tpl.states.length && tp('tpl.states', tpl.states.length),
    tp('tpl.activities', tpl.activities.length - routines.length), routines.length && tp('tpl.routines', routines.length)].filter(Boolean);
  const list = (label, items) => (items.length ? `<p><strong>${label}</strong></p><ul>${items.map(x => `<li>${esc(tplText(x.title))}</li>`).join('')}</ul>` : '');
  return `<article class="tpl-card">
    <div class="tpl-head"><h3>${esc(tplText(tpl.name))}</h3><span class="tag tpl-level ${tpl.level}">${t('tpl.level.' + tpl.level)}</span></div>
    <p class="tpl-about">${esc(tplText(tpl.about))}</p>
    <p class="tpl-meta">${[tplSpan(tpl), ...counts].map(x => `<span>${x}</span>`).join('')}</p>
    <details class="tpl-inside"><summary>${t('tpl.inside')}</summary>
      ${list(t('tpl.goalList'), tpl.goals)}${list(t('tpl.stepList'), steps)}${list(t('tpl.routineList'), routines)}</details>
    <button type="button" class="btn small primary" data-template="${tpl.id}">${t('tpl.use')}</button>
  </article>`;
}

// Templates by area (starter ones first), with chips to show a single area.
export function renderTemplates() {
  const chip = (area, label) => `<button type="button" class="chip ${tplArea === area ? 'active' : ''}" data-tpl-area="${area}" aria-pressed="${tplArea === area}">${label}</button>`;
  $('#templateAreas').innerHTML = chip('', t('tpl.area.all')) + TPL_AREAS.map(a => chip(a, t('tpl.area.' + a))).join('');
  const levels = ['starter', 'ambitious'];
  $('#templateList').innerHTML = TPL_AREAS.filter(a => !tplArea || a === tplArea).map(area => {
    const list = TEMPLATES.filter(x => x.area === area).sort((a, b) => levels.indexOf(a.level) - levels.indexOf(b.level));
    return `<section class="tpl-area"><h3>${t('tpl.area.' + area)}</h3><div class="tpl-grid">${list.map(tplCard).join('')}</div></section>`;
  }).join('');
}

export function openTemplates() {
  closeCtxMenu();
  if (settings.open) settings.close();
  renderTemplates();
  tplDialog.showModal();
  tplDialog.querySelector('.modal-body').scrollTop = 0;
}
tplDialog.addEventListener('click', e => {
  if (e.target === tplDialog || e.target.closest('[data-templates-close]')) return tplDialog.close();
  const area = e.target.closest('[data-tpl-area]');
  if (area) { tplArea = area.dataset.tplArea; renderTemplates(); return; }
  const use = e.target.closest('[data-template]');
  if (!use) return;
  tplDialog.close();
  useTemplate(TEMPLATES.find(x => x.id === use.dataset.template));
});

/* ---------- Settings (gear, top right): plan, language, theme, display options, data, help ---------- */

export const settings = $('#settings');

// Display options shown as switches: how to read each one and what changing it does.
export const SETTINGS = {
  help: { get: () => ui.help, set: v => setHelp(v) },
  hideDone: { get: () => ui.hideDone, set: v => setToggle('hideDone', v) },
  tlDeps: { get: () => ui.tlDeps, set: v => setToggle('tlDeps', v) },
  planBadges: { get: () => ui.planBadges, set: v => setToggle('planBadges', v) },
  navCollapsed: { get: () => ui.navCollapsed, set: v => setNavCollapsed(v) },
};

// A remembered on/off display option (hideDone, tlDeps, planBadges).
export function setToggle(key, on) {
  ui[key] = on;
  prefs.set(key, on);
  requestRender();
}

export function renderSettings() {
  settings.querySelectorAll('[data-setting]').forEach(box => (box.checked = SETTINGS[box.dataset.setting].get()));
  renderThemeSetting();
}

$('#settingsBtn').addEventListener('click', () => {
  closeCtxMenu();
  renderSettings();
  settings.showModal();
});
settings.addEventListener('click', e => {
  if (e.target === settings || e.target.closest('[data-settings-close]')) settings.close();
});
settings.addEventListener('change', e => {
  const key = e.target.dataset.setting;
  if (key) SETTINGS[key].set(e.target.checked);
});
$('#exportBtn').addEventListener('click', openExport);
$('#importInput').addEventListener('change', e => {
  if (e.target.files[0]) { importJson(e.target.files[0]); settings.close(); }
  e.target.value = '';
});
$('#sampleBtn').addEventListener('click', () => { settings.close(); loadSample(); });
$('#templatesBtn').addEventListener('click', openTemplates);

/* ---------- Collapsible sidebar (desktop): only the icons stay visible ---------- */

export function setNavCollapsed(on) {
  ui.navCollapsed = on;
  prefs.set('navCollapsed', on);
  applyNavCollapsed();
  requestRender(); // graphs are drawn at the view's width
}

export function applyNavCollapsed() {
  const on = ui.navCollapsed;
  $('.app').classList.toggle('nav-collapsed', on);
  const b = $('#navToggle');
  b.setAttribute('aria-expanded', !on);
  b.querySelector('span').textContent = t(on ? 'nav.expand' : 'nav.collapse');
  b.title = t(on ? 'nav.expand' : 'nav.collapse');
}

$('#navToggle').addEventListener('click', () => setNavCollapsed(!ui.navCollapsed));

/* ---------- Map context menu: right-click, long-press, or the context-menu key ---------- */

export const ctxMenu = $('#ctxMenu');
// Map boxes and timeline rows both act as item "nodes".
export const NODE_SEL = '[data-map-node],[data-tl-node]';
// The menu also opens on the cards and rows of the other views (on a chart, only on its heading).
export const MENU_SEL = `${NODE_SEL},[data-ctx-item]`;
export const nodeId = el => el?.dataset.mapNode || el?.dataset.tlNode || el?.dataset.ctxItem;
export const LONG_PRESS_MS = 500;

export function ctxOptions(kind, item) {
  const opt = (act, label, extra = {}) => ({ act, label, ...extra });
  if (kind === 'vision') return [
    opt('edit', t('btn.edit')), ...(ui.view === 'map' ? [opt('highlight', t('ctx.highlight'))] : []), '-', opt('add:vision:parents', t('ctx.addSubvision')),
    '-', ...SHOW_IN.vision.filter(v => v !== ui.view).map(v => opt('show:' + v, t('ctx.showInView', { view: t('nav.' + v) }), { icon: v })),
    ...(ui.view === 'map' ? [opt('link', t('ctx.link'))] : []), '-', opt('delete', t('btn.delete'), { danger: true }),
  ];
  // Highlighting links and showing one goal only mean something where links are drawn.
  const options = [opt('edit', t('btn.edit')), ...(selectsInView() ? [opt('highlight', t('ctx.highlight'))] : [])];
  if (kind === 'goal') {
    options.push(
      ...(selectsInView() ? [opt('focus', t('ctx.focus'))] : []),
      '-',
      item.status === 'achieved' ? opt('status:active', t('ctx.reactivate')) : opt('status:achieved', t('ctx.markAchieved')),
      '-',
      opt('add:goal:subgoal', t('ctx.addSubgoal')),
      opt('add:activity:contributes', t('ctx.addActivityGoal')),
    );
  } else if (isRoutine(item)) {
    if (runsOn(item, today())) options.push('-', opt('checkin', t('rt.doneTodayShort'), { checked: checkedOn(item, today()) }));
  } else if (kind === 'activity') {
    options.push(
      '-',
      ...ACTIVITY_STATUS.map(s => opt('status:' + s, t('activity.' + s), { checked: item.status === s })),
      '-',
      opt('add:activity:subactivity', t('ctx.addSubactivity')),
    );
  } else {
    options.push('-', opt('value', t(isCumulative(item) ? 'ctx.addAmount' : 'ctx.addValue')), opt('add:activity:improves', t('ctx.addActivityState')));
  }
  // "Show in…" opens in place onto the other views, each with its name and icon from the navigation
  // (the full name is the accessible name and tooltip); with only one, it is offered directly.
  const views = SHOW_IN[kind].filter(v => v !== ui.view && (v !== 'graphs' || hasGraph(item)));
  const showOpt = v => opt('show:' + v, t('nav.' + v), { icon: v, name: t('ctx.showInView', { view: t('nav.' + v) }) });
  if (views.length > 1) options.push('-', { label: t('ctx.showIn'), sub: views.map(showOpt) });
  else if (views.length) options.push('-', opt('show:' + views[0], t('ctx.showInView', { view: t('nav.' + views[0]) }), { icon: views[0] }));
  options.push(opt('link', t('ctx.link')), '-', opt('delete', t('btn.delete'), { danger: true }));
  return options;
}

// The views each kind of item appears in (graphs: only states with measurements or amounts, and
// routines with check-ins).
export const SHOW_IN = { vision: ['visions', 'map'], goal: ['goals', 'map', 'timeline'], activity: ['activities', 'map', 'timeline', 'graphs'], state: ['states', 'map', 'graphs'] };

// Switches to another view with the item selected there (map, timeline) or its card brought into
// view, first changing the filters there that would hide it (setView clears the search).
export function showIn(view, id) {
  const { kind, item } = findEntity(id);
  revealIn(view, kind, item);
  prefs.set('category', ui.category);
  if (view === 'map' || view === 'timeline') Object.assign(ui, { mapSelected: id, mapRel: null });
  setView(view);
  const el = view === 'map' ? $(`[data-map-node="${id}"]`)
    : view === 'timeline' ? $(`[data-tl-node="${id}"]`)
    : view === 'graphs' ? $(`[data-gr="${id}"]`) : $(`.card[data-open="${id}"]`);
  if (!el) return;
  // In the timeline, the bar (or milestone) rather than the start of the row.
  (el.querySelector('.tl-bar, .tl-milestone') || el).scrollIntoView({ block: 'center', inline: 'center' });
  if (el.tabIndex >= 0) return el.focus({ preventScroll: true });
  el.classList.add('flash');
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
}

// Changes only the filters that hide the item in a view: the goal status shown (to all), the done
// items hidden (shown again), the goal picked (to all), the category (to one the item belongs to –
// a goal's own, then those of the goals it is linked to – or else to all) and, in the timeline,
// the folded goals it is under.
export function revealIn(view, kind, item) {
  // On the map every vision shows once no goal or category is picked and none are hidden.
  if (kind === 'vision') {
    if (view === 'map') { Object.assign(ui, { mapGoal: '', category: '' }); if (ui.hideVisions) { ui.hideVisions = false; prefs.set('hideVisions', false); } }
    return;
  }
  if (view === 'goals') {
    if (ui.goalFilter !== 'all' && item.status !== ui.goalFilter) ui.goalFilter = 'all';
    if (!inCategory(item)) ui.category = item.category || '';
    return;
  }
  const field = GOAL_FILTERS[view === 'activities' ? 'activity' : view];
  if (!field) return;
  const done = kind === 'goal' || view === 'activities' ? isComplete(kind, item) : item.status === 'done';
  if (ui.hideDone && view !== 'graphs' && kind !== 'state' && done) { ui.hideDone = false; prefs.set('hideDone', false); }
  const shows = () => { const s = scopeFor(ui[field]); return !s || s[kind].has(item.id); };
  if (!shows()) ui[field] = '';
  if (!shows()) {
    const own = kind === 'goal' ? [item.category] : relsFrom(item.id).map(r => findEntity(r.to)?.item.category);
    const holds = c => db.goals.some(g => g.category === c && goalScope(g.id)[kind].has(item.id));
    ui.category = [...own, ...categories()].find(c => c && holds(c)) || '';
  }
  if (view !== 'timeline') return;
  // Unfold only what hides it: every fold is kept that still leaves it shown.
  const scope = scopeFor(ui.timelineGoal), folded = tlCollapsed();
  const shown = set => timelineRows(scope, set).some(r => r.item?.id === item.id);
  if (!shown(folded) && shown(new Set())) setTlCollapsed([...folded].reduce((keep, k) => (shown(new Set([...keep, k])) ? keep.add(k) : keep), new Set()));
}

export function openCtxMenu(id, x, y, byKey = false) {
  const ent = findEntity(id);
  if (!ent) return;
  Object.assign(ctxMenu.dataset, { id, rel: '', add: '' });
  ctxMenu.setAttribute('aria-label', t('ctx.label', { name: ent.item.title }));
  showCtxMenu(ent.kind, t('kind.' + ent.kind), ent.item.title, ctxOptions(ent.kind, ent.item), x, y, byKey);
}

export let ctxOpenedAt = 0;

// Fills the menu – a heading with a tag and a name (none without a title), then its options – and shows it at x, y, kept on screen.
// An option with a sub list is a parent that opens its items in place, below it (see toggleCtxSub).
// Opened from the keyboard, its first item takes focus; opened by a finger or the mouse, the menu itself
// does, so no item is marked under the finger (the arrow keys still reach them).
export function showCtxMenu(tagClass, tag, title, options, x, y, byKey = false) {
  ctxOpenedAt = performance.now();
  ctxMenu.innerHTML = (title ? `<div class="ctx-head"><span class="tag ${tagClass}">${tag}</span><strong title="${esc(title)}">${esc(title)}</strong></div>` : '') +
    options.map(o => o === '-' ? '<hr>' : o.sub ?
      `<button type="button" tabindex="-1" data-ctx-sub role="menuitem" aria-haspopup="true" aria-expanded="false" aria-controls="ctxSub">${esc(o.label)}<svg class="ctx-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>` +
      `<div class="ctx-sub" id="ctxSub" role="group" aria-label="${esc(o.label)}" hidden>${o.sub.map(ctxButton).join('')}</div>` : ctxButton(o)).join('');
  ctxMenu.hidden = false;
  const { width, height } = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
  (byKey ? ctxMenu.querySelector('button') : ctxMenu).focus();
}

// One item; a view's icon goes before its name in the "Show in…" list, after the words otherwise.
export const ctxButton = o => {
  const icon = o.icon ? $(`.nav-item[data-view="${o.icon}"] svg`).outerHTML : '';
  return `<button type="button" tabindex="-1" data-ctx="${o.act}" class="${o.danger ? 'danger' : ''}" role="${o.checked === undefined ? 'menuitem' : 'menuitemradio'}"${o.checked === undefined ? '' : ` aria-checked="${o.checked}"`}${o.name ? ` aria-label="${esc(o.name)}" title="${esc(o.name)}"` : ''}>${o.name ? icon : ''}${esc(o.label)}${o.name ? '' : icon}</button>`;
};

// Opens (or closes) the parent's items in place; the menu then moves up as far as it needs to stay
// on screen, and scrolls to the opened items when it is taller than the screen.
export function toggleCtxSub(open) {
  const parent = ctxMenu.querySelector('[data-ctx-sub]'), sub = $('#ctxSub');
  sub.hidden = !open;
  parent.setAttribute('aria-expanded', open);
  const r = ctxMenu.getBoundingClientRect();
  ctxMenu.style.top = `${Math.max(8, Math.min(r.top, innerHeight - r.height - 8))}px`;
  const below = sub.getBoundingClientRect().bottom - ctxMenu.getBoundingClientRect().bottom + 6;
  if (open && below > 0) ctxMenu.scrollTop += below;
}

export function closeCtxMenu(refocus = false) {
  if (ctxMenu.hidden) return;
  ctxMenu.hidden = true;
  if (refocus) $(ctxMenu.dataset.add ? '#addBtn' : ctxMenu.dataset.rel ? `[data-rel-edit="${ctxMenu.dataset.rel}"]` : `[data-map-node="${ctxMenu.dataset.id}"], [data-tl-node="${ctxMenu.dataset.id}"]`)?.focus();
}

// A relationship line's menu (long-press, right-click or the menu key): it selects the line and
// offers what the selection row below offers.
export function openRelMenu(relId, x, y, byKey = false) {
  const r = db.relations.find(x => x.id === relId) || visionRel(relId);
  if (!r) return;
  Object.assign(ui, { mapRel: relId, mapSelected: null });
  render();
  Object.assign(ctxMenu.dataset, { id: '', rel: relId, add: '' });
  ctxMenu.setAttribute('aria-label', t('map.relLabel', { rel: relText(r) }));
  showCtxMenu('', t('kind.relation'), relText(r), [
    { act: 'rel-edit', label: t('btn.edit') }, { act: 'rel-remove', label: t('btn.remove'), danger: true }, { act: 'rel-deselect', label: t('btn.deselect') },
  ], x, y, byKey);
}

// The menu of a relationship line, or else of an item.
export const openMenuAt = (line, node, x, y) => (line ? openRelMenu(line.dataset.relEdit, x, y) : openCtxMenu(nodeId(node), x, y));

export function runRelAction(act, relId) {
  closeCtxMenu();
  if (act === 'rel-edit') return openForm('relation', relId);
  if (act === 'rel-remove') return removeRelation(relId);
  ui.mapRel = null;
  render();
}

export function runCtxAction(act, id) {
  const ent = findEntity(id);
  closeCtxMenu();
  if (!ent) return;
  const { kind, item } = ent;
  const [verb, arg, type] = act.split(':');
  if (verb === 'edit') return openForm(kind, id);
  if (verb === 'checkin') return toggleCheckin(id, today());
  // The popup opens by what the menu was opened on: a card, a box on the map, or a graph's heading (not the tall graph).
  if (verb === 'value') { const at = $(`[data-ctx-item="${id}"], [data-map-node="${id}"]`); return openStateValue(id, at?.querySelector(':scope.gr-card > .card-head') || at || viewEl); }
  if (verb === 'highlight') { ui.mapSelected = id; return render(); }
  if (verb === 'show') return showIn(arg, id);
  if (verb === 'focus') {
    Object.assign(ui, { [ui.view === 'timeline' ? 'timelineGoal' : 'mapGoal']: id, mapRefocus: true });
    if (!inCategory(item)) ui.category = '';
    return render();
  }
  if (verb === 'add') return openForm(arg, null, { [type]: [id], category: kind === 'goal' ? item.category : '' });
  if (verb === 'link') return ui.view === 'map' ? startMapLink(id) : openForm('relation', null, { from: id });
  if (verb === 'status') {
    item.status = arg;
    save();
    render();
    const waits = kind === 'activity' && arg === 'done' ? blockers(item) : [];
    return toast(waits.length ? t('acts.notDone', { name: waits[0].title }) : t('ctx.statusSet', { s: t(`${kind}.${arg}`) }));
  }
  if (verb === 'delete' && confirm(t('confirm.delete', { name: item.title }))) {
    removeEntity(kind, id);
    Object.values(GOAL_FILTERS).forEach(k => { if (ui[k] === id) ui[k] = ''; });
    save();
    render();
    toast(t('toast.deleted.' + kind));
  }
}

viewEl.addEventListener('contextmenu', e => {
  // Phones may report a still finger of a pinch as a long-press.
  if (tlDrag?.touch || pinch) return e.preventDefault();
  const node = e.target.closest(MENU_SEL), line = e.target.closest('[data-rel-edit]');
  if (!node && !line) {
    // The map's empty space offers what the Add button does.
    if (ui.view === 'map' && e.target.closest('.map-wrap')) { e.preventDefault(); openAddMenu(e.clientX, e.clientY, false); }
    return;
  }
  e.preventDefault();
  openMenuAt(line, node, e.clientX, e.clientY);
});

// Long-press for touch screens (iOS Safari never fires contextmenu).
export let press = null;
viewEl.addEventListener('pointerdown', e => {
  const node = e.target.closest(MENU_SEL), line = e.target.closest('[data-rel-edit]');
  if ((!node && !line) || e.pointerType === 'mouse' || e.target.closest('[data-tl-drag]')) return;
  // A second finger (a pinch starting) must not leave the first one's wait running.
  if (press) clearTimeout(press.timer);
  const p = { x: e.clientX, y: e.clientY, fired: false };
  p.timer = setTimeout(() => { p.fired = true; openMenuAt(line, node, p.x, p.y + 12); }, LONG_PRESS_MS);
  press = p;
});
viewEl.addEventListener('pointermove', e => {
  if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; }
});
['pointerup', 'pointercancel'].forEach(type => viewEl.addEventListener(type, () => press && clearTimeout(press.timer)));
// The click that ends a long-press must not also toggle highlighting or hit a menu item. Phones often
// send no click at all when the finger lifts, so a new touch ends the wait; otherwise the first tap on
// the menu would be swallowed instead.
document.addEventListener('click', e => {
  if (press?.fired) { e.stopPropagation(); e.preventDefault(); }
  press = null;
}, true);
document.addEventListener('pointerdown', () => { if (press?.fired) press = null; }, true);

/* ---------- Zoom: ctrl + scroll, pinch, trackpad gestures ---------- */
// The map scales as a whole; the timeline and the graphs only stretch their time axis. All keep the point
// under the pointer (or between the fingers) in place.

export function zoomMap(scale, cx, cy) {
  const wrap = $('.map-wrap'), svg = wrap?.querySelector('svg');
  const s0 = ui.mapScale, s = clamp(scale, MAP.MIN_SCALE, MAP.MAX_SCALE);
  if (!svg || s === s0) return;
  const before = svg.getBoundingClientRect();
  const u = (cx - before.left) / s0, v = (cy - before.top) / s0;
  const [, , width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
  svg.setAttribute('width', width * s);
  svg.setAttribute('height', height * s);
  const after = svg.getBoundingClientRect();
  wrap.scrollLeft += after.left + u * s - cx;
  wrap.scrollTop += after.top + v * s - cy;
  ui.mapScale = s;
  prefs.set('mapScale', s);
  $('.zoom-pct').textContent = `${Math.round(s * 100)} %`;
}

export function zoomTimeline(factor, cx) {
  const p0 = ui.tlPx, p = clamp(p0 * factor, TL.MIN, TL.MAX);
  if (!$('.tl-scale') || p === p0) return;
  // Anchor on the day under the pointer, but never on the sticky label column.
  const at = () => ({ left: $('.tl-scale').getBoundingClientRect().left, from: Number($('.tl-scroll').dataset.from) });
  const x = Math.max(cx, $('.tl-corner').getBoundingClientRect().right);
  const b = at(), day = (x - b.left) / p0 + b.from;
  ui.tlPx = p;
  prefs.set('tlPx', p);
  render();
  const a = at();
  $('.tl-scroll').scrollLeft += a.left + (day - a.from) * p - x;
}

// Only that graph is redrawn, into the same element, so a pinch that started on it keeps going.
export function zoomGraph(plot, factor, cx) {
  const id = plot.closest('[data-gr]')?.dataset.gr, c = grCharts[id], item = id && findEntity(id)?.item;
  if (!c || !item) return;
  const z0 = clamp(ui.grZoom[id] || 1, ...c.zoom), z = clamp(z0 * factor, ...c.zoom);
  if (z === z0) return;
  const svg = plot.querySelector('svg'), w0 = Number(svg.getAttribute('width'));
  const u = (cx - svg.getBoundingClientRect().left - GR.L) / (w0 - GR.L - GR.R);
  ui.grZoom[id] = z;
  const fresh = document.createElement('div');
  fresh.innerHTML = graphFor(item, grDrawW);
  const next = fresh.querySelector('.gr-plot');
  plot.className = next.className;
  plot.replaceChildren(...next.childNodes);
  const now = plot.querySelector('svg'), w = Number(now.getAttribute('width'));
  plot.scrollLeft += now.getBoundingClientRect().left + GR.L + u * (w - GR.L - GR.R) - cx;
}

// Coalesce bursts of wheel / touch events into one zoom per frame.
export let zoomQueue = null;
export function queueZoom(wrap, factor, cx, cy) {
  if (zoomQueue) return Object.assign(zoomQueue, { factor: zoomQueue.factor * factor, cx, cy });
  zoomQueue = { wrap, factor, cx, cy };
  requestAnimationFrame(() => {
    const z = zoomQueue;
    zoomQueue = null;
    if (z.wrap.classList.contains('map-wrap')) zoomMap(ui.mapScale * z.factor, z.cx, z.cy);
    else if (z.wrap.classList.contains('gr-plot')) zoomGraph(z.wrap, z.factor, z.cx);
    else zoomTimeline(z.factor, z.cx);
  });
}
export const ZOOM_SEL = '.map-wrap, .tl-scroll, .gr-plot';

// Ctrl + wheel; trackpad pinch in Chrome, Edge and Firefox also arrives as ctrl + wheel.
viewEl.addEventListener('wheel', e => {
  const wrap = e.ctrlKey && e.target.closest(ZOOM_SEL);
  if (!wrap) return;
  e.preventDefault();
  const dy = e.deltaY * ([1, 16, 400][e.deltaMode] ?? 1); // deltaMode: pixels, lines or pages
  queueZoom(wrap, Math.exp(-clamp(dy, -100, 100) * 0.0025), e.clientX, e.clientY);
}, { passive: false });

// Two-finger pinch on touch screens. Touch events keep going to the element each finger started on,
// even after re-rendering the timeline detaches it, so the handlers are attached to those elements.
export let pinch = null;
export const touchGap = ([a, b]) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
export function pinchMove(e) {
  if (!pinch || e.touches.length !== 2) return;
  if (e.cancelable) e.preventDefault();
  const gap = touchGap(e.touches), [a, b] = e.touches;
  queueZoom(pinch.wrap, gap / pinch.gap, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
  pinch.gap = gap;
}
export function pinchEnd(e) {
  if (!pinch || e.touches.length >= 2) return;
  pinch.targets.forEach(el => {
    el.removeEventListener('touchmove', pinchMove);
    ['touchend', 'touchcancel'].forEach(type => el.removeEventListener(type, pinchEnd));
  });
  pinch = null;
}
viewEl.addEventListener('touchstart', e => {
  const wrap = e.touches.length === 2 && e.target.closest(ZOOM_SEL);
  if (!wrap) return;
  pinch = { wrap, gap: touchGap(e.touches), targets: new Set([...e.touches].map(x => x.target)) };
  pinch.targets.forEach(el => {
    el.addEventListener('touchmove', pinchMove, { passive: false });
    ['touchend', 'touchcancel'].forEach(type => el.addEventListener(type, pinchEnd));
  });
  if (press) { clearTimeout(press.timer); press = null; }
  // Nor does a pinch pick up the selected timeline bar.
  if (tlDrag && !tlDrag.moved) endTlDrag(false);
}, { passive: true });

// One-finger zoom on touch screens: tap, then touch again and drag – down zooms in, up zooms out,
// around the point first tapped. A second tap that doesn't move stays a double-tap (which edits).
export const TAP_ZOOM = { GAP_MS: 300, NEAR: 30, START: 8, RATE: 0.01 };
export let lastTap = null, tapZoom = null;
export function tapZoomMove(e) {
  if (!tapZoom || e.touches.length !== 1) return;
  // From the first move on, so the drag never starts scrolling the view instead.
  if (e.cancelable) e.preventDefault();
  const y = e.touches[0].clientY;
  if (!tapZoom.moved) {
    if (Math.abs(y - tapZoom.y0) < TAP_ZOOM.START) return;
    tapZoom.moved = true;
    if (press) { clearTimeout(press.timer); press = null; }
    if (tlDrag && !tlDrag.moved) endTlDrag(false);
  }
  queueZoom(tapZoom.wrap, Math.exp((y - tapZoom.y) * TAP_ZOOM.RATE), tapZoom.x, tapZoom.y0);
  tapZoom.y = y;
}
export function tapZoomEnd() {
  const z = tapZoom;
  if (!z) return;
  z.target.removeEventListener('touchmove', tapZoomMove);
  ['touchend', 'touchcancel'].forEach(type => z.target.removeEventListener(type, tapZoomEnd));
  // Keep it until the click the lifted finger may produce has been swallowed (see below).
  setTimeout(() => { if (tapZoom === z) tapZoom = null; });
}
export let touchDown = null; // where and when the current one-finger touch began
viewEl.addEventListener('touchstart', e => {
  const t = e.touches.length === 1 && e.touches[0], prev = lastTap;
  touchDown = t && { x: t.clientX, y: t.clientY, t: e.timeStamp };
  lastTap = null;
  const wrap = t && e.target.closest(ZOOM_SEL);
  if (!wrap || !prev || e.timeStamp - prev.t > TAP_ZOOM.GAP_MS || Math.hypot(t.clientX - prev.x, t.clientY - prev.y) > TAP_ZOOM.NEAR) return;
  tapZoom = { wrap, target: e.target, x: prev.x, y0: t.clientY, y: t.clientY, moved: false };
  e.target.addEventListener('touchmove', tapZoomMove, { passive: false });
  ['touchend', 'touchcancel'].forEach(type => e.target.addEventListener(type, tapZoomEnd));
}, { passive: true });
// A tap: one finger, down and up quickly, without moving. Only a tap can start a tap-and-drag.
viewEl.addEventListener('touchend', e => {
  const t = e.changedTouches[0], down = touchDown;
  touchDown = null;
  const tap = down && t && !e.touches.length && !tapZoom && e.timeStamp - down.t < TAP_ZOOM.GAP_MS && Math.hypot(t.clientX - down.x, t.clientY - down.y) < TAP_ZOOM.START;
  lastTap = tap ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
});

// Click and drag with the mouse pans the map, the timeline and a zoomed graph (touch screens pan natively).
export let pan = null;
viewEl.addEventListener('pointerdown', e => {
  const wrap = e.pointerType === 'mouse' && e.button === 0 && !e.target.closest('[data-map-node],[data-tl-drag]') && e.target.closest(ZOOM_SEL);
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  if (e.clientX - r.left - wrap.clientLeft >= wrap.clientWidth || e.clientY - r.top - wrap.clientTop >= wrap.clientHeight) return; // scrollbar
  pan = { wrap, id: e.pointerId, x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!pan || e.pointerId !== pan.id) return;
  const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
  if (!pan.moved) {
    if (Math.hypot(dx, dy) < 5) return;
    // Capture only once dragging starts, so a plain click still reaches the box under the pointer.
    pan.moved = true;
    pan.wrap.setPointerCapture(e.pointerId);
    pan.wrap.classList.add('panning');
    getSelection().removeAllRanges();
  }
  pan.wrap.scrollLeft = pan.left - dx;
  pan.wrap.scrollTop = pan.top - dy;
});
['pointerup', 'pointercancel'].forEach(type => document.addEventListener(type, e => {
  if (!pan || e.pointerId !== pan.id) return;
  pan.wrap.classList.remove('panning');
  // Keep the drag until the click it may produce has been swallowed below.
  setTimeout(() => { pan = null; });
}));
// The click that ends a drag (panning, or linking two boxes) must not select a box.
document.addEventListener('click', e => {
  if (pan?.moved || linkDrag?.moved || tapZoom?.moved) { e.stopPropagation(); e.preventDefault(); }
}, true);

/* ---------- Linking two map boxes ----------
   With a mouse, drag from one box to another; releasing anywhere but another box drops the link.
   On touch screens (where dragging scrolls), choose "Link to…" in a box's long-press menu, then tap
   the other box. Either way the relationship form opens with only the types that fit the two items. */

export function startMapLink(id) {
  ui.mapLinkFrom = id;
  ui.mapSelected = null;
  render();
}

// Whether any relationship fits two items, in either direction.
export const canLink = (a, b) => (findVision(a) || findVision(b) ? !visionLinkError(a, b) : possibleTypes(a, b).length > 0 || possibleTypes(b, a).length > 0);
export const LINK_MARKS = ['link-source', 'link-target', 'link-bad'];

export function linkItems(from, to) {
  if (findVision(from) || findVision(to)) return linkVision(from, to);
  if (!canLink(from, to))
    return toast(t('map.linkNone', { a: findEntity(from).item.title, b: findEntity(to).item.title }));
  openForm('relation', null, { from, to });
}

export let linkDrag = null; // { from, id, x, y, moved, line, target }
// A point on the screen in the map's own coordinates.
export function mapPoint(svg, x, y) {
  const p = svg.createSVGPoint();
  Object.assign(p, { x, y });
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
viewEl.addEventListener('pointerdown', e => {
  const node = e.pointerType === 'mouse' && e.button === 0 && e.target.closest('[data-map-node]');
  if (node) linkDrag = { from: node.dataset.mapNode, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!linkDrag || e.pointerId !== linkDrag.id) return;
  const svg = $('.map-wrap svg'), src = $(`[data-map-node="${linkDrag.from}"]`);
  if (!svg || !src) return endLinkDrag();
  if (!linkDrag.moved) {
    if (Math.hypot(e.clientX - linkDrag.x, e.clientY - linkDrag.y) < 5) return;
    linkDrag.moved = true;
    const r = src.getBoundingClientRect(), c = mapPoint(svg, r.left + r.width / 2, r.top + r.height / 2);
    svg.insertAdjacentHTML('beforeend', `<line class="link-line" x1="${c.x}" y1="${c.y}" x2="${c.x}" y2="${c.y}"></line>`);
    linkDrag.line = svg.lastElementChild;
    src.classList.add('link-source');
    $('.map-wrap').classList.add('linking');
    getSelection().removeAllRanges();
  }
  const p = mapPoint(svg, e.clientX, e.clientY);
  linkDrag.line.setAttribute('x2', p.x);
  linkDrag.line.setAttribute('y2', p.y);
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-map-node]');
  const to = over && over !== src ? over.dataset.mapNode : null;
  if (to === linkDrag.target) return;
  svg.querySelector('.link-target, .link-bad')?.classList.remove(...LINK_MARKS.slice(1));
  linkDrag.target = to;
  if (to) over.classList.add(canLink(linkDrag.from, to) ? 'link-target' : 'link-bad');
});
// Clears the drag's line and marks; the drag itself is kept until the click it may produce has been swallowed.
export function endLinkDrag() {
  const done = linkDrag;
  if (!done) return {};
  done.ended = true;
  done.line?.remove();
  document.querySelectorAll(LINK_MARKS.map(c => '.' + c).join()).forEach(n => n.classList.remove(...LINK_MARKS));
  $('.map-wrap')?.classList.remove('linking');
  setTimeout(() => { if (linkDrag === done) linkDrag = null; });
  return done;
}
document.addEventListener('pointerup', e => {
  if (!linkDrag || e.pointerId !== linkDrag.id || linkDrag.ended) return;
  const { moved, from } = endLinkDrag();
  if (!moved) return;
  const to = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-map-node]')?.dataset.mapNode;
  if (to && to !== from) linkItems(from, to);
});
document.addEventListener('pointercancel', e => { if (linkDrag && e.pointerId === linkDrag.id) endLinkDrag(); });
// Escape drops a link being dragged or picked.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || modal.open || !ctxMenu.hidden) return;
  if (linkDrag?.moved && !linkDrag.ended) endLinkDrag();
  else if (tlDrag) endTlDrag(false);
  else if (ui.mapLinkFrom) { ui.mapLinkFrom = null; render(); }
  else if (selectsInView() && (ui.mapSelected || ui.mapRel) && !document.querySelector('dialog[open]')) { ui.mapSelected = ui.mapRel = null; render(); }
});

/* ---------- Moving dates in the timeline ----------
   The selected item's bar can be dragged along the time axis: from its middle it moves both dates,
   from one of its grips only that date. With a mouse the drag starts once the pointer moves; on touch
   screens (where dragging scrolls) after a long-press, and a long-press let go without moving still
   opens the menu. The bar follows whole days as it goes; the dates are saved when it is let go, and
   Esc puts it back. */

export let tlDrag = null; // { id, kind, edge, s0, e0, lo, hi, x, y, pointerId, touch, armed, moved, days, timer }
export let tlDragClick = false; // the click that ends a drag must not toggle the selection

// The dates the drag has reached: each end keeps at least the length the item's form asks for.
export function tlDragDates(d, days = d.days) {
  const min = d.kind === 'goal' ? 1 : 0;
  let s = d.s0, e = d.e0;
  if (d.edge === 'start') s = dayStr(Math.min(dayNum(d.s0) + days, dayNum(d.e0) - min));
  else if (d.edge === 'end') e = dayStr(Math.max(dayNum(d.e0) + days, dayNum(d.s0) + min));
  else { s = s && addDays(s, days); e = e && addDays(e, days); }
  const item = findEntity(d.id)?.item;
  if (item && fixedEnd(item)) e = lastOccurrence({ ...item, startDate: s }, item.repeat.count) || e;
  return { s, e };
}

// Redraws the dragged item's bar (in every row it is listed in) without redrawing the timeline.
export function previewTlDrag(d) {
  const scroll = $('.tl-scroll');
  if (!scroll) return;
  const { s, e } = tlDragDates(d), px = ui.tlPx, from = Number(scroll.dataset.from);
  const a = dayNum(s || e), b = dayNum(e || s), left = (a - from) * px, width = (b - a + 1) * px;
  document.querySelectorAll(`[data-tl-node="${d.id}"]`).forEach(row => {
    row.querySelector('.tl-overdue')?.remove();
    const bar = row.querySelector('.tl-bar'), dot = row.querySelector('.tl-milestone'), label = row.querySelector('.tl-bar-label');
    if (bar) Object.assign(bar.style, { left: `${left}px`, width: `${width}px` });
    if (dot) dot.style.left = `${left + px / 2}px`;
    if (label) label.style.left = `${bar ? left + width + 8 : left + px / 2 + 14}px`;
    row.querySelectorAll('[data-tl-edge]').forEach(g => { g.style.cssText = tlGrip(g.dataset.tlEdge, left, width); });
    row.querySelector('.tl-dates').textContent = fmtSpan(s, e, true);
  });
  showTlDragTip(d, s, e);
}

// A label above the dragged bar with the date (or dates) it would get, over the end that moves.
// On touch screens it stays clear of the finger.
export function showTlDragTip(d, s, e) {
  const mark = $(`[data-tl-node="${d.id}"] :is(.tl-bar, .tl-milestone)`);
  if (!mark) return;
  let tip = $('.tl-drag-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tl-drag-tip';
    tip.setAttribute('role', 'status');
    document.body.append(tip);
  }
  const endKey = d.kind === 'goal' ? 'f.deadline' : 'f.dueDate';
  tip.textContent = d.edge ? `${t(d.edge === 'start' ? 'f.startDate' : endKey)}: ${fmtRel(d.edge === 'start' ? s : e)}` : fmtSpan(s, e, true);
  const r = mark.getBoundingClientRect(), w = tip.offsetWidth;
  const x = d.edge === 'start' ? r.left : d.edge === 'end' ? r.right : r.left + r.width / 2;
  const top = Math.min(r.top, d.touch ? d.cy - 40 : r.top) - 8;
  tip.style.left = `${clamp(x - w / 2, 8, innerWidth - w - 8)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

export function startTlDrag(d) {
  d.moved = true;
  $('.tl-scroll')?.classList.add('tl-dragging', d.edge ? 'tl-resizing' : 'tl-moving');
  getSelection().removeAllRanges();
}

// Saves the new dates (or, with `keep` false, puts the bar back) and redraws the timeline.
export function endTlDrag(keep) {
  const d = tlDrag;
  if (!d) return;
  clearTimeout(d.timer);
  tlDrag = null;
  tlDragClick = d.moved || d.armed;
  $('.tl-scroll')?.classList.remove('tl-dragging', 'tl-resizing', 'tl-moving');
  $('.tl-drag-tip')?.remove();
  d.target?.removeEventListener('touchmove', tlDragTouchMove);
  const ent = findEntity(d.id);
  if (!keep || !d.days || !ent) return d.moved && render();
  const { s, e } = tlDragDates(d);
  if (d.s0) ent.item.startDate = s;
  if (d.e0 || fixedEnd(ent.item)) ent.item[ent.kind === 'goal' ? 'deadline' : 'dueDate'] = e;
  save();
  render();
  toast(t('tl.datesMoved', { name: ent.item.title, dates: fmtSpan(s, e, true) }));
}

// Once a long-press has picked the bar up, moving the finger drags it instead of scrolling.
export function tlDragTouchMove(e) {
  if (tlDrag?.armed && e.cancelable) e.preventDefault();
}

viewEl.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-tl-drag]'), ent = el && findEntity(el.dataset.tlDrag);
  if (!ent || (e.pointerType === 'mouse' && e.button !== 0) || tlDrag) return;
  const { kind, item } = ent, edge = el.dataset.tlEdge || '';
  const s0 = item.startDate || '', e0 = endOf(kind, item) || '';
  // How far the drag may go: to the ends of the timeline as drawn.
  const scroll = $('.tl-scroll'), from = Number(scroll.dataset.from), to = Number(scroll.dataset.to);
  const ends = (edge === 'start' ? [s0] : edge === 'end' ? [e0] : [s0, e0]).filter(Boolean).map(dayNum);
  const d = tlDrag = { id: item.id, kind, edge, s0, e0, lo: from - Math.min(...ends), hi: to - Math.max(...ends),
    x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch: e.pointerType !== 'mouse', armed: false, moved: false, days: 0 };
  if (!d.touch) return;
  // Touch events keep going to the element the finger started on, even after a redraw detaches it.
  d.target = e.target;
  d.target.addEventListener('touchmove', tlDragTouchMove, { passive: false });
  d.timer = setTimeout(() => {
    d.armed = true;
    $('.tl-scroll')?.classList.add('tl-dragging');
    navigator.vibrate?.(15);
  }, LONG_PRESS_MS);
});
document.addEventListener('pointermove', e => {
  const d = tlDrag;
  if (!d || e.pointerId !== d.pointerId) return;
  const dx = e.clientX - d.x;
  d.cy = e.clientY;
  if (!d.moved) {
    const far = Math.hypot(dx, e.clientY - d.y);
    // A finger that moves before the long-press is up scrolls the timeline as usual.
    if (d.touch && !d.armed) return far > 10 && endTlDrag(false);
    if (far < 4) return;
    startTlDrag(d);
    if (!d.days) previewTlDrag(d);
  }
  const days = clamp(Math.round(dx / ui.tlPx), d.lo, d.hi);
  if (days === d.days) return;
  d.days = days;
  previewTlDrag(d);
});
document.addEventListener('pointerup', e => {
  const d = tlDrag;
  if (!d || e.pointerId !== d.pointerId) return;
  // A long-press let go where it started opens the menu, as it does elsewhere.
  if (d.armed && !d.moved) {
    endTlDrag(false);
    return openCtxMenu(d.id, d.x, d.y + 12);
  }
  endTlDrag(true);
});
document.addEventListener('pointercancel', e => { if (tlDrag && e.pointerId === tlDrag.pointerId) endTlDrag(false); });
document.addEventListener('click', e => {
  if (tlDragClick) { e.stopPropagation(); e.preventDefault(); }
  tlDragClick = false;
}, true);
document.addEventListener('pointerdown', () => { tlDragClick = false; }, true);

// Safari: trackpad pinch on macOS arrives as gesture events; on iOS they duplicate the touches above.
export let gesture = null;
export function gestureChange(e) {
  e.preventDefault();
  if (!pinch) queueZoom(gesture.wrap, e.scale / gesture.scale, e.clientX, e.clientY);
  gesture.scale = e.scale;
}
export function gestureEnd() {
  gesture.target.removeEventListener('gesturechange', gestureChange);
  gesture.target.removeEventListener('gestureend', gestureEnd);
  gesture = null;
}
viewEl.addEventListener('gesturestart', e => {
  const wrap = e.target.closest?.(ZOOM_SEL);
  if (!wrap) return;
  e.preventDefault();
  gesture = { wrap, target: e.target, scale: 1 };
  e.target.addEventListener('gesturechange', gestureChange);
  e.target.addEventListener('gestureend', gestureEnd);
});

viewEl.addEventListener('keydown', e => {
  const line = e.target.closest?.('[data-rel-edit]'), menuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
  if (line && menuKey) {
    e.preventDefault();
    const box = line.getBoundingClientRect();
    return openRelMenu(line.dataset.relEdit, box.left + box.width / 2, box.top + box.height / 2, true);
  }
  if (line && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    return openForm('relation', line.dataset.relEdit);
  }
  const node = e.target.closest?.(NODE_SEL);
  // A fold button inside a timeline row handles its own keys.
  if (!node || e.target.closest('[data-tl-fold]')) return;
  if (menuKey) {
    e.preventDefault();
    const r = node.getBoundingClientRect();
    openCtxMenu(nodeId(node), r.left + 16, r.bottom + 4, true);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const id = nodeId(node), ent = findEntity(id);
    if (ui.mapSelected === id && ent) return openForm(ent.kind, id);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
});

viewEl.addEventListener('dblclick', e => {
  const id = nodeId(e.target.closest(NODE_SEL));
  const ent = id && findEntity(id);
  if (ent && !modal.open) openForm(ent.kind, id);
});

// In the map and the timeline, with nothing being typed and no dialog or menu open: Delete (or
// Backspace, the Mac's delete key) removes the selected or focused line at once, or asks before
// deleting the selected or focused item; Enter or Space opens what is selected.
export const selectsInView = () => ui.view === 'map' || ui.view === 'timeline';
export const relShown = id => !!id && !!$(`[data-rel-edit="${id}"]`);
export const itemShown = id => !!id && !!$(`[data-map-node="${id}"],[data-tl-node="${id}"]`);
document.addEventListener('keydown', e => {
  if (!selectsInView() || document.querySelector('dialog[open]') || !ctxMenu.hidden) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const edgeEl = e.target.closest?.('[data-rel-edit]'), nodeEl = e.target.closest?.(NODE_SEL);
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const relId = edgeEl?.dataset.relEdit || (!nodeEl && relShown(ui.mapRel) ? ui.mapRel : '');
    const id = !relId && (nodeId(nodeEl) || (itemShown(ui.mapSelected) ? ui.mapSelected : ''));
    if (!relId && !id) return;
    e.preventDefault();
    return relId ? removeRelation(relId) : askDeleteItem(id);
  }
  if ((e.key === 'Enter' || e.key === ' ') && !edgeEl && !nodeEl && !e.target.closest?.('button, a, [tabindex]')) {
    const ent = itemShown(ui.mapSelected) && findEntity(ui.mapSelected);
    if (relShown(ui.mapRel)) openForm('relation', ui.mapRel);
    else if (ent) openForm(ent.kind, ui.mapSelected);
    else return;
    e.preventDefault();
  }
});

ctxMenu.addEventListener('click', e => {
  if (e.target.closest('[data-ctx-sub]')) return toggleCtxSub($('#ctxSub').hidden);
  const b = e.target.closest('[data-ctx]');
  if (b && ctxMenu.dataset.add) { closeCtxMenu(); openForm(b.dataset.ctx.slice(4)); }
  else if (b && ctxMenu.dataset.rel) runRelAction(b.dataset.ctx, ctxMenu.dataset.rel);
  else if (b) runCtxAction(b.dataset.ctx, ctxMenu.dataset.id);
});
ctxMenu.addEventListener('keydown', e => {
  const items = [...ctxMenu.querySelectorAll('button')].filter(b => !b.closest('[hidden]'));
  const i = items.indexOf(document.activeElement);
  // The "Show in…" parent: Right opens it onto its first item; Left (or Escape) on one of its items
  // closes it back onto the parent, as does Left on the open parent.
  const parent = ctxMenu.querySelector('[data-ctx-sub]'), inSub = !!document.activeElement.closest('.ctx-sub');
  if (parent && e.key === 'ArrowRight' && document.activeElement === parent) {
    e.preventDefault();
    toggleCtxSub(true);
    return $('#ctxSub button').focus();
  }
  if (parent && (e.key === 'ArrowLeft' && (inSub || document.activeElement === parent) || e.key === 'Escape' && inSub)) {
    e.preventDefault();
    toggleCtxSub(false);
    return parent.focus();
  }
  // With the menu itself focused (i = -1), Down goes to the first item and Up to the last.
  const moves = { ArrowDown: i + 1, ArrowUp: (i < 0 ? items.length : i) - 1, Home: 0, End: items.length - 1 };
  if (e.key in moves) {
    e.preventDefault();
    items[(moves[e.key] + items.length) % items.length].focus();
  } else if (e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault();
    closeCtxMenu(true);
  }
});
document.addEventListener('pointerdown', e => { if (!ctxMenu.contains(e.target)) closeCtxMenu(); });
addEventListener('resize', () => closeCtxMenu());
// Scrolling closes the menu, but not a scroll that arrives right after it opened: browsers deliver
// scroll events on the next frame, so one from just before (a redraw putting the map's scroll back,
// as a line's menu does when it selects the line, or the end of a swipe) can land after it.
// Scrolling the menu itself (taller than a phone held sideways) keeps it open.
document.addEventListener('scroll', e => { if (e.target !== ctxMenu && performance.now() - ctxOpenedAt > 400) closeCtxMenu(); }, true);

/* ---------- Plan switcher (sidebar on desktop, menu on mobile) ---------- */

export const PLAN_ICONS = {
  new: '<path d="M12 5v14M5 12h14"/>',
  rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  merge: '<path d="M6 3v4a6 6 0 0 0 12 0V3M12 13v8M8 17l4 4 4-4"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5M5 14v6h14v-6"/>',
  delete: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
};

// How a plan is doing, for the badge in the plan menus: 'late' when something is overdue,
// 'today' when something still has to be done today, else 'ok'. Paused goals and finished work don't count.
export function planHealth(data) {
  const keep = db;
  setDb(data);
  try {
    const now = today();
    let health = 'ok';
    const flag = level => { if (level === 'late' || health === 'ok') health = level; };
    const due = (date, open) => { if (open && date && date <= now) flag(date < now ? 'late' : 'today'); };
    db.goals.forEach(g => due(g.deadline, g.status === 'active' || !g.status));
    db.activities.forEach(a => {
      if (!isRoutine(a)) return due(a.dueDate, a.status !== 'done');
      if (!runsOn(a, now)) return;
      if (routineState(a) === 'late') flag('late');
      // Due today: a set day not ticked yet, or a flexible routine that needs every day left, today included.
      if (routineToday(a) === 'due') flag('today');
    });
    return health;
  } finally { setDb(keep); }
}
export const HEALTH_BADGE = { ok: '🟢', today: '🟡', late: '🔴' };

// Other plans change only through sync or the plan menu: their health is kept until the stored
// copy or the day changes, so a render reads them from storage without parsing them again.
export const storedHealth = new Map(); // plan id → { key, health }
export function storedPlanHealth(id) {
  let raw = null;
  try { raw = userStorage.getItem(planKey(id)); } catch (e) { /* ignore */ }
  const key = `${today()}|${raw}`;
  if (storedHealth.get(id)?.key !== key) storedHealth.set(id, { key, health: planHealth(readPlan(id)) });
  return storedHealth.get(id).health;
}

// The plan menus show each plan's badge before its name (unless switched off in Settings).
export function updatePlanBadges() {
  const health = ui.planBadges ? Object.fromEntries(plans.list.map(p => [p.id, p.id === plans.current ? planHealth(db) : storedPlanHealth(p.id)])) : {};
  document.querySelectorAll('[data-plan-select] option').forEach(o => {
    const plan = plans.list.find(p => p.id === o.value), h = health[o.value];
    if (!plan) return;
    o.textContent = h ? `${HEALTH_BADGE[h]} ${plan.name}` : plan.name;
    o.title = h ? t('plan.health.' + h) : '';
  });
}

export function renderPlanSwitch() {
  const options = plans.list.map(p => `<option value="${p.id}" ${p.id === plans.current ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  // Merging needs a second plan to merge into.
  const off = act => act === 'merge' && plans.list.length < 2;
  const label = act => esc(t(off(act) ? 'plan.mergeOnly' : 'plan.' + act));
  const actions = Object.entries(PLAN_ICONS).map(([act, path]) =>
    `<button type="button" class="icon-btn" data-plan="${act}" title="${label(act)}" aria-label="${label(act)}" ${off(act) ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg></button>`).join('');
  document.querySelectorAll('.plan-switch').forEach(box => {
    box.innerHTML = `<label class="plan-label">${t('plan.label')}<select data-plan-select>${options}</select></label><div class="plan-actions">${actions}</div>`;
  });
  $('#planName').innerHTML = options;
  updatePlanBadges();
}

document.addEventListener('change', e => {
  if (e.target.matches('[data-plan-select]')) openPlan(e.target.value);
});
document.addEventListener('click', e => {
  const act = e.target.closest('[data-plan]')?.dataset.plan;
  if (!act) return;
  const plan = currentPlan();
  if (act === 'new') {
    const name = askPlanName(t('plan.newPrompt'), uniqueName(t('plan.defaultName')));
    if (name) { createPlan(name); toast(t('toast.planCreated')); }
  } else if (act === 'rename') {
    const name = askPlanName(t('plan.renamePrompt'), plan.name, plan.id);
    if (name) { plan.name = name; save(); renderPlanSwitch(); toast(t('toast.planRenamed')); }
  } else if (act === 'merge') {
    openMerge(plan);
  } else if (act === 'export') {
    openExport();
  } else if (act === 'import') {
    $('#importInput').click();
  } else if (act === 'delete') {
    openPlanDelete(plan);
  }
});

// What a plan holds, as list items for the delete and merge dialogs ('' when it is empty).
export function planContents(data) {
  const count = (key, n) => (n ? `<li>${esc(tp(key, n))}</li>` : '');
  const measured = data.states.reduce((sum, s) => sum + (s.cumulative ? s.entries || [] : s.history || []).length, 0);
  return count('planDel.goals', data.goals.length) + count('planDel.states', data.states.length) + count('planDel.measurements', measured)
    + count('planDel.activities', data.activities.length) + count('planDel.relations', data.relations.length);
}

/* ---------- Deleting a plan: spells out what is lost and asks for the plan's name ---------- */

export const planDel = $('#planDelete');

export function openPlanDelete(plan) {
  closeCtxMenu();
  planDel.dataset.id = plan.id;
  const contents = planContents(db);
  const last = plans.list.length === 1;
  $('#planDeleteBody').innerHTML = `
    <div class="del-warn" role="alert">
      <p>${t('planDel.lead', { name: `<span class="del-name">${esc(plan.name)}</span>` })}</p>
      ${contents ? `<ul>${contents}</ul>` : `<p>${t('planDel.empty')}</p>`}
    </div>
    <ul class="del-points">
      <li class="strong">${t('planDel.noUndo')}</li>
      <li>${t(syncConnected() ? 'planDel.synced' : 'planDel.local')}</li>
      <li>${t(last ? 'planDel.last' : 'planDel.others')}</li>
    </ul>
    <div class="del-actions">
      <button type="button" class="btn small" data-plan-backup>${t('planDel.backup')}</button>
      ${contents && !last ? `<button type="button" class="btn small" data-plan-merge-instead>${t('planDel.merge')}</button>` : ''}
    </div>
    <div class="field">
      <label for="planDeleteName">${t('planDel.type', { name: `<span class="del-name">${esc(plan.name)}</span>` })}</label>
      <input type="text" id="planDeleteName" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="planDeleteHint">
      <div class="hint" id="planDeleteHint">${t('planDel.typeHint')}</div>
    </div>`;
  $('#planDeleteBtn').disabled = true;
  planDel.showModal();
  $('#planDeleteName').focus();
}

export const planDelNameOk = () => $('#planDeleteName').value.trim() === plans.list.find(p => p.id === planDel.dataset.id)?.name;
planDel.addEventListener('input', () => ($('#planDeleteBtn').disabled = !planDelNameOk()));
planDel.addEventListener('click', e => {
  if (e.target === planDel || e.target.closest('[data-plan-delete-close]')) planDel.close();
  if (e.target.closest('[data-plan-backup]')) exportJson();
  if (e.target.closest('[data-plan-merge-instead]')) {
    planDel.close();
    openMerge(currentPlan(), true);
  }
});
$('#planDeleteForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!planDelNameOk()) return;
  planDel.close();
  deletePlan(planDel.dataset.id);
  toast(t('toast.planDeleted'));
});

/* ---------- Merging a plan into another (also offered instead of deleting it) ---------- */

export const planMerge = $('#planMerge');

export function openMerge(plan, remove = false) {
  closeCtxMenu();
  const others = plans.list.filter(p => p.id !== plan.id);
  if (!others.length) return;
  planMerge.dataset.id = plan.id;
  const contents = planContents(plan.id === plans.current ? db : readPlan(plan.id));
  const name = `<strong>${esc(plan.name)}</strong>`;
  $('#planMergeBody').innerHTML = `
    <div class="field">
      <label for="mergeTarget">${t('merge.lead', { name })}</label>
      <select id="mergeTarget">${others.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
    </div>
    ${contents ? `<div><p>${t('merge.contents')}</p><ul class="import-progress">${contents}</ul></div>` : `<p>${t('planDel.empty')}</p>`}
    <p class="hint">${t('merge.hint')}</p>
    <label class="merge-remove"><input type="checkbox" id="mergeRemove" ${remove ? 'checked' : ''}> <span>${t('merge.remove', { name })}</span></label>`;
  planMerge.showModal();
  $('#mergeTarget').focus();
}
planMerge.addEventListener('click', e => {
  if (e.target === planMerge || e.target.closest('[data-plan-merge-close]')) return planMerge.close();
  if (!e.target.closest('#mergeBtn') || !planMerge.open) return;
  const from = plans.list.find(p => p.id === planMerge.dataset.id), to = plans.list.find(p => p.id === $('#mergeTarget').value);
  const remove = $('#mergeRemove').checked;
  planMerge.close();
  if (!from || !to) return;
  mergePlanInto(from.id, to.id, remove);
  toast(t(remove ? 'toast.mergedDeleted' : 'toast.merged', { from: from.name, to: to.name }));
});

/* ---------- Language & theme (in Settings) ---------- */

export function renderLangSwitch() {
  document.querySelectorAll('.lang-switch').forEach(box => {
    box.innerHTML = Object.entries(I18N).map(([code, l]) =>
      `<button type="button" data-lang="${code}" lang="${code}" title="${esc(l.name)}" aria-pressed="${code === lang}">${code.toUpperCase()}</button>`).join('');
  });
}

export function changeLanguage(code) {
  if (code === lang) return;
  setLanguage(code);
  applyStaticI18n();
  renderLangSwitch();
  renderThemeSetting();
  applyNavCollapsed();
  renderSync();
  renderPlanSwitch();
  renderInstall();
  if (modal.open) modal.close();
  requestRender();
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-lang]');
  if (b) changeLanguage(b.dataset.lang);
});

// 'system' follows the device; 'light' / 'dark' pin the theme.
export const THEMES = ['system', 'light', 'dark'];
export const THEME_ICONS = {
  system: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="currentColor"/></svg>',
};
export let theme = 'system'; // the current user's, read by bootUser
export function setTheme(v) { theme = v; }

export function applyTheme() {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  renderThemeSetting();
}
export const darkScheme = matchMedia('(prefers-color-scheme: dark)');
// The map writes its glass in the colours of the theme it was drawn in, so a change of theme redraws it;
// other views follow the CSS, and keep an open popup.
export const redrawForTheme = () => { if (ui.view === 'map') requestRender(); };
darkScheme.addEventListener('change', () => { if (theme === 'system') redrawForTheme(); });
export function renderThemeSetting() {
  $('#themeSeg').innerHTML = THEMES.map(k =>
    `<button type="button" data-theme-set="${k}" aria-pressed="${k === theme}">${THEME_ICONS[k]}<span>${t('theme.' + k)}</span></button>`).join('');
}
$('#themeSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-theme-set]');
  if (!b) return;
  theme = b.dataset.themeSet;
  prefs.set('theme', theme);
  applyTheme();
  redrawForTheme();
});

/* ---------- Install as an app ----------
   Browsers that can install it (Chrome, Edge, Samsung Internet) offer it through `beforeinstallprompt`;
   on iPhone and iPad it is Safari's Share → Add to Home Screen; Firefox on Android adds it from its
   menu, and Firefox on a computer cannot install it at all. */

export let installPrompt = null;
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isFirefox = () => /Firefox\//.test(navigator.userAgent);
export const isAndroid = () => /Android/.test(navigator.userAgent);

// Without an install prompt, the browser's own way to install it, if there is a hint for it.
export function installHintKey() {
  if (installPrompt) return 'install.hint';
  if (isIos()) return 'install.iosHint';
  if (isFirefox()) return isAndroid() ? 'install.firefoxAndroidHint' : 'install.firefoxHint';
  return '';
}

export function renderInstall() {
  const hint = installHintKey();
  $('#installSection').hidden = isInstalled() || !hint;
  $('#installHint').textContent = hint ? t(hint) : '';
  $('#installBtn').hidden = !installPrompt;
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); // offer it in Settings instead of the browser's own banner
  installPrompt = e;
  renderInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  renderInstall();
  toast(t('install.done'));
});
$('#installBtn').addEventListener('click', async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null; // a prompt can only be shown once
  prompt.prompt();
  await prompt.userChoice.catch(() => null);
  renderInstall();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it, just not offline */ });
}

/* ---------- Boot ---------- */

// Loads the current user's plans, visions and preferences and shows them; true on their first visit.
export function bootUser() {
  // First visit = nothing stored yet; load() creates the first plan, so check before it.
  let firstVisit = false;
  try { firstVisit = !userStorage.getItem(PLANS_KEY) && !userStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  theme = THEMES.includes(prefs.get('theme')) ? prefs.get('theme') : 'system';
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
  if (typeof tour !== 'undefined' && tour.step >= 0) endTour(false);
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
