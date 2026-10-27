'use strict';

/* =========================================================
   Data model
   ---------------------------------------------------------
   goals      – SMART goals
   states     – snapshots of "where I am now" (optionally numeric)
   activities – concrete actions with status and due date
   relations  – typed links between any two of the above
   ========================================================= */

const STORAGE_KEY = 'actionplan.v1';

// Labels for kinds, relation types and statuses live in i18n.js (kind.*, rel.*, activity.*, goal.*).
const KINDS = ['goal', 'state', 'activity'];

// `from` lists the allowed source kinds; `to: 'same'` means the target must be the same kind as the source.
const REL_TYPES = {
  contributes: { from: ['activity'],         to: ['goal'],     color: 'var(--contrib)' },
  subgoal:     { from: ['goal'],             to: ['goal'],     color: 'var(--goal)', width: 2.4 },
  subactivity: { from: ['activity'],         to: ['activity'], color: 'var(--activity)', width: 2.4 },
  depends:     { from: ['activity', 'goal'], to: 'same',       color: 'var(--bad)', dash: true },
  measures:    { from: ['state'],            to: ['goal'],     color: 'var(--rel-state)' },
  improves:    { from: ['activity'],         to: ['state'],    color: 'var(--rel-state)', dash: true },
  related:     { from: '*',                  to: '*',          color: 'var(--ink-2)', dash: true },
};
const ACYCLIC = new Set(['depends', 'subgoal', 'subactivity']);
const SYMMETRIC = new Set(['related']);
const PARENT_REL = { goal: 'subgoal', activity: 'subactivity' };

const ACTIVITY_STATUS = ['todo', 'doing', 'done'];
const GOAL_STATUS = ['active', 'achieved', 'paused'];
// Visual state used to color goals and activities on the map.
const NODE_STATES = ['todo', 'doing', 'late', 'blocked', 'done'];

const relLabel = type => (REL_TYPES[type] ? t('rel.' + type) : type);
const statusLabels = (list, prefix) => Object.fromEntries(list.map(k => [k, t(prefix + k)]));

let db = emptyDb();
const ui = {
  view: 'dashboard', goalFilter: 'active', category: '', activityGoal: '', mapGoal: '', timelineGoal: '', graphGoal: '',
  mapHidden: new Set(), hideDone: false, nextAll: false, tlPx: 8, mapScale: 1, tlDeps: true, planBadges: true, search: '', mapSelected: null, mapRel: null, help: false,
  rtWeek: {}, // the Monday each routine card's week strip shows, when not this week
};

// Small per-device preferences (view, hidden relation types, hide-done, theme).
const prefs = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`${STORAGE_KEY}.${key}`); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`${STORAGE_KEY}.${key}`, JSON.stringify(value)); } catch (e) { /* ignore */ }
  },
};

function emptyDb() {
  return { goals: [], states: [], activities: [], relations: [], deleted: {} };
}

/* ---------- Plans ----------
   Each action plan is stored under its own key; an index keeps names and the current plan.
   Data from the single-plan version (STORAGE_KEY) is migrated into the first plan. */
const PLANS_KEY = 'actionplan.plans';
const planKey = id => `actionplan.plan.${id}`;
let plans = { current: null, list: [] };
const currentPlan = () => plans.list.find(p => p.id === plans.current);

function readPlan(id) {
  try {
    const raw = localStorage.getItem(planKey(id));
    return raw ? normalize(JSON.parse(raw)) : emptyDb();
  } catch (e) {
    return emptyDb();
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLANS_KEY));
    if (Array.isArray(saved?.list) && saved.list.length) plans = saved;
  } catch (e) { /* start fresh */ }
  if (plans.list.length) {
    if (!currentPlan()) plans.current = plans.list[0].id;
    takePlanSnapshot(plans);
    db = readPlan(plans.current);
    takeSnapshot(db);
    return;
  }
  let legacy = emptyDb();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) legacy = normalize(JSON.parse(raw));
  } catch (e) { /* ignore */ }
  const id = uid();
  plans = { current: id, list: [{ id, name: t('plan.defaultName') }] };
  takePlanSnapshot({ list: [] }); // a brand-new plan list: nothing in it was deleted
  db = legacy;
  takeSnapshot(db);
  save();
}

function save() {
  stampChanges(db);
  stampPlanChanges(plans);
  try {
    localStorage.setItem(planKey(plans.current), JSON.stringify(db));
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  } catch (e) {
    toast(t('err.storage'));
  }
  scheduleSync();
}

function openPlan(id) {
  plans.current = id;
  db = readPlan(id);
  takeSnapshot(db);
  Object.assign(ui, { category: '', activityGoal: '', mapGoal: '', timelineGoal: '', graphGoal: '', mapSelected: null, mapRel: null, search: '', mapRefocus: true, rtWeek: {} });
  save();
  renderPlanSwitch();
  render();
}

// Plan names are unique, ignoring case and spaces around them.
const nameTaken = (name, exceptId) => plans.list.some(p => p.id !== exceptId && p.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
// The name itself if it is free, else with the first free number added: "Sample plan 2".
function uniqueName(name) {
  let candidate = name, n = 1;
  while (nameTaken(candidate)) candidate = `${name} ${++n}`;
  return candidate;
}

// Asks for a plan name until it is free (or the user cancels); `exceptId` is the plan being renamed.
function askPlanName(question, suggestion, exceptId) {
  let name = prompt(question, suggestion)?.trim();
  while (name && nameTaken(name, exceptId)) name = prompt(`${t('plan.nameTaken', { name })}\n${question}`, name)?.trim();
  return name;
}

function createPlan(name, data = emptyDb()) {
  const id = uid();
  plans.list.push({ id, name });
  plans.current = id;
  db = data;
  takeSnapshot(db); // what a new plan starts with is not an edit
  save();
  openPlan(id);
}

function deletePlan(id) {
  try { localStorage.removeItem(planKey(id)); } catch (e) { /* ignore */ }
  plans.list = plans.list.filter(p => p.id !== id);
  if (!plans.list.length) return createPlan(t('plan.defaultName'));
  openPlan(plans.list[0].id);
}

// Moves everything in one plan into another and opens that one. Items keep their ids unless the
// target already has (or once deleted) that id; then they get new ones and their relations follow.
// The moved items are saved as changes, so sync carries them; `remove` deletes the source afterwards.
function mergePlanInto(fromId, toId, remove = false) {
  if (fromId === toId) return;
  const source = fromId === plans.current ? JSON.parse(JSON.stringify(db)) : readPlan(fromId);
  if (plans.current !== toId) openPlan(toId);
  const taken = new Set([...SYNC_COLLS.flatMap(c => db[c].map(x => x.id)), ...Object.keys(db.deleted || {})]);
  const ids = new Map();
  const place = x => {
    const id = taken.has(x.id) ? uid() : x.id;
    taken.add(id);
    ids.set(x.id, id);
    delete x.updatedAt;
    return Object.assign(x, { id });
  };
  SYNC_COLLS.filter(c => c !== 'relations').forEach(c => db[c].push(...source[c].map(place)));
  db.relations.push(...source.relations.filter(r => ids.has(r.from) && ids.has(r.to))
    .map(r => place({ ...r, from: ids.get(r.from), to: ids.get(r.to) })));
  if (remove) {
    try { localStorage.removeItem(planKey(fromId)); } catch (e) { /* ignore */ }
    plans.list = plans.list.filter(p => p.id !== fromId);
  }
  save();
  renderPlanSwitch();
  render();
}

function normalize(data) {
  const d = emptyDb();
  for (const k of SYNC_COLLS) if (Array.isArray(data?.[k])) d[k] = data[k];
  if (data?.deleted && typeof data.deleted === 'object' && !Array.isArray(data.deleted)) d.deleted = data.deleted;
  return d;
}

/* ---------- Utilities ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const viewEl = $('#view');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isNum = v => v !== '' && v !== null && v !== undefined && !isNaN(Number(v));

// Local calendar date as YYYY-MM-DD.
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function today() {
  return isoDate(new Date());
}
function daysUntil(date) {
  if (!date) return null;
  return Math.round((new Date(date + 'T00:00') - new Date(today() + 'T00:00')) / 86400000);
}
function fmtDate(date) {
  if (!date) return '';
  return new Date(date + 'T00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}
// "3 Mar 2026 – 9 Apr 2026", or the one date there is.
const fmtSpan = (s, e) => (s && e ? `${fmtDate(s)} – ${fmtDate(e)}` : fmtDate(s || e));
// A yyyy-mm-dd date in the app's language, read as a calendar day (no time zone shift).
const fmtDay = (iso, opts) => new Date(iso + 'T00:00Z').toLocaleDateString(locale(), { ...opts, timeZone: 'UTC' });
function fmtNum(n) {
  return Number(n).toLocaleString(locale(), { maximumFractionDigits: 2 });
}
// A number typed with a decimal dot or comma ("78.5", "78,5", "1 234,5", "1,234.5"); NaN if it isn't one.
function parseNum(s) {
  let v = String(s ?? '').trim().replace(/[\s  ']/g, '').replace(/^−/, '-');
  const dot = v.lastIndexOf('.'), comma = v.lastIndexOf(',');
  // With both, the last one is the decimal separator and the other groups thousands.
  if (dot >= 0 && comma >= 0) v = dot > comma ? v.replace(/,/g, '') : v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(v) ? Number(v) : NaN;
}
// A stored number ("78.5") as typed in the current language ("78,5" in Slovenian).
const numInput = v => (isNum(v) ? String(v).replace('.', (1.5).toLocaleString(locale()).charAt(1)) : v ?? '');
// Dates are typed as dd/mm/yyyy (also accepting dots, dashes or spaces, and yyyy-mm-dd) and stored as yyyy-mm-dd.
function parseDateInput(s) {
  s = String(s ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/), d, mo, y;
  if (m) [, y, mo, d] = m.map(Number);
  else if ((m = s.match(/^(\d{1,2})[/.\-\s]+(\d{1,2})[/.\-\s]+(\d{4})$/))) [, d, mo, y] = m.map(Number);
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
const dateInput = iso => (iso ? iso.split('-').reverse().join('/') : '');

const itemCount = () => db.goals.length + db.states.length + db.activities.length;

function collection(kind) {
  return { goal: db.goals, state: db.states, activity: db.activities }[kind];
}
function findEntity(id) {
  for (const kind of KINDS) {
    const item = collection(kind).find(x => x.id === id);
    if (item) return { kind, item };
  }
  return null;
}

/* ---------- Relations ---------- */

const relsFrom = (id, type) => db.relations.filter(r => r.from === id && (!type || r.type === type));
const relsTo = (id, type) => db.relations.filter(r => r.to === id && (!type || r.type === type));

// True if `target` is reachable from `start` following edges of `type`.
function reaches(start, target, type, seen = new Set()) {
  if (start === target) return true;
  if (seen.has(start)) return false;
  seen.add(start);
  return relsFrom(start, type).some(r => reaches(r.to, target, type, seen));
}

// Parent chain (nearest first) following a parent relation such as 'subactivity'.
function ancestors(id, type) {
  const out = [];
  for (let r = relsFrom(id, type)[0]; r && !out.includes(r.to); r = relsFrom(r.to, type)[0]) out.push(r.to);
  return out;
}
function descendants(id, type) {
  const out = [];
  const queue = [id];
  while (queue.length) {
    relsTo(queue.shift(), type).forEach(r => {
      if (!out.includes(r.from)) { out.push(r.from); queue.push(r.from); }
    });
  }
  return out;
}

const kindList = kinds => kinds.map(k => t('kindLower.' + k)).join(' / ');
// Human-readable allowed direction, e.g. "activity → activity, goal → goal".
function relSignature(type) {
  const d = REL_TYPES[type];
  if (d.from === '*') return '';
  return d.from.map(f => `${kindList([f])} → ${kindList(d.to === 'same' ? [f] : d.to)}`).join(', ');
}

function canRelate(from, to, type) {
  const def = REL_TYPES[type];
  const a = findEntity(from), b = findEntity(to);
  if (!def || !a || !b) return t('err.unknown');
  if (from === to) return t('err.self');
  if (def.from !== '*' && !def.from.includes(a.kind)) return t('err.relFrom', { rel: relLabel(type), kind: kindList(def.from) });
  if (def.to === 'same' && b.kind !== a.kind) return t('err.relTo', { rel: relLabel(type), kind: kindList([a.kind]) });
  if (Array.isArray(def.to) && !def.to.includes(b.kind)) return t('err.relTo', { rel: relLabel(type), kind: kindList(def.to) });
  if (db.relations.some(r => r.from === from && r.to === to && r.type === type)) return t('err.relExists');
  if (Object.values(PARENT_REL).includes(type) && relsFrom(from, type).length) return t('err.oneParent');
  if (ACYCLIC.has(type) && reaches(to, from, type)) return t('err.cycle');
  const parentRel = PARENT_REL[a.kind];
  if (parentRel && (type === 'depends' || type === parentRel)) {
    if (dependsInLine(from, to, type, a.kind)) return t('err.lineDep');
    if (wouldSelfBlock(from, to, type, a.kind)) return t('err.selfBlock');
  }
  return null;
}

// True if the link would leave an item depending on its own parent or sub-item, in either direction:
// directly for a new dependency, or through the new parent line for a new sub-activity or sub-goal.
function dependsInLine(from, to, type, kind) {
  const parentRel = PARENT_REL[kind];
  if (type === 'depends') return [...ancestors(from, parentRel), ...descendants(from, parentRel)].includes(to);
  const below = new Set([from, ...descendants(from, parentRel)]), above = new Set([to, ...ancestors(to, parentRel)]);
  return db.relations.some(r => r.type === 'depends'
    && ((below.has(r.from) && above.has(r.to)) || (above.has(r.from) && below.has(r.to))));
}

// Items `id` waits for: its own prerequisites plus those of every parent above it (see blockers).
const effectiveDeps = (id, kind) => [id, ...ancestors(id, PARENT_REL[kind])].flatMap(x => relsFrom(x, 'depends')).map(r => r.to);

// True if adding the link would make an item wait for itself, e.g. a parent depending on its
// own sub-activity: the sub-activity inherits that prerequisite, so both stay blocked for good.
function wouldSelfBlock(from, to, type, kind) {
  const rel = { id: '', from, to, type };
  db.relations.push(rel);
  try {
    const waitsForSelf = id => {
      const seen = new Set(), queue = effectiveDeps(id, kind);
      while (queue.length) {
        const x = queue.shift();
        if (x === id) return true;
        if (!seen.has(x)) { seen.add(x); queue.push(...effectiveDeps(x, kind)); }
      }
      return false;
    };
    return [from, ...descendants(from, PARENT_REL[kind])].some(waitsForSelf);
  } finally { db.relations.splice(db.relations.indexOf(rel), 1); }
}

function addRelation(from, to, type) {
  const err = canRelate(from, to, type);
  if (err) return err;
  db.relations.push({ id: uid(), from, to, type });
  return null;
}

// Relationship types that can link `from` → `to`; an edited relationship (`ignoreId`) does not count against itself.
function possibleTypes(from, to, ignoreId) {
  const all = db.relations;
  db.relations = all.filter(r => r.id !== ignoreId);
  // "Related" goes both ways, so it already exists when it links the two items the other way round.
  const twoWay = k => SYMMETRIC.has(k) && db.relations.some(r => r.type === k && r.from === to && r.to === from);
  try { return Object.keys(REL_TYPES).filter(k => !canRelate(from, to, k) && !twoWay(k)); } finally { db.relations = all; }
}

// Replace all outgoing links of one type from an entity.
function setLinks(fromId, type, toIds) {
  db.relations = db.relations.filter(r => !(r.from === fromId && r.type === type));
  const errors = toIds.map(to => addRelation(fromId, to, type)).filter(Boolean);
  if (errors.length) toast(errors[0]);
}

// Replace all incoming links of one type to an entity, e.g. the activities that contribute to a goal.
function setIncoming(toId, type, fromIds) {
  db.relations = db.relations.filter(r => !(r.to === toId && r.type === type));
  const errors = fromIds.map(from => addRelation(from, toId, type)).filter(Boolean);
  if (errors.length) toast(errors[0]);
}

function removeEntity(kind, id) {
  const list = collection(kind);
  list.splice(list.findIndex(x => x.id === id), 1);
  db.relations = db.relations.filter(r => r.from !== id && r.to !== id);
  if (ui.mapSelected === id) ui.mapSelected = null;
}

/* ---------- SMART & progress ---------- */

function smartCheck(g) {
  const errs = {};
  if (!g.title || g.title.trim().length < 4) errs.title = t('err.title');
  if (!g.specific || g.specific.trim().length < 15) errs.specific = t('err.specific');
  // A goal measured by its activities or routines needs no metric or target of its own.
  if (ownMetric(g)) {
    if (!g.metric || !g.metric.trim()) errs.metric = t('err.metric');
    if (!isNum(g.target)) errs.target = t('err.target');
    else if (isNum(g.baseline) && Number(g.baseline) === Number(g.target)) errs.target = t('err.targetSame');
  }
  if (!g.achievable || g.achievable.trim().length < 10) errs.achievable = t('err.achievable');
  if (!g.relevant || g.relevant.trim().length < 10) errs.relevant = t('err.relevant');
  if (!g.deadline) errs.deadline = t('err.deadline');
  else if (g.startDate && g.deadline <= g.startDate) errs.deadline = t('err.deadlineOrder');
  return {
    S: !errs.title && !errs.specific,
    M: !errs.metric && !errs.target,
    A: !errs.achievable,
    R: !errs.relevant,
    T: !errs.deadline,
    errs,
  };
}

// Latest numeric current-state linked via "measures" wins; otherwise the goal's own value.
function measuringState(g) {
  return relsTo(g.id, 'measures')
    .map(r => db.states.find(s => s.id === r.from))
    .filter(s => s && isNum(s.value))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
}
function goalCurrent(g) {
  if (byRoutines(g)) return Math.round(goalProgress(g));
  if (byActivities(g)) return countedActivities(g).filter(a => a.status === 'done').length;
  const st = measuringState(g);
  if (st) return Number(st.value);
  if (isNum(g.current)) return Number(g.current);
  return isNum(g.baseline) ? Number(g.baseline) : 0;
}
function goalProgress(g) {
  if (g.status === 'achieved') return 100;
  if (byRoutines(g)) {
    const kept = goalRoutines(g).map(a => consistency(a, g.startDate)).filter(v => v !== null);
    return kept.length ? (kept.reduce((sum, v) => sum + v, 0) / kept.length) * 100 : 0;
  }
  if (byActivities(g)) {
    const total = countedActivities(g).length;
    return total ? (goalCurrent(g) / total) * 100 : 0;
  }
  const b = isNum(g.baseline) ? Number(g.baseline) : 0;
  const target = Number(g.target);
  if (!isNum(g.target) || target === b) return 0;
  return clamp(((goalCurrent(g) - b) / (target - b)) * 100, 0, 100);
}

// Activities working toward a goal: direct contributors plus all their sub-activities.
function goalActivities(g) {
  const ids = new Set();
  relsTo(g.id, 'contributes').forEach(r => [r.from, ...descendants(r.from, 'subactivity')].forEach(id => ids.add(id)));
  return db.activities.filter(a => ids.has(a.id));
}

// Goals can measure progress by their activities instead of a metric (`progress: 'activities'`).
const byActivities = g => g.progress === 'activities';
// The activities such a goal counts: the actual pieces of work (activities without sub-activities
// of their own) under the goal and its sub-goals.
function countedActivities(g) {
  return treeActivities(g).filter(a => !isRoutine(a) && !relsTo(a.id, 'subactivity').length);
}

// The activities working toward a goal and its sub-goals.
function treeActivities(g) {
  const goals = [g, ...descendants(g.id, 'subgoal').map(id => db.goals.find(x => x.id === id)).filter(Boolean)];
  const ids = new Set(goals.flatMap(x => goalActivities(x).map(a => a.id)));
  return db.activities.filter(a => ids.has(a.id));
}

// Goals can also measure progress by how consistently their routines are kept (`progress: 'routines'`):
// the routines working toward the goal and its sub-goals.
const byRoutines = g => g.progress === 'routines';
// Measured by its own metric and target (form values say 'measure', stored goals leave it out).
const ownMetric = g => !g.progress || g.progress === 'measure';
const goalRoutines = g => treeActivities(g).filter(isRoutine);

// A routine is complete (for whatever waits for it) once it has ended.
const isComplete = (kind, item) => (kind === 'goal' ? item.status === 'achieved'
  : isRoutine(item) ? !!item.dueDate && item.dueDate < today() : item.status === 'done');

// Unfinished items this one waits for – its own dependencies and those inherited from its parents.
function blockers(item, kind = 'activity') {
  return [item.id, ...ancestors(item.id, PARENT_REL[kind])]
    .flatMap(id => relsFrom(id, 'depends'))
    .map(r => findEntity(r.to))
    .filter(e => e && e.kind === kind && !isComplete(kind, e.item))
    .map(e => e.item);
}

function activityState(a) {
  if (isRoutine(a)) return routineState(a);
  if (a.status === 'done') return 'done';
  if (blockers(a).length) return 'blocked';
  if (a.dueDate && daysUntil(a.dueDate) < 0) return 'late';
  return a.status === 'doing' ? 'doing' : 'todo';
}
function goalState(g) {
  if (g.status === 'achieved') return 'done';
  if (blockers(g, 'goal').length) return 'blocked';
  if (g.deadline && daysUntil(g.deadline) < 0) return 'late';
  if (g.status === 'paused') return 'todo';
  return (g.startDate && g.startDate <= today()) || goalProgress(g) > 0 ? 'doing' : 'todo';
}

// Everything relevant to one goal: its sub-goals and prerequisite goals, the activity trees
// working toward them (with their prerequisite chains), the activities waiting for those,
// and the related current states.
function goalScope(goalId) {
  const goal = new Set([goalId, ...descendants(goalId, 'subgoal')]);
  [...goal].forEach(id => relsFrom(id, 'depends').forEach(r => goal.add(r.to)));

  const activity = new Set();
  const addActivity = id => {
    if (activity.has(id)) return;
    activity.add(id);
    [...ancestors(id, 'subactivity'), ...descendants(id, 'subactivity')].forEach(addActivity);
    relsFrom(id, 'depends').forEach(r => addActivity(r.to));
  };
  db.relations.filter(r => r.type === 'contributes' && goal.has(r.to)).forEach(r => addActivity(r.from));
  // Activities that wait for this work belong here too (with their sub-activities), e.g. a former
  // sub-activity turned into a dependency – but without pulling in the rest of their own trees.
  const addWaiting = id => {
    if (activity.has(id)) return;
    [id, ...descendants(id, 'subactivity')].forEach(x => activity.add(x));
    relsTo(id, 'depends').forEach(r => addWaiting(r.from));
  };
  [...activity].forEach(id => relsTo(id, 'depends').forEach(r => addWaiting(r.from)));

  const state = new Set();
  db.relations.forEach(r => {
    if (r.type === 'measures' && goal.has(r.to)) state.add(r.from);
    if (r.type === 'improves' && activity.has(r.from)) state.add(r.to);
  });
  return { goal, activity, state };
}

/* ---------- Routines: activities that repeat ----------
   `repeat` is { every, unit: 'day' | 'week' | 'month' | 'year', ... }, like a calendar's custom
   recurrence: every `every` days, weeks, months or years, counted from the start date.
   - week: `days` (Monday = 0) it falls on, or `times`: any that many days per period;
   - month: `on` 'day' (`day` of the month, or the start's; 29–31 fall on the last day of shorter
     months), 'lastDay', 'nth' (the `nth` – 1 to 5, or -1 for the last – `weekday` of the month),
     or `times`: any that many days per period. Older routines store 'weekday' or 'last', which
     meant the start's n-th or last weekday; `sched` reads them as 'nth';
   - year: on the start's day and month;
   - `count`: it ends after that many occurrences (the due date is set to the last one).
   Older plans store { times, per: 'week' | 'month' } or { days }; `sched` reads both.
   `checkins` maps a date to 1 (done) or 0 (unticked, kept so sync can merge it). A routine runs
   from its start date to its due date, if any. Weeks start on Monday. */

const isRoutine = a => !!a?.repeat;
// Monday = 0 (day 0 of the epoch, 1 January 1970, was a Thursday).
const weekday = iso => (dayNum(iso) + 3) % 7;
const addDays = (iso, n) => dayStr(dayNum(iso) + n);
const daysBetween = (from, to) => Array.from({ length: Math.max(0, dayNum(to) - dayNum(from) + 1) }, (_, i) => addDays(from, i));
const routineStart = a => a.startDate || a.createdAt || today();
const checkedOn = (a, iso) => a.checkins?.[iso] === 1;
const runsOn = (a, iso) => iso >= routineStart(a) && !(a.dueDate && iso > a.dueDate);
const monthDay = iso => Number(iso.slice(8));
const monthLength = iso => monthDay(isoOf(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0));
const nthInMonth = iso => Math.ceil(monthDay(iso) / 7);
const lastInMonth = iso => monthDay(iso) + 7 > monthLength(iso);

function sched(a) {
  const r = a.repeat;
  if (r.unit) return r.unit === 'month' && !r.times ? monthRule({ every: 1, ...r }, routineStart(a)) : { every: 1, ...r };
  return r.days ? { every: 1, unit: 'week', days: r.days } : { every: 1, unit: r.per === 'month' ? 'month' : 'week', times: r.times };
}
// A monthly rule with everything it falls on spelled out (older ones took it from the start date).
function monthRule(s, start) {
  if (s.on === 'lastDay') return s;
  if (s.on === 'weekday' || s.on === 'last') return { ...s, on: 'nth', nth: s.on === 'last' ? -1 : nthInMonth(start), weekday: weekday(start) };
  if (s.on === 'nth') return { ...s, nth: s.nth ?? nthInMonth(start), weekday: s.weekday ?? weekday(start) };
  return { ...s, on: 'day', day: s.day || monthDay(start) };
}

// Flexible routines ask for a number of days per period; fixed ones fall on set days.
const isFlexible = a => !!sched(a).times;

// Number of the day, week, month or year a date falls in, and the first day of one.
function unitIndex(iso, unit) {
  const [y, m] = iso.split('-').map(Number);
  return { day: dayNum(iso), week: Math.floor((dayNum(iso) + 3) / 7), month: y * 12 + m - 1, year: y }[unit];
}
function unitFrom(i, unit) {
  return { day: () => dayStr(i), week: () => dayStr(i * 7 - 3), month: () => isoOf(Math.floor(i / 12), i % 12, 1), year: () => isoOf(i, 0, 1) }[unit]();
}

// Whether a fixed routine falls on a date (a flexible one may be done on any day).
function isDueDay(a, iso) {
  const s = sched(a);
  if (s.times) return true;
  const start = routineStart(a);
  if ((unitIndex(iso, s.unit) - unitIndex(start, s.unit)) % s.every) return false;
  if (s.unit === 'week') return (s.days || [weekday(start)]).includes(weekday(iso));
  if (s.unit === 'month') {
    if (s.on === 'lastDay') return monthDay(iso) === monthLength(iso);
    if (s.on === 'nth') return weekday(iso) === s.weekday && (s.nth < 0 ? lastInMonth(iso) : nthInMonth(iso) === s.nth);
    return monthDay(iso) === Math.min(s.day, monthLength(iso));
  }
  if (s.unit === 'year') return iso.slice(5) === start.slice(5);
  return true;
}

// The period progress is shown for: a flexible routine's own (every 2 weeks: two weeks from the
// start's week), or a fixed routine's calendar week (daily and weekly), month or year.
const periodUnit = a => { const s = sched(a); return s.times ? s.unit : s.unit === 'day' ? 'week' : s.unit; };

function periodOf(a, iso) {
  const s = sched(a), unit = periodUnit(a);
  const span = s.times ? s.every : 1;
  const first = unitIndex(routineStart(a), unit);
  const i = first + Math.floor((unitIndex(iso, unit) - first) / span) * span;
  return { from: unitFrom(i, unit), to: addDays(unitFrom(i + span, unit), -1) };
}

// The date of the `count`-th occurrence: the last due day, or the end of the last period needed.
function lastOccurrence(a, count) {
  const s = sched(a);
  if (s.times) {
    let p = periodOf(a, routineStart(a));
    for (let k = 1; k < Math.ceil(count / s.times); k++) p = periodOf(a, addDays(p.to, 1));
    return p.to;
  }
  let n = 0;
  for (let d = routineStart(a), i = 0; i < 36600; d = addDays(d, 1), i++) if (isDueDay(a, d) && ++n >= count) return d;
  return '';
}

// Check-ins in the period around `iso` against what the period asks for. Specific days count only
// when they are due; days before the start or after the end do not count.
function periodProgress(a, iso = today()) {
  const { from, to } = periodOf(a, iso);
  const days = daysBetween(from, to).filter(d => runsOn(a, d));
  if (!isFlexible(a)) {
    const due = days.filter(d => isDueDay(a, d));
    const done = due.filter(d => checkedOn(a, d)).length;
    return { from, to, done, target: due.length, met: due.length > 0 && done >= due.length };
  }
  const done = days.filter(d => checkedOn(a, d)).length;
  const { times } = sched(a);
  return { from, to, done, target: times, met: done >= times };
}

function routineState(a) {
  const now = today();
  if (a.dueDate && a.dueDate < now) return 'done';
  if (routineStart(a) > now) return 'todo';
  if (blockers(a).length) return 'blocked';
  const p = periodProgress(a, now);
  if (p.met) return 'done';
  if (!isFlexible(a)) {
    if (daysBetween(p.from, addDays(now, -1)).some(d => runsOn(a, d) && isDueDay(a, d) && !checkedOn(a, d))) return 'late';
  } else {
    // Days left to tick in this period, today included unless it is ticked already.
    const left = daysBetween(now, p.to).filter(d => runsOn(a, d) && !checkedOn(a, d)).length;
    if (p.target - p.done > left) return 'late';
  }
  return p.done ? 'doing' : 'todo';
}

// Periods met in a row (flexible) or due days ticked in a row (fixed); the current period or today
// counts once done, and does not break the streak before that.
function routineStreak(a) {
  const now = today(), start = routineStart(a);
  let n = 0;
  if (!isFlexible(a)) {
    for (let d = now; d >= start && n < 3660; d = addDays(d, -1)) {
      if (!isDueDay(a, d) || (a.dueDate && d > a.dueDate)) continue;
      if (checkedOn(a, d)) n++;
      else if (d !== now) break;
    }
    return { n, unit: 'day' };
  }
  let p = periodOf(a, now);
  if (!periodProgress(a, now).met) p = periodOf(a, addDays(p.from, -1));
  while (p.to >= start && periodProgress(a, p.from).met && n < 600) {
    n++;
    p = periodOf(a, addDays(p.from, -1));
  }
  // Periods of several weeks or months are counted as times.
  return { n, unit: sched(a).every > 1 ? 'day' : periodUnit(a) };
}

// Share (0–1) of periods met (flexible) or due days ticked (fixed) since `from`, or null when there is
// nothing to judge yet. The running period – and a first period cut short by the start – count
// only once met; today counts only once ticked.
function consistency(a, from = '') {
  const now = today();
  const start = from > routineStart(a) ? from : routineStart(a);
  const end = a.dueDate && a.dueDate < now ? a.dueDate : now;
  if (start > end) return null;
  let kept = 0, total = 0;
  if (!isFlexible(a)) {
    daysBetween(start, end).filter(d => isDueDay(a, d)).forEach(d => {
      if (d === now && !checkedOn(a, d)) return;
      total++;
      if (checkedOn(a, d)) kept++;
    });
  } else {
    for (let p = periodOf(a, start); p.from <= end; p = periodOf(a, addDays(p.to, 1))) {
      const { met } = periodProgress(a, p.from);
      if (!met && (p.to >= now || p.from < start)) continue;
      total++;
      if (met) kept++;
    }
  }
  return total ? kept / total : null;
}

// 1 January 2024 was a Monday.
const weekdayName = (i, style = 'short') => fmtDay(isoOf(2024, 0, 1 + i), { weekday: style });
// "first" … "fifth" or "last" (-1); in Slovenian it follows the weekday's gender (sreda, sobota and
// nedelja are feminine).
const nthWord = (nth, day) => t(`rt.nth.${nth < 0 ? 'last' : nth}${[2, 5, 6].includes(day) ? 'F' : ''}`);
// "the second Friday" or "the last Wednesday" of a month.
const nthWeekdayText = (nth, day) => t('rt.monthNth', { nth: nthWord(nth, day), day: weekdayName(day, 'long') });

// A short summary, like a calendar's: every day, every Mon, Thu, every 2 weeks on Mon, 3× a week.
function scheduleText(a) {
  const s = sched(a), start = routineStart(a);
  const every = tp('rt.every.' + s.unit, s.every);
  if (s.times) return s.every === 1 ? tp(s.unit === 'month' ? 'rt.perMonth' : 'rt.perWeek', s.times) : t('rt.timesEvery', { times: tp('rt.times', s.times), every });
  if (s.unit === 'week') {
    const days = [...(s.days || [weekday(start)])].sort();
    if (s.every === 1) return days.length === 7 ? t('rt.daily') : t('rt.onDays', { days: days.map(i => weekdayName(i)).join(', ') });
    return t('rt.on', { every, what: days.map(i => weekdayName(i)).join(', ') });
  }
  if (s.unit === 'month') return t('rt.on', { every, what: s.on === 'lastDay' ? t('rt.monthLast') : s.on === 'nth' ? nthWeekdayText(s.nth, s.weekday) : t('rt.monthDay', { d: s.day }) });
  if (s.unit === 'year') return t('rt.on', { every, what: fmtDay(start, { day: 'numeric', month: 'long' }) });
  return every;
}
// The first day from `from` on which a fixed routine is due, or '' when it is not due again.
function nextDueDay(a, from = today()) {
  const start = routineStart(a) > from ? routineStart(a) : from;
  for (let d = start, i = 0; i < 36600 && runsOn(a, d); d = addDays(d, 1), i++) if (isDueDay(a, d)) return d;
  return '';
}

// This period's progress; when nothing is due in it (an off week of every 2 weeks, before the
// start), the next due day instead.
function periodText(a, p = periodProgress(a)) {
  if (p.target) return t('rt.' + periodUnit(a), { done: p.done, target: p.target });
  const next = nextDueDay(a);
  return next ? t('rt.next', { date: fmtDay(next, { weekday: 'short', day: 'numeric', month: 'short' }) }) : t('rt.ended');
}
const streakText = ({ n, unit }) => tp('rt.streak.' + unit, n);

function toggleCheckin(id, iso) {
  const a = db.activities.find(x => x.id === id);
  if (!a || !isRoutine(a) || !runsOn(a, iso) || iso > today()) return;
  const wasMet = periodProgress(a, iso).met;
  a.checkins = { ...a.checkins, [iso]: checkedOn(a, iso) ? 0 : 1 };
  save();
  render();
  // Only the period running now is "this week done"; filling in an earlier one says nothing.
  const current = periodOf(a, today()).from === periodOf(a, iso).from;
  if (current && !wasMet && periodProgress(a, iso).met) toast(t({ month: 'rt.metMonth', year: 'rt.metYear' }[periodUnit(a)] || 'rt.metWeek'));
  $(`[data-checkin="${id}"][data-date="${iso}"]`)?.focus();
}

const mondayOf = iso => addDays(iso, -weekday(iso));
// "13–19 Oct" in the app's language.
const fmtRange = (from, to) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' })
  .formatRange(new Date(from + 'T00:00Z'), new Date(to + 'T00:00Z'));

// The weeks a routine's strip can show: from the week it started in to the week of its end date or
// today, whichever comes first (a routine that has not started stays on this week).
function routineWeeks(a) {
  const now = today(), end = a.dueDate && a.dueDate < now ? a.dueDate : now;
  const last = mondayOf(end), first = mondayOf(routineStart(a));
  return { first: first < last ? first : last, last, end };
}
// The week the strip shows (`w`, or else this one), kept within those weeks.
function shownWeek(a, w = ui.rtWeek[a.id]) {
  const { first, last } = routineWeeks(a);
  if (!w || w > last) return last;
  return w < first ? first : w;
}
function shiftRoutineWeek(id, dir) {
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
function routineWeek(a, from = shownWeek(a)) {
  const now = today(), { first, last } = routineWeeks(a);
  const fmt = iso => fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const arrow = (dir, off, tip = esc(t(dir < 0 ? 'rt.prevWeek' : 'rt.nextWeek'))) => `<button type="button" class="icon-btn rt-arrow" data-rt-week="${a.id}" data-dir="${dir}" title="${tip}" aria-label="${tip}" ${off ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg></button>`;
  const strip = daysBetween(from, addDays(from, 6)).map(d => {
    const on = checkedOn(a, d), off = d > now || !runsOn(a, d);
    const cls = ['rt-day', !isFlexible(a) && isDueDay(a, d) ? 'due' : '', on ? 'on' : '', d === now ? 'today' : ''].filter(Boolean).join(' ');
    const label = esc(t(on ? 'rt.dayOn' : 'rt.dayOff', { date: fmt(d) }));
    return `<button type="button" class="${cls}" data-checkin="${a.id}" data-date="${d}" aria-pressed="${on}" ${off ? 'aria-disabled="true"' : ''} title="${label}" aria-label="${label}"><span aria-hidden="true">${esc(weekdayName(weekday(d), 'narrow'))}</span></button>`;
  }).join('');
  return `<div class="rt-nav">${arrow(-1, from <= first)}<div class="rt-week" role="group" aria-label="${esc(from === mondayOf(now) ? t('rt.weekLabel') : fmtRange(from, addDays(from, 6)))}">${strip}</div>${arrow(1, from >= last)}</div>`;
}

function routineCard(a) {
  // The bar follows the week on the strip: this period as usual, or an earlier one with its dates.
  const week = shownWeek(a), { end } = routineWeeks(a), lastDay = addDays(week, 6) < end ? addDays(week, 6) : end;
  const p = periodProgress(a, lastDay), streak = routineStreak(a), st = activityState(a);
  const earlier = periodOf(a, lastDay).from !== periodOf(a, today()).from;
  const label = earlier ? t(p.target ? 'rt.past' : 'rt.pastNone', { range: fmtRange(p.from, p.to), done: p.done, target: p.target }) : periodText(a, p);
  const goals = relsFrom(a.id, 'contributes').map(r => linkTag(r.to)).join('');
  const blocked = blockers(a), now = today();
  const when = a.dueDate && a.dueDate < now ? `<span class="tag">${t('rt.ended')}</span>`
    : routineStart(a) > now ? `<span class="tag">${t('rt.starts', { date: fmtDate(routineStart(a)) })}</span>` : '';
  return `<article class="card activity routine st-${st}" data-open="${a.id}">
    <div class="card-head"><h3>${esc(a.title)}</h3><span class="tag rt-sched">${esc(scheduleText(a))}</span></div>
    ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
    ${progressBar(p.target ? clamp(p.done / p.target * 100, 0, 100) : 0, `<span class="rt-progress">${esc(label)}</span>`)}
    ${routineWeek(a, week)}
    <div class="meta">
      ${streak.n ? `<span class="tag ok">${esc(streakText(streak))}</span>` : ''}
      ${when}
      ${blocked.length ? waitsForTag(blocked) : ''}
    </div>
    ${goals ? `<div class="links">${goals}</div>` : ''}
  </article>`;
}

// A routine on the overview: tick today off and see this period at a glance.
function routineRow(a) {
  const now = today(), on = checkedOn(a, now), p = periodProgress(a), streak = routineStreak(a);
  return `<div class="row routine-row" data-open="${a.id}">
    <button type="button" class="check ${on ? 'done' : ''}" data-checkin="${a.id}" data-date="${now}" aria-pressed="${on}" aria-label="${esc(t('rt.doneToday', { name: a.title }))}" title="${esc(t('rt.doneToday', { name: a.title }))}">${on ? '✓' : ''}</button>
    <span class="grow">${esc(a.title)} <span class="meta">${esc(scheduleText(a))}</span></span>
    <span class="tag ${p.met ? 'ok' : ''}">${esc(periodText(a, p))}</span>
    ${streak.n ? `<span class="tag">${esc(streakText(streak))}</span>` : ''}
  </div>`;
}

const activeRoutine = a => isRoutine(a) && runsOn(a, today());

/* ---------- Small render helpers ---------- */

function smartBadge(g) {
  const c = smartCheck(g);
  return `<span class="smart" aria-label="SMART">${'SMART'.split('').map(l => `<b class="${c[l] ? 'on' : ''}" title="${esc(t('smart.' + l))}">${l}</b>`).join('')}</span>`;
}

function deadlineTag(date, done) {
  if (!date) return '';
  const d = daysUntil(date);
  if (done) return `<span class="tag">${fmtDate(date)}</span>`;
  if (d < 0) return `<span class="tag bad">${t('due.overdue', { n: -d })}</span>`;
  if (d === 0) return `<span class="tag warn">${t('due.today')}</span>`;
  if (d <= 7) return `<span class="tag warn">${t('due.left', { n: d })}</span>`;
  return `<span class="tag">${fmtDate(date)}</span>`;
}

function progressBar(pct, label) {
  return `<div class="progress-row"><div class="progress"><i style="width:${pct.toFixed(1)}%"></i></div><span>${label ?? Math.round(pct) + '%'}</span></div>`;
}

// Goal progress as a trail from the starting value to the target, with a blaze where you are now.
function trail(pct, from, to) {
  return `<div class="trail" role="img" aria-label="${Math.round(pct)}%">
    <div class="trail-line"><i style="width:${pct.toFixed(1)}%"></i><b class="blaze" style="left:${pct.toFixed(1)}%"></b></div>
    <div class="trail-ends"><span>${from}</span><strong>${Math.round(pct)}%</strong><span>${to}</span></div>
  </div>`;
}

function hideDoneToggle() {
  return `<button class="chip" data-hide-done aria-pressed="${ui.hideDone}">${t('acts.hideDone')}</button>`;
}

// "waits for n" tag listing the unfinished items something waits for.
function waitsForTag(waits) {
  return `<span class="tag bad" title="${esc(waits.map(w => w.title).join(', '))}">${t('acts.waitsFor', { n: waits.length })}</span>`;
}

function statusLegend() {
  return NODE_STATES.map(s => `<span><i class="swatch st-${s}"></i>${esc(t('nodeState.' + s))}</span>`).join('');
}

// The selected item and everything directly linked to it.
function neighbourhood(sel, rels) {
  const near = new Set(sel ? [sel] : []);
  if (sel) rels.forEach(r => { if (r.from === sel) near.add(r.to); if (r.to === sel) near.add(r.from); });
  return near;
}

function linkTag(id) {
  const e = findEntity(id);
  if (!e) return '';
  return `<span class="tag ${e.kind}" data-open="${e.item.id}">${esc(e.item.title)}</span>`;
}

function statusCheck(a) {
  const cls = a.status === 'done' || a.status === 'doing' ? a.status : '';
  const label = t('activity.' + a.status);
  return `<button class="check ${cls}" data-cycle="${a.id}" aria-label="${esc(t('status.aria', { s: label }))}" title="${esc(t('status.title', { s: label }))}">${a.status === 'done' ? '✓' : ''}</button>`;
}

function emptyState(title, text, kind) {
  return `<div class="empty"><h3>${title}</h3><div>${text}</div>
    <button class="btn primary" data-new="${kind}"><span aria-hidden="true">+</span> ${t('add.' + kind)}</button>
    ${itemCount() === 0 ? `<div><button class="btn ghost" data-sample>${t('btn.sampleAlt')}</button></div>` : ''}</div>`;
}

const byDueDate = (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
const matchesSearch = item => !ui.search || (item.title + ' ' + (item.description || item.specific || '')).toLowerCase().includes(ui.search.toLowerCase());

/* =========================================================
   Views
   ========================================================= */

const VIEWS = {
  dashboard: { add: 'goal', render: renderDashboard },
  goals: { add: 'goal', render: renderGoals },
  states: { add: 'state', render: renderStates },
  graphs: { add: 'state', render: renderGraphs },
  activities: { add: 'activity', render: renderActivities },
  timeline: { add: 'activity', render: renderTimeline },
  map: { add: 'relation', render: renderMap },
};

function render() {
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
  const old = ui.mapRefocus ? null : $('.map-wrap, .tl-scroll');
  const prevScroll = old && { left: old.scrollLeft, top: old.scrollTop };
  ui.mapRefocus = false;
  viewEl.dataset.view = ui.view;
  viewEl.innerHTML = v.render();
  if (ui.view === 'activities') bindDragDrop();
  // Keep the map / timeline where the user left it; on first show, centre on the goals / today.
  const wrap = $('.map-wrap, .tl-scroll');
  if (wrap) {
    wrap.scrollLeft = prevScroll ? prevScroll.left : Number(wrap.dataset.focusX) - wrap.clientWidth / 2;
    if (prevScroll) wrap.scrollTop = prevScroll.top;
  }
  decorateHelp();
  updatePlanBadges();
}

const NEXT_FEW = 3; // next actions shown on the overview until expanded

function renderDashboard() {
  if (!itemCount()) return emptyState(t('dash.emptyTitle'), t('dash.emptyText'), 'goal');

  const active = db.goals.filter(g => g.status !== 'achieved' && g.status !== 'paused');
  const avg = active.length ? active.reduce((s, g) => s + goalProgress(g), 0) / active.length : 0;
  // Routines have no status of their own: they get their own list, and the counts leave them out.
  const oneOff = db.activities.filter(a => !isRoutine(a));
  // Not yet ticked today first, then those whose week or month is not met yet.
  const now = today();
  const routines = db.activities.filter(activeRoutine).map(a => ({ a, on: checkedOn(a, now), met: periodProgress(a).met }))
    .sort((x, y) => x.on - y.on || x.met - y.met).map(x => x.a);
  const doneActs = oneOff.filter(a => a.status === 'done').length;
  const todo = oneOff.filter(a => a.status !== 'done').sort(byDueDate);
  const overdue = todo.filter(a => a.dueDate && daysUntil(a.dueDate) < 0).length;
  const next = ui.nextAll ? todo : todo.slice(0, NEXT_FEW);
  const more = todo.length > NEXT_FEW ? `<button type="button" class="list-more" data-next-more aria-expanded="${ui.nextAll}">${
    ui.nextAll ? t('dash.showFewer') : t('dash.showAll', { n: todo.length })}</button>` : '';

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
    ${next.length ? `<div class="list">${next.map(activityRow).join('')}${more}</div>` : `<div class="empty">${t('dash.allDone')}</div>`}

    ${routines.length ? `<h2 class="section-title">${t('rt.title')} <small>${t('rt.dashHint')}</small></h2>
    <div class="list routine-list">${routines.map(routineRow).join('')}</div>` : ''}

    <h2 class="section-title">${t('dash.goalsInProgress')} <small>${active.length ? t('dash.clickToEdit') : ''}</small></h2>
    ${active.length ? `<div class="grid">${active.map(goalCard).join('')}</div>` : `<div class="empty">${t('dash.noActive')}</div>`}
  `;
}

function activityRow(a) {
  const goals = relsFrom(a.id, 'contributes').map(r => linkTag(r.to)).join('');
  const blocked = blockers(a).length;
  return `<div class="row" data-open="${a.id}">
    ${statusCheck(a)}
    <span class="grow ${a.status === 'done' ? 'done-text' : ''}">${esc(a.title)}</span>
    ${blocked ? `<span class="tag bad" title="${esc(tp('blocked.title', blocked))}">${t('blocked')}</span>` : ''}
    <span class="links">${goals}</span>
    ${deadlineTag(a.dueDate, a.status === 'done')}
  </div>`;
}

function goalCard(g) {
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
  return `<article class="card goal" data-open="${g.id}">
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
    <div class="meta"><span>${esc(g.metric)}: <strong>${fmtNum(goalCurrent(g))}${unit}</strong></span></div>`}
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

function renderGoals() {
  if (!db.goals.length) return emptyState(t('goals.emptyTitle'), t('goals.emptyText'), 'goal');
  const filters = statusLabels(['all', ...GOAL_STATUS], 'goal.');
  const inCat = db.goals.filter(inCategory);
  const list = inCat
    .filter(g => ui.goalFilter === 'all' || g.status === ui.goalFilter)
    .filter(matchesSearch)
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  return `
    ${categoryChips()}
    <div class="toolbar">
      <div class="chips">${Object.entries(filters).map(([k, v]) => `<button class="chip ${ui.goalFilter === k ? 'active' : ''}" data-goal-filter="${k}">${v} <span style="opacity:.6">${k === 'all' ? inCat.length : inCat.filter(g => g.status === k).length}</span></button>`).join('')}</div>
      ${searchBox()}
    </div>
    ${list.length ? `<div class="grid">${list.map(goalCard).join('')}</div>` : `<div class="empty">${t('goals.noMatch')}</div>`}`;
}

function searchBox() {
  return `<input type="search" class="search" placeholder="${esc(t('search'))}" value="${esc(ui.search)}" data-search>`;
}

function renderStates() {
  if (!db.states.length) return emptyState(t('states.emptyTitle'), t('states.emptyText'), 'state');
  const list = db.states.filter(matchesSearch).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="toolbar">${searchBox()}</div>
    <div class="grid">${list.map(s => {
      const goals = relsFrom(s.id, 'measures').map(r => linkTag(r.to)).join('');
      const improvers = relsTo(s.id, 'improves').length;
      return `<article class="card state" data-open="${s.id}">
        <div class="card-head"><h3>${esc(s.title)}</h3>${isNum(s.value) ? `<span class="tag state">${fmtNum(s.value)}${s.unit ? ' ' + esc(s.unit) : ''}</span>` : ''}</div>
        ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ''}
        <div class="meta"><span>${t('states.asOf', { date: fmtDate(s.date) || '—' })}</span>${improvers ? `<span>${tp('states.improvers', improvers)}</span>` : ''}${(s.history?.length || 0) > 1 ? `<span>${tp('states.measurements', s.history.length)}</span>` : ''}</div>
        ${goals ? `<div class="links">${goals}</div>` : ''}
      </article>`;
    }).join('')}</div>`;
}

function renderActivities() {
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
      <div class="routine-grid">${routines.map(routineCard).join('')}</div></section>` : ''}
    <div class="board" style="--cols:${statuses.length}">${cols}</div>`;
}

/* ---------- Goal categories & shared filters ---------- */

const categories = () => [...new Set(db.goals.map(g => g.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, locale()));
const categorySuggestions = () => [...new Set([...categories(), ...t('cat.suggestions').split(',').map(s => s.trim())])];
const inCategory = g => !ui.category || g.category === ui.category;

// What a view shows: one goal's scope if a goal is picked, otherwise everything under
// the selected category (null means no filter at all).
function scopeFor(goalId) {
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

function categoryChips() {
  const cats = categories();
  if (!cats.length) return '';
  const chip = (value, label, count) =>
    `<button class="chip ${ui.category === value ? 'active' : ''}" data-category="${esc(value)}">${esc(label)}${count === undefined ? '' : ` <span class="count">${count}</span>`}</button>`;
  return `<div class="chips cat-chips" role="group" aria-label="${esc(t('f.category'))}">${chip('', t('cat.all'))}${cats.map(c => chip(c, c, db.goals.filter(g => g.category === c).length)).join('')}</div>`;
}

// The ui field holding each view's goal filter, by the goal picker's data-goal-select value.
const GOAL_FILTERS = { activity: 'activityGoal', map: 'mapGoal', timeline: 'timelineGoal', graphs: 'graphGoal' };

// Goal picker limited to the selected category, grouped by category otherwise.
function goalSelect(target, value) {
  const option = g => `<option value="${g.id}" ${value === g.id ? 'selected' : ''}>${esc(g.title)}</option>`;
  const goals = db.goals.filter(inCategory);
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

function activityCard(a) {
  const goals = relsFrom(a.id, 'contributes').map(r => linkTag(r.to)).join('');
  const blocked = blockers(a);
  const parent = relsFrom(a.id, 'subactivity')[0];
  const children = descendants(a.id, 'subactivity').map(id => db.activities.find(x => x.id === id)).filter(Boolean);
  const childrenDone = children.filter(c => c.status === 'done').length;
  return `<article class="card activity" data-open="${a.id}" draggable="true" data-drag="${a.id}">
    <div class="card-head"><h3 class="${a.status === 'done' ? 'done-text' : ''}">${esc(a.title)}</h3>${statusCheck(a)}</div>
    ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
    ${children.length ? progressBar(childrenDone / children.length * 100, t('acts.subDone', { done: childrenDone, total: children.length })) : ''}
    <div class="meta">
      ${deadlineTag(a.dueDate, a.status === 'done')}
      ${blocked.length ? waitsForTag(blocked) : ''}
    </div>
    ${parent ? `<div class="links"><span class="meta">${t('acts.partOf')}</span>${linkTag(parent.to)}</div>` : ''}
    ${goals ? `<div class="links">${goals}</div>` : ''}
  </article>`;
}

/* ---------- Relationship map ---------- */

/* ---------- Map layout: layered graph drawing (Sugiyama method) ----------
   1. Layering   – goals, activities and current states each get their own band, top to bottom.
                   Inside a band, children sit below their parent and prerequisites below whatever
                   depends on them (longest-path layering), so chains read bottom-up toward the goal.
   2. Dummies    – an edge spanning several layers gets a virtual node in each layer it crosses,
                   so it is routed through the gaps between boxes instead of across them.
   3. Ordering   – alternating barycenter sweeps plus adjacent swaps minimise edge crossings.
   4. Placement  – every box is pulled toward the median of its neighbours while keeping the order
                   and spacing (weighted isotonic regression), which keeps edges short and straight. */
const MAP = { NW: 172, NH: 56, HG: 18, DG: 8, DW: 10, VG: 62, PAD: 20, HEAD: 34, BAND_GAP: 40, MIN_SCALE: 0.25, MAX_SCALE: 3 };

function layoutMap(items, rels) {
  const { NW, NH, HG, DG, DW, VG, PAD, HEAD, BAND_GAP } = MAP;
  const kindOf = {};
  Object.entries(items).forEach(([k, list]) => list.forEach(x => (kindOf[x.id] = k)));

  // 1. Layering
  const above = {};
  rels.forEach(r => {
    if (kindOf[r.from] !== kindOf[r.to] || kindOf[r.from] === 'state') return;
    if (r.type === 'subgoal' || r.type === 'subactivity') (above[r.from] ||= []).push(r.to);
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

  const layers = [], bands = [], node = {};
  ['goal', 'activity', 'state'].forEach(kind => {
    if (!items[kind].length) return;
    const base = layers.length;
    const maxDepth = Math.max(...items[kind].map(it => depthOf(it.id)));
    for (let i = 0; i <= maxDepth; i++) layers.push({ list: [] });
    items[kind].forEach(it => {
      const n = { id: it.id, kind, layer: base + depth[it.id], w: NW };
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
      const d = { id: `${r.id}:${l}`, dummy: true, layer: l, w: DW };
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

  // 3. Crossing minimisation
  const reindex = () => layers.forEach(L => L.list.forEach((n, i) => (n.i = i)));
  reindex();
  const crossings = () => {
    let c = 0;
    for (let l = 0; l < layers.length - 1; l++) {
      const segs = [];
      layers[l].list.forEach(n => (down.get(n) || []).forEach(m => segs.push([n.i, m.i])));
      for (let i = 0; i < segs.length; i++)
        for (let j = i + 1; j < segs.length; j++)
          if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) c++;
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
    (nbrs.get(u) || []).forEach(a => (nbrs.get(v) || []).forEach(b => { if (a.i > b.i) c++; }));
    return c;
  };
  for (let pass = 0, improved = true; improved && pass < 8; pass++) {
    improved = false;
    layers.forEach(L => {
      for (let i = 0; i + 1 < L.list.length; i++) {
        const u = L.list[i], v = L.list[i + 1];
        if (pairCross(v, u, up) + pairCross(v, u, down) < pairCross(u, v, up) + pairCross(u, v, down)) {
          L.list[i] = v; L.list[i + 1] = u; v.i = i; u.i = i + 1;
          improved = true;
        }
      }
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
    list.forEach((p, i) => (p.c.pts[p.k] = [n.x - NW / 2 + (NW * (i + 1)) / (list.length + 1), layers[n.layer].y + (side === 'bottom' ? NH : 0)]));
  }));
  chains.forEach(c => {
    if (c.same) {
      // Same layer: straight between neighbours, otherwise an arc above the row.
      const dir = c.b.x > c.a.x ? 1 : -1, cy = layers[c.a.layer].y + NH / 2;
      const sx = c.a.x + (dir * NW) / 2, tx = c.b.x - (dir * NW) / 2;
      if (Math.abs(c.a.i - c.b.i) === 1) c.d = `M${sx},${cy} L${tx},${cy}`;
      else c.d = `M${sx},${cy - 10} C${sx + dir * 50},${cy - 70} ${tx - dir * 50},${cy - 70} ${tx},${cy - 10}`;
      return;
    }
    // Top-to-bottom polyline: through each dummy the line runs straight down its layer.
    let pts = [{ p: c.pts[0] }];
    c.chain.slice(1, -1).forEach(d => {
      const ly = layers[d.layer].y;
      pts.push({ p: [d.x, ly], d }, { p: [d.x, ly + NH], d });
    });
    pts.push({ p: c.pts[c.pts.length - 1] });
    if (c.reversed) pts = pts.reverse();
    c.d = `M${pts[0].p[0]},${pts[0].p[1]}` + pts.slice(1).map((q, i) => {
      const p = pts[i];
      if (p.d && p.d === q.d) return ` L${q.p[0]},${q.p[1]}`;
      const my = (p.p[1] + q.p[1]) / 2;
      return ` C${p.p[0]},${my} ${q.p[0]},${my} ${q.p[0]},${q.p[1]}`;
    }).join('');
  });

  return { node, layers, bands, chains, W, H };
}

function renderMap() {
  if (!itemCount()) return emptyState(t('map.emptyTitle'), t('map.emptyText'), 'goal');

  const scope = scopeFor(ui.mapGoal);
  const keep = kind => item => (!scope || scope[kind].has(item.id)) && !(kind === 'activity' && ui.hideDone && item.status === 'done');
  const items = {
    goal: db.goals.filter(keep('goal')),
    activity: db.activities.filter(keep('activity')),
    state: db.states.filter(keep('state')),
  };
  const visible = new Set([...items.goal, ...items.activity, ...items.state].map(x => x.id));
  const rels = db.relations.filter(r => REL_TYPES[r.type] && !ui.mapHidden.has(r.type) && visible.has(r.from) && visible.has(r.to));
  const { NW, NH, PAD } = MAP;
  const { node, layers, bands, chains, W, H } = layoutMap(items, rels);

  // Either an item or a relationship line can be selected.
  const relSel = rels.find(r => r.id === ui.mapRel) || null;
  const sel = !relSel && ui.mapSelected && visible.has(ui.mapSelected) ? ui.mapSelected : null;
  const near = relSel ? new Set([relSel.from, relSel.to]) : neighbourhood(sel, rels);

  // Each line sits in a group with a wide invisible twin, so it is easy to hit; a click selects it,
  // a second click (or Enter) edits the relationship and Delete removes it.
  const edges = chains.map(c => {
    const def = REL_TYPES[c.r.type];
    const dim = (sel && !(c.r.from === sel || c.r.to === sel)) || (relSel && c.r.id !== relSel.id) ? 'dim' : '';
    const label = relText(c.r);
    return `<g class="edge-g ${dim} ${c.r.id === relSel?.id ? 'sel' : ''}" data-rel-edit="${c.r.id}" tabindex="0" role="button" aria-pressed="${c.r.id === relSel?.id}" aria-label="${esc(t('map.relLabel', { rel: label }))}">
      <path class="edge" d="${c.d}" style="stroke:${def.color};stroke-width:${def.width || 1.6}" ${def.dash ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#arrow-${c.r.type})"></path>
      <path class="edge-hit" d="${c.d}"></path><title>${esc(label)}</title></g>`;
  }).join('');

  const nodes = Object.values(node).map(n => {
    const { item } = findEntity(n.id);
    let st = '', sub, bar = '', pct = '';
    if (n.kind === 'goal') {
      st = goalState(item);
      sub = st === 'blocked' ? t('acts.waitsFor', { n: blockers(item, 'goal').length }) : item.deadline ? fmtDate(item.deadline) : t('map.noDeadline');
      // Progress shows as a green bar along the bottom of the box; the number stays in the tooltip.
      const p = goalProgress(item);
      pct = ` – ${Math.round(p)} %`;
      const y = NH - 8, end = 14 + (NW - 28) * Math.min(p, 100) / 100;
      bar = `<line class="node-track" x1="14" x2="${NW - 14}" y1="${y}" y2="${y}"></line>${p > 0 ? `<line class="node-progress" x1="14" x2="${end.toFixed(1)}" y1="${y}" y2="${y}"></line>` : ''}`;
    } else if (isRoutine(item)) {
      st = activityState(item);
      const streak = routineStreak(item);
      sub = periodText(item) + (streak.n ? ', ' + streakText(streak) : '');
    } else if (n.kind === 'activity') {
      st = activityState(item);
      sub = (st === 'blocked' ? t('acts.waitsFor', { n: blockers(item).length }) : t('activity.' + item.status)) + (item.dueDate ? ', ' + fmtDate(item.dueDate) : '');
    } else {
      sub = isNum(item.value) ? `${fmtNum(item.value)} ${item.unit || ''}, ${fmtDate(item.date)}` : fmtDate(item.date);
    }
    const title = item.title.length > 22 ? item.title.slice(0, 21) + '…' : item.title;
    const dim = (sel || relSel) && !near.has(n.id) ? 'dim' : '';
    const linking = ui.mapLinkFrom === n.id ? ' link-source' : '';
    return `<g class="node ${n.kind}${st ? ' st-' + st : ''}${linking} ${dim}" data-map-node="${n.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc(item.title)}" transform="translate(${n.x - NW / 2},${layers[n.layer].y})">
      <rect width="${NW}" height="${NH}" rx="10" style="${n.id === sel ? 'stroke-width:3' : ''}"></rect>
      <text x="12" y="23">${esc(title)}</text>
      <text class="sub" x="12" y="${bar ? 38 : 41}">${esc(sub)}</text>${bar}
      <title>${esc(item.title)}${pct}${st ? ' – ' + esc(t('nodeState.' + st)) : ''}</title>
    </g>`;
  }).join('');

  const bandSvg = bands.map(b => {
    const levels = b.last - b.first + 1;
    return `<rect class="band" x="6" y="${b.top}" width="${W - 12}" height="${b.bottom - b.top}" rx="14"></rect>
    <text class="col-label" x="${PAD}" y="${b.top + 22}">${esc(t('kinds.' + b.kind))}${levels > 1 ? ` (${esc(tp('map.levels', levels))})` : ''}</text>`;
  }).join('');

  const markers = Object.entries(REL_TYPES).map(([k, d]) =>
    `<marker id="arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:${d.color}"/></marker>`).join('');

  const toggles = Object.entries(REL_TYPES).map(([k, d]) => {
    const count = db.relations.filter(r => r.type === k).length;
    return `<button class="chip rel-toggle" data-rel-toggle="${k}" aria-pressed="${!ui.mapHidden.has(k)}" title="${esc(relSignature(k))}"><i class="${d.dash ? 'dash' : ''}" style="border-color:${d.color}"></i>${esc(relLabel(k))}<span class="count">${count}</span></button>`;
  }).join('');
  const goalNodes = items.goal.length ? items.goal : Object.values(items).flat();
  const focusX = Math.round(goalNodes.reduce((s, x) => s + node[x.id].x, 0) / goalNodes.length * ui.mapScale);
  let relNote = '';
  if (!rels.length) relNote = db.relations.length ? `<div class="empty">${t('map.noneShown')}</div>` : emptyState(t('map.relEmptyTitle'), t('map.relEmptyText'), 'relation');
  const zoomBtn = (dir, label) => `<button type="button" class="icon-btn" data-map-zoom="${dir}" aria-label="${esc(t('map.zoom.' + dir))}" title="${esc(t('map.zoom.' + dir))}">${label}</button>`;

  return `
    ${categoryChips()}
    <div class="toolbar">${goalSelect('map', ui.mapGoal)}${hideDoneToggle()}</div>
    <div class="map-controls">
      <div class="chips" role="group" aria-label="${esc(t('map.toggles'))}"><span class="ctl-label">${t('map.show')}</span>${toggles}</div>
      <div class="map-legend"><span class="ctl-label">${t('map.status')}</span>${statusLegend()}
        <div class="zoom-ctl" role="group" aria-label="${esc(t('map.zoom'))}">${zoomBtn('out', '−')}${zoomBtn('reset', `<span class="zoom-pct">${Math.round(ui.mapScale * 100)} %</span>`)}${zoomBtn('in', '+')}</div>
      </div>
    </div>
    <div class="map-wrap" data-focus-x="${focusX}"><svg viewBox="0 0 ${W} ${H}" width="${W * ui.mapScale}" height="${H * ui.mapScale}" role="img" aria-label="${esc(t('map.aria'))}">
      <defs>${markers}</defs>${bandSvg}${edges}${nodes}
    </svg></div>
    ${ui.mapLinkFrom && visible.has(ui.mapLinkFrom) ? mapLinkBar(ui.mapLinkFrom) : ''}
    ${relSel ? mapRelSelection(relSel) : sel ? mapSelection(sel) : `<p class="meta" style="margin-top:10px">${t('map.hint')}</p>`}
    ${relNote}
  `;
}

// Shown while linking by tapping: the next box tapped becomes the other end.
function mapLinkBar(id) {
  return `<div class="link-bar" role="status"><span class="grow">${esc(t('map.linkPick', { name: findEntity(id).item.title }))}</span>
    <button type="button" class="btn small ghost" data-map-link-cancel>${t('btn.cancel')}</button></div>`;
}

function mapSelection(id) {
  const { kind, item } = findEntity(id);
  return `<div class="row" style="margin-top:12px;cursor:default">
    <span class="tag ${kind}">${t('kind.' + kind)}</span>
    <span class="grow"><strong>${esc(item.title)}</strong></span>
    <button class="btn small" data-open="${id}">${t('btn.edit')}</button>
    <button class="btn small ghost" data-map-clear>${t('btn.deselect')}</button>
  </div>`;
}

// The ▸/▾ button that folds a goal (or the 'rest' group) in the timeline.
const foldBtn = (key, name, folded, tip = esc(t(folded ? 'tl.expand' : 'tl.collapse', { name }))) => `<button type="button" class="tl-fold" data-tl-fold="${key}" aria-expanded="${!folded}" aria-label="${tip}" title="${tip}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${folded ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'}"/></svg></button>`;

function toggleTlFold(key) {
  const set = tlCollapsed();
  set.has(key) ? set.delete(key) : set.add(key);
  setTlCollapsed(set);
  render();
  $(`[data-tl-fold="${key}"]`)?.focus();
}
// Collapse all folds every goal with something under it, and the 'rest' group.
function foldAllTl(collapse) {
  const keys = collapse ? timelineRows(scopeFor(ui.timelineGoal)).filter(r => r.fold || r.kind === 'group').map(r => r.kind === 'group' ? 'rest' : r.item.id) : [];
  setTlCollapsed(new Set(keys));
  render();
}

const relText = r => `${findEntity(r.from).item.title} ${relLabel(r.type)} ${findEntity(r.to).item.title}`;

// The selected line, with buttons for touch screens (no Delete key there).
function mapRelSelection(r) {
  return `<div class="row map-rel-selection" style="margin-top:12px;cursor:default">
    <span class="tag">${t('kind.relation')}</span>
    <span class="grow"><strong>${esc(relText(r))}</strong></span>
    <button class="btn small" data-rel-open="${r.id}">${t('btn.edit')}</button>
    <button class="btn small danger" data-rel-remove="${r.id}">${t('btn.remove')}</button>
    <button class="btn small ghost" data-map-clear>${t('btn.deselect')}</button>
  </div>`;
}

function removeRelation(id) {
  db.relations = db.relations.filter(r => r.id !== id);
  if (ui.mapRel === id) ui.mapRel = null;
  save();
  render();
  toast(t('toast.relRemoved'));
}

// Deleting an item from the map asks first, like the form's Delete button.
function askDeleteItem(id) {
  const ent = findEntity(id);
  if (!ent || !confirm(t('confirm.delete', { name: ent.item.title }))) return;
  removeEntity(ent.kind, id);
  save();
  render();
  toast(t('toast.deleted.' + ent.kind));
}

/* ---------- Timeline (Gantt chart of goals and activities) ---------- */

// ZOOM presets and the MIN–MAX range for free zooming are in pixels per day.
const TL = { ROW: 40, ZOOM: { week: 30, month: 8, quarter: 2.6 }, MIN: 1.5, MAX: 80 };
const DAY_MS = 86400000;
const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY_MS; };
const dayStr = n => new Date(n * DAY_MS).toISOString().slice(0, 10);
const endOf = (kind, item) => (kind === 'goal' ? item.deadline : item.dueDate);
// A routine that runs a set number of times ends where its start puts it: only the whole bar moves.
const fixedEnd = item => isRoutine(item) && !!item.repeat.count;
// The grips at the ends of the selected bar reach a little past it, so even a thin bar has room to grab.
const tlGrip = (edge, left, width) => {
  const inner = Math.min(6, width / 4);
  return `left:${edge === 'start' ? left - 12 : left + width - inner}px;width:${12 + inner}px`;
};

// Rows in plan order: each top-level goal, its activity trees, then its sub-goals (recursively).
// Prerequisites that work toward no goal themselves are listed under the activity that waits for them.
// An activity that serves several goals is listed under each of them (its rows carry `also`: the
// other goals it is under). A goal in `collapsed` keeps its own row but hides what is under it;
// what it hides still counts as placed. Activities under no shown goal come last in their own
// group ('rest', which can be collapsed too).
function timelineRows(scope, collapsed = new Set()) {
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
    const subs = relsTo(g.id, 'subgoal').map(r => db.goals.find(x => x.id === r.from)).filter(x => x && visible('goal', x)).sort(byStart);
    const folded = collapsed.has(g.id);
    const here = hidden ? parent : rows.push({ kind: 'goal', item: g, depth, rel, parent, fold: acts.length + subs.length > 0, collapsed: folded }) - 1;
    acts.forEach(a => addActivity(a, depth + 1, 'contributes', here, g.id, hidden || folded));
    subs.forEach(sg => addGoal(sg, depth + 1, 'subgoal', here, hidden || folded));
  };
  const goalIds = new Set(goals.map(g => g.id));
  goals.filter(g => !ancestors(g.id, 'subgoal').some(p => goalIds.has(p))).sort(byStart).forEach(g => addGoal(g, 0));

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
const tlCollapsed = () => new Set(prefs.get('tlCollapsed.' + plans.current, []));
const setTlCollapsed = set => prefs.set('tlCollapsed.' + plans.current, [...set]);

function renderTimeline() {
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

  const geo = {};
  const body = rows.map((r, i) => {
    if (r.kind === 'group') return `<div class="tl-row tl-group"><div class="tl-label">${foldBtn('rest', r.label, r.collapsed)}${esc(r.label)}</div><div class="tl-track"></div></div>`;
    const { item, kind, depth } = r;
    const st = kind === 'goal' ? goalState(item) : activityState(item);
    const s = item.startDate, e = endOf(kind, item);
    const dateText = fmtSpan(s, e) || t('tl.noDates');
    let bar = `<span class="tl-nodates">${t('tl.noDates')}</span>`;
    if (s || e) {
      const a = dayNum(s || e), b = dayNum(e || s);
      const left = x(a), width = (b - a + 1) * px;
      const overdue = st === 'late' && e && dayNum(e) < todayN;
      const lateHtml = overdue ? `<i class="tl-overdue" style="left:${x(dayNum(e) + 1)}px;width:${(todayN - dayNum(e)) * px}px" title="${esc(t('tl.overdue', { date: fmtDate(e) }))}"></i>` : '';
      const tip = `${item.title}: ${dateText} (${t('nodeState.' + st)})`;
      // The selected item's bar can be dragged to new dates (see "Moving dates in the timeline").
      const drag = item.id === sel ? ` tl-drag" data-tl-drag="${item.id}` : '';
      // Every row of an item, so an activity listed under several goals gets its arrows on each copy.
      const spot = s && e ? { start: left, end: left + width } : { start: left + px / 2 - 7, end: left + px / 2 + 7 };
      (geo[item.id] ||= []).push({ ...spot, y: i * ROW + ROW / 2, goal: r.goal });
      if (!s || !e) {
        const cx = left + px / 2;
        bar = `${lateHtml}<i class="tl-milestone ${kind} st-${st}${drag}" style="left:${cx}px" title="${esc(tip)}"></i><span class="tl-bar-label" style="left:${Math.max(cx + 14, overdue ? x(todayN + 1) + 6 : 0)}px">${esc(item.title)}</span>`;
      } else {
        const inside = width > item.title.length * 7.2 + 26;
        const pct = kind === 'goal' ? goalProgress(item) : null;
        const grips = drag && !fixedEnd(item) ? ['start', 'end'].map(edge => `<i class="tl-grip" data-tl-drag="${item.id}" data-tl-edge="${edge}" style="${tlGrip(edge, left, width)}"></i>`).join('') : '';
        bar = `${lateHtml}${grips}<div class="tl-bar ${kind} st-${st}${drag}" style="left:${left}px;width:${width}px" title="${esc(tip)}">${pct === null ? '' : `<i class="tl-progress" style="width:${pct.toFixed(1)}%"></i>`}${inside ? `<span>${esc(item.title)}</span>` : ''}</div>${inside ? '' : `<span class="tl-bar-label" style="left:${Math.max(left + width, overdue ? x(todayN + 1) : 0) + 8}px">${esc(item.title)}</span>`}`;
      }
    }
    const dim = (sel || relSel) && !near.has(item.id) ? 'dim' : '';
    const also = r.also ? t('tl.alsoUnder', { goals: r.also.join(', ') }) : '';
    const fold = r.fold ? foldBtn(item.id, item.title, r.collapsed) : '';
    return `<div class="tl-row ${kind} ${dim}${item.id === sel ? ' selected' : ''}" data-tl-node="${item.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc([item.title, dateText, also].filter(Boolean).join(', '))}">
      <div class="tl-label" style="--depth:${depth}">${r.rel && r.parent !== undefined ? `<i class="tl-elbow${REL_TYPES[r.rel].dash ? ' dash' : ''}" style="--rel:${REL_TYPES[r.rel].color};--up:${i - r.parent - 1}" title="${esc(relLabel(r.rel))}"></i>` : ''}${fold}<span class="tl-dot ${kind} st-${st}"></span><span class="tl-text"><span class="tl-head-line"><span class="tl-title">${esc(item.title)}</span>${also ? `<span class="tl-also" title="${esc(also)}" aria-hidden="true">↻</span>` : ''}</span><span class="tl-dates">${esc(dateText)}</span></span></div>
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
  // Finish-to-start arrows: from the end of a prerequisite to the start of what depends on it.
  const deps = !ui.tlDeps ? '' : db.relations.filter(r => r.type === 'depends' && geo[r.from] && geo[r.to]).flatMap(r => copyPairs(geo[r.from], geo[r.to]).map(([p, d]) => {
    const x1 = p.end, y1 = p.y, x2 = d.start, y2 = d.y;
    const path = x2 - 12 >= x1 + 6
      ? `M${x1},${y1} H${x2 - 12} V${y2} H${x2}`
      : `M${x1},${y1} h8 V${y2 + (y2 > y1 ? -ROW / 2 : ROW / 2)} H${x2 - 12} V${y2} H${x2}`;
    const dim = (sel && !(r.from === sel || r.to === sel)) || (relSel && r.id !== relSel.id) ? ' dim' : '';
    // A wide invisible twin makes the thin arrow easy to hit.
    return `<g class="tl-dep-g${dim}${r.id === relSel?.id ? ' sel' : ''}" data-rel-edit="${r.id}" tabindex="0" role="button" aria-pressed="${r.id === relSel?.id}" aria-label="${esc(t('map.relLabel', { rel: relText(r) }))}">
      <path class="tl-dep" d="${path}" marker-end="url(#tl-arrow)"></path><path class="tl-dep-hit" d="${path}"></path><title>${esc(relText(r))}</title></g>`;
  })).join('');

  const zoom = Object.entries(TL.ZOOM).map(([z, p]) => `<button class="chip ${Math.abs(px - p) < 0.01 ? 'active' : ''}" data-tl-zoom="${z}">${t('tl.zoom.' + z)}</button>`).join('');
  return `
    ${categoryChips()}
    <div class="toolbar">
      ${goalSelect('timeline', ui.timelineGoal)}
      ${hideDoneToggle()}
      <button class="chip" data-tl-deps aria-pressed="${ui.tlDeps}">${t('tl.deps')}</button>
      <button class="chip" data-tl-fold-all="collapse">${t('tl.collapseAll')}</button>
      <button class="chip" data-tl-fold-all="expand">${t('tl.expandAll')}</button>
      <div class="chips" role="group" aria-label="${esc(t('tl.zoom'))}">${zoom}</div>
    </div>
    <div class="map-legend tl-legend"><span class="ctl-label">${t('map.status')}</span>${statusLegend()}<span><i class="swatch tl-overdue-swatch"></i>${esc(t('tl.overdueLegend'))}</span></div>
    <div class="map-legend tl-legend"><span class="ctl-label">${t('tl.links')}</span>${['contributes', 'subactivity', 'subgoal', ...(ui.tlDeps || rows.some(r => r.rel === 'depends') ? ['depends'] : [])].map(k =>
      `<span><i class="line-key${REL_TYPES[k].dash ? ' dash' : ''}" style="--rel:${REL_TYPES[k].color}"></i>${esc(relLabel(k))}</span>`).join('')}</div>
    ${rows.length ? `<div class="tl-scroll" data-focus-x="${Math.round(x(todayN) + 145)}" data-from="${from}" data-to="${to}">
      <div class="tl-inner" style="--tl-w:${W}px">
        <div class="tl-head">
          <div class="tl-corner"></div>
          <div class="tl-scale"><div class="tl-months">${months.join('')}</div><div class="tl-ticks">${ticks.join('')}</div>
            <span class="tl-today-flag" style="left:${x(todayN) + px / 2}px">${t('tl.today')}</span></div>
        </div>
        <div class="tl-body">
          <div class="tl-grid">${lines.join('')}<i class="tl-today" style="left:${x(todayN) + px / 2}px"></i></div>
          <svg class="tl-deps" width="${W}" height="${rows.length * ROW}">
            <defs><marker id="tl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>${deps}
          </svg>
          ${body}
        </div>
      </div>
    </div>` : `<div class="empty">${t('tl.noneShown')}</div>`}
    ${relSel ? mapRelSelection(relSel) : sel ? mapSelection(sel) + (geo[sel] ? `<p class="meta" style="margin-top:8px">${t(fixedEnd(findEntity(sel).item) ? 'tl.dragHintMove' : 'tl.dragHint')}</p>` : '') : `<p class="meta" style="margin-top:10px">${t('tl.hint')}</p>`}`;
}

/* ---------- Graphs (measurement history of each current state) ----------
   One line chart per current state: its measurements over time, a target line for every goal it
   measures (running to the goal's deadline), and the change since the first measurement. */

const GR = { H: 210, L: 48, R: 14, T: 14, B: 26, MIN_W: 280, MAX_W: 960 };
const grCharts = {}; // state id → points and scales, for the hover layer

// About `count` clean steps (1, 2 or 5 × 10ⁿ) covering lo–hi.
function niceTicks(lo, hi, count = 4) {
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw);
  const ticks = [];
  for (let v = Math.floor(lo / step) * step; ; v += step) {
    ticks.push(Number(v.toFixed(10)));
    if (v >= hi - step * 1e-9) break;
  }
  return ticks;
}

function stateSeries(s) {
  return (s.history || []).filter(h => h.date && isNum(h.value))
    .map(h => ({ day: dayNum(h.date), date: h.date, value: Number(h.value) }))
    .sort((a, b) => a.day - b.day);
}

// One measurement per date: a new value for a date replaces the old one. The state's value is its latest measurement.
function recordMeasurement(s, date, value) {
  s.history = (s.history || []).filter(h => h.date !== date).concat({ date, value }).sort((a, b) => a.date.localeCompare(b.date));
  if (s.dropped) { delete s.dropped[date]; if (!Object.keys(s.dropped).length) delete s.dropped; }
  followLatest(s);
}

// A deleted date is remembered, so syncing with an older copy does not bring the measurement back.
function deleteMeasurement(s, date) {
  s.history = (s.history || []).filter(h => h.date !== date);
  s.dropped = { ...s.dropped, [date]: 1 };
  followLatest(s);
}

function followLatest(s) {
  const last = s.history.reduce((a, h) => (!a || h.date > a.date ? h : a), null);
  Object.assign(s, last ? { value: last.value, date: last.date } : { value: '' });
}

function removeMeasurement(id, iso) {
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
function stateChange(s, points, targets) {
  if (points.length < 2) return null;
  const first = points[0], last = points[points.length - 1];
  const delta = last.value - first.value;
  const pct = first.value ? delta / Math.abs(first.value) * 100 : null;
  const aim = targets.length ? Math.sign(targets[0].value - first.value) : 0;
  return { first, delta, pct, good: aim && delta ? Math.sign(delta) === aim : null };
}

function signed(n) {
  let sign = '±';
  if (n > 0) sign = '+';
  else if (n < 0) sign = '−';
  return sign + fmtNum(Math.abs(n));
}
const withUnit = (n, unit) => (unit ? `${n} ${unit}` : n);

function changeTag(s, change) {
  if (!change) return `<span class="tag">${t('gr.oneMeasurement')}</span>`;
  const { delta, pct, good, first } = change;
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '→';
  const cls = good === null ? '' : good ? 'ok' : 'bad';
  const text = withUnit(signed(delta), esc(s.unit || '')) + (pct === null ? '' : ` (${signed(Math.round(pct * 10) / 10)} %)`);
  return `<span class="tag gr-delta ${cls}"><span aria-hidden="true">${arrow}</span> ${text}</span>
    <span class="meta">${t('gr.since', { date: fmtDate(first.date) })}</span>`;
}

function graphCard(s, width) {
  const points = stateSeries(s);
  const targets = relsFrom(s.id, 'measures').map(r => db.goals.find(g => g.id === r.to))
    .filter(g => g && !byActivities(g) && isNum(g.target))
    .map(g => ({ goal: g, value: Number(g.target), end: g.deadline ? dayNum(g.deadline) : null }));
  const change = stateChange(s, points, targets);
  const unit = s.unit || '';
  const last = points[points.length - 1];

  // Scales: time from the first measurement to the latest of today / last measurement / deadlines.
  const W = width;
  const x0 = points[0].day;
  let x1 = Math.max(last.day, dayNum(today()), ...targets.map(tg => tg.end || 0));
  if (x1 - x0 < 14) x1 = x0 + 14;
  const ticks = niceTicks(Math.min(...points.map(p => p.value), ...targets.map(tg => tg.value)), Math.max(...points.map(p => p.value), ...targets.map(tg => tg.value)));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const px = d => GR.L + (d - x0) / (x1 - x0) * (W - GR.L - GR.R);
  const py = v => GR.T + (1 - (v - y0) / (y1 - y0)) * (GR.H - GR.T - GR.B);
  grCharts[s.id] = { s, points, targets, change, px, py, unit };

  const grid = ticks.map(v => `<line class="gr-grid" x1="${GR.L}" x2="${W - GR.R}" y1="${py(v)}" y2="${py(v)}"/>
    <text class="gr-axis" x="${GR.L - 8}" y="${py(v) + 4}" text-anchor="end">${esc(fmtNum(v))}</text>`).join('');
  // Date ticks: first measurement, the end of the axis, and today when it is not crowded.
  const dateTicks = [x0, x1];
  const todayN = dayNum(today());
  if (todayN > x0 && todayN < x1 && px(todayN) - px(x0) > 80 && px(x1) - px(todayN) > 80) dateTicks.push(todayN);
  const xAxis = dateTicks.map((d, i) => `<text class="gr-axis" x="${px(d)}" y="${GR.H - 6}" text-anchor="${['start', 'end', 'middle'][i]}">${esc(fmtDate(dayStr(d)))}</text>`).join('');
  const todayLine = todayN > x0 && todayN <= x1 ? `<line class="gr-today" x1="${px(todayN)}" x2="${px(todayN)}" y1="${GR.T}" y2="${GR.H - GR.B}"/>` : '';

  const targetLines = targets.map(tg => {
    const xe = px(tg.end && tg.end > x0 ? tg.end : x1);
    return `<line class="gr-target" x1="${GR.L}" x2="${xe}" y1="${py(tg.value)}" y2="${py(tg.value)}"/>
      ${tg.end && tg.end > x0 ? `<circle class="gr-target-end" cx="${xe}" cy="${py(tg.value)}" r="4"/>` : ''}`;
  }).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.day).toFixed(1)},${py(p.value).toFixed(1)}`).join(' ');
  const dots = points.map(p => `<circle class="gr-dot" cx="${px(p.day)}" cy="${py(p.value)}" r="4"/>`).join('');

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
  const todayBox = todayN > x0 && todayN <= x1 ? [[px(todayN) - 1, GR.T, px(todayN) + 1, GR.H - GR.B]] : [];
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
    return `<tr><td>${fmtDate(p.date)}</td><td>${esc(withUnit(fmtNum(p.value), unit))}</td><td>${p === points[0] ? '—' : esc(withUnit(signed(p.value - points[0].value), unit))}</td><td class="gr-del"><button type="button" class="btn small ghost" data-del-measure="${s.id}" data-date="${p.date}" title="${esc(del)}" aria-label="${esc(del)}">×</button></td></tr>`;
  }).join('');

  return `<article class="card gr-card" data-gr="${s.id}">
    <div class="card-head"><h3>${esc(s.title)}</h3><button class="btn small ghost" data-open="${s.id}">${t('btn.edit')}</button></div>
    <div class="gr-stats"><strong class="gr-value">${esc(withUnit(fmtNum(last.value), unit))}</strong>${changeTag(s, change)}</div>
    ${legend}
    <div class="gr-plot" tabindex="0" role="img" aria-label="${esc(t('gr.aria', { name: s.title }))}">
      <svg width="${W}" height="${GR.H}" viewBox="0 0 ${W} ${GR.H}" aria-hidden="true">
        ${grid}${todayLine}${targetLines}<path class="gr-line" d="${path}"/>${dots}${targetLabels}${valueLabel}${xAxis}
        <line class="gr-cross" y1="${GR.T}" y2="${GR.H - GR.B}" hidden/>
        <circle class="gr-focus" r="6" hidden/>
      </svg>
      <div class="gr-tip" hidden></div>
    </div>
    <details class="gr-table"><summary>${t('gr.table')}</summary>
      <table><thead><tr><th>${t('gr.col.date')}</th><th>${t('gr.col.value')}</th><th>${t('gr.col.change')}</th><th><span class="sr-only">${t('gr.col.delete')}</span></th></tr></thead><tbody>${rowsHtml}</tbody></table>
    </details>
  </article>`;
}

function renderGraphs() {
  if (!db.states.length) return emptyState(t('states.emptyTitle'), t('states.emptyText'), 'state');
  const scope = scopeFor(ui.graphGoal);
  const list = db.states.filter(s => !scope || scope.state.has(s.id)).filter(matchesSearch);
  const withData = list.filter(s => stateSeries(s).length);
  const without = list.filter(s => !stateSeries(s).length);
  // Cards take the full width of the view; charts are drawn at that pixel width so text stays crisp.
  const viewStyle = getComputedStyle(viewEl);
  const width = clamp(viewEl.clientWidth - parseFloat(viewStyle.paddingLeft) - parseFloat(viewStyle.paddingRight) - 38, GR.MIN_W, GR.MAX_W);
  Object.keys(grCharts).forEach(k => delete grCharts[k]);
  return `${categoryChips()}
    <div class="toolbar">${goalSelect('graphs', ui.graphGoal)}${searchBox()}</div>
    ${withData.length ? `<div class="gr-list">${withData.map(s => graphCard(s, width)).join('')}</div>` : `<div class="empty">${t('gr.none')}</div>`}
    ${without.length ? `<p class="meta gr-without">${t('gr.without')} ${without.map(s => linkTag(s.id)).join(' ')}</p>` : ''}`;
}

// Hover / touch / keyboard: a crosshair snaps to the nearest measurement and a tooltip lists its values.
function showGraphPoint(plot, i) {
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
  row('gr-tip-value', withUnit(fmtNum(p.value), c.unit));
  row('gr-tip-date', fmtDate(p.date));
  if (p !== c.points[0]) row('gr-tip-row', t('gr.tipChange', { value: withUnit(signed(p.value - c.points[0].value), c.unit) }));
  c.targets.forEach(tg => row('gr-tip-row', t('gr.tipTarget', { goal: tg.goal.title, value: withUnit(fmtNum(tg.value), c.unit) })));
  tip.hidden = false;
  const box = plot.getBoundingClientRect();
  tip.style.left = `${clamp(cx + 12, 0, box.width - tip.offsetWidth)}px`;
  tip.style.top = `${clamp(cy - tip.offsetHeight - 10, 0, GR.H - tip.offsetHeight)}px`;
  if (cx + 12 + tip.offsetWidth > box.width) tip.style.left = `${Math.max(0, cx - 12 - tip.offsetWidth)}px`;
}

function hideGraphPoint(plot) {
  plot.querySelectorAll('.gr-cross, .gr-focus, .gr-tip').forEach(el => (el.hidden = true));
  delete plot.dataset.i;
}

function nearestPoint(plot, clientX) {
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
  const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  showGraphPoint(plot, next);
});
// Charts are drawn at the view's pixel width, so redraw them when it changes.
let grResize = null;
addEventListener('resize', () => {
  clearTimeout(grResize);
  grResize = setTimeout(() => { if (ui.view === 'graphs' && !modal.open) render(); }, 150);
});

/* =========================================================
   Forms
   ========================================================= */

const modal = $('#modal');
let formCtx = null; // { kind, id }

function field(name, label, input, hint = '') {
  return `<div class="field" data-field="${name}"><label for="f-${name}">${label}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ''}<div class="err"></div></div>`;
}
const text = (name, v, ph = '') => `<input type="text" id="f-${name}" name="${name}" value="${esc(v)}" placeholder="${esc(ph)}">`;
// A text field rather than type="number", so both a decimal dot and comma work in every browser.
const num = (name, v, ph = '') => `<input type="text" data-num id="f-${name}" name="${name}" value="${esc(numInput(v))}" placeholder="${esc(ph)}" inputmode="decimal" autocomplete="off">`;
// A dd/mm/yyyy text field in every language, with the app's own calendar (weeks start on Monday);
// the browser's date field and picker follow the browser's language instead.
const date = (name, v) => `<div class="date-field">
  <input type="text" data-date id="f-${name}" name="${name}" value="${esc(dateInput(v))}" placeholder="${esc(t('f.datePh'))}" inputmode="numeric" autocomplete="off" maxlength="10">
  <button type="button" class="date-pick" data-cal-open title="${esc(t('f.pickDate'))}" aria-label="${esc(t('f.pickDate'))}" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg></button>
</div>`;
const area = (name, v, ph = '') => `<textarea id="f-${name}" name="${name}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
const select = (name, opts, v) => `<select id="f-${name}" name="${name}">${Object.entries(opts).map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

// A link list: the chosen items are shown as removable tags; the search box below them opens
// a list of the other items (goals grouped by category) that typing filters and a click adds.
function checklist(name, label, kind, items, selected, hint = '') {
  if (!items.length) return '';
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
const pickedTag = (name, kind, item) =>
  `<span class="tag ${kind}" data-picked-id="${item.id}"><input type="hidden" name="${name}" value="${item.id}">${esc(item.title)}<button type="button" data-unpick="${item.id}" title="${esc(t('pick.remove', { name: item.title }))}" aria-label="${esc(t('pick.remove', { name: item.title }))}">×</button></span>`;

// Lower case without accents, so "zivljenje" finds "Življenje".
const fold = s => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Shows the items that match the search and are not chosen yet, and empty groups not at all.
function filterPicker(picker) {
  const q = fold(picker.querySelector('.picker-search').value.trim());
  const opts = [...picker.querySelectorAll('.pick-opt')];
  opts.forEach(o => (o.hidden = o.hasAttribute('data-picked') || (!!q && !o.dataset.pickTitle.includes(q))));
  picker.querySelectorAll('.pick-group').forEach(g => (g.hidden = !g.querySelector('.pick-opt:not([hidden])')));
  const empty = picker.querySelector('.pick-empty');
  empty.hidden = opts.some(o => !o.hidden);
  empty.textContent = opts.every(o => o.hasAttribute('data-picked')) ? t('pick.allChosen') : t('pick.noMatch');
}

function showPickList(picker, open) {
  const list = picker.querySelector('.pick-list');
  if (open) filterPicker(picker);
  list.hidden = !open;
  picker.querySelector('.picker-search').setAttribute('aria-expanded', open);
}

function pickItem(opt) {
  const picker = opt.closest('[data-picker]');
  const { item } = findEntity(opt.dataset.pick);
  opt.setAttribute('data-picked', '');
  picker.querySelector('.pick-none').insertAdjacentHTML('beforebegin', pickedTag(picker.dataset.name, picker.dataset.picker, item));
  filterPicker(picker);
}

function unpickItem(picker, id) {
  picker.querySelector(`[data-picked-id="${id}"]`).remove();
  picker.querySelector(`.pick-opt[data-pick="${id}"]`).removeAttribute('data-picked');
  filterPicker(picker);
}

function smartSection(letter, body) {
  return `<fieldset class="smart-block" data-smart="${letter}"><legend><span class="letter">${letter}</span>${t('smart.' + letter)}</legend>${body}</fieldset>`;
}

// `links` pre-fills a new item's relations by type, e.g. { subactivity: [parentId] };
// for a new relationship, { from: id } pre-selects its source.
function openForm(kind, id = null, links = {}) {
  formCtx = { kind, id };
  cal = null;
  let item = null;
  if (id) item = kind === 'relation' ? db.relations.find(r => r.id === id) : findEntity(id)?.item;
  $('#deleteBtn').hidden = !item;
  $('#modalTitle').textContent = t((item ? 'edit.' : 'new.') + kind);
  $('#modalBody').innerHTML = { goal: goalForm, state: stateForm, activity: activityForm, relation: relationForm }[kind](item || { links });
  if (kind === 'relation') {
    const r = item || links;
    if (r.from) $('#f-from').value = r.from;
    if (r.to) $('#f-to').value = r.to;
    fillRelTypes(r.type);
  }
  if (kind === 'goal') { updateProgressFields(); updateSmartLive(); }
  if (kind === 'activity') updateRepeatFields();
  modal.showModal();
  if (!item) setTimeout(() => modal.querySelector('input, select, textarea')?.focus(), 30);
}

// Targets an item links to by relation type – stored relations, or the presets of a new item.
const linksOf = (item, type) => (item.id ? relsFrom(item.id, type).map(r => r.to) : item.links?.[type] || []);
// Sources that link to an item by relation type, e.g. the activities contributing to a goal.
const linkedFrom = (item, type) => (item.id ? relsTo(item.id, type).map(r => r.from) : []);

function goalForm(g) {
  const parent = linksOf(g, 'subgoal')[0] || '';
  const parents = { '': t('f.none') };
  db.goals.filter(x => x.id !== g.id && !(g.id && reaches(x.id, g.id, 'subgoal'))).forEach(x => (parents[x.id] = x.title));
  const st = g.id ? measuringState(g) : null;
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
      <div class="row3">
        ${field('baseline', t('f.baseline'), num('baseline', g.baseline ?? '', '0'))}
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
    ${checklist('activities', t('f.goalActivities'), 'activity', db.activities, linkedFrom(g, 'contributes'))}
    ${checklist('depends', t('f.goalDepends'), 'goal', db.goals.filter(x => x.id !== g.id), linksOf(g, 'depends'))}`;
}

function stateForm(s) {
  const linked = s.id ? relsFrom(s.id, 'measures').map(r => r.to) : [];
  const history = (s.history || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  // The value field records a new measurement, so it starts empty and dated today.
  const latest = isNum(s.value) ? t('f.valueHint', { value: withUnit(fmtNum(s.value), s.unit || ''), date: fmtDate(s.date) || '—' }) : '';
  return `
    ${field('title', t('f.title'), text('title', s.title, t('f.statePh')))}
    ${field('description', t('f.stateDesc'), area('description', s.description, t('f.stateDescPh')))}
    <div class="row3">
      ${field('value', t('f.value'), num('value', '', t('f.optional')), latest)}
      ${field('unit', t('f.unit'), text('unit', s.unit, t('f.unitPh')))}
      ${field('date', t('f.asOf'), date('date', today()))}
    </div>
    ${checklist('goals', t('f.describesGoals'), 'goal', db.goals, linked, t('f.describesHint'))}
    ${history.length > 1 ? `<div class="field"><span class="label">${t('f.history')}</span><div class="history">${history.map(h => `<div><span>${fmtDate(h.date)}</span><strong>${fmtNum(h.value)} ${esc(s.unit || '')}</strong></div>`).join('')}</div></div>` : ''}`;
}

function activityForm(a) {
  const pick = type => linksOf(a, type);
  const others = db.activities.filter(x => x.id !== a.id);
  // An activity cannot be placed under itself or one of its own sub-activities.
  const below = a.id ? descendants(a.id, 'subactivity') : [];
  const parents = { '': t('f.none') };
  others.filter(x => !below.includes(x.id)).forEach(x => (parents[x.id] = x.title));
  const children = a.id ? relsTo(a.id, 'subactivity').map(r => r.from) : [];
  return `
    ${field('title', t('f.activity'), text('title', a.title, t('f.activityPh')))}
    ${field('description', t('f.details'), area('description', a.description, t('f.detailsPh')))}
    <div class="row3">
      ${field('status', t('f.status'), select('status', statusLabels(ACTIVITY_STATUS, 'activity.'), a.status || 'todo'))}
      ${field('startDate', t('f.startDate'), date('startDate', isRoutine(a) ? routineStart(a) : a.startDate))}
      ${field('dueDate', t('f.dueDate'), date('dueDate', a.dueDate))}
    </div>
    ${repeatFields(a)}
    ${field('parent', t('f.parentActivity'), select('parent', parents, pick('subactivity')[0] || ''), t('f.parentActivityHint'))}
    ${children.length ? `<div class="field"><span class="label">${t('f.subActivities')}</span><div class="links">${children.map(linkTag).join('')}</div></div>` : ''}
    ${checklist('goals', t('f.contributes'), 'goal', db.goals, pick('contributes'))}
    ${checklist('states', t('f.improves'), 'state', db.states, pick('improves'))}
    ${checklist('depends', t('f.depends'), 'activity', others, pick('depends'))}`;
}

// Whether and how an activity repeats; a repeating activity is a routine. The common kinds – a number
// of times a week or month, or specific weekdays – or a custom recurrence, and when it ends.
// Each common kind is a unit and what it falls on, as in the custom recurrence.
const REPEAT_PRESETS = { week: { unit: 'week', on: 'times' }, month: { unit: 'month', on: 'times' }, days: { unit: 'week', on: 'days' } };

function repeatPreset(r) {
  if (!r) return 'none';
  if (r.every !== 1) return 'custom';
  if (r.times) return r.unit;
  return r.unit === 'week' && r.days ? 'days' : 'custom';
}

// What a custom recurrence falls on, for its unit: weekdays, a day or weekday of the month, or any days a number of times.
function repeatOnOptions(unit) {
  if (unit === 'week') return { days: t('f.onDays'), times: t('f.onTimes') };
  if (unit !== 'month') return {};
  return { day: t('f.onMonthDay'), lastDay: t('f.onLastDay'), nth: t('f.onNth'), times: t('f.onTimes') };
}
// The n-th choices for a monthly weekday; a fifth only for older routines that use one.
const nthOptions = nth => Object.fromEntries([1, 2, 3, 4, ...(nth === 5 ? [5] : []), -1].map(n => [n, nthWord(n, 0)]));

const formStart = () => parseDateInput($('#f-startDate')?.value || '') || today();

function repeatFields(a) {
  const r = isRoutine(a) ? sched(a) : null;
  const start = a.startDate || today();
  const mode = repeatPreset(r);
  const unit = r?.unit || 'week';
  const on = r?.times ? 'times' : unit === 'week' ? 'days' : r?.on || 'day';
  // A monthly day or n-th weekday, the start's until chosen (updateRepeatFields follows the start date).
  const month = r?.unit === 'month' && !r.times ? r : monthRule({ on: 'day' }, start);
  const nthPick = { ...month, ...monthRule({ on: 'nth' }, start), ...(month.on === 'nth' ? month : {}) };
  const weekdays = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [i, weekdayName(i, 'long')]));
  const picked = r?.unit === 'month' && !r.times ? 'data-picked' : '';
  const days = r?.days || [weekday(start)];
  const ends = r?.count ? 'after' : a.dueDate ? 'on' : 'never';
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
    <fieldset id="repeatEnds" class="rep-ends"><legend class="label">${t('f.ends')}</legend>
      ${radio('never', t('f.endsNever'))}
      <div class="field rep-end" data-field="endDate">${radio('on', t('f.endsOn'))}${date('endDate', r?.count ? '' : a.dueDate)}<div class="err"></div></div>
      <div class="field rep-end" data-field="count">${radio('after', t('f.endsAfter'))}${num('count', r?.count ?? 10)}<span id="countUnit"></span><div class="err"></div></div>
    </fieldset>
    ${stats ? `<p class="hint rt-stats">${esc(stats)}</p>` : ''}
  </div>`;
}

// The metric fields, or the hint for measuring by activities or routines.
function updateProgressFields() {
  const by = $('#f-progress').value;
  $('#measureFields').hidden = by !== 'measure';
  $('#actsHint').hidden = by !== 'activities';
  $('#routinesHint').hidden = by !== 'routines';
}

// A routine has no status or due date (when it ends takes its place); only the fields its kind of
// repeat needs show, and the labels follow the start date and the interval.
function updateRepeatFields(e) {
  const sel = $('#f-repeat');
  if (!sel) return;
  const unitSel = $('#f-unit'), onSel = $('#f-on');
  // Switching from a common kind to custom starts from what it was.
  const was = REPEAT_PRESETS[sel.dataset.prev];
  if (e?.target === sel && sel.value === 'custom' && was) { unitSel.value = was.unit; onSel.dataset.want = was.on; }
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
  $('#timesHint').textContent = t('f.timesHint', { every: tp('rt.every.' + unit, every) });
  $('#countUnit').textContent = tp('f.endsCount', Math.max(1, parseInt($('#f-count').value, 10) || 1));
  $('#repeatEnds').hidden = mode === 'none';
  modal.querySelector('[data-field="status"]').hidden = mode !== 'none';
  modal.querySelector('[data-field="dueDate"]').hidden = mode !== 'none';
}

// The recurrence the form describes, or an error for one of its fields.
function readRepeat(v, start) {
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
  let dueDate = '';
  if (v.ends === 'on') {
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

function relationForm() {
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
function fillRelTypes(keep = $('#f-type').value) {
  const from = $('#f-from').value, to = $('#f-to').value;
  const title = id => findEntity(id)?.item.title || '';
  const group = (a, b, types, pre) => types.length
    ? `<optgroup label="${esc(`${title(a)} → ${title(b)}`)}">${types.map(k => `<option value="${pre}${k}">${esc(relLabel(k))}</option>`).join('')}</optgroup>` : '';
  const fwd = possibleTypes(from, to, formCtx.id), rev = possibleTypes(to, from, formCtx.id).filter(k => !(SYMMETRIC.has(k) && fwd.includes(k)));
  const box = $('#f-type');
  box.innerHTML = fwd.length || rev.length ? group(from, to, fwd, '') + group(to, from, rev, 'rev:') : `<option value="">${esc(t('rel.nonePossible'))}</option>`;
  if ([...box.options].some(o => o.value === keep)) box.value = keep;
  // Explain an empty list right away rather than on saving.
  const f = box.closest('.field');
  f.classList.toggle('invalid', !box.value);
  f.querySelector('.err').textContent = box.value ? '' : from === to ? t('err.self') : t('rel.noneBetween');
}

function formValues() {
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

function showErrors(errs) {
  modal.querySelectorAll('.field[data-field]').forEach(f => {
    const e = errs[f.dataset.field];
    f.classList.toggle('invalid', !!e);
    f.querySelector('.err').textContent = e || '';
  });
  const first = modal.querySelector('.field.invalid input, .field.invalid textarea, .field.invalid select');
  first?.focus();
}

function updateSmartLive() {
  if (formCtx?.kind !== 'goal') return;
  const { v } = formValues();
  const c = smartCheck(v);
  modal.querySelectorAll('.smart-block').forEach(b => b.classList.toggle('ok', !!c[b.dataset.smart]));
  const okCount = 'SMART'.split('').filter(l => c[l]).length;
  $('#smartLive').innerHTML = smartBadge(v);
  $('#smartLiveText').textContent = okCount === 5 ? t('smart.ok') : t('smart.partial', { n: okCount });
}

function submitForm() {
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
    if (!existing) db.goals.push(g);
    setLinks(g.id, 'subgoal', v.parent ? [v.parent] : []);
    setLinks(g.id, 'depends', arr('depends'));
    setIncoming(g.id, 'contributes', arr('activities'));
    return finish(t(existing ? 'toast.goalUpdated' : 'toast.goalCreated'));
  }

  if (kind === 'state') {
    const s = Object.assign(existing || { id: uid(), history: [], value: '' }, {
      title: v.title.trim(), description: v.description.trim(), unit: v.unit.trim(),
    });
    s.history ||= [];
    // An empty value keeps the latest measurement; a value for a date that has one replaces it.
    if (isNum(v.value)) recordMeasurement(s, v.date || today(), v.value);
    if (!existing) db.states.push(s);
    setLinks(s.id, 'measures', arr('goals'));
    return finish(t(existing ? 'toast.stateUpdated' : 'toast.stateAdded'));
  }

  if (kind === 'activity') {
    const startDate = v.startDate || (v.repeat === 'none' ? '' : existing && isRoutine(existing) ? routineStart(existing) : today());
    const { repeat, dueDate = v.dueDate, errors } = readRepeat(v, startDate);
    if (errors) return showErrors(errors);
    if (!repeat && v.startDate && v.dueDate && v.startDate > v.dueDate) return showErrors({ dueDate: t('err.startAfterDue') });
    const a = Object.assign(existing || { id: uid(), createdAt: today() }, {
      title: v.title.trim(), description: v.description.trim(), status: v.status, startDate, dueDate,
    });
    // A routine keeps its check-ins even when it stops repeating, in case it is switched back.
    if (repeat) Object.assign(a, { repeat, status: 'todo', checkins: a.checkins || {} });
    else delete a.repeat;
    if (!existing) db.activities.push(a);
    setLinks(a.id, 'subactivity', v.parent ? [v.parent] : []);
    setLinks(a.id, 'contributes', arr('goals'));
    setLinks(a.id, 'improves', arr('states'));
    setLinks(a.id, 'depends', arr('depends'));
    return finish(t(existing ? 'toast.activityUpdated' : 'toast.activityAdded'));
  }
}

function finish(msg) {
  save();
  modal.close();
  render();
  toast(msg);
}

let lastNodeClick = { id: null, t: 0 };

/* =========================================================
   Events
   ========================================================= */

function toast(msg) {
  const box = $('#toast');
  box.textContent = msg;
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), 2200);
}

function cycleStatus(id) {
  const a = db.activities.find(x => x.id === id);
  if (!a) return;
  const next = ACTIVITY_STATUS[(ACTIVITY_STATUS.indexOf(a.status) + 1) % ACTIVITY_STATUS.length];
  const waits = blockers(a);
  if (next === 'done' && waits.length) toast(t('acts.notDone', { name: waits[0].title }));
  a.status = next;
  save();
  render();
}

function setView(view) {
  ui.view = view;
  ui.mapLinkFrom = null;
  ui.search = '';
  ui.mapRefocus = true;
  prefs.set('view', view);
  render();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-item[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

/* ---------- "More" menu of the phone tab bar ---------- */

function openNavSheet() {
  const sheet = $('#navSheet');
  sheet.innerHTML = [...document.querySelectorAll('.nav-extra')].map(b =>
    `<button type="button" role="menuitem" class="${b.dataset.view === ui.view ? 'active' : ''}" data-sheet-view="${b.dataset.view}">${b.innerHTML}</button>`).join('');
  sheet.hidden = false;
  $('#navMore').setAttribute('aria-expanded', 'true');
  (sheet.querySelector('.active') || sheet.querySelector('button')).focus();
}

function closeNavSheet(refocus = false) {
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

$('#addBtn').addEventListener('click', () => {
  const kind = VIEWS[ui.view].add;
  if (kind === 'relation' && itemCount() < 2) return toast(t('err.needTwo'));
  openForm(kind);
});

viewEl.addEventListener('click', e => {
  const el = e.target.closest('[data-tl-fold],[data-tl-fold-all],[data-rel-open],[data-rel-remove],[data-rt-week],[data-checkin],[data-del-measure],[data-cycle],[data-open],[data-new],[data-sample],[data-goal-filter],[data-rel-edit],[data-map-node],[data-tl-node],[data-map-clear],[data-rel-toggle],[data-hide-done],[data-category],[data-tl-zoom],[data-tl-deps],[data-map-zoom],[data-next-more]');
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
  if (el.dataset.checkin) return toggleCheckin(el.dataset.checkin, el.dataset.date);
  if (el.dataset.delMeasure) return removeMeasurement(el.dataset.delMeasure, el.dataset.date);
  if (el.dataset.cycle) return cycleStatus(el.dataset.cycle);
  if (el.dataset.open) { const ent = findEntity(el.dataset.open); return ent && openForm(ent.kind, ent.item.id); }
  if (el.dataset.new) return el.dataset.new === 'relation' ? $('#addBtn').click() : openForm(el.dataset.new);
  if (el.hasAttribute('data-sample')) return loadSample();
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
    if (double) {
      ui.mapSelected = node;
      render();
      const ent = findEntity(node);
      return ent && openForm(ent.kind, node);
    }
    ui.mapSelected = ui.mapSelected === node ? null : node;
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

function bindDragDrop() {
  document.querySelectorAll('[data-drag]').forEach(card => {
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

$('#modalForm').addEventListener('submit', e => { e.preventDefault(); submitForm(); });
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
  if (e.target.id === 'f-from' || e.target.id === 'f-to') return fillRelTypes();
  if (['f-monthDay', 'f-nth', 'f-weekday'].includes(e.target.id)) e.target.setAttribute('data-picked', '');
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
const shownOpts = picker => [...picker.querySelectorAll('.pick-opt:not([hidden])')];
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

let cal = null; // { field, box, y, m, focus: 'yyyy-mm-dd' }
const isoOf = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

function openCalendar(field) {
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

function drawCalendar() {
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

const focusDay = () => cal.field.querySelector(`.cal-grid [data-cal-day="${cal.focus}"]`).focus();

// Show the month of `iso` with that day focused.
function moveCalendar(iso) {
  const [y, m] = iso.split('-').map(Number);
  Object.assign(cal, { y, m: m - 1, focus: iso });
  drawCalendar();
}

function closeCalendar(refocus = false) {
  if (!cal) return;
  const { field } = cal;
  cal = null;
  field.querySelector('.cal')?.remove();
  field.querySelector('[data-cal-open]')?.setAttribute('aria-expanded', 'false');
  if (refocus) field.querySelector('[data-cal-open]')?.focus();
}

function pickDate(iso) {
  const { box } = cal;
  box.value = dateInput(iso);
  closeCalendar();
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.focus();
}

$('#modalForm').addEventListener('click', e => {
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

/* A plan file is { format, version, kind, name, exportedAt, goals, states, activities, relations }.
   kind 'full' is an exact copy (a backup); 'template' is the same plan without progress, its dates
   moved to start now, for sharing. Files exported before the header are read as full copies. */
const PLAN_FORMAT = 'actionplan-plan';
const PLAN_VERSION = 1;
const PLAN_DATES = ['startDate', 'deadline', 'dueDate'];

// A copy of plan data with the progress taken out: goals active again with no current value, no
// measurements, activities to do, no check-ins, no sync bookkeeping. With `shift`, every date moves
// by the same whole number of weeks (so weekly routines keep their days) to put the earliest one this week.
function resetProgress(data, { shift = false } = {}) {
  const d = normalize(JSON.parse(JSON.stringify(data)));
  d.deleted = {};
  const dated = [...d.goals, ...d.activities];
  const first = dated.flatMap(x => PLAN_DATES.map(k => x[k])).filter(Boolean).sort()[0];
  const by = shift && first ? Math.ceil((dayNum(today()) - dayNum(first)) / 7) * 7 : 0;
  for (const x of [...dated, ...d.states, ...d.relations]) delete x.updatedAt;
  for (const x of dated) for (const k of [...PLAN_DATES, 'createdAt']) if (by && x[k]) x[k] = addDays(x[k], by);
  d.goals.forEach(g => { g.current = ''; if (g.status === 'achieved') g.status = 'active'; });
  d.states.forEach(s => Object.assign(s, { value: '', date: '', history: [] }));
  d.activities.forEach(a => { a.status = 'todo'; delete a.checkins; });
  return d;
}

// How much progress plan data holds, as the import question lists it.
function progressCounts(data) {
  const ticks = a => Object.values(a.checkins || {}).filter(v => v === 1).length;
  return {
    checkins: data.activities.reduce((n, a) => n + ticks(a), 0),
    measurements: data.states.reduce((n, s) => n + ((s.history || []).length || (isNum(s.value) ? 1 : 0)), 0)
      + data.goals.filter(g => isNum(g.current)).length,
    done: data.activities.filter(a => a.status === 'done').length + data.goals.filter(g => g.status === 'achieved').length,
    started: data.activities.filter(a => a.status === 'doing').length,
  };
}
const hasProgress = data => Object.values(progressCounts(data)).some(Boolean);

function planFile(kind) {
  const data = kind === 'template' ? resetProgress(db, { shift: true }) : db;
  const { goals, states, activities, relations } = data;
  return { format: PLAN_FORMAT, version: PLAN_VERSION, kind, name: currentPlan().name, exportedAt: new Date().toISOString(), goals, states, activities, relations };
}

// Reads a plan file; throws an error with code 'invalid' (not a plan) or 'version' (from a newer app).
function parsePlanFile(text, fileName) {
  const fail = code => Object.assign(new Error(code), { code });
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw fail('invalid'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail('invalid');
  if (raw.format !== undefined && raw.format !== PLAN_FORMAT) throw fail('invalid');
  if (raw.format && raw.version > PLAN_VERSION) throw fail('version');
  if (!SYNC_COLLS.some(k => Array.isArray(raw[k]))) throw fail('invalid');
  const name = (typeof raw.name === 'string' && raw.name.trim()) || fileName.replace(/\.json$/i, '');
  return { name, kind: raw.kind === 'template' ? 'template' : 'full', data: normalize(raw) };
}

const planFileName = kind => {
  const name = currentPlan().name.replace(/[\\/:*?"<>|]+/g, '').trim() || t('app.file');
  return `${name}${kind === 'template' ? '-' + t('export.templateFile') : ''}-${today()}.json`;
};

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Downloads the plan, or hands it to the system share sheet where files can be shared (phones).
// A cancelled share does nothing; a failed one falls back to a download.
async function exportPlan(kind, share = false) {
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
const exportJson = () => exportPlan('full');
const canShareFiles = () => {
  try { return !!navigator.canShare?.({ files: [new File(['{}'], 'plan.json', { type: 'application/json' })] }); } catch (e) { return false; }
};

const planExp = $('#planExport');

function openExport() {
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
const planImp = $('#planImport');
let pendingImport = null;

function addImported(name, data, msg = 'toast.imported') {
  createPlan(uniqueName(name), data);
  toast(t(msg));
}

async function importJson(file) {
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
function sampleData() {
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoDate(x); };
  const [halfMarathon, fund, tenK, weight, course, spanish, sell, trip, bathroom, heating, exercise] = Array.from({ length: 11 }, uid);
  const [fitness, savings, spending, bodyWeight, itemsSold, heatingBill] = Array.from({ length: 6 }, uid);
  const a = Array.from({ length: 25 }, uid);
  // Routine check-ins on the past days `from`..yesterday that `keep(daysAgo, weekday)` picks.
  const ticks = (from, keep) => Object.fromEntries(Array.from({ length: -from }, (_, i) => from + i)
    .filter(n => keep(n, weekday(d(n)))).map(n => [d(n), 1]));
  // Strength training on Mondays and Thursdays, one session missed two weeks ago.
  const missed = Array.from({ length: 7 }, (_, i) => -14 + i).find(n => [0, 3].includes(weekday(d(n))));
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
    ], txt.goals),
    states: withText([
      { id: fitness, value: '8', unit: 'km', date: d(-2), history: [{ date: d(-30), value: '5' }, { date: d(-2), value: '8' }] },
      { id: savings, value: '1900', unit: '€', date: d(-5), history: [{ date: d(-60), value: '1000' }, { date: d(-5), value: '1900' }] },
      { id: spending, value: '2000', unit: '€', date: d(-5), history: [{ date: d(-5), value: '2000' }] },
      { id: bodyWeight, value: '78', unit: 'kg', date: d(-1), history: [{ date: d(-30), value: '81' }, { date: d(-1), value: '78' }] },
      { id: itemsSold, value: '6', date: d(-4), history: [{ date: d(-20), value: '2' }, { date: d(-4), value: '6' }] },
      { id: heatingBill, value: '165', unit: '€', date: d(-5), history: [{ date: d(-60), value: '180' }, { date: d(-30), value: '172' }, { date: d(-5), value: '165' }] },
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
      { id: a[13], status: 'doing', startDate: d(-15), dueDate: d(10) },  // list items for sale
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
        checkins: ticks(-28, (n, wd) => [0, 3].includes(wd) && n !== missed) },
    ], txt.activities),
    relations: [],
  };
  const rel = (from, type, to) => data.relations.push({ id: uid(), from, to, type });
  // Goals: two sub-goals under the half marathon, a late sub-goal under the fund,
  // and a trip that waits for two other goals.
  rel(tenK, 'subgoal', halfMarathon); rel(weight, 'subgoal', halfMarathon); rel(sell, 'subgoal', fund);
  rel(fund, 'depends', course); rel(trip, 'depends', spanish); rel(trip, 'depends', fund);
  rel(heating, 'related', bathroom);
  // Current states
  rel(fitness, 'measures', halfMarathon); rel(fitness, 'measures', tenK); rel(savings, 'measures', fund);
  rel(bodyWeight, 'measures', weight); rel(itemsSold, 'measures', sell);
  rel(spending, 'related', savings);
  rel(heatingBill, 'measures', heating);
  // Activities → goals
  rel(a[0], 'contributes', halfMarathon); rel(a[1], 'contributes', halfMarathon); rel(a[1], 'contributes', tenK);
  rel(a[2], 'contributes', halfMarathon); rel(a[3], 'contributes', tenK); rel(a[4], 'contributes', fund);
  rel(a[5], 'contributes', fund); rel(a[6], 'contributes', fund); rel(a[12], 'contributes', weight);
  rel(a[13], 'contributes', sell); rel(a[14], 'contributes', course); rel(a[15], 'contributes', spanish);
  rel(a[16], 'contributes', bathroom); rel(a[17], 'contributes', bathroom); rel(a[18], 'contributes', bathroom);
  rel(a[22], 'contributes', heating);
  rel(a[23], 'contributes', exercise); rel(a[24], 'contributes', exercise); rel(exercise, 'related', halfMarathon);
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

function loadSample() {
  createPlan(uniqueName(t('plan.sampleName')), sampleData());
  toast(t('toast.sample'));
}

/* ---------- Settings (gear, top right): plan, language, theme, display options, data, help ---------- */

const settings = $('#settings');

// Display options shown as switches: how to read each one and what changing it does.
const SETTINGS = {
  help: { get: () => ui.help, set: v => setHelp(v) },
  hideDone: { get: () => ui.hideDone, set: v => setToggle('hideDone', v) },
  tlDeps: { get: () => ui.tlDeps, set: v => setToggle('tlDeps', v) },
  planBadges: { get: () => ui.planBadges, set: v => setToggle('planBadges', v) },
  navCollapsed: { get: () => ui.navCollapsed, set: v => setNavCollapsed(v) },
};

// A remembered on/off display option (hideDone, tlDeps, planBadges).
function setToggle(key, on) {
  ui[key] = on;
  prefs.set(key, on);
  render();
}

function renderSettings() {
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

/* ---------- Collapsible sidebar (desktop): only the icons stay visible ---------- */

function setNavCollapsed(on) {
  ui.navCollapsed = on;
  prefs.set('navCollapsed', on);
  applyNavCollapsed();
  render(); // graphs are drawn at the view's width
}

function applyNavCollapsed() {
  const on = ui.navCollapsed;
  $('.app').classList.toggle('nav-collapsed', on);
  const b = $('#navToggle');
  b.setAttribute('aria-expanded', !on);
  b.querySelector('span').textContent = t(on ? 'nav.expand' : 'nav.collapse');
  b.title = t(on ? 'nav.expand' : 'nav.collapse');
}

$('#navToggle').addEventListener('click', () => setNavCollapsed(!ui.navCollapsed));

/* ---------- Map context menu: right-click, long-press, or the context-menu key ---------- */

const ctxMenu = $('#ctxMenu');
// Map boxes and timeline rows both act as item "nodes".
const NODE_SEL = '[data-map-node],[data-tl-node]';
const nodeId = el => el?.dataset.mapNode || el?.dataset.tlNode;
const LONG_PRESS_MS = 500;

function ctxOptions(kind, item) {
  const opt = (act, label, extra = {}) => ({ act, label, ...extra });
  const options = [opt('edit', t('btn.edit')), opt('highlight', t('ctx.highlight'))];
  if (kind === 'goal') {
    options.push(
      opt('focus', t('ctx.focus')),
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
    options.push('-', opt('add:activity:improves', t('ctx.addActivityState')));
  }
  options.push(opt('link', t('ctx.link')), '-', opt('delete', t('btn.delete'), { danger: true }));
  return options;
}

function openCtxMenu(id, x, y) {
  const ent = findEntity(id);
  if (!ent) return;
  ctxMenu.dataset.id = id;
  ctxMenu.dataset.rel = '';
  ctxMenu.setAttribute('aria-label', t('ctx.label', { name: ent.item.title }));
  showCtxMenu(ent.kind, t('kind.' + ent.kind), ent.item.title, ctxOptions(ent.kind, ent.item), x, y);
}

// Fills the menu – a heading with a tag and a name, then its options – and shows it at x, y, kept on screen.
function showCtxMenu(tagClass, tag, title, options, x, y) {
  ctxMenu.innerHTML = `<div class="ctx-head"><span class="tag ${tagClass}">${tag}</span><strong title="${esc(title)}">${esc(title)}</strong></div>` +
    options.map(o => o === '-' ? '<hr>' :
      `<button type="button" tabindex="-1" data-ctx="${o.act}" class="${o.danger ? 'danger' : ''}" role="${o.checked === undefined ? 'menuitem' : 'menuitemradio'}"${o.checked === undefined ? '' : ` aria-checked="${o.checked}"`}>${esc(o.label)}</button>`).join('');
  ctxMenu.hidden = false;
  const { width, height } = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
  ctxMenu.querySelector('button').focus();
}

let ctxOpenedAt = 0;

function closeCtxMenu(refocus = false) {
  if (ctxMenu.hidden) return;
  ctxMenu.hidden = true;
  if (refocus) $(ctxMenu.dataset.rel ? `[data-rel-edit="${ctxMenu.dataset.rel}"]` : `[data-map-node="${ctxMenu.dataset.id}"], [data-tl-node="${ctxMenu.dataset.id}"]`)?.focus();
}

// A relationship line's menu (long-press, right-click or the menu key): it selects the line and
// offers what the selection row below offers.
function openRelMenu(relId, x, y) {
  const r = db.relations.find(x => x.id === relId);
  if (!r) return;
  Object.assign(ui, { mapRel: relId, mapSelected: null });
  render();
  ctxMenu.dataset.id = '';
  ctxMenu.dataset.rel = relId;
  ctxMenu.setAttribute('aria-label', t('map.relLabel', { rel: relText(r) }));
  ctxOpenedAt = performance.now();
  showCtxMenu('', t('kind.relation'), relText(r), [
    { act: 'rel-edit', label: t('btn.edit') }, { act: 'rel-remove', label: t('btn.remove'), danger: true }, { act: 'rel-deselect', label: t('btn.deselect') },
  ], x, y);
}

// The menu of a relationship line, or else of an item.
const openMenuAt = (line, node, x, y) => (line ? openRelMenu(line.dataset.relEdit, x, y) : openCtxMenu(nodeId(node), x, y));

function runRelAction(act, relId) {
  closeCtxMenu();
  if (act === 'rel-edit') return openForm('relation', relId);
  if (act === 'rel-remove') return removeRelation(relId);
  ui.mapRel = null;
  render();
}

function runCtxAction(act, id) {
  const ent = findEntity(id);
  closeCtxMenu();
  if (!ent) return;
  const { kind, item } = ent;
  const [verb, arg, type] = act.split(':');
  if (verb === 'edit') return openForm(kind, id);
  if (verb === 'checkin') return toggleCheckin(id, today());
  if (verb === 'highlight') { ui.mapSelected = id; return render(); }
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
  if (tlDrag?.touch) return e.preventDefault();
  const node = e.target.closest(NODE_SEL), line = e.target.closest('[data-rel-edit]');
  if (!node && !line) return;
  e.preventDefault();
  openMenuAt(line, node, e.clientX, e.clientY);
});

// Long-press for touch screens (iOS Safari never fires contextmenu).
let press = null;
viewEl.addEventListener('pointerdown', e => {
  const node = e.target.closest(NODE_SEL), line = e.target.closest('[data-rel-edit]');
  if ((!node && !line) || e.pointerType === 'mouse' || e.target.closest('[data-tl-drag]')) return;
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
// The map scales as a whole; the timeline only stretches its time axis. Both keep the point under the
// pointer (or between the fingers) in place.

function zoomMap(scale, cx, cy) {
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

function zoomTimeline(factor, cx) {
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

// Coalesce bursts of wheel / touch events into one zoom per frame.
let zoomQueue = null;
function queueZoom(wrap, factor, cx, cy) {
  if (zoomQueue) return Object.assign(zoomQueue, { factor: zoomQueue.factor * factor, cx, cy });
  zoomQueue = { map: wrap.classList.contains('map-wrap'), factor, cx, cy };
  requestAnimationFrame(() => {
    const z = zoomQueue;
    zoomQueue = null;
    if (z.map) zoomMap(ui.mapScale * z.factor, z.cx, z.cy); else zoomTimeline(z.factor, z.cx);
  });
}
const ZOOM_SEL = '.map-wrap, .tl-scroll';

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
let pinch = null;
const touchGap = ([a, b]) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
function pinchMove(e) {
  if (!pinch || e.touches.length !== 2) return;
  if (e.cancelable) e.preventDefault();
  const gap = touchGap(e.touches), [a, b] = e.touches;
  queueZoom(pinch.wrap, gap / pinch.gap, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
  pinch.gap = gap;
}
function pinchEnd(e) {
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
}, { passive: true });

// Click and drag with the mouse pans the map and the timeline (touch screens pan natively).
let pan = null;
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
  if (pan?.moved || linkDrag?.moved) { e.stopPropagation(); e.preventDefault(); }
}, true);

/* ---------- Linking two map boxes ----------
   With a mouse, drag from one box to another; releasing anywhere but another box drops the link.
   On touch screens (where dragging scrolls), choose "Link to…" in a box's long-press menu, then tap
   the other box. Either way the relationship form opens with only the types that fit the two items. */

function startMapLink(id) {
  ui.mapLinkFrom = id;
  ui.mapSelected = null;
  render();
}

// Whether any relationship fits two items, in either direction.
const canLink = (a, b) => possibleTypes(a, b).length > 0 || possibleTypes(b, a).length > 0;
const LINK_MARKS = ['link-source', 'link-target', 'link-bad'];

function linkItems(from, to) {
  if (!canLink(from, to))
    return toast(t('map.linkNone', { a: findEntity(from).item.title, b: findEntity(to).item.title }));
  openForm('relation', null, { from, to });
}

let linkDrag = null; // { from, id, x, y, moved, line, target }
// A point on the screen in the map's own coordinates.
function mapPoint(svg, x, y) {
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
function endLinkDrag() {
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

let tlDrag = null; // { id, kind, edge, s0, e0, lo, hi, x, y, pointerId, touch, armed, moved, days, timer }
let tlDragClick = false; // the click that ends a drag must not toggle the selection

// The dates the drag has reached: each end keeps at least the length the item's form asks for.
function tlDragDates(d, days = d.days) {
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
function previewTlDrag(d) {
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
    row.querySelector('.tl-dates').textContent = fmtSpan(s, e);
  });
  showTlDragTip(d, s, e);
}

// A label above the dragged bar with the date (or dates) it would get, over the end that moves.
// On touch screens it stays clear of the finger.
function showTlDragTip(d, s, e) {
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
  tip.textContent = d.edge ? `${t(d.edge === 'start' ? 'f.startDate' : endKey)}: ${fmtDate(d.edge === 'start' ? s : e)}` : fmtSpan(s, e);
  const r = mark.getBoundingClientRect(), w = tip.offsetWidth;
  const x = d.edge === 'start' ? r.left : d.edge === 'end' ? r.right : r.left + r.width / 2;
  const top = Math.min(r.top, d.touch ? d.cy - 40 : r.top) - 8;
  tip.style.left = `${clamp(x - w / 2, 8, innerWidth - w - 8)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

function startTlDrag(d) {
  d.moved = true;
  $('.tl-scroll')?.classList.add('tl-dragging', d.edge ? 'tl-resizing' : 'tl-moving');
  getSelection().removeAllRanges();
}

// Saves the new dates (or, with `keep` false, puts the bar back) and redraws the timeline.
function endTlDrag(keep) {
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
  toast(t('tl.datesMoved', { name: ent.item.title, dates: fmtSpan(s, e) }));
}

// Once a long-press has picked the bar up, moving the finger drags it instead of scrolling.
function tlDragTouchMove(e) {
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
let gesture = null;
function gestureChange(e) {
  e.preventDefault();
  if (!pinch) queueZoom(gesture.wrap, e.scale / gesture.scale, e.clientX, e.clientY);
  gesture.scale = e.scale;
}
function gestureEnd() {
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
    return openRelMenu(line.dataset.relEdit, box.left + box.width / 2, box.top + box.height / 2);
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
    openCtxMenu(nodeId(node), r.left + 16, r.bottom + 4);
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
const selectsInView = () => ui.view === 'map' || ui.view === 'timeline';
const relShown = id => !!id && !!$(`[data-rel-edit="${id}"]`);
const itemShown = id => !!id && !!$(`[data-map-node="${id}"],[data-tl-node="${id}"]`);
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
  const b = e.target.closest('[data-ctx]');
  if (b && ctxMenu.dataset.rel) runRelAction(b.dataset.ctx, ctxMenu.dataset.rel);
  else if (b) runCtxAction(b.dataset.ctx, ctxMenu.dataset.id);
});
ctxMenu.addEventListener('keydown', e => {
  const items = [...ctxMenu.querySelectorAll('button')];
  const i = items.indexOf(document.activeElement);
  const moves = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 };
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
// Scrolling closes the menu, but not the scroll a redraw makes right after it opened (a line's
// menu selects the line, which redraws the map and puts its scroll position back).
document.addEventListener('scroll', () => { if (performance.now() - ctxOpenedAt > 400) closeCtxMenu(); }, true);

/* ---------- Plan switcher (sidebar on desktop, menu on mobile) ---------- */

const PLAN_ICONS = {
  new: '<path d="M12 5v14M5 12h14"/>',
  rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  merge: '<path d="M6 3v4a6 6 0 0 0 12 0V3M12 13v8M8 17l4 4 4-4"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5M5 14v6h14v-6"/>',
  delete: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
};

// How a plan is doing, for the badge in the plan menus: 'late' when something is overdue,
// 'today' when something still has to be done today, else 'ok'. Paused goals and finished work don't count.
function planHealth(data) {
  const keep = db;
  db = data;
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
      const p = periodProgress(a, now);
      const left = daysBetween(now, p.to).filter(d => runsOn(a, d) && !checkedOn(a, d)).length;
      const dueToday = !checkedOn(a, now) && !p.met && (isFlexible(a) ? p.target - p.done >= left : isDueDay(a, now));
      if (dueToday) flag('today');
    });
    return health;
  } finally { db = keep; }
}
const HEALTH_BADGE = { ok: '🟢', today: '🟡', late: '🔴' };

// Other plans change only through sync or the plan menu: their health is kept until the stored
// copy or the day changes, so a render reads them from storage without parsing them again.
const storedHealth = new Map(); // plan id → { key, health }
function storedPlanHealth(id) {
  let raw = null;
  try { raw = localStorage.getItem(planKey(id)); } catch (e) { /* ignore */ }
  const key = `${today()}|${raw}`;
  if (storedHealth.get(id)?.key !== key) storedHealth.set(id, { key, health: planHealth(readPlan(id)) });
  return storedHealth.get(id).health;
}

// The plan menus show each plan's badge before its name (unless switched off in Settings).
function updatePlanBadges() {
  const health = ui.planBadges ? Object.fromEntries(plans.list.map(p => [p.id, p.id === plans.current ? planHealth(db) : storedPlanHealth(p.id)])) : {};
  document.querySelectorAll('[data-plan-select] option').forEach(o => {
    const plan = plans.list.find(p => p.id === o.value), h = health[o.value];
    if (!plan) return;
    o.textContent = h ? `${HEALTH_BADGE[h]} ${plan.name}` : plan.name;
    o.title = h ? t('plan.health.' + h) : '';
  });
}

function renderPlanSwitch() {
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
function planContents(data) {
  const count = (key, n) => (n ? `<li>${esc(tp(key, n))}</li>` : '');
  const measured = data.states.reduce((sum, s) => sum + (s.history || []).length, 0);
  return count('planDel.goals', data.goals.length) + count('planDel.states', data.states.length) + count('planDel.measurements', measured)
    + count('planDel.activities', data.activities.length) + count('planDel.relations', data.relations.length);
}

/* ---------- Deleting a plan: spells out what is lost and asks for the plan's name ---------- */

const planDel = $('#planDelete');

function openPlanDelete(plan) {
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

const planDelNameOk = () => $('#planDeleteName').value.trim() === plans.list.find(p => p.id === planDel.dataset.id)?.name;
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

const planMerge = $('#planMerge');

function openMerge(plan, remove = false) {
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

function renderLangSwitch() {
  document.querySelectorAll('.lang-switch').forEach(box => {
    box.innerHTML = Object.entries(I18N).map(([code, l]) =>
      `<button type="button" data-lang="${code}" lang="${code}" title="${esc(l.name)}" aria-pressed="${code === lang}">${code.toUpperCase()}</button>`).join('');
  });
}

function changeLanguage(code) {
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
  render();
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-lang]');
  if (b) changeLanguage(b.dataset.lang);
});

// 'system' follows the device; 'light' / 'dark' pin the theme.
const THEMES = ['system', 'light', 'dark'];
const THEME_ICONS = {
  system: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="currentColor"/></svg>',
};
let theme = THEMES.includes(prefs.get('theme')) ? prefs.get('theme') : 'system';

function applyTheme() {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  renderThemeSetting();
}
function renderThemeSetting() {
  $('#themeSeg').innerHTML = THEMES.map(k =>
    `<button type="button" data-theme-set="${k}" aria-pressed="${k === theme}">${THEME_ICONS[k]}<span>${t('theme.' + k)}</span></button>`).join('');
}
$('#themeSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-theme-set]');
  if (!b) return;
  theme = b.dataset.themeSet;
  prefs.set('theme', theme);
  applyTheme();
});

/* ---------- Install as an app ----------
   Browsers that can install it (Chrome, Edge, Samsung Internet) offer it through `beforeinstallprompt`;
   on iPhone and iPad it is Safari's Share → Add to Home Screen; Firefox on Android adds it from its
   menu, and Firefox on a computer cannot install it at all. */

let installPrompt = null;
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isFirefox = () => /Firefox\//.test(navigator.userAgent);
const isAndroid = () => /Android/.test(navigator.userAgent);

// Without an install prompt, the browser's own way to install it, if there is a hint for it.
function installHintKey() {
  if (installPrompt) return 'install.hint';
  if (isIos()) return 'install.iosHint';
  if (isFirefox()) return isAndroid() ? 'install.firefoxAndroidHint' : 'install.firefoxHint';
  return '';
}

function renderInstall() {
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

applyStaticI18n();
renderLangSwitch();
applyTheme();
// First visit = nothing stored yet; load() creates the first plan, so check before it.
let firstVisit = false;
try { firstVisit = !localStorage.getItem(PLANS_KEY) && !localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
load();
renderPlanSwitch();
if (VIEWS[prefs.get('view')]) ui.view = prefs.get('view');
ui.mapHidden = new Set([].concat(prefs.get('mapHidden', [])).filter(k => REL_TYPES[k]));
ui.hideDone = prefs.get('hideDone', false) === true;
ui.nextAll = prefs.get('nextAll', false) === true;
ui.tlDeps = prefs.get('tlDeps', true) !== false;
ui.planBadges = prefs.get('planBadges', true) !== false;
ui.tlPx = clamp(Number(prefs.get('tlPx', TL.ZOOM[prefs.get('tlZoom')] || TL.ZOOM.month)) || TL.ZOOM.month, TL.MIN, TL.MAX);
ui.mapScale = clamp(Number(prefs.get('mapScale', 1)) || 1, MAP.MIN_SCALE, MAP.MAX_SCALE);
ui.category = typeof prefs.get('category') === 'string' ? prefs.get('category') : '';
ui.help = prefs.get('help', false) === true;
ui.navCollapsed = prefs.get('navCollapsed', false) === true;
applyNavCollapsed();
renderInstall();
render();
initTutorial(firstVisit);
initSync();
