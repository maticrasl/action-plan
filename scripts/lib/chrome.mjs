/** Headless Chrome helpers: build the test pages, serve them on a local port, dump a page's DOM. */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFile, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { build } from 'vite';

export const ROOT = resolve(import.meta.dirname, '..', '..');

const WINDOWS_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// CHROME, else the Windows default path, else google-chrome (Linux, for CI).
export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  if (process.platform === 'win32' && existsSync(WINDOWS_CHROME)) return WINDOWS_CHROME;
  return 'google-chrome';
}

// Builds the app at `src` in test mode (vite.config.ts: browser.html, perf.html, fx.html) and serves
// the result on a free local port. Returns { dir, profiles, url, close }: the built folder, a temp
// folder for Chrome profiles, the server's address with a trailing slash, and a function that stops
// the server and removes the profiles.
export async function serveTestBuild(src = ROOT) {
  await build({ root: src, configFile: join(src, 'vite.config.ts'), mode: 'test', logLevel: 'error' });
  const dir = join(src, 'dist-test');
  const server = createServer((req, res) => {
    const path = normalize(join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (path !== dir && !path.startsWith(dir + sep)) return void res.writeHead(403).end();
    readFile(path, (err, data) => {
      if (err) return void res.writeHead(404).end();
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const profiles = mkdtempSync(join(tmpdir(), 'actionplan-'));
  return {
    dir,
    profiles,
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => {
      server.close();
      rmSync(profiles, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

// Runs headless Chrome on `url` and resolves to the dumped DOM. `virtualTime` in ms, or 0 for real
// time. Each run gets its own profile folder under `profiles`, so storage starts empty.
export function dumpDom(url, profiles, { virtualTime = 60000, profile = 'profile', offline = false } = {}) {
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--user-data-dir=${join(profiles, profile)}`, '--window-size=1280,900',
  ];
  if (process.platform === 'linux') args.push('--no-sandbox'); // GitHub's runners refuse Chrome's sandbox
  if (offline) args.push('--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'); // nothing but the test server is reachable
  if (virtualTime) args.push(`--virtual-time-budget=${virtualTime}`);
  args.push('--dump-dom', url);
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
