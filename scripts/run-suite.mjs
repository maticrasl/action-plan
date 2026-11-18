/** Runs the page tests (tests/browser/*.js, each in a fresh page) in headless Chrome, quietly. */
// usage: node scripts/run-suite.mjs [--verbose] [--perf] [--app <dir>] [<feature> …]
//   <feature>  a tests/browser file without .js: `map` runs map.js and map.*.js (not map-gestures.js);
//              `old` runs what is left of the old suite (tests/test.js + more.js). Default: every file.
//   default    prints each failing file's FAIL lines, its errors and a summary line, then one total line;
//              exit 0 if all passed
//   --verbose  every PASS and FAIL line, with stacks
//   --perf     the draw-time budgets (tests/perf.js) on real time instead; prints their lines, never fails
//   --app      test the app in another folder (a `git archive` of an older commit) with its own tests
// On CI (CI=true), steps listed in tests/ci-skip.txt still run but their failure does not count.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROOT, dumpDom, readPre, serveTestBuild } from './lib/chrome.mjs';

// Pages run side by side, each with its own Chrome and profile.
const JOBS = 4;

const args = process.argv.slice(2);
const verbose = args.includes('--verbose'), perf = args.includes('--perf');
const appAt = args.indexOf('--app');
const src = resolve(appAt >= 0 ? args[appAt + 1] : ROOT);
const names = args.filter((a, i) => !a.startsWith('--') && !(appAt >= 0 && i === appAt + 1));
const tests = join(src, 'tests');

const pages = selectPages(names);
const { url, profiles, close } = await serveTestBuild(src);
try {
  process.exitCode = perf ? await runPerf() : await runAll();
} finally {
  close();
}

// [name, page path] for each file to run.
function selectPages(wanted) {
  const dir = join(tests, 'browser');
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'harness.js').map(f => f.slice(0, -3)).sort() : [];
  const all = [...files.map(f => [f, `browser.html?f=${f}`]), ...(existsSync(join(tests, 'test.js')) ? [['old', 'test.html']] : [])];
  if (!wanted.length) return all;
  return wanted.flatMap(w => {
    const hit = all.filter(([f]) => f === w || f.startsWith(w + '.'));
    if (!hit.length) {
      console.error(`no page tests named ${w} (tests/browser/${w}.js)`);
      process.exit(2);
    }
    return hit;
  });
}

async function runPerf() {
  // Real time: no virtual-time budget, so the clock runs while perf.js measures.
  const out = readPre(await dumpDom(url + 'perf.html', profiles, { virtualTime: 0, profile: 'profile-perf' }), 'PERF');
  console.log(out ?? 'FAIL draw times: NO RESULT');
  return 0;
}

async function runAll() {
  const results = new Array(pages.length);
  let next = 0;
  const worker = async () => {
    while (next < pages.length) {
      const i = next++;
      const [name, page] = pages[i];
      results[i] = parse(name, await dumpDom(url + page, profiles, { profile: `profile-${name}` }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(JOBS, pages.length) }, worker));
  let steps = 0, failed = 0, skipped = 0, broken = 0;
  for (const r of results) {
    steps += r.steps;
    failed += r.failed.length;
    skipped += r.skipped.length;
    if (verbose) console.log(`== ${r.name}\n${r.out}`);
    else r.failed.forEach(e => console.log(e.split('\n')[0])); // the stack only with --verbose
    r.skipped.forEach(e => console.log(`SKIP (CI) ${r.listed(e)}`));
    if (r.crash) console.log(r.crash);
    else if (r.errors !== 'none' && !verbose) console.log('errors: ' + r.errors);
    if (r.crash || r.failed.length || r.errors !== 'none') {
      broken++;
      console.log(`${r.name}: ${r.crash ? 'no result' : `${r.steps} steps, ${r.failed.length} failed, errors: ${r.errors === 'none' ? 'none' : 'yes'}`}`);
    }
  }
  console.log(`suite: ${pages.length} files, ${steps} steps, ${failed} failed${skipped ? `, ${skipped} skipped on CI` : ''}, ${broken} files failing`);
  return broken ? 1 : 0;
}

// One page's result: its steps, the failed and CI-skipped ones, its errors, or why there is none.
function parse(name, dom) {
  const out = readPre(dom, 'OK');
  if (out === null || out.startsWith('HARNESS CRASH')) {
    const saved = join(tmpdir(), `actionplan-last-dom-${name}.html`);
    writeFileSync(saved, dom);
    const why = out ?? `NO RESULT (the page did not finish within the virtual-time budget, or failed to load); page dump (${dom.length} bytes): ${saved}`;
    return { name, out: why, crash: why, steps: 0, failed: [], skipped: [], errors: 'none', listed: () => '' };
  }
  // Entries start with PASS, FAIL or "errors:"; a FAIL's stack continues on the lines after it.
  const entries = [];
  for (const line of out.split('\n')) {
    if (/^(PASS|FAIL) |^errors: /.test(line) || !entries.length) entries.push(line);
    else entries[entries.length - 1] += '\n' + line;
  }
  const steps = entries.filter(e => /^(PASS|FAIL) /.test(e));
  const errors = entries.find(e => e.startsWith('errors: '))?.slice(8) ?? 'missing';
  const skip = ciSkips();
  // Step names hold ": " themselves, so a listed name is matched as the start of the FAIL line.
  const listed = e => [...skip].find(s => e === `FAIL ${s}` || e.startsWith(`FAIL ${s}: `) || e.startsWith(`FAIL ${s}\n`));
  return {
    name,
    out,
    steps: steps.length,
    failed: steps.filter(e => e.startsWith('FAIL ') && !listed(e)),
    skipped: steps.filter(e => e.startsWith('FAIL ') && listed(e)),
    errors,
    listed,
  };
}

// Step names (one per line, # comments) whose failure is not counted on CI's Linux Chrome.
function ciSkips() {
  const file = join(tests, 'ci-skip.txt');
  if (process.env.CI !== 'true' || !existsSync(file)) return new Set();
  return new Set(readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')));
}
