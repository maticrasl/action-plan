/** Routines on screen: week strips, list ticks, the routine card and row, and ticking days and items. */
import { fmtDay, fmtRel, today } from '../core/dates';
import { db } from '../core/state';
import {
  checkedOn,
  dayItemsDone,
  followList,
  isList,
  isListRoutine,
  itemOn,
  listDone,
  setCheckin,
  setDayItems,
  tickable,
} from '../core/routines/checkins';
import { activityState, blockers } from '../core/progress';
import { toast } from '../ui/toast';
import { t, type TextKey } from '../i18n/index';
import type { ISODate, State } from '../core/model';
import type { WithList } from '../core/routines/checkins';
import type { Routine } from '../core/routines/schedule';
import { save } from '../store/plans';
import { $, esc, linkTag, progressBar, waitsForTag } from '../ui/dom';
import { addEntry, dropRoutineEntries, improvedStates } from '../core/cumulative';
import { keptDay, makesUp, periodProgress, routineStreak, routineToday, type TodayAsk } from '../core/routines/keeping';
import {
  addDays,
  daysBetween,
  isDueDay,
  isFlexible,
  isRoutine,
  nextDueDay,
  periodOf,
  periodUnit,
  routineStart,
  runsOn,
  weekday,
} from '../core/routines/schedule';
import { clamp, doneLast, formatter } from '../core/util';
import { ui } from '../store/state';
import { periodText, scheduleText, shortSchedule, streakText, weekdayName } from '../ui/text';
import { relsFrom } from '../core/relations';
import { openAmountPop } from '../ui/amount-popover';
import { requestRender as render } from '../ui/render';

export function tickListItem(id: string, itemId: string, iso: ISODate = today()) {
  const a = db.activities.find(x => x.id === id);
  if (a && isListRoutine(a)) return tickRoutineItem(a, itemId, iso);
  const it = a && isList(a) && a.list.find(i => i.id === itemId);
  if (!it) return;
  Object.assign(it, { done: !it.done, at: new Date().toISOString() });
  const was = a.status;
  followList(a);
  const waits = blockers(a);
  if (a.status === 'done' && was !== 'done')
    toast(waits.length ? t('acts.notDone', { name: waits[0].title }) : t('list.complete', { name: a.title }));
  save();
  render();
  // The card is drawn anew (perhaps in another column): keep the keyboard on the item, without
  // scrolling to where it moved (the bottom of a long list).
  // A ticked item is hidden: the keyboard goes to the toggle that shows it.
  (justTicked($(`[data-li-tick="${id}"][data-li="${itemId}"]`)) || $(`[data-li-show-done="${id}"]`))?.focus({
    preventScroll: true,
  });
}

export function tickRoutineItem(a: Routine & WithList, itemId: string, iso: ISODate) {
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
  justTicked(item())?.focus({ preventScroll: true });
}
// A ticked item's box pops once; the class is only added here, so a later render does not replay it.
export const justTicked = (el: HTMLElement | null) => {
  if (el?.matches('.done')) el.classList.add('just');
  return el;
};

export const TODAY_TAG: Record<TodayAsk, string> = {
  done: 'ok',
  due: 'warn',
  makeUp: 'warn',
  any: '',
  met: 'ok',
  rest: '',
};
export function todayTag(a: Routine) {
  const k = routineToday(a);
  if (!k) return '';
  const next = k === 'rest' && nextDueDay(a, addDays(today(), 1));
  const text = next
    ? t('rt.today.restNext', { date: fmtDay(next, { weekday: 'short', day: 'numeric', month: 'short' }) })
    : t(('rt.today.' + k) as TextKey);
  return `<span class="tag rt-today ${TODAY_TAG[k]}" data-today="${k}">${esc(text)}</span>`;
}

// Ticking a day of a routine that improves states that add up first asks how much (from `anchor`,
// the button that was clicked); unticking also removes the amounts its tick added that day.
export function toggleCheckin(id: string, iso: ISODate, anchor: HTMLElement | null = null) {
  const a = db.activities.find(x => x.id === id);
  if (!a || !isRoutine(a) || !tickable(a, iso)) return;
  if (anchor && !checkedOn(a, iso) && improvedStates(a).length) return openTickAmount(a, iso, anchor);
  setRoutineDay(a, iso, !checkedOn(a, iso));
}

// `amounts`: [state, amount] pairs to add to the states, tagged with the routine.
export function setRoutineDay(a: Routine, iso: ISODate, on: boolean, amounts: [State, number][] = []) {
  const id = a.id;
  const wasMet = periodProgress(a, iso).met;
  setCheckin(a, iso, on);
  // Ticking a list routine's day ticks its items; unticking the day (not one item) unticks them all.
  if (isListRoutine(a) && (on || dayItemsDone(a, iso) === a.list.length))
    setDayItems(a, iso, Object.fromEntries(a.list.map(i => [i.id, on ? 1 : 0])));
  if (!on) dropRoutineEntries(a, iso);
  amounts.forEach(([s, n]) => addEntry(s, iso, n, a));
  save();
  render();
  // Only the period running now is "this week done"; filling in an earlier one says nothing.
  const current = periodOf(a, today()).from === periodOf(a, iso).from;
  const met = current && !wasMet && periodProgress(a, iso).met;
  if (met)
    toast(t(({ month: 'rt.metMonth', year: 'rt.metYear' } as Record<string, TextKey>)[periodUnit(a)] || 'rt.metWeek'));
  $(`[data-checkin="${id}"][data-date="${iso}"]`)?.focus();
  return met;
}

export const mondayOf = (iso: ISODate) => addDays(iso, -weekday(iso));
// "13–19 Oct" in the app's language.
export const fmtRange = (from: ISODate, to: ISODate) =>
  formatter(Intl.DateTimeFormat, { day: 'numeric', month: 'short', timeZone: 'UTC' }).formatRange(
    new Date(from + 'T00:00Z'),
    new Date(to + 'T00:00Z'),
  );

// The weeks a routine's strip can show: from the week it started in to the week of its end date or
// today, whichever comes first (a routine that has not started stays on this week).
export function routineWeeks(a: Routine) {
  const now = today(),
    end = a.dueDate && a.dueDate < now ? a.dueDate : now;
  const last = mondayOf(end),
    first = mondayOf(routineStart(a));
  return { first: first < last ? first : last, last, end };
}
// The week the strip shows (`w`, or else this one), kept within those weeks.
export function shownWeek(a: Routine, w: ISODate | undefined = ui.rtWeek[a.id]) {
  const { first, last } = routineWeeks(a);
  if (!w || w > last) return last;
  return w < first ? first : w;
}
export function shiftRoutineWeek(id: string, dir: number) {
  const a = db.activities.find(x => x.id === id) as Routine | undefined;
  if (!a) return;
  ui.rtWeek[id] = shownWeek(a, addDays(shownWeek(a), dir * 7));
  render();
  // Keep focus on the arrow, or on the other one once this one has reached the end.
  const btn = (d: number) => $<HTMLButtonElement>(`[data-rt-week="${id}"][data-dir="${d}"]`);
  (btn(dir)?.disabled ? btn(-dir) : btn(dir))?.focus();
}

// A week, Monday to Sunday, between arrows to earlier and later weeks: tap a day the routine runs
// on, up to today, to tick or untick it. Every day names its date on hover.
export function routineWeek(a: Routine, from: ISODate = shownWeek(a)) {
  const now = today(),
    { first, last } = routineWeeks(a);
  const fmt = (iso: ISODate) => fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const arrow = (dir: number, off: boolean, tip = esc(t(dir < 0 ? 'rt.prevWeek' : 'rt.nextWeek'))) =>
    `<button type="button" class="icon-btn rt-arrow" data-rt-week="${a.id}" data-dir="${dir}" title="${tip}" aria-label="${tip}" ${off ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg></button>`;
  // Each day is one of: done, due (outlined), missed (hatched), not due (fixed routines' other days)
  // or any day (flexible routines); today is ringed.
  // A missed day that a tick on another day made up for shows as made up.
  const kept = keptDay(a);
  const strip = daysBetween(from, addDays(from, 6))
    .map(d => {
      const on = checkedOn(a, d),
        off = d > now || !runsOn(a, d),
        fixed = !isFlexible(a),
        due = fixed && isDueDay(a, d);
      const past = due && !on && !off && d < now;
      const kind = on ? 'on' : past ? (kept(d) ? 'made' : 'missed') : due ? 'due' : fixed ? 'rest' : '';
      const cls = ['rt-day', due ? 'due' : '', kind, d === now ? 'today' : ''].filter(Boolean).join(' ');
      const said = t(
        (
          {
            on: 'rt.dayOn',
            missed: 'rt.dayMissed',
            made: 'rt.dayMadeUp',
            due: 'rt.dayDue',
            rest: 'rt.dayRest',
          } as Record<string, TextKey>
        )[kind] || 'rt.dayOff',
        { date: fmt(d) },
      );
      const label = esc(d === now ? t('rt.dayToday', { label: said }) : said);
      return `<button type="button" class="${cls}" data-checkin="${a.id}" data-date="${d}" aria-pressed="${on}" ${off ? 'aria-disabled="true"' : ''} title="${label}" aria-label="${label}"><span aria-hidden="true">${esc(weekdayName(weekday(d), 'narrow'))}</span></button>`;
    })
    .join('');
  return `<div class="rt-nav">${arrow(-1, from <= first)}<div class="rt-week" role="group" aria-label="${esc(from === mondayOf(now) ? t('rt.weekLabel') : fmtRange(from, addDays(from, 6)))}">${strip}</div>${arrow(1, from >= last)}</div>`;
}

export function routineCard(a: Routine) {
  // The bar follows the week on the strip: this period as usual, or an earlier one with its dates.
  const week = shownWeek(a),
    { end } = routineWeeks(a),
    lastDay = addDays(week, 6) < end ? addDays(week, 6) : end;
  const p = periodProgress(a, lastDay),
    streak = routineStreak(a),
    st = activityState(a);
  const earlier = periodOf(a, lastDay).from !== periodOf(a, today()).from;
  const label = earlier
    ? t(p.target ? 'rt.past' : 'rt.pastNone', { range: fmtRange(p.from, p.to), done: p.done, target: p.target })
    : periodText(a, p);
  const goals = relsFrom(a.id, 'contributes')
    .map(r => linkTag(r.to))
    .join('');
  const blocked = blockers(a),
    now = today();
  const when =
    a.dueDate && a.dueDate < now
      ? `<span class="tag">${t('rt.ended')}</span>`
      : routineStart(a) > now
        ? `<span class="tag">${t('rt.starts', { date: fmtRel(routineStart(a)) })}</span>`
        : '';
  return `<article class="card glass activity routine st-${st}" data-open="${a.id}" data-ctx-item="${a.id}">
    <div class="card-head"><h3>${esc(a.title)}</h3><span class="tag rt-sched" title="${esc(scheduleText(a))}">${esc(shortSchedule(a))}</span></div>
    ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
    ${progressBar(p.target ? clamp((p.done / p.target) * 100, 0, 100) : 0, `<span class="rt-progress">${esc(label)}</span>`)}
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
export function routineItems(a: Routine & WithList, iso: ISODate) {
  const n = dayItemsDone(a, iso);
  const pips = a.list.map((_, k) => `<i${k < n ? ' class="on"' : ''}></i>`).join('');
  return `<div class="rt-items"><div class="rt-items-head"><span class="label">${esc(t('list.today', { done: n, total: a.list.length }))}</span><span class="li-pips" aria-hidden="true">${pips}</span></div>
    <div class="li-ticks" role="group" aria-label="${esc(t('list.todayLabel'))}">${doneLast(a.list, i =>
      itemOn(a, iso, i.id),
    )
      .map(i => {
        const on = itemOn(a, iso, i.id);
        return `<button type="button" class="li-tick${on ? ' done' : ''}" role="checkbox" aria-checked="${on}" data-li-tick="${a.id}" data-li="${i.id}" data-date="${iso}"><span class="li-box" aria-hidden="true">${on ? '✓' : ''}</span><span class="li-text">${esc(i.text)}</span></button>`;
      })
      .join('')}</div></div>`;
}

// What the week strip's days mean; due, missed and not-due days only when some routine falls on set days.
export function routineLegend(routines: Routine[]) {
  const fixed = routines.some(a => !isFlexible(a)),
    made = routines.some(makesUp);
  const keys = ['on', ...(fixed ? ['due', 'missed', ...(made ? ['made'] : []), 'rest'] : []), 'today'];
  const look: Record<string, string> = { today: 'rest today', missed: 'due missed', made: 'due made' };
  return `<div class="map-legend rt-legend">${keys.map(k => `<span><i class="rt-day rt-swatch ${look[k] || k}" aria-hidden="true"></i>${esc(t(('rt.legend.' + k) as TextKey))}</span>`).join('')}</div>`;
}

// A routine on the overview: tick today off and see this period at a glance.
// Lists opened on the Overview, for this visit: a tick renders the page again and they stay open.
const openLists = new Set<string>();
export function toggleListFold(id: string) {
  if (!openLists.delete(id)) openLists.add(id);
  render();
}
export const listOpen = (id: string) => openLists.has(id);
// A list's count on an Overview row, as the button that opens its items under the row.
export const listFold = (id: string, done: number, total: number) =>
  `<button type="button" class="tag li-fold" data-li-fold="${id}" aria-expanded="${listOpen(id)}" aria-label="${esc(t('list.done', { done, total }))}">${t('list.count', { done, total })}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg></button>`;

export function routineRow(a: Routine) {
  const now = today(),
    on = checkedOn(a, now),
    p = periodProgress(a),
    streak = routineStreak(a);
  const items = isListRoutine(a) && a.list.length > 0,
    open = items && listOpen(a.id) && tickable(a, now);
  return `<div class="row glass routine-row st-${activityState(a)}${open ? ' open' : ''}" data-open="${a.id}" data-ctx-item="${a.id}">
    <button type="button" class="check ${on ? 'done' : ''}" data-checkin="${a.id}" data-date="${now}" aria-pressed="${on}" aria-label="${esc(t('rt.doneToday', { name: a.title }))}" title="${esc(t('rt.doneToday', { name: a.title }))}">${on ? '✓' : ''}</button>
    <span class="grow">${esc(a.title)} <span class="meta">${esc(scheduleText(a))}</span></span>
    ${items ? listFold(a.id, dayItemsDone(a, now), a.list.length) : ''}
    <span class="tag ${p.met ? 'ok' : ''}">${esc(periodText(a, p))}</span>
    ${streak.n ? `<span class="tag">${esc(streakText(streak))}</span>` : ''}
    ${open ? `<div class="row-items">${routineItems(a as Routine & WithList, now)}</div>` : ''}
  </div>`;
}

// Lists showing their ticked items, for this visit; by default they are hidden.
const doneShown = new Set<string>();
export function toggleListDone(id: string) {
  if (!doneShown.delete(id)) doneShown.add(id);
  render();
}

export function listTicks(a: WithList) {
  const n = listDone(a),
    show = doneShown.has(a.id);
  const toggle = n
    ? `<button type="button" class="chip li-show-done" data-li-show-done="${a.id}" aria-pressed="${show}">${esc(show ? t('list.hideDone') : t('list.showDone', { n }))}</button>`
    : '';
  return `${a.list.length ? progressBar((n / a.list.length) * 100, t('list.done', { done: n, total: a.list.length })) : ''}
    <div class="li-ticks">${doneLast(a.list)
      .filter(i => show || !i.done)
      .map(
        i =>
          `<button type="button" class="li-tick${i.done ? ' done' : ''}" role="checkbox" aria-checked="${!!i.done}" data-li-tick="${a.id}" data-li="${i.id}"><span class="li-box" aria-hidden="true">${i.done ? '✓' : ''}</span><span class="li-text">${esc(i.text)}</span></button>`,
      )
      .join('')}</div>${toggle}`;
}

export function openTickAmount(a: Routine, iso: ISODate, anchor: HTMLElement) {
  const states = improvedStates(a);
  const title =
    iso === today()
      ? t('cu.howMuch', { name: a.title })
      : t('cu.howMuchOn', { name: a.title, date: fmtDay(iso, { weekday: 'short', day: 'numeric', month: 'short' }) });
  openAmountPop(
    anchor,
    {
      title,
      fields: states.map(s => ({ label: s.title, unit: s.unit })),
      okLabel: t('cu.add'),
      skipLabel: t('cu.tickOnly'),
    },
    amounts =>
      setRoutineDay(
        a,
        iso,
        true,
        states.map((s, i) => [s, amounts[i]] as [State, number | null]).filter(([, n]) => n !== null) as [
          State,
          number,
        ][],
      ),
    () => setRoutineDay(a, iso, true),
  );
}
