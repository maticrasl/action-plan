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
  mapHidden: new Set(), hideDone: false, tlPx: 8, mapScale: 1, tlDeps: true, search: '', mapSelected: null, help: false,
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
  Object.assign(ui, { category: '', activityGoal: '', mapGoal: '', timelineGoal: '', graphGoal: '', mapSelected: null, search: '', mapRefocus: true });
  save();
  renderPlanSwitch();
  render();
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
  return null;
}

function addRelation(from, to, type) {
  const err = canRelate(from, to, type);
  if (err) return err;
  db.relations.push({ id: uid(), from, to, type });
  return null;
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
  // A goal measured by its activities needs no metric or target of its own.
  if (!byActivities(g)) {
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
  if (byActivities(g)) return countedActivities(g).filter(a => a.status === 'done').length;
  const st = measuringState(g);
  if (st) return Number(st.value);
  if (isNum(g.current)) return Number(g.current);
  return isNum(g.baseline) ? Number(g.baseline) : 0;
}
function goalProgress(g) {
  if (g.status === 'achieved') return 100;
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
  const goals = [g, ...descendants(g.id, 'subgoal').map(id => db.goals.find(x => x.id === id)).filter(Boolean)];
  const ids = new Set(goals.flatMap(x => goalActivities(x).map(a => a.id)));
  return db.activities.filter(a => ids.has(a.id) && !relsTo(a.id, 'subactivity').length);
}

const isComplete = (kind, item) => (kind === 'goal' ? item.status === 'achieved' : item.status === 'done');

// Unfinished items this one waits for – its own dependencies and those inherited from its parents.
function blockers(item, kind = 'activity') {
  return [item.id, ...ancestors(item.id, PARENT_REL[kind])]
    .flatMap(id => relsFrom(id, 'depends'))
    .map(r => findEntity(r.to))
    .filter(e => e && e.kind === kind && !isComplete(kind, e.item))
    .map(e => e.item);
}

function activityState(a) {
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
  closeCtxMenu();
  const old = ui.mapRefocus ? null : $('.map-wrap, .tl-scroll');
  const prevScroll = old && { left: old.scrollLeft, top: old.scrollTop };
  ui.mapRefocus = false;
  viewEl.innerHTML = v.render();
  if (ui.view === 'activities') bindDragDrop();
  // Keep the map / timeline where the user left it; on first show, centre on the goals / today.
  const wrap = $('.map-wrap, .tl-scroll');
  if (wrap) {
    wrap.scrollLeft = prevScroll ? prevScroll.left : Number(wrap.dataset.focusX) - wrap.clientWidth / 2;
    if (prevScroll) wrap.scrollTop = prevScroll.top;
  }
  decorateHelp();
}

function renderDashboard() {
  if (!itemCount()) return emptyState(t('dash.emptyTitle'), t('dash.emptyText'), 'goal');

  const active = db.goals.filter(g => g.status !== 'achieved' && g.status !== 'paused');
  const avg = active.length ? active.reduce((s, g) => s + goalProgress(g), 0) / active.length : 0;
  const doneActs = db.activities.filter(a => a.status === 'done').length;
  const overdue = db.activities.filter(a => a.status !== 'done' && a.dueDate && daysUntil(a.dueDate) < 0).length;
  const next = db.activities
    .filter(a => a.status !== 'done')
    .sort(byDueDate)
    .slice(0, 7);

  const waiting = db.activities.filter(a => a.status !== 'done' && blockers(a).length).length;
  return `
    <section class="summary">
      <p class="summary-line">${tp('dash.headline', active.length, { pct: `<strong>${Math.round(avg)}&nbsp;%</strong>` })}</p>
      <ul class="facts">
        <li>${t('dash.factDone', { done: doneActs, total: db.activities.length })}</li>
        ${overdue ? `<li class="fact-late">${tp('dash.factLate', overdue)}</li>` : ''}
        ${waiting ? `<li class="fact-waiting">${tp('dash.factWaiting', waiting)}</li>` : ''}
      </ul>
    </section>

    <h2 class="section-title">${t('dash.goalsInProgress')} <small>${active.length ? t('dash.clickToEdit') : ''}</small></h2>
    ${active.length ? `<div class="grid">${active.map(goalCard).join('')}</div>` : `<div class="empty">${t('dash.noActive')}</div>`}

    <h2 class="section-title">${t('dash.next')} <small>${next.length ? t('dash.sorted') : ''}</small></h2>
    ${next.length ? `<div class="list">${next.map(activityRow).join('')}</div>` : `<div class="empty">${t('dash.allDone')}</div>`}
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
  const acts = goalActivities(g);
  const done = acts.filter(a => a.status === 'done').length;
  const st = measuringState(g);
  const unit = g.unit ? ' ' + esc(g.unit) : '';
  const parent = relsFrom(g.id, 'subgoal')[0];
  const waits = g.status === 'achieved' ? [] : blockers(g, 'goal');
  const measured = byActivities(g), counted = measured ? countedActivities(g).length : 0;
  return `<article class="card goal" data-open="${g.id}">
    <div class="card-head"><h3>${esc(g.title)}</h3>${smartBadge(g)}</div>
    ${g.category ? `<div><button type="button" class="tag cat" data-category="${esc(g.category)}">${esc(g.category)}</button></div>` : ''}
    <p class="desc">${esc(g.specific)}</p>
    ${measured
    ? `${trail(pct, '0', esc(tp('goals.actsTotal', counted)))}
    <div class="meta"><span>${t('f.progressActs')}: <strong>${goalCurrent(g)} / ${counted}</strong></span></div>`
    : `${trail(pct, `${fmtNum(isNum(g.baseline) ? g.baseline : 0)}${unit}`, `${fmtNum(g.target)}${unit}`)}
    <div class="meta"><span>${esc(g.metric)}: <strong>${fmtNum(goalCurrent(g))}${unit}</strong></span></div>`}
    <div class="meta">
      ${g.status !== 'active' ? `<span class="tag ${g.status === 'achieved' ? 'ok' : ''}">${t('goal.' + g.status)}</span>` : ''}
      ${waits.length ? waitsForTag(waits) : ''}
      ${deadlineTag(g.deadline, g.status === 'achieved')}
      ${measured ? '' : `<span>${t('goals.activities', { done, total: acts.length })}</span>`}
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
  const list = db.activities.filter(matchesSearch).filter(a => !scope || scope.activity.has(a.id));
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

  const sel = ui.mapSelected && visible.has(ui.mapSelected) ? ui.mapSelected : null;
  const near = neighbourhood(sel, rels);

  // Each line sits in a group with a wide invisible twin, so it is easy to hit; clicking it edits the relationship.
  const edges = chains.map(c => {
    const def = REL_TYPES[c.r.type];
    const dim = sel && !(c.r.from === sel || c.r.to === sel) ? 'dim' : '';
    const label = `${findEntity(c.r.from).item.title} ${relLabel(c.r.type)} ${findEntity(c.r.to).item.title}`;
    return `<g class="edge-g ${dim}" data-rel-edit="${c.r.id}" tabindex="0" role="button" aria-label="${esc(t('map.editRel', { rel: label }))}">
      <path class="edge" d="${c.d}" style="stroke:${def.color};stroke-width:${def.width || 1.6}" ${def.dash ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#arrow-${c.r.type})"></path>
      <path class="edge-hit" d="${c.d}"></path><title>${esc(label)}</title></g>`;
  }).join('');

  const nodes = Object.values(node).map(n => {
    const { item } = findEntity(n.id);
    let st = '', sub;
    if (n.kind === 'goal') {
      st = goalState(item);
      sub = st === 'blocked'
        ? t('acts.waitsFor', { n: blockers(item, 'goal').length })
        : `${Math.round(goalProgress(item))} %, ${item.deadline ? fmtDate(item.deadline) : t('map.noDeadline')}`;
    } else if (n.kind === 'activity') {
      st = activityState(item);
      sub = (st === 'blocked' ? t('acts.waitsFor', { n: blockers(item).length }) : t('activity.' + item.status)) + (item.dueDate ? ', ' + fmtDate(item.dueDate) : '');
    } else {
      sub = isNum(item.value) ? `${fmtNum(item.value)} ${item.unit || ''}, ${fmtDate(item.date)}` : fmtDate(item.date);
    }
    const title = item.title.length > 22 ? item.title.slice(0, 21) + '…' : item.title;
    const dim = sel && !near.has(n.id) ? 'dim' : '';
    return `<g class="node ${n.kind}${st ? ' st-' + st : ''} ${dim}" data-map-node="${n.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc(item.title)}" transform="translate(${n.x - NW / 2},${layers[n.layer].y})">
      <rect width="${NW}" height="${NH}" rx="10" style="${n.id === sel ? 'stroke-width:3' : ''}"></rect>
      <text x="12" y="23">${esc(title)}</text>
      <text class="sub" x="12" y="41">${esc(sub)}</text>
      <title>${esc(item.title)}${st ? ' – ' + esc(t('nodeState.' + st)) : ''}</title>
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
    ${sel ? mapSelection(sel) : `<p class="meta" style="margin-top:10px">${t('map.hint')}</p>`}
    ${relNote}
  `;
}

function mapSelection(id) {
  const { kind, item } = findEntity(id);
  return `<div class="row" style="margin-top:12px;cursor:default">
    <span class="tag ${kind}">${t('kind.' + kind)}</span>
    <span class="grow"><strong>${esc(item.title)}</strong></span>
    <button class="btn small" data-open="${id}">${t('btn.edit')}</button>
    <button class="btn small ghost" data-map-clear>${t('btn.clear')}</button>
  </div>`;
}

/* ---------- Timeline (Gantt chart of goals and activities) ---------- */

// ZOOM presets and the MIN–MAX range for free zooming are in pixels per day.
const TL = { ROW: 40, ZOOM: { week: 30, month: 8, quarter: 2.6 }, MIN: 1.5, MAX: 80 };
const DAY_MS = 86400000;
const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY_MS; };
const dayStr = n => new Date(n * DAY_MS).toISOString().slice(0, 10);
const endOf = (kind, item) => (kind === 'goal' ? item.deadline : item.dueDate);

// Rows in plan order: each top-level goal, its activity trees, then its sub-goals (recursively).
// Activities that are not under any shown goal come last in their own group.
function timelineRows(scope) {
  const rows = [], placed = new Set();
  const visible = (kind, x) => !scope || scope[kind].has(x.id);
  const startKey = x => x.startDate || x.dueDate || x.deadline || '9999';
  const byStart = (a, b) => startKey(a).localeCompare(startKey(b));
  // `rel` is how a row hangs off the row at index `parent` (drawn as a connector in that relation's colour).
  // A hidden activity passes its own place in the tree on to its children.
  const addActivity = (a, depth, rel, parent) => {
    if (placed.has(a.id)) return;
    placed.add(a.id);
    const show = visible('activity', a) && !(ui.hideDone && a.status === 'done');
    const here = show ? rows.push({ kind: 'activity', item: a, depth, rel, parent }) - 1 : parent;
    relsTo(a.id, 'subactivity').map(r => db.activities.find(x => x.id === r.from)).filter(Boolean).sort(byStart)
      .forEach(c => (show ? addActivity(c, depth + 1, 'subactivity', here) : addActivity(c, depth, rel, parent)));
  };
  const addGoal = (g, depth, rel, parent) => {
    if (placed.has(g.id)) return;
    placed.add(g.id);
    const here = rows.push({ kind: 'goal', item: g, depth, rel, parent }) - 1;
    const contributors = new Set(relsTo(g.id, 'contributes').map(r => r.from));
    db.activities.filter(a => contributors.has(a.id) && !ancestors(a.id, 'subactivity').some(p => contributors.has(p)))
      .sort(byStart).forEach(a => addActivity(a, depth + 1, 'contributes', here));
    relsTo(g.id, 'subgoal').map(r => db.goals.find(x => x.id === r.from)).filter(x => x && visible('goal', x)).sort(byStart)
      .forEach(sg => addGoal(sg, depth + 1, 'subgoal', here));
  };
  const goals = db.goals.filter(g => visible('goal', g));
  const goalIds = new Set(goals.map(g => g.id));
  goals.filter(g => !ancestors(g.id, 'subgoal').some(p => goalIds.has(p))).sort(byStart).forEach(g => addGoal(g, 0));

  const rest = db.activities.filter(a => !placed.has(a.id) && visible('activity', a));
  const restIds = new Set(rest.map(a => a.id));
  const group = { kind: 'group', label: t(scope ? 'tl.related' : 'tl.unlinked'), depth: 0 };
  const before = rows.push(group);
  rest.filter(a => !ancestors(a.id, 'subactivity').some(p => restIds.has(p))).sort(byStart).forEach(a => addActivity(a, 1));
  if (rows.length === before) rows.pop();
  return rows;
}

function renderTimeline() {
  if (!db.goals.length && !db.activities.length) return emptyState(t('tl.emptyTitle'), t('tl.emptyText'), 'goal');
  const rows = timelineRows(scopeFor(ui.timelineGoal));
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

  const sel = ui.mapSelected && rows.some(r => r.item?.id === ui.mapSelected) ? ui.mapSelected : null;
  const near = neighbourhood(sel, db.relations);

  const geo = {};
  const body = rows.map((r, i) => {
    if (r.kind === 'group') return `<div class="tl-row tl-group"><div class="tl-label">${esc(r.label)}</div><div class="tl-track"></div></div>`;
    const { item, kind, depth } = r;
    const st = kind === 'goal' ? goalState(item) : activityState(item);
    const s = item.startDate, e = endOf(kind, item);
    const dateText = s && e ? `${fmtDate(s)} – ${fmtDate(e)}` : fmtDate(s || e) || t('tl.noDates');
    let bar = `<span class="tl-nodates">${t('tl.noDates')}</span>`;
    if (s || e) {
      const a = dayNum(s || e), b = dayNum(e || s);
      const left = x(a), width = (b - a + 1) * px;
      const overdue = st === 'late' && e && dayNum(e) < todayN;
      const lateHtml = overdue ? `<i class="tl-overdue" style="left:${x(dayNum(e) + 1)}px;width:${(todayN - dayNum(e)) * px}px" title="${esc(t('tl.overdue', { date: fmtDate(e) }))}"></i>` : '';
      const tip = `${item.title}: ${dateText} (${t('nodeState.' + st)})`;
      geo[item.id] = { y: i * ROW + ROW / 2, start: left, end: s && e ? left + width : left + px / 2 };
      if (!s || !e) {
        const cx = left + px / 2;
        geo[item.id].start = cx - 7;
        geo[item.id].end = cx + 7;
        bar = `${lateHtml}<i class="tl-milestone ${kind} st-${st}" style="left:${cx}px" title="${esc(tip)}"></i><span class="tl-bar-label" style="left:${Math.max(cx + 14, overdue ? x(todayN + 1) + 6 : 0)}px">${esc(item.title)}</span>`;
      } else {
        const inside = width > item.title.length * 7.2 + 26;
        const pct = kind === 'goal' ? goalProgress(item) : null;
        bar = `${lateHtml}<div class="tl-bar ${kind} st-${st}" style="left:${left}px;width:${width}px" title="${esc(tip)}">${pct === null ? '' : `<i class="tl-progress" style="width:${pct.toFixed(1)}%"></i>`}${inside ? `<span>${esc(item.title)}</span>` : ''}</div>${inside ? '' : `<span class="tl-bar-label" style="left:${Math.max(left + width, overdue ? x(todayN + 1) : 0) + 8}px">${esc(item.title)}</span>`}`;
      }
    }
    const dim = sel && !near.has(item.id) ? 'dim' : '';
    return `<div class="tl-row ${kind} ${dim}${item.id === sel ? ' selected' : ''}" data-tl-node="${item.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc(`${item.title}, ${dateText}`)}">
      <div class="tl-label" style="--depth:${depth}">${r.rel && r.parent !== undefined ? `<i class="tl-elbow" style="--rel:${REL_TYPES[r.rel].color};--up:${i - r.parent - 1}" title="${esc(relLabel(r.rel))}"></i>` : ''}<span class="tl-dot ${kind} st-${st}"></span><span class="tl-text"><span class="tl-title">${esc(item.title)}</span><span class="tl-dates">${esc(dateText)}</span></span></div>
      <div class="tl-track">${bar}</div>
    </div>`;
  }).join('');

  // Finish-to-start arrows: from the end of a prerequisite to the start of what depends on it.
  const deps = !ui.tlDeps ? '' : db.relations.filter(r => r.type === 'depends' && geo[r.from] && geo[r.to]).map(r => {
    const p = geo[r.to], d = geo[r.from];
    const x1 = p.end, y1 = p.y, x2 = d.start, y2 = d.y;
    const path = x2 - 12 >= x1 + 6
      ? `M${x1},${y1} H${x2 - 12} V${y2} H${x2}`
      : `M${x1},${y1} h8 V${y2 + (y2 > y1 ? -ROW / 2 : ROW / 2)} H${x2 - 12} V${y2} H${x2}`;
    const dim = sel && !(r.from === sel || r.to === sel) ? ' dim' : '';
    return `<path class="tl-dep${dim}" d="${path}" marker-end="url(#tl-arrow)"><title>${esc(findEntity(r.from).item.title)} ${esc(relLabel('depends'))} ${esc(findEntity(r.to).item.title)}</title></path>`;
  }).join('');

  const zoom = Object.entries(TL.ZOOM).map(([z, p]) => `<button class="chip ${Math.abs(px - p) < 0.01 ? 'active' : ''}" data-tl-zoom="${z}">${t('tl.zoom.' + z)}</button>`).join('');
  return `
    ${categoryChips()}
    <div class="toolbar">
      ${goalSelect('timeline', ui.timelineGoal)}
      ${hideDoneToggle()}
      <button class="chip" data-tl-deps aria-pressed="${ui.tlDeps}">${t('tl.deps')}</button>
      <div class="chips" role="group" aria-label="${esc(t('tl.zoom'))}">${zoom}</div>
    </div>
    <div class="map-legend tl-legend"><span class="ctl-label">${t('map.status')}</span>${statusLegend()}<span><i class="swatch tl-overdue-swatch"></i>${esc(t('tl.overdueLegend'))}</span></div>
    <div class="map-legend tl-legend"><span class="ctl-label">${t('tl.links')}</span>${['contributes', 'subactivity', 'subgoal', ...(ui.tlDeps ? ['depends'] : [])].map(k =>
      `<span><i class="line-key${REL_TYPES[k].dash ? ' dash' : ''}" style="--rel:${REL_TYPES[k].color}"></i>${esc(relLabel(k))}</span>`).join('')}</div>
    ${rows.length ? `<div class="tl-scroll" data-focus-x="${Math.round(x(todayN) + 145)}" data-from="${from}">
      <div class="tl-inner" style="--tl-w:${W}px">
        <div class="tl-head">
          <div class="tl-corner"></div>
          <div class="tl-scale"><div class="tl-months">${months.join('')}</div><div class="tl-ticks">${ticks.join('')}</div>
            <span class="tl-today-flag" style="left:${x(todayN) + px / 2}px">${t('tl.today')}</span></div>
        </div>
        <div class="tl-body">
          <div class="tl-grid">${lines.join('')}<i class="tl-today" style="left:${x(todayN) + px / 2}px"></i></div>
          <svg class="tl-deps" width="${W}" height="${rows.length * ROW}" aria-hidden="true">
            <defs><marker id="tl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>${deps}
          </svg>
          ${body}
        </div>
      </div>
    </div>` : `<div class="empty">${t('tl.noneShown')}</div>`}
    ${sel ? mapSelection(sel) : `<p class="meta" style="margin-top:10px">${t('tl.hint')}</p>`}`;
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

  const rowsHtml = points.map(p => `<tr><td>${fmtDate(p.date)}</td><td>${esc(withUnit(fmtNum(p.value), unit))}</td><td>${p === points[0] ? '—' : esc(withUnit(signed(p.value - points[0].value), unit))}</td></tr>`).join('');

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
      <table><thead><tr><th>${t('gr.col.date')}</th><th>${t('gr.col.value')}</th><th>${t('gr.col.change')}</th></tr></thead><tbody>${rowsHtml}</tbody></table>
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

function checklist(name, label, items, selected, hint = '') {
  if (!items.length) return '';
  return `<div class="field"><span class="label">${label}</span><div class="check-list">${items.map(i =>
    `<label><input type="checkbox" name="${name}" value="${i.id}" ${selected.includes(i.id) ? 'checked' : ''}> ${esc(i.title)}</label>`).join('')}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
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
    if (r.type) $('#f-type').value = r.type;
    if (r.to) $('#f-to').value = r.to;
  }
  if (kind === 'goal') updateSmartLive();
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
      ${field('progress', t('f.progress'), select('progress', { measure: t('f.progressMeasure'), activities: t('f.progressActs') }, byActivities(g) ? 'activities' : 'measure'))}
      <p class="hint" id="actsHint" ${byActivities(g) ? '' : 'hidden'}>${t('f.progressActsHint')}</p>
      <div id="measureFields" ${byActivities(g) ? 'hidden' : ''}>
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
    ${checklist('activities', t('f.goalActivities'), db.activities, linkedFrom(g, 'contributes'))}
    ${checklist('depends', t('f.goalDepends'), db.goals.filter(x => x.id !== g.id), linksOf(g, 'depends'))}`;
}

function stateForm(s) {
  const linked = s.id ? relsFrom(s.id, 'measures').map(r => r.to) : [];
  const history = (s.history || []).slice().reverse();
  return `
    ${field('title', t('f.title'), text('title', s.title, t('f.statePh')))}
    ${field('description', t('f.stateDesc'), area('description', s.description, t('f.stateDescPh')))}
    <div class="row3">
      ${field('value', t('f.value'), num('value', s.value ?? '', t('f.optional')))}
      ${field('unit', t('f.unit'), text('unit', s.unit, t('f.unitPh')))}
      ${field('date', t('f.asOf'), date('date', s.date || today()))}
    </div>
    ${checklist('goals', t('f.describesGoals'), db.goals, linked, t('f.describesHint'))}
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
      ${field('startDate', t('f.startDate'), date('startDate', a.startDate))}
      ${field('dueDate', t('f.dueDate'), date('dueDate', a.dueDate))}
    </div>
    ${field('parent', t('f.parentActivity'), select('parent', parents, pick('subactivity')[0] || ''), t('f.parentActivityHint'))}
    ${children.length ? `<div class="field"><span class="label">${t('f.subActivities')}</span><div class="links">${children.map(linkTag).join('')}</div></div>` : ''}
    ${checklist('goals', t('f.contributes'), db.goals, pick('contributes'))}
    ${checklist('states', t('f.improves'), db.states, pick('improves'))}
    ${checklist('depends', t('f.depends'), others, pick('depends'))}`;
}

function relationForm() {
  const groups = KINDS.map(k => {
    const items = collection(k);
    return items.length ? `<optgroup label="${esc(t('kinds.' + k))}">${items.map(i => `<option value="${i.id}">${esc(i.title)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  return `
    ${field('from', t('f.from'), `<select id="f-from" name="from">${groups}</select>`)}
    ${field('type', t('f.relationship'), select('type', Object.fromEntries(Object.keys(REL_TYPES).map(k => [k, `${relLabel(k)}${relSignature(k) ? ` (${relSignature(k)})` : ''}`])), 'contributes'))}
    ${field('to', t('f.to'), `<select id="f-to" name="to">${groups}</select>`)}`;
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
    if (v.progress === 'activities') g.progress = 'activities';
    else delete g.progress;
    if (!existing) db.goals.push(g);
    setLinks(g.id, 'subgoal', v.parent ? [v.parent] : []);
    setLinks(g.id, 'depends', arr('depends'));
    setIncoming(g.id, 'contributes', arr('activities'));
    return finish(t(existing ? 'toast.goalUpdated' : 'toast.goalCreated'));
  }

  if (kind === 'state') {
    const s = Object.assign(existing || { id: uid(), history: [] }, {
      title: v.title.trim(), description: v.description.trim(), value: v.value, unit: v.unit.trim(), date: v.date || today(),
    });
    s.history ||= [];
    const last = s.history[s.history.length - 1];
    if (isNum(s.value) && (!last || last.value !== s.value || last.date !== s.date)) {
      if (last && last.date === s.date) last.value = s.value;
      else s.history.push({ date: s.date, value: s.value });
    }
    if (!existing) db.states.push(s);
    setLinks(s.id, 'measures', arr('goals'));
    return finish(t(existing ? 'toast.stateUpdated' : 'toast.stateAdded'));
  }

  if (kind === 'activity') {
    if (v.startDate && v.dueDate && v.startDate > v.dueDate) return showErrors({ dueDate: t('err.startAfterDue') });
    const a = Object.assign(existing || { id: uid(), createdAt: today() }, {
      title: v.title.trim(), description: v.description.trim(), status: v.status, startDate: v.startDate, dueDate: v.dueDate,
    });
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
  ui.search = '';
  ui.mapRefocus = true;
  prefs.set('view', view);
  render();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-item[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

$('#addBtn').addEventListener('click', () => {
  const kind = VIEWS[ui.view].add;
  if (kind === 'relation' && itemCount() < 2) return toast(t('err.needTwo'));
  openForm(kind);
});

viewEl.addEventListener('click', e => {
  const el = e.target.closest('[data-cycle],[data-open],[data-new],[data-sample],[data-goal-filter],[data-rel-edit],[data-map-node],[data-tl-node],[data-map-clear],[data-rel-toggle],[data-hide-done],[data-category],[data-tl-zoom],[data-tl-deps],[data-map-zoom]');
  if (!el) return;
  e.stopPropagation();
  if (el.dataset.cycle) return cycleStatus(el.dataset.cycle);
  if (el.dataset.open) { const ent = findEntity(el.dataset.open); return ent && openForm(ent.kind, ent.item.id); }
  if (el.dataset.new) return el.dataset.new === 'relation' ? $('#addBtn').click() : openForm(el.dataset.new);
  if (el.hasAttribute('data-sample')) return loadSample();
  if (el.dataset.goalFilter) { ui.goalFilter = el.dataset.goalFilter; return render(); }
  if (el.dataset.relEdit) return openForm('relation', el.dataset.relEdit);
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
  if (node) { ui.mapSelected = ui.mapSelected === node ? null : node; return render(); }
  if (el.hasAttribute('data-map-clear')) { ui.mapSelected = null; return render(); }
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
$('#modalForm').addEventListener('change', e => {
  if (e.target.id !== 'f-progress') return;
  const acts = e.target.value === 'activities';
  $('#measureFields').hidden = acts;
  $('#actsHint').hidden = !acts;
  updateSmartLive();
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
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const chosen = parseDateInput(box.value), now = today();
  const fmt = (iso, opts) => new Date(iso + 'T00:00Z').toLocaleDateString(locale(), { ...opts, timeZone: 'UTC' });
  // 1 January 2024 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) => `<span class="cal-wd" aria-hidden="true">${esc(fmt(isoOf(2024, 0, 1 + i), { weekday: 'short' }))}</span>`).join('');
  const cells = Array.from({ length: days }, (_, i) => {
    const iso = isoOf(y, m, i + 1);
    return `<button type="button" data-cal-day="${iso}" class="${iso === now ? 'today' : ''}" aria-pressed="${iso === chosen}" tabindex="${iso === cal.focus ? 0 : -1}" aria-label="${esc(fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}">${i + 1}</button>`;
  }).join('');
  cal.field.querySelector('.cal').innerHTML = `
    <div class="cal-head">
      <button type="button" data-cal-move="-1" aria-label="${esc(t('cal.prev'))}">‹</button>
      <strong aria-live="polite">${esc(fmt(isoOf(y, m, 1), { month: 'long', year: 'numeric' }))}</strong>
      <button type="button" data-cal-move="1" aria-label="${esc(t('cal.next'))}">›</button>
    </div>
    <div class="cal-grid">${weekdays}${'<span></span>'.repeat(lead)}${cells}</div>
    <div class="cal-foot">
      <button type="button" class="btn small ghost" data-cal-pick="${now}">${t('cal.today')}</button>
      <button type="button" class="btn small ghost" data-cal-pick="">${t('cal.clear')}</button>
    </div>`;
}

const focusDay = () => cal.field.querySelector(`.cal-grid [data-cal-day="${cal.focus}"]`).focus({ preventScroll: true });

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

function exportJson() {
  const name = currentPlan().name;
  const blob = new Blob([JSON.stringify({ name, ...db }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, '').trim() || t('app.file')}-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(reader.result);
      // Imports always become a new plan, so nothing is overwritten.
      const name = (typeof raw.name === 'string' && raw.name.trim()) || file.name.replace(/\.json$/i, '');
      createPlan(name, normalize(raw));
      toast(t('toast.imported'));
    } catch (e) {
      toast(t('err.import'));
    }
  };
  reader.readAsText(file);
}

// A plan that exercises every feature: all relationship types, sub-goals, three levels of
// sub-activities, dependency chains, and every status (not started, in progress, late, waiting, done).
// The sample plan's data (also used by the guided tour in tutorial.js).
function sampleData() {
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoDate(x); };
  const [halfMarathon, fund, tenK, weight, course, spanish, sell, trip, bathroom, heating] = Array.from({ length: 10 }, uid);
  const [fitness, savings, spending, bodyWeight, itemsSold, heatingBill] = Array.from({ length: 6 }, uid);
  const a = Array.from({ length: 23 }, uid);
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
      { id: a[6], status: 'doing', startDate: d(-20), dueDate: d(14) },   // cook at home
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
  createPlan(t('plan.sampleName'), sampleData());
  toast(t('toast.sample'));
}

/* ---------- Settings (gear, top right): plan, language, theme, display options, data, help ---------- */

const settings = $('#settings');

// Display options shown as switches: how to read each one and what changing it does.
const SETTINGS = {
  help: { get: () => ui.help, set: v => setHelp(v) },
  hideDone: { get: () => ui.hideDone, set: v => setToggle('hideDone', v) },
  tlDeps: { get: () => ui.tlDeps, set: v => setToggle('tlDeps', v) },
  navCollapsed: { get: () => ui.navCollapsed, set: v => setNavCollapsed(v) },
};

// A remembered on/off display option (hideDone, tlDeps).
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
$('#exportBtn').addEventListener('click', exportJson);
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
  ctxMenu.setAttribute('aria-label', t('ctx.label', { name: ent.item.title }));
  ctxMenu.innerHTML = `<div class="ctx-head"><span class="tag ${ent.kind}">${t('kind.' + ent.kind)}</span><strong>${esc(ent.item.title)}</strong></div>` +
    ctxOptions(ent.kind, ent.item).map(o => o === '-' ? '<hr>' :
      `<button type="button" tabindex="-1" data-ctx="${o.act}" class="${o.danger ? 'danger' : ''}" role="${o.checked === undefined ? 'menuitem' : 'menuitemradio'}"${o.checked === undefined ? '' : ` aria-checked="${o.checked}"`}>${esc(o.label)}</button>`).join('');
  ctxMenu.hidden = false;
  const { width, height } = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
  ctxMenu.querySelector('button').focus();
}

function closeCtxMenu(refocus = false) {
  if (ctxMenu.hidden) return;
  ctxMenu.hidden = true;
  if (refocus) $(`[data-map-node="${ctxMenu.dataset.id}"], [data-tl-node="${ctxMenu.dataset.id}"]`)?.focus();
}

function runCtxAction(act, id) {
  const ent = findEntity(id);
  closeCtxMenu();
  if (!ent) return;
  const { kind, item } = ent;
  const [verb, arg, type] = act.split(':');
  if (verb === 'edit') return openForm(kind, id);
  if (verb === 'highlight') { ui.mapSelected = id; return render(); }
  if (verb === 'focus') {
    Object.assign(ui, { [ui.view === 'timeline' ? 'timelineGoal' : 'mapGoal']: id, mapRefocus: true });
    if (!inCategory(item)) ui.category = '';
    return render();
  }
  if (verb === 'add') return openForm(arg, null, { [type]: [id], category: kind === 'goal' ? item.category : '' });
  if (verb === 'link') return openForm('relation', null, { from: id });
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
  const node = e.target.closest(NODE_SEL);
  if (!node) return;
  e.preventDefault();
  openCtxMenu(nodeId(node), e.clientX, e.clientY);
});

// Long-press for touch screens (iOS Safari never fires contextmenu).
let press = null;
viewEl.addEventListener('pointerdown', e => {
  const node = e.target.closest(NODE_SEL);
  if (!node || e.pointerType === 'mouse') return;
  const p = { x: e.clientX, y: e.clientY, fired: false };
  p.timer = setTimeout(() => { p.fired = true; openCtxMenu(nodeId(node), p.x, p.y + 12); }, LONG_PRESS_MS);
  press = p;
});
viewEl.addEventListener('pointermove', e => {
  if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; }
});
['pointerup', 'pointercancel'].forEach(type => viewEl.addEventListener(type, () => press && clearTimeout(press.timer)));
// The click that ends a long-press must not also toggle highlighting or hit a menu item.
document.addEventListener('click', e => {
  if (press?.fired) { e.stopPropagation(); e.preventDefault(); }
  press = null;
}, true);

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
  const wrap = e.pointerType === 'mouse' && e.button === 0 && e.target.closest(ZOOM_SEL);
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
// The click that ends a drag must not select a box.
document.addEventListener('click', e => {
  if (pan?.moved) { e.stopPropagation(); e.preventDefault(); }
}, true);

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
  if (e.target.closest?.('[data-rel-edit]') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    return openForm('relation', e.target.closest('[data-rel-edit]').dataset.relEdit);
  }
  const node = e.target.closest?.(NODE_SEL);
  if (!node) return;
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
    e.preventDefault();
    const r = node.getBoundingClientRect();
    openCtxMenu(nodeId(node), r.left + 16, r.bottom + 4);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
});

viewEl.addEventListener('dblclick', e => {
  const id = nodeId(e.target.closest(NODE_SEL));
  const ent = id && findEntity(id);
  if (ent) openForm(ent.kind, id);
});

ctxMenu.addEventListener('click', e => {
  const b = e.target.closest('[data-ctx]');
  if (b) runCtxAction(b.dataset.ctx, ctxMenu.dataset.id);
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
document.addEventListener('scroll', () => closeCtxMenu(), true);

/* ---------- Plan switcher (sidebar on desktop, menu on mobile) ---------- */

const PLAN_ICONS = {
  new: '<path d="M12 5v14M5 12h14"/>',
  rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  delete: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
};

function renderPlanSwitch() {
  const options = plans.list.map(p => `<option value="${p.id}" ${p.id === plans.current ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const actions = Object.entries(PLAN_ICONS).map(([act, path]) =>
    `<button type="button" class="icon-btn" data-plan="${act}" title="${esc(t('plan.' + act))}" aria-label="${esc(t('plan.' + act))}"><svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg></button>`).join('');
  document.querySelectorAll('.plan-switch').forEach(box => {
    box.innerHTML = `<label class="plan-label">${t('plan.label')}<select data-plan-select>${options}</select></label><div class="plan-actions">${actions}</div>`;
  });
  $('#planName').textContent = currentPlan().name;
}

document.addEventListener('change', e => {
  if (e.target.matches('[data-plan-select]')) openPlan(e.target.value);
});
document.addEventListener('click', e => {
  const act = e.target.closest('[data-plan]')?.dataset.plan;
  if (!act) return;
  const plan = currentPlan();
  if (act === 'new') {
    const name = prompt(t('plan.newPrompt'), t('plan.defaultName'))?.trim();
    if (name) { createPlan(name); toast(t('toast.planCreated')); }
  } else if (act === 'rename') {
    const name = prompt(t('plan.renamePrompt'), plan.name)?.trim();
    if (name) { plan.name = name; save(); renderPlanSwitch(); toast(t('toast.planRenamed')); }
  } else if (act === 'delete' && confirm(t('plan.confirmDelete', { name: plan.name }))) {
    deletePlan(plan.id);
    toast(t('toast.planDeleted'));
  }
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
ui.tlDeps = prefs.get('tlDeps', true) !== false;
ui.tlPx = clamp(Number(prefs.get('tlPx', TL.ZOOM[prefs.get('tlZoom')] || TL.ZOOM.month)) || TL.ZOOM.month, TL.MIN, TL.MAX);
ui.mapScale = clamp(Number(prefs.get('mapScale', 1)) || 1, MAP.MIN_SCALE, MAP.MAX_SCALE);
ui.category = typeof prefs.get('category') === 'string' ? prefs.get('category') : '';
ui.help = prefs.get('help', false) === true;
ui.navCollapsed = prefs.get('navCollapsed', false) === true;
applyNavCollapsed();
render();
initTutorial(firstVisit);
initSync();
