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

// The helpers. From tests/test.js: step, assert and fp (a fingerprint of the view).
// From tests/more.js: d (a date n days from today), eq, fresh (a new empty plan), mk (a new item),
// rel (a relationship that must be allowed) and untickCook.
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
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `${m || 'expected'} ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
  );
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
