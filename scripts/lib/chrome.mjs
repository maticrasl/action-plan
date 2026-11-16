/** Headless Chrome helpers: stage a copy of the app, inject scripts, dump a page's DOM. */
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = resolve(import.meta.dirname, '..', '..');

const WINDOWS_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// CHROME, else the Windows default path, else google-chrome (Linux, for CI).
export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  if (process.platform === 'win32' && existsSync(WINDOWS_CHROME)) return WINDOWS_CHROME;
  return 'google-chrome';
}

// A temp folder holding index.html, css/ and js/ of the app (as tests/run.sh copied them).
// Returns { dir, cleanup }.
export function stageApp(src = ROOT) {
  const dir = mkdtempSync(join(tmpdir(), 'actionplan-'));
  for (const p of ['index.html', 'css', 'js']) cpSync(join(src, p), join(dir, p), { recursive: true });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) };
}

// index.html with <script src="js/<name>"> tags put before i18n.js and after app.js.
export function injectedPage(dir, { before = [], after = [] }) {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const tag = n => `<script src="js/${n}"></script>`;
  const first = tag('i18n.js'), last = tag('app.js');
  if (!html.includes(first) || !html.includes(last)) throw new Error('index.html: script tags to inject at not found');
  return html
    .replace(first, () => before.map(n => `${tag(n)}\n  `).join('') + first)
    .replace(last, () => last + after.map(n => `\n  ${tag(n)}`).join(''));
}

export function writePage(dir, name, html) {
  writeFileSync(join(dir, name), html);
}

// Runs headless Chrome on <dir>/<page> and resolves to the dumped DOM. `virtualTime` in ms, or 0 for
// real time. Each run gets its own profile folder, so storage starts empty.
export function dumpDom(dir, page, { virtualTime = 60000, profile = 'profile', offline = false } = {}) {
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--user-data-dir=${join(dir, profile)}`, '--window-size=1280,900',
  ];
  if (process.platform === 'linux') args.push('--no-sandbox'); // GitHub's runners refuse Chrome's sandbox
  if (offline) args.push('--host-resolver-rules=MAP * ~NOTFOUND'); // nothing reaches the network
  if (virtualTime) args.push(`--virtual-time-budget=${virtualTime}`);
  args.push('--dump-dom', pathToFileURL(join(dir, page)).href);
  return new Promise((ok, fail) => {
    execFile(chromePath(), args, { maxBuffer: 512 * 1024 * 1024, timeout: 10 * 60 * 1000, windowsHide: true }, (err, stdout) => {
      if (err && !stdout) return fail(new Error(`chrome failed: ${err.message}`));
      ok(stdout);
    });
  });
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const unescapeHtml = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITIES[e] ?? m;
});

// The text of <pre id="<id>"> in a dumped DOM, or null.
export function readPre(dom, id) {
  const m = dom.match(new RegExp(`<pre id="${id}">([\\s\\S]*?)</pre>`));
  return m ? unescapeHtml(m[1]) : null;
}
