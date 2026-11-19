/** The item dialog: field builders, opening a form, reading and checking it, saving and deleting. */
import { db, visions } from '../../core/state';
import { addRelation, canRelate, findEntity, relsFrom, relsTo } from '../../core/relations';
import { toast } from '../toast';
import { $, esc } from '../dom';
import { isNum, numInput, parseNum, uid } from '../../core/util';
import { dateInput, parseDateInput, today } from '../../core/dates';
import { t, tp } from '../../i18n/index';
import { canParent, ownVisions, setGoalVisions, visionRel } from '../../core/visions';
import { setCal } from '../calendar';
import { activityChoice, activityForm, readRepeat, updateRepeatFields } from './activity';
import { goalForm, updateProgressFields, updateSmartLive } from './goal';
import { stateForm, updateStateFields } from './state';
import { fillRelTypes, relationForm } from './relation';
import { visionForm } from './vision';
import { saveVisions } from '../../store/visions';
import { ownMetric, smartCheck } from '../../core/progress';
import { addEntry, convertState, deleteEntry, entriesOf, isCumulative, recordMeasurement } from '../../core/cumulative';
import { checkedOn, dayItemsDone, followList, setCheckin, tickable } from '../../core/routines/checkins';
import { dropRoutineDeps } from '../../core/normalize';
import { save } from '../../store/plans';
import { requestRender } from '../render';
import type { Activity, Goal, Item, ItemKind, RelType, Relation, Scale, State, Vision } from '../../core/model';
import type { TextKey } from '../../i18n/index';
import type { WithList } from '../../core/routines/checkins';

// A new item's preset links by relation type ({ subactivity: [parentId] }), a new relationship's ends
// ({ from: id }), and for a new activity `repeat`: whether it repeats.
export interface Links {
  [type: string]: string[] | string | undefined;
}
// What a form is drawn from: the item, or a new one's preset links.
export type New<T> = Partial<T> & { links?: Links };
export type FormKind = ItemKind | 'relation';
// Each field's value; a field that occurs more than once (a link list) holds them all, read through arr().
export type FormVals = Record<string, string>;
export type Errors = Partial<Record<string, string>>;

// Replace all outgoing links of one type from an entity.
export function setLinks(fromId: string, type: RelType, toIds: string[]) {
  db.relations = db.relations.filter(r => !(r.from === fromId && r.type === type));
  const errors = toIds.map(to => addRelation(fromId, to, type)).filter(Boolean);
  if (errors.length) toast(errors[0]!);
}

// Replace all incoming links of one type to an entity, e.g. the activities that contribute to a goal.
export function setIncoming(toId: string, type: RelType, fromIds: string[]) {
  db.relations = db.relations.filter(r => !(r.to === toId && r.type === type));
  const errors = fromIds.map(from => addRelation(from, toId, type)).filter(Boolean);
  if (errors.length) toast(errors[0]!);
}

/* =========================================================
   Forms
   ========================================================= */

export const modal = $<HTMLDialogElement>('#modal');
// The open form; `choose` holds a new activity's links while it asks whether the activity repeats.
export let formCtx: { kind: FormKind; id: string | null; choose?: Links; snap?: string } | null = null;

export function field(name: string, label: string, input: string, hint = '') {
  return `<div class="field" data-field="${name}"><label for="f-${name}">${label}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ''}<div class="err"></div></div>`;
}
export const text = (name: string, v: string | undefined, ph = '') =>
  `<input type="text" id="f-${name}" name="${name}" value="${esc(v)}" placeholder="${esc(ph)}">`;
// A text field rather than type="number", so both a decimal dot and comma work in every browser.
export const num = (name: string, v: string | number | undefined, ph = '') =>
  `<input type="text" data-num id="f-${name}" name="${name}" value="${esc(numInput(v))}" placeholder="${esc(ph)}" inputmode="decimal" autocomplete="off">`;
// A dd/mm/yyyy text field in every language, with the app's own calendar (weeks start on Monday);
// the browser's date field and picker follow the browser's language instead.
export const date = (name: string, v: string | undefined) => `<div class="date-field">
  <input type="text" data-date id="f-${name}" name="${name}" value="${esc(dateInput(v))}" placeholder="${esc(t('f.datePh'))}" inputmode="numeric" autocomplete="off" maxlength="10">
  <button type="button" class="date-pick" data-cal-open title="${esc(t('f.pickDate'))}" aria-label="${esc(t('f.pickDate'))}" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg></button>
</div>`;
export const area = (name: string, v: string | undefined, ph = '') =>
  `<textarea id="f-${name}" name="${name}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
export const select = (name: string, opts: Record<string, string>, v: string | undefined) =>
  `<select id="f-${name}" name="${name}">${Object.entries(opts)
    .map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`)
    .join('')}</select>`;

// `links` pre-fills a new item's relations by type, e.g. { subactivity: [parentId] };
// for a new relationship, { from: id } pre-selects its source.
// A new activity first asks whether it is done once or repeats; `links.repeat` carries the answer.
export function openForm(kind: FormKind, id: string | null = null, links: Links = {}) {
  // A line to a vision opens the vision that holds the link: the one served by a goal, or the narrower of two.
  const vr = kind === 'relation' && visionRel(id);
  if (vr) return openForm('vision', vr.type === 'serves' ? vr.to : vr.from);
  formCtx = { kind, id };
  setCal(null);
  let item: Item | null | undefined = null;
  if (id) item = kind === 'relation' ? db.relations.find(r => r.id === id) : findEntity(id)?.item;
  $('#deleteBtn').hidden = !item;
  $('#saveBtn').hidden = false;
  $('#modalTitle').textContent = t(((item ? 'edit.' : 'new.') + kind) as TextKey);
  if (kind === 'activity' && !item && !links.repeat) {
    formCtx.choose = links;
    $('#saveBtn').hidden = true;
    $('#modalBody').innerHTML = activityChoice();
    if (!modal.open) modal.showModal();
    setTimeout(() => modal.querySelector<HTMLElement>('[data-act-kind]')?.focus(), 30);
    return;
  }
  $('#modalBody').innerHTML = (
    { goal: goalForm, state: stateForm, activity: activityForm, relation: relationForm, vision: visionForm } as Record<
      FormKind,
      (item: New<Item>) => string
    >
  )[kind](item || { links });
  if (kind === 'relation') {
    const r = (item || links) as Partial<Relation>;
    if (r.from) $<HTMLSelectElement>('#f-from').value = r.from;
    if (r.to) $<HTMLSelectElement>('#f-to').value = r.to;
    fillRelTypes(r.type);
  }
  if (kind === 'goal') {
    updateProgressFields();
    updateSmartLive();
  }
  if (kind === 'activity') updateRepeatFields();
  if (kind === 'state') updateStateFields();
  formCtx.snap = formSnapshot();
  if (!modal.open) modal.showModal();
  if (!item) setTimeout(() => modal.querySelector<HTMLElement>('input, select, textarea')?.focus(), 30);
}

// What the form holds now (its fields, and entries marked for deletion), to tell whether anything was changed.
const formSnapshot = () =>
  JSON.stringify([
    ...[...modal.querySelectorAll<HTMLInputElement>('input:not(.picker-search), select, textarea')].map(i =>
      i.type === 'checkbox' || i.type === 'radio' ? i.checked : i.value,
    ),
    modal.querySelectorAll('.dropped').length,
  ]);
export const formChanged = () => formCtx?.snap !== undefined && formSnapshot() !== formCtx.snap;

// Targets an item links to by relation type – stored relations, or the presets of a new item.
export const linksOf = (item: New<Item>, type: RelType): string[] =>
  item.id ? relsFrom(item.id, type).map(r => r.to) : (item.links?.[type] as string[] | undefined) || [];
// Sources that link to an item by relation type, e.g. the activities contributing to a goal.
export const linkedFrom = (item: New<Item>, type: RelType): string[] =>
  item.id ? relsTo(item.id, type).map(r => r.from) : [];

export function formValues() {
  const fd = new FormData($<HTMLFormElement>('#modalForm'));
  const v: Record<string, string | string[]> = {};
  for (const [k, val] of fd.entries()) {
    if (k in v) v[k] = ([] as string[]).concat(v[k], val as string);
    else v[k] = val as string;
  }
  // Number fields are stored with a dot and dates as yyyy-mm-dd; `bad` maps fields that hold neither to their error.
  const bad: Errors = {};
  modal.querySelectorAll<HTMLInputElement>('input[data-num]').forEach(i => {
    const n = parseNum(i.value);
    if (!i.value.trim()) v[i.name] = '';
    else if (isNaN(n)) {
      v[i.name] = '';
      if (!i.closest('[hidden]')) bad[i.name] = t('err.number');
    } else v[i.name] = String(n);
  });
  modal.querySelectorAll<HTMLInputElement>('input[data-date]').forEach(i => {
    v[i.name] = i.value.trim() ? parseDateInput(i.value) || '' : '';
    if (i.value.trim() && !v[i.name]) bad[i.name] = t('err.date');
  });
  const arr = (k: string): string[] => (v[k] === undefined ? [] : ([] as string[]).concat(v[k]));
  return { v: v as FormVals, arr, bad };
}

export function showErrors(errs: Errors) {
  modal.querySelectorAll<HTMLElement>('.field[data-field]').forEach(f => {
    const e = errs[f.dataset.field!];
    f.classList.toggle('invalid', !!e);
    f.querySelector('.err')!.textContent = e || '';
  });
  const first = modal.querySelector<HTMLElement>(
    '.field.invalid input, .field.invalid textarea, .field.invalid select',
  );
  first?.closest('details')?.setAttribute('open', '');
  first?.focus();
}

export function submitForm() {
  const { kind, id } = formCtx!;
  const { v, arr, bad } = formValues();
  const existing = id ? findEntity(id)?.item : null;

  if (kind === 'relation') {
    // An edited relationship is validated without itself, and put back unchanged if the edit is invalid.
    if (!v.type) return showErrors({ type: v.from === v.to ? t('err.self') : t('rel.noneBetween') });
    if (v.type.startsWith('rev:')) Object.assign(v, { type: v.type.slice(4), from: v.to, to: v.from });
    const at = id ? db.relations.findIndex(r => r.id === id) : -1;
    const old = at >= 0 ? db.relations.splice(at, 1)[0] : null;
    const err = canRelate(v.from, v.to, v.type as RelType);
    if (err) {
      if (old) db.relations.splice(at, 0, old);
      return showErrors({ to: err });
    }
    if (old) db.relations.splice(at, 0, Object.assign(old, { from: v.from, to: v.to, type: v.type }));
    else db.relations.push({ id: uid(), from: v.from, to: v.to, type: v.type as RelType });
    return finish(t(old ? 'toast.relUpdated' : 'toast.relAdded'));
  }

  if (Object.keys(bad).length) return showErrors(bad);
  if (!v.title || !v.title.trim()) return showErrors({ title: t('err.titleRequired') });

  if (kind === 'vision') {
    const vis = (existing || { id: uid(), createdAt: today(), parents: [] }) as Vision;
    Object.assign(vis, { title: v.title.trim(), description: (v.description || '').trim(), parents: [] });
    if (!existing) visions.list.push(vis);
    arr('parents').forEach(p => {
      if (!canParent(vis.id, p)) vis.parents.push(p);
    });
    const chosen = new Set(arr('goals'));
    db.goals.forEach(g => {
      const own = ownVisions(g),
        has = own.includes(vis.id);
      if (chosen.has(g.id) !== has) setGoalVisions(g, has ? own.filter(x => x !== vis.id) : [...own, vis.id]);
    });
    saveVisions();
    return finish(t(existing ? 'toast.visionUpdated' : 'toast.visionAdded'));
  }

  if (kind === 'goal') {
    const c = smartCheck(v as unknown as Goal);
    if (Object.keys(c.errs).length) return showErrors(c.errs);
    const g = Object.assign((existing as Goal) || { id: uid(), createdAt: today() }, {
      title: v.title.trim(),
      specific: v.specific.trim(),
      metric: v.metric.trim(),
      unit: v.unit.trim(),
      baseline: v.baseline,
      current: v.current,
      target: v.target,
      achievable: v.achievable.trim(),
      relevant: v.relevant.trim(),
      startDate: v.startDate,
      deadline: v.deadline,
      status: v.status,
      category: v.category.trim(),
    }) as Goal;
    // The metric fields are kept while measuring by activities, in case the goal switches back.
    if (ownMetric(v as unknown as Goal)) delete g.progress;
    else g.progress = v.progress as Goal['progress'];
    // How a state that adds up counts; kept when the field is not shown.
    if (v.period) g.period = v.period as Scale;
    if (!existing) db.goals.push(g);
    setLinks(g.id, 'subgoal', v.parent ? [v.parent] : []);
    setLinks(g.id, 'depends', arr('depends'));
    setIncoming(g.id, 'contributes', arr('activities'));
    setGoalVisions(g, arr('visions'));
    return finish(t(existing ? 'toast.goalUpdated' : 'toast.goalCreated'));
  }

  if (kind === 'state') {
    // Switching between adding up and single measurements turns what is there into the other kind.
    const had =
      existing &&
      (isCumulative(existing as State)
        ? entriesOf(existing as State).length
        : ((existing as State).history || []).length);
    if (
      had &&
      !v.addsUp !== !isCumulative(existing as State) &&
      !confirm(t(v.addsUp ? 'cu.confirmToCumulative' : 'cu.confirmToPlain', { name: (existing as State).title }))
    )
      return;
    const s = Object.assign((existing as State) || { id: uid(), history: [], value: '' }, {
      title: v.title.trim(),
      description: v.description.trim(),
      unit: v.unit.trim(),
    }) as State;
    s.history ||= [];
    if (!existing) db.states.push(s);
    setLinks(s.id, 'measures', arr('goals'));
    modal
      .querySelectorAll<HTMLElement>('[data-drop-entry][aria-pressed="true"]')
      .forEach(b => deleteEntry(s, b.dataset.dropEntry!));
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
    const list =
      rows &&
      [...rows.querySelectorAll<HTMLElement>('.li-row')]
        .map(r => ({
          id: r.dataset.liRow || uid(),
          text: r.querySelector<HTMLInputElement>('.li-input')!.value.trim(),
          done: r.querySelector<HTMLInputElement>('.li-check')!.checked,
        }))
        .filter(i => i.text);
    if (list && !list.length) return showErrors({ list: t('err.listEmpty') });
    if (!startDate) return showErrors({ startDate: t('err.startRequired') });
    const { repeat, dueDate = v.dueDate, errors } = readRepeat(v, startDate);
    if (errors) return showErrors(errors);
    if (!repeat && !dueDate) return showErrors({ dueDate: t('err.dueRequired') });
    if (!repeat && startDate > dueDate) return showErrors({ dueDate: t('err.startAfterDue') });
    const a = Object.assign((existing as Activity) || { id: uid(), createdAt: today() }, {
      // A list has no status field: it keeps its own (followList moves it on below).
      title: v.title.trim(),
      description: v.description.trim(),
      status: list ? (existing as Activity | undefined)?.status || 'todo' : v.status,
      startDate,
      dueDate,
    }) as Activity;
    // A routine keeps its check-ins even when it stops repeating, in case it is switched back.
    if (repeat) Object.assign(a, { repeat, status: 'todo', checkins: a.checkins || {} });
    else delete a.repeat;
    if (list) {
      // Only items that changed get a new time; removed ones are remembered for sync. A list
      // routine's items are ticked per day instead (listDays).
      if (repeat) list.forEach(i => (i.done = false));
      const now = new Date().toISOString(),
        before = new Map(((existing as Activity | undefined)?.list || []).map(i => [i.id, i]));
      a.list = list.map(i => {
        const was = before.get(i.id);
        return was && was.text === i.text && !!was.done === i.done ? { ...i, at: was.at } : { ...i, at: now };
      });
      const kept = new Set(a.list.map(i => i.id));
      const removed = [...before.keys()].filter(id => !kept.has(id));
      removed.forEach(id => ((a.droppedItems ||= {})[id] = 1));
      // A day left with only ticked items once one is removed is done (any amounts are not asked for).
      if (repeat && removed.length)
        Object.keys(a.listDays || {}).forEach(iso => {
          if (tickable(a, iso) && !checkedOn(a, iso) && dayItemsDone(a as WithList, iso) === a.list!.length)
            setCheckin(a, iso, true);
        });
      if (!repeat) followList(a as WithList);
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

export function finish(msg: string) {
  save();
  modal.close();
  requestRender();
  toast(msg);
}
