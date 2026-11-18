/** Page-test harness: the helpers every tests/browser file uses, and the runner of browser.html. */
// A classic script, run after the app has booted (src/test-bridge.ts), so the app's names are on window.
// On browser.html?f=<file>[,<file>…] it loads those tests/browser files; each calls suite() with a
// function of `await step(…)` calls. The suites run in order and the results go into <pre id="OK">.
const suites = [];
const suite = fn => suites.push(fn);

const loadScript = src =>
  new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => fail(new Error('cannot load ' + src));
    document.body.append(s);
  });

const writeResult = text => {
  const pre = document.createElement('pre');
  pre.id = 'OK';
  pre.textContent = text;
  document.body.append(pre);
};

// The helpers: step, assert, eq, fp (a fingerprint of the view), tick (a turn of the event loop),
// d (a date n days from today), fresh (a new empty plan), mk (a new item), rel (a relationship that
// must be allowed) and untickCook.
const out = [];
const log = s => out.push(s);
const hash = str => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(16);
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const fp = () => {
  const html = $('#view').innerHTML.replace(UUID, 'ID');
  return `${hash(html)}/${html.length}`;
};
const step = async (name, fn) => {
  try {
    const r = await fn();
    log(`PASS ${name}${r === undefined ? '' : ': ' + r}`);
  } catch (e) {
    log(`FAIL ${name}: ${(e && e.stack) || e}`);
  }
};
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const tick = () => new Promise(r => setTimeout(r, 0));

const d = n => {
  const x = new Date();
  x.setDate(x.getDate() + n);
  return isoDate(x);
};
const eq = (a, b, m) =>
  assert(JSON.stringify(a) === JSON.stringify(b), `${m || 'expected'} ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const fresh = name => {
  createPlan(name);
  assert(itemCount() === 0);
};
const mk = (kind, p = {}) => {
  const base = { goal: { status: 'active' }, activity: { status: 'todo' }, state: { history: [] } }[kind];
  const x = { id: uid(), title: `${kind} ${Math.random().toString(36).slice(2, 6)}`, ...base, ...p };
  collection(kind).push(x);
  return x;
};
const rel = (a, b, type) => {
  const e = addRelation(a.id, b.id, type);
  assert(!e, `${type}: ${e}`);
};
// By Sunday every sample routine has met its week: unticking "cook at home" keeps one on the overview any day.
const untickCook = () => (db.activities.find(a => a.repeat?.times === 5).checkins = {});

// Helpers that steps of several files share: the views, copies, amounts, plan files and dialogs,
// weeks, form fields, visions, clicks and keys, the real Drive.
const views = ['dashboard', 'goals', 'activities', 'states', 'map', 'timeline', 'graphs'];

const clone = x => JSON.parse(JSON.stringify(x));

const entry = (date, amount, routine) => ({ id: uid(), date, amount: String(amount), ...(routine && { routine }) });

// A plan with progress of every kind: achieved and measured goals, measurements, done and started
// activities, routine check-ins (ticked and unticked), sync bookkeeping and a relation.
const progressPlan = () => {
  const g1 = {
    id: uid(),
    title: 'Run 10 km',
    unit: 'km',
    baseline: '5',
    current: '7',
    target: '10',
    startDate: d(-30),
    deadline: d(40),
    status: 'active',
    category: 'Health',
    createdAt: d(-31),
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const g2 = {
    id: uid(),
    title: 'Read a book',
    baseline: '0',
    current: '1',
    target: '1',
    startDate: d(-20),
    deadline: d(-2),
    status: 'achieved',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const g3 = { id: uid(), title: 'On hold', progress: 'activities', startDate: d(-10), status: 'paused' };
  const s1 = {
    id: uid(),
    title: 'Longest run',
    unit: 'km',
    value: '7',
    date: d(-1),
    history: [
      { date: d(-30), value: '5' },
      { date: d(-1), value: '7' },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const s2 = { id: uid(), title: 'Weight', unit: 'kg', history: [] };
  const a1 = { id: uid(), title: 'Buy shoes', status: 'done', startDate: d(-28), dueDate: d(-25) };
  const a2 = {
    id: uid(),
    title: 'Training plan',
    status: 'doing',
    startDate: d(-21),
    dueDate: d(50),
    notes: 'Three runs a week',
  };
  const a3 = { id: uid(), title: 'Someday', status: 'todo' };
  const r1 = {
    id: uid(),
    title: 'Run',
    status: 'todo',
    startDate: d(-14),
    repeat: { every: 1, unit: 'week', days: [0, 3] },
    checkins: { [d(-7)]: 1, [d(-4)]: 1, [d(-3)]: 0 },
  };
  const rel1 = { id: uid(), from: a2.id, to: g1.id, type: 'contributes' };
  return {
    name: 'Running',
    data: {
      goals: [g1, g2, g3],
      states: [s1, s2],
      activities: [a1, a2, a3, r1],
      relations: [rel1],
      deleted: { gone: '2026-01-01T00:00:00.000Z' },
    },
  };
};
const datesOf = data =>
  [...data.goals, ...data.activities].flatMap(x => [x.startDate, x.deadline, x.dueDate]).filter(Boolean);
const addPlan = ({ name, data }) => {
  createPlan(uniqueName(name), normalize(clone(data)));
  return currentPlan();
};
// Captures what a download or share would hand over instead of saving it.
const capture = async run => {
  const got = [];
  const orig = URL.createObjectURL,
    click = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = b => {
    got.push({ blob: b });
    return 'blob:x' + got.length;
  };
  HTMLAnchorElement.prototype.click = function () {
    got[got.length - 1].name = this.download;
  };
  try {
    await run();
  } finally {
    URL.createObjectURL = orig;
    HTMLAnchorElement.prototype.click = click;
  }
  for (const g of got) g.json = JSON.parse(await g.blob.text());
  return got;
};
const fileOf = (obj, name = 'plan.json') =>
  new File([typeof obj === 'string' ? obj : JSON.stringify(obj)], name, { type: 'application/json' });
const imp = $('#planImport'),
  exp = $('#planExport');

const mondayAt = iso => addDays(iso, -weekday(iso));
const change = (id, value) => {
  $(id).value = value;
  $(id).dispatchEvent(new Event('change', { bubbles: true }));
};

const clearVisions = () => {
  visions = { list: [], deleted: {} };
  saveVisions();
};
const mkV = (title, parents = [], p = {}) => {
  const v = { id: uid(), title, parents: parents.map(x => x.id), ...p };
  visions.list.push(v);
  return v;
};
const ids = list => [...list].map(x => x.id || x).sort();
// Purpose counts the goals of every plan: these steps set the other plans aside while they run.
let asideList = [];
const setAside = () => {
  asideList = plans.list.filter(p => p.id !== plans.current);
  plans.list = plans.list.filter(p => p.id === plans.current);
};
const putBack = () => {
  plans.list.push(...asideList);
  asideList = [];
};

const clickEl = (el, detail = 1) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
const press = (key, target = document.activeElement || document.body) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev.defaultPrevented;
};

const $$ = sel => [...document.querySelectorAll(sel)];

// The real Drive methods, before any test swaps them for fakes.
const REAL_DRIVE = { ...drive };

// The runner: everything above is defined by the time the first suite runs.
if (location.pathname.endsWith('/browser.html')) {
  (async () => {
    const files = new URLSearchParams(location.search).get('f').split(',');
    for (const f of files) await loadScript(`tests/browser/${f}.js`);
    if (!suites.length) throw new Error(`no suite in ${files}`);
    for (const fn of suites) await fn();
    await tick();
    log('errors: ' + (__errors.length ? __errors.join(' || ') : 'none'));
    writeResult(out.join('\n'));
  })().catch(e => writeResult('HARNESS CRASH ' + e.stack));
}
