/** Find your visions (feature 01): the dialog with its chooser, Reflections and a run, saved as typed, and what a run adds. */
import { t, tp } from '../i18n/index';
import { visions } from '../core/state';
import { fmtDay, today } from '../core/dates';
import { uid } from '../core/util';
import { findVision, isActiveGoal, ownVisions, setGoalVisions } from '../core/visions';
import {
  answersOf,
  EXERCISES,
  hasAnswers,
  isExercise,
  nextStep,
  prevStep,
  rateList,
  stepsOf,
  toMake,
  type DiscAnswers,
  type ExerciseId,
} from '../core/discovery';
import type { Session } from '../core/journal';
import type { Vision } from '../core/model';
import { addSession, deleteSession, journal, updateSession } from '../store/journal';
import { allPlansData, saveVisions } from '../store/visions';
import { editPlan } from '../store/plans';
import { plans } from '../store/state';
import { prefs } from '../store/prefs';
import { markSeen } from '../store/seen';
import { $, esc } from './dom';
import { dots, footHtml, stepHtml, type PickGoal, type StepCtx } from './discovery-steps';
import { openForm } from './forms/form';
import { setView } from './nav';
import { requestRender } from './render';
import { undoable } from './undo';

const dlg = $<HTMLDialogElement>('#discDlg');
type Run = { id: string | null; ex: ExerciseId; a: DiscAnswers; at: string; made: string[]; done: boolean };
let run: Run | null = null,
  dirty = false,
  timer: ReturnType<typeof setTimeout> | undefined;

/* ---------- What the steps need ---------- */

// Goals of every plan but the samples, active first.
function pickGoals(): PickGoal[] {
  const many = plans.list.length > 1;
  return allPlansData()
    .filter(p => !p.plan.demo)
    .flatMap(({ plan, data }) =>
      data.goals.map(g => ({
        plan: plan.id,
        id: g.id,
        title: g.title,
        active: isActiveGoal(g),
        label: many ? t('vis.goalInPlan', { goal: g.title, plan: plan.name }) : g.title,
      })),
    )
    .sort((x, y) => Number(y.active) - Number(x.active));
}
function rateAreas(extra: string[] = []) {
  const inUse = [
    ...visions.list.map(v => v.area || ''),
    ...allPlansData()
      .filter(p => !p.plan.demo)
      .flatMap(p => p.data.goals.map(g => g.category || '')),
  ];
  const hidden = prefs.get<unknown>('hiddenAreas', []);
  return rateList(
    inUse,
    t('cat.suggestions').split(','),
    Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === 'string') : [],
    extra,
  );
}
const ctx = (r: Run): StepCtx => ({
  goals: pickGoals(),
  areas: rateAreas(r.a.extra),
  visions: visions.list,
  made: r.made.some(id => findVision(id)),
});

/* ---------- Saving ---------- */

// Stored once anything is written; emptied again, it is removed.
function persist() {
  clearTimeout(timer);
  dirty = false;
  if (!run) return;
  const answers = { ...run.a, step: run.at } as Record<string, unknown>;
  const stored = run.id && journal.sessions.some(s => s.id === run!.id);
  if (!hasAnswers(run.a)) {
    if (stored) deleteSession(run.id!);
    run.id = null;
    return;
  }
  if (stored) updateSession(run.id!, { answers, done: run.done, made: run.made });
  else run.id = addSession({ exercise: run.ex, date: today(), done: run.done, answers, made: run.made }).id;
}
function later() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(persist, 1000);
}

/* ---------- Drawing ---------- */

const short = (iso: string) => fmtDay(iso, { day: 'numeric', month: 'short' });
const titleOf = (s: Session) => (isExercise(s.exercise) ? t(`disc.${s.exercise}.title`) : t('disc.reflection'));

function draw(focus?: string) {
  const body = $('#discBody'),
    foot = $('#discFoot');
  $('#discClose').textContent = run ? t('disc.close') : t('btn.close');
  dlg.classList.toggle('running', !!run);
  if (!run) {
    $('#discTitle').textContent = t('disc.title');
    const goals = pickGoals().length > 0;
    const list = [...journal.sessions].sort((x, y) =>
      (y.date + (y.updatedAt ?? '')).localeCompare(x.date + (x.updatedAt ?? '')),
    );
    body.innerHTML = `<p class="disc-lead">${esc(t('disc.lead'))}</p>
      <div class="disc-exercises">${EXERCISES.map(ex => {
        const off = ex === 'what-for' && !goals;
        return `<button type="button" class="disc-ex" data-disc-start="${ex}"${off ? ' disabled' : ''}>
          <span class="disc-ex-title">◇ ${esc(t(`disc.${ex}.title`))}</span>
          <span class="disc-ex-about">${esc(off ? t('disc.needsGoal') : t(`disc.${ex}.about`))}</span></button>`;
      }).join('')}</div>
      ${
        list.length
          ? `<h3 class="disc-h">${esc(t('disc.reflections'))}</h3><ul class="disc-refl">${list
              .map(
                s => `<li><button type="button" class="disc-open" data-disc-open="${esc(s.id)}"><span class="disc-date">${esc(short(s.date))}</span>
              <span>${esc(titleOf(s))}${s.done || !isExercise(s.exercise) ? '' : ` <span class="meta">· ${esc(t('disc.unfinished'))}</span>`}</span></button>
              <button type="button" class="icon-btn" data-disc-del="${esc(s.id)}" aria-label="${esc(`${t('disc.delete')}: ${titleOf(s)}`)}" title="${esc(t('disc.delete'))}">×</button></li>`,
              )
              .join('')}</ul>`
          : ''
      }`;
    foot.innerHTML = '';
    foot.hidden = true;
    return;
  }
  const c = ctx(run);
  $('#discTitle').textContent = t(`disc.${run.ex}.title`);
  body.innerHTML = `${dots(run.ex, run.a, run.at)}<div class="disc-step">${stepHtml(run.ex, run.a, run.at, c)}</div>`;
  foot.innerHTML = footHtml(run.ex, run.a, run.at, c);
  foot.hidden = false;
  const el = focus
    ? body.querySelector<HTMLElement>(focus)
    : body.querySelector<HTMLElement>('textarea, input:not([type=checkbox]), [aria-pressed]');
  el?.focus();
}

// A reflection written by a newer version: its texts, as they are.
function drawReadOnly(s: Session) {
  const texts: string[] = [];
  const walk = (v: unknown) =>
    typeof v === 'string'
      ? v.trim() && texts.push(v)
      : v && typeof v === 'object' && Object.values(v as object).forEach(walk);
  walk(s.answers);
  $('#discTitle').textContent = t('disc.reflection');
  $('#discClose').textContent = t('btn.close');
  $('#discBody').innerHTML =
    `<p class="hint">${esc(t('disc.readOnly'))}</p>${texts.map(x => `<p class="disc-said">${esc(x)}</p>`).join('')}`;
  $('#discFoot').hidden = true;
}

/* ---------- Opening ---------- */

export function openDiscovery() {
  markSeen({ discovery: true });
  if (dirty) persist();
  run = null;
  draw();
  if (!dlg.open) dlg.showModal();
}

function start(ex: ExerciseId) {
  run = { id: null, ex, a: {}, at: stepsOf(ex, {})[0], made: [], done: false };
  draw();
}

// An unfinished one continues where it stopped; a finished one opens at its first step.
function reopen(id: string) {
  const s = journal.sessions.find(x => x.id === id);
  if (!s) return;
  if (!isExercise(s.exercise)) return drawReadOnly(s);
  const a = answersOf(s.answers),
    at = a.step;
  delete a.step;
  const ok = !s.done && at && (at === 'end' || stepsOf(s.exercise, a, at).includes(at));
  run = {
    id,
    ex: s.exercise,
    a,
    at: ok ? at : stepsOf(s.exercise, a)[0],
    made: s.made.filter((x): x is string => typeof x === 'string'),
    done: s.done,
  };
  draw();
}

/* ---------- Moving ---------- */

// The goal radio is read on Next, so a run that only showed the list stores nothing.
function readChoice(r: Run) {
  const goal = dlg.querySelector<HTMLInputElement>('input[name="disc-goal"]:checked');
  if (r.at === 'goal' && goal) {
    const g = pickGoals().find(x => `${x.plan}|${x.id}` === goal.value);
    if (g && (r.a.goal?.id !== g.id || r.a.goal.plan !== g.plan))
      r.a = { ...r.a, goal: { plan: g.plan, id: g.id, title: g.title } };
  }
}

function go(again = false) {
  if (!run) return;
  readChoice(run);
  if (run.at === 'goal' && !run.a.goal) return;
  const r = nextStep(run.ex, run.a, run.at, again);
  run.a = r.answers;
  run.at = r.to;
  if (r.to === 'end' && run.ex === 'areas') run.done = true; // nothing to add: reaching the end finishes it
  persist();
  draw();
}
function back() {
  if (!run) return;
  readChoice(run);
  const p = prevStep(run.ex, run.a, run.at);
  if (!p) return;
  run.at = p;
  persist();
  draw();
}

function finish() {
  if (!run) return;
  run.done = true;
  persist();
  run = null;
  dlg.close();
  requestRender();
}

// Add as visions / Link: one undoable action; a goal in another plan makes it the whole store's.
function addVisions() {
  const r = run;
  if (!r) return;
  const list = toMake(r.ex, r.a, visions.list);
  const g = r.ex === 'what-for' && r.a.serves !== false && r.a.goal;
  const goal = g ? pickGoals().find(x => x.plan === g.plan && x.id === g.id) : undefined;
  if (!list.length) return finish();
  const ids: string[] = [];
  undoable(
    () => {
      const made: string[] = [];
      list.forEach(m => {
        if (m.existing) return ids.push(m.existing.id);
        const v: Vision = {
          id: uid(),
          createdAt: today(),
          parents: [],
          title: m.title,
          description: m.description ?? '',
        };
        if (m.avoid) v.avoid = m.avoid;
        if (m.area) v.area = m.area;
        visions.list.push(v);
        made.push(v.id);
        ids.push(v.id);
      });
      saveVisions();
      if (goal)
        editPlan(goal.plan, data => {
          const x = data.goals.find(y => y.id === goal.id);
          if (x) setGoalVisions(x, [...ownVisions(x), ids[0]]);
        });
      r.made = [...r.made, ...made];
      r.done = true;
      persist();
      run = null;
      dlg.close();
      setView('visions');
      return made.length ? tp('disc.added', made.length) : t('disc.linked', { title: list[0].title });
    },
    undefined,
    !!goal && goal.plan !== plans.current,
  );
  document.querySelector(`.card.vision[data-open="${CSS.escape(ids[0])}"]`)?.scrollIntoView({ block: 'center' });
}

/* ---------- Typing and pressing ---------- */

// Each field writes its own answer; saved a second later, or at once on Next, Back and close.
function input(el: HTMLInputElement | HTMLTextAreaElement) {
  if (!run) return;
  const a = run.a,
    d = el.dataset,
    v = el.value;
  if (d.a) (a as Record<string, unknown>)[d.a] = v;
  else if (d.ladder) {
    const ladder = [...(a.ladder ?? [])];
    ladder[Number(d.ladder)] = v;
    a.ladder = Array.from(ladder, x => x ?? '');
  } else if (d.s5) {
    const lines = [...(a.s5 ?? [])];
    const i = Number(d.s5);
    for (let k = 0; k <= i; k++) lines[k] = lines[k] ?? { text: '', area: '' };
    lines[i] = { ...lines[i], [d.part === 'area' ? 'area' : 'text']: v };
    a.s5 = lines;
  } else if (d.better) a.better = { ...a.better, [d.better]: v };
  else if (d.vision) {
    const cur = a.vision ?? { text: dlg.querySelector<HTMLInputElement>('[data-vision="text"]')!.value, area: '' };
    a.vision = { ...cur, [d.vision === 'area' ? 'area' : 'text']: v };
  } else if ('serves' in d) a.serves = (el as HTMLInputElement).checked;
  else if (el.name === 'disc-pick') a.pick = v;
  else return;
  if (run.at === 'end' && (d.vision || 'serves' in d)) $('#discFoot').innerHTML = footHtml(run.ex, a, run.at, ctx(run));
  later();
}

function rate(area: string, v: number) {
  if (!run) return;
  const ratings = { ...run.a.ratings };
  if (v) ratings[area] = v;
  else delete ratings[area];
  run.a = { ...run.a, ratings };
  later();
  draw(`[data-rate="${CSS.escape(area)}"][data-v="${v}"]`);
}

function addArea() {
  if (!run) return;
  const name = (prompt(t('disc.addAreaAsk')) || '').trim().slice(0, 80);
  if (!name) return;
  run.a = { ...run.a, extra: [...(run.a.extra ?? []), name] };
  later();
  draw(`[data-rate="${CSS.escape(name)}"][data-v="1"]`);
}

// The picked area's vision or goal form, filled in; the run is finished first.
function openFor(kind: 'vision' | 'goal') {
  const r = run;
  if (!r?.a.pick) return;
  const area = r.a.pick,
    line = r.a.better?.[area]?.trim();
  finish();
  if (kind === 'goal') return openForm('goal', null, { category: area });
  openForm('vision', null, { area });
  if (line) $<HTMLTextAreaElement>('#f-description').value = line;
}

const DO: Record<string, () => void> = {
  next: () => go(),
  again: () => go(true),
  back,
  finish,
  add: addVisions,
  vision: () => openFor('vision'),
  goal: () => openFor('goal'),
  'add-area': addArea,
};

export function listenDiscovery() {
  const form = $<HTMLFormElement>('#discForm');
  form.addEventListener('input', e => input(e.target as HTMLInputElement));
  form.addEventListener('change', e => {
    const el = e.target as HTMLInputElement;
    if (el.type === 'checkbox' || el.type === 'radio') input(el);
  });
  // Enter in a line and Ctrl+Enter in a text box do what the main button does.
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && (e.target as Element).tagName === 'TEXTAREA') {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const main = $('#discFoot').querySelector<HTMLElement>('[type="submit"]');
    if (main) DO[main.dataset.discDo!]?.();
  });
  dlg.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-disc-do],[data-disc-start],[data-disc-open],[data-disc-del],[data-rate],#discClose',
    );
    if ((e.target as HTMLElement) === dlg || el?.id === 'discClose') return dlg.close();
    if (!el) return;
    const d = el.dataset;
    if (d.discDo && el.getAttribute('type') !== 'submit') DO[d.discDo]?.();
    else if (d.discStart && isExercise(d.discStart)) start(d.discStart);
    else if (d.discOpen) reopen(d.discOpen);
    else if (d.rate) rate(d.rate, Number(d.v));
    else if (d.discDel && confirm(t('disc.deleteAsk'))) {
      deleteSession(d.discDel);
      draw();
    }
  });
  // Esc and the corner button keep what was typed.
  dlg.addEventListener('close', () => {
    if (run && dirty) persist();
    run = null;
    requestRender();
  });
}
