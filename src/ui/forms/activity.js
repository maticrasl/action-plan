/** The activity form: done once or repeating, a checklist, and when a routine repeats. */
import { db } from '../../core/state';
import { descendants, relsTo } from '../../core/relations';
import { t, tp } from '../../i18n/index';
import { nthWord, statusLabels, streakText, weekdayName } from '../text';
import { ACTIVITY_STATUS } from '../../core/model';
import { isRoutine, lastOccurrence, monthDay, monthRule, nthInMonth, routineStart, sched, weekday } from '../../core/routines/schedule';
import { dateInput, parseDateInput, today } from '../../core/dates';
import { $, esc, linkTag } from '../dom';
import { checklist } from './picker';
import { doneLast } from '../../core/util';
import { consistency, routineStreak } from '../../core/routines/keeping';
import { area, date, field, linksOf, modal, num, select, text } from './form';

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
