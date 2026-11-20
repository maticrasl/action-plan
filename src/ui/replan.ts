/** Move late steps: the dialog that re-dates the open plan's late steps in one action, with Undo. */
import { db } from '../core/state';
import { fmtDay, fmtRel, parseDateInput, today } from '../core/dates';
import { addDays } from '../core/routines/schedule';
import { applyMove, lateSteps, planMove, type MovePlan } from '../core/replan';
import { t, tp } from '../i18n/index';
import { save } from '../store/plans';
import { $, esc } from './dom';
import { date } from './forms/form';
import { cal, calendarClick, calendarKey, closeCalendar, dateSlashes } from './calendar';
import { requestRender } from './render';
import { toast } from './toast';
import { undoable } from './undo';

const dlg = $<HTMLDialogElement>('#replan');
const short = (iso: string) => fmtDay(iso, { day: 'numeric', month: 'short' });

// The button on the Overview, in Activities and on the Timeline: only while a step is late.
export const replanButton = () =>
  lateSteps(db, today()).length
    ? `<button type="button" class="chip replan-btn" data-replan>${esc(t('replan.btn'))}</button>`
    : '';

export function openReplan() {
  const now = today();
  const steps = lateSteps(db, now);
  if (!steps.length) return toast(t('replan.none'));
  $('#replanBody').innerHTML = `
    <p class="hint">${esc(t('replan.lead'))}</p>
    <div class="field replan-to">
      <label for="f-replanTo">${esc(t('replan.to'))}</label>
      <div class="replan-date">${date('replanTo', addDays(now, 1))}<span class="hint" id="replanRel"></span></div>
      <div class="err" id="replanErr" role="alert"></div>
    </div>
    <ul class="replan-list">${steps
      .map(
        a => `<li><label class="rep-check"><input type="checkbox" data-replan-id="${esc(a.id)}" checked>
        <span class="replan-title">${esc(a.title)}</span>
        <span class="replan-was">${esc(t('replan.was', { date: short(a.dueDate!) }))}</span>
        <span class="replan-new" data-replan-new="${esc(a.id)}"></span></label></li>`,
      )
      .join('')}</ul>
    <label class="rep-check"><input type="checkbox" id="replanLater"> <span>${esc(t('replan.later'))}
      <span class="hint" id="replanLaterCount"></span></span></label>
    <div class="replan-goals" id="replanGoals" hidden>
      <div id="replanGoalText"></div>
      <label class="rep-check"><input type="checkbox" id="replanMoveGoal"> ${esc(t('replan.moveGoal'))}</label>
    </div>`;
  preview();
  dlg.showModal();
}

const checked = (sel: string) => $<HTMLInputElement>(sel).checked;
function planned(withLater = checked('#replanLater')): MovePlan | null {
  const to = parseDateInput($<HTMLInputElement>('#f-replanTo').value);
  const ids = [...dlg.querySelectorAll<HTMLInputElement>('[data-replan-id]:checked')].map(i => i.dataset.replanId!);
  return to ? planMove(db, { ids, to, withLater, today: today() }) : null;
}
const count = (p: MovePlan) => p.moves.length + p.later.length;

// Updates the new dates, counts, goal lines and the button in place, so the date field keeps focus.
function preview() {
  const to = parseDateInput($<HTMLInputElement>('#f-replanTo').value);
  const plan = planned(),
    all = planned(true);
  $('#replanErr').textContent = !to || to < today() ? t('err.replanPast') : '';
  $('#replanRel').textContent = to && to >= today() ? fmtRel(to, false, () => '') : '';
  const due = new Map(plan?.moves.map(m => [m.id, m.due]));
  dlg.querySelectorAll<HTMLElement>('[data-replan-new]').forEach(el => {
    const d = due.get(el.dataset.replanNew!);
    el.textContent = d ? `→ ${short(d)}` : '';
  });
  $('#replanLaterCount').textContent = all?.later.length
    ? `(${tp('replan.laterCount', all.later.length, { days: tp('replan.days', all.days) })})`
    : '';
  const goals = plan?.goals ?? [];
  $('#replanGoals').hidden = !goals.length;
  $('#replanGoalText').innerHTML = goals
    .map(g => {
      const title = db.goals.find(x => x.id === g.id)?.title ?? '';
      return `<p>${esc(tp('replan.pastGoal', g.by.length, { goal: title, date: short(g.was) }))}</p>`;
    })
    .join('');
  const btn = $<HTMLButtonElement>('#replanBtn');
  btn.textContent = tp('replan.do', plan ? count(plan) : 0);
  btn.disabled = !plan;
}

function move() {
  const plan = planned();
  if (!plan) return;
  const goals = checked('#replanMoveGoal');
  dlg.close();
  undoable(() => {
    applyMove(db, plan, goals);
    save();
    requestRender();
    return tp('replan.done', count(plan));
  });
}

export function listenReplan() {
  const form = $<HTMLFormElement>('#replanForm');
  form.addEventListener('input', e => {
    dateSlashes(e);
    preview();
  });
  form.addEventListener('change', preview);
  form.addEventListener('keydown', calendarKey);
  form.addEventListener('submit', e => {
    e.preventDefault();
    move();
  });
  dlg.addEventListener('click', e => {
    const el = e.target as HTMLElement;
    if (el === dlg || el.closest('[data-replan-close]')) return dlg.close();
    calendarClick(e);
  });
  // Escape closes the calendar first, then the dialog.
  dlg.addEventListener('cancel', e => {
    if (!cal) return;
    e.preventDefault();
    closeCalendar(true);
  });
  dlg.addEventListener('close', () => closeCalendar());
}
