/** Runs the in-page browser suite (tests/test.js + more.js) in headless Chrome, quietly. */
// usage: node scripts/run-suite.mjs [--verbose] [--perf] [app dir]
//   default  the suite: prints FAIL entries, the errors block and one summary line; exit 0 if all passed
//   --perf   the draw-time budgets (tests/perf.js) on real time instead; prints their lines, never fails
// On CI (CI=true), steps listed in tests/ci-skip.txt still run but their failure does not count.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROOT, dumpDom, readPre, serveTestBuild } from './lib/chrome.mjs';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose'), perf = args.includes('--perf');
const src = resolve(args.find(a => !a.startsWith('--')) || ROOT);
const tests = join(ROOT, 'tests');

const { url, profiles, close } = await serveTestBuild(src);
try {
  process.exitCode = perf ? await runPerf() : await runSuite();
} finally {
  close();
}

async function runPerf() {
  // Real time: no virtual-time budget, so the clock runs while perf.js measures.
  const out = readPre(await dumpDom(url + 'perf.html', profiles, { virtualTime: 0, profile: 'profile-perf' }), 'PERF');
  console.log(out ?? 'FAIL draw times: NO RESULT');
  return 0;
}

async function runSuite() {
  const dom = await dumpDom(url + 'test.html', profiles);
  const out = readPre(dom, 'OK');
  if (out === null || out.startsWith('HARNESS CRASH')) {
    const saved = join(tmpdir(), 'actionplan-last-dom.html');
    writeFileSync(saved, dom);
    console.log(out ?? `NO RESULT (the suite did not finish within the virtual-time budget, or the page failed to load); page dump (${dom.length} bytes): ${saved}`);
    return 1;
  }
  if (verbose) console.log(out);
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
  const name = e => listed(e) ?? e;
  const failed = steps.filter(e => e.startsWith('FAIL ') && !listed(e));
  const skipped = steps.filter(e => e.startsWith('FAIL ') && listed(e));
  if (!verbose) {
    failed.forEach(e => console.log(e.split('\n')[0])); // the stack only with --verbose
    if (errors !== 'none') console.log('errors: ' + errors);
  }
  skipped.forEach(e => console.log(`SKIP (CI) ${name(e)}`));
  console.log(`suite: ${steps.length} steps, ${failed.length} failed${skipped.length ? `, ${skipped.length} skipped on CI` : ''}, errors: ${errors === 'none' ? 'none' : 'yes'}`);
  return failed.length || errors !== 'none' ? 1 : 0;
}

// Step names (one per line, # comments) whose failure is not counted on CI's Linux Chrome.
function ciSkips() {
  const file = join(tests, 'ci-skip.txt');
  if (process.env.CI !== 'true' || !existsSync(file)) return new Set();
  return new Set(readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')));
}
