/** Stored-data fixtures: proves the app reads and writes plans, sync files, exports and backups unchanged. */
// usage: node scripts/fixtures.mjs [--generate] [app dir]
//   default     load each fixture into storage, boot, open every view, save, compare (npm run test:fixtures)
//   --generate  write the fixtures from the current code (only before anything moves; never to make a test pass)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, dumpDom, readPre, serveTestBuild } from './lib/chrome.mjs';

const FIX = join(ROOT, 'tests', 'fixtures');
const PRIVATE = join(FIX, 'private');
const CLOCK = '2026-11-16T11:00:00.000Z'; // the frozen "now" of every fixture page
const STORAGE = ['sample-en', 'sample-sl', 'legacy-single', 'two-users', 'rich'];
const OUTPUTS = { sync: 'rich.sync.json', exportFull: 'rich.export-full.json', exportTemplate: 'rich.export-template.json', backup: 'rich.backup.json' };

const args = process.argv.slice(2);
const generate = args.includes('--generate');
const src = resolve(args.find(a => !a.startsWith('--')) || ROOT); // the app to test; fixtures stay this repo's

const { dir, url, profiles, close } = await serveTestBuild(src);

// One page load: storage set to `storage`, then `mode` runs (see tests/fixtures/fixture-page.js).
let runs = 0;
async function run(mode, storage = {}, extra = {}) {
  writeFileSync(join(dir, 'fixture-config.js'), `window.__FX = ${JSON.stringify({ mode, storage, clock: CLOCK, ...extra })};\n`);
  const text = readPre(await dumpDom(url + 'fx.html', profiles, { virtualTime: 10000, profile: `profile-${++runs}`, offline: true }), 'FX');
  if (text === null) throw new Error(`${mode}: no result (page did not finish)`);
  const out = JSON.parse(text);
  if (out.crash) throw new Error(`${mode}: ${out.crash}`);
  if (out.errors.length) throw new Error(`${mode}: page errors: ${out.errors.join(' || ')}`);
  return out;
}

const readJson = name => JSON.parse(readFileSync(join(FIX, name), 'utf8'));
const writeJson = (name, value) => writeFileSync(join(FIX, name), JSON.stringify(value, null, 2) + '\n');
const fresh = lang => ({ 'actionplan.lang': lang });

async function generateAll() {
  for (const name of ['sample-en', 'sample-sl', 'two-users', 'rich']) {
    const out = await run('build:' + name, fresh(name === 'sample-sl' ? 'sl' : 'en'));
    writeJson(`${name}.storage.json`, out.storage);
    if (name === 'rich') for (const [k, file] of Object.entries(OUTPUTS)) writeJson(file, out[k]);
    console.log(`wrote ${name}`);
  }
  // The single-plan version's key, as that version stored it; the migrated dump is the expectation.
  const legacy = (await run('build:legacy-single', fresh('en'))).legacy;
  const storage = { ...fresh('en'), 'actionplan.v1': JSON.stringify(legacy) };
  writeJson('legacy-single.storage.json', storage);
  writeJson('legacy-single.expected.json', (await run('roundtrip', storage)).storage);
  console.log('wrote legacy-single');
  return 0;
}

async function checkAll() {
  const fails = [];
  const compare = (label, want, got) => {
    const diff = firstDiff(want, got);
    if (diff) fails.push(`FAIL ${label}: ${diff}`);
  };
  let checks = 0;
  for (const name of STORAGE) {
    checks++;
    const storage = readJson(`${name}.storage.json`);
    const out = await run('roundtrip', storage, { outputs: name === 'rich' });
    compare(`${name} storage`, readJson(name === 'legacy-single' ? 'legacy-single.expected.json' : `${name}.storage.json`), out.storage);
    if (name === 'rich') for (const [k, file] of Object.entries(OUTPUTS)) { checks++; compare(file, readJson(file), out[k]); }
  }
  checks++;
  const restored = await run('restore', fresh('en'), { backup: readJson(OUTPUTS.backup) });
  if (restored.problems.length) fails.push(`FAIL restore ${OUTPUTS.backup}: ${restored.problems.join('; ')}`);
  for (const file of existsSync(PRIVATE) ? readdirSync(PRIVATE).filter(f => f.endsWith('.json')) : []) {
    checks++;
    const text = readFileSync(join(PRIVATE, file), 'utf8');
    const out = await run('import', fresh('en'), { file: { name: file, text } });
    compare(`private/${file} import → export`, out.want, out.got);
  }
  fails.forEach(f => console.log(f));
  console.log(`fixtures: ${checks} checks, ${fails.length} failed`);
  return fails.length ? 1 : 0;
}

// Where two JSON values first differ, as "path: want … got …"; '' when equal. Stored strings that
// hold JSON are compared as JSON, so the path points inside them.
function firstDiff(want, got, path = '$') {
  const parse = v => { if (typeof v !== 'string' || !/^[[{]/.test(v)) return v; try { return JSON.parse(v); } catch { return v; } };
  if (typeof want === 'string' && typeof got === 'string' && want !== got) {
    const w = parse(want), g = parse(got);
    if (typeof w === 'object' && typeof g === 'object') return firstDiff(w, g, path) || `${path}: same JSON, different text`;
  }
  if (want === got) return '';
  const show = v => { const s = JSON.stringify(v); return s === undefined ? 'nothing' : s.length > 120 ? s.slice(0, 117) + '...' : s; };
  if (typeof want !== 'object' || typeof got !== 'object' || !want || !got || Array.isArray(want) !== Array.isArray(got)) return `${path}: want ${show(want)}, got ${show(got)}`;
  const keys = [...new Set([...Object.keys(want), ...Object.keys(got)])];
  for (const k of keys) {
    const d = firstDiff(want[k], got[k], Array.isArray(want) ? `${path}[${k}]` : `${path}.${k}`);
    if (d) return d;
  }
  if (!Array.isArray(want) && JSON.stringify(Object.keys(want)) !== JSON.stringify(Object.keys(got))) return `${path}: same keys, different order`;
  return '';
}

try {
  process.exitCode = generate ? await generateAll() : await checkAll();
} finally {
  close();
}
