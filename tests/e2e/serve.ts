/** Playwright helpers: the built app on a local server whose folder can be swapped, and the old app's files. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import type { Page } from '@playwright/test';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const DIST = join(ROOT, 'dist'); // npm run test:e2e builds it first

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Serves `dir` on 127.0.0.1 (a secure context, so the service worker registers). setRoot() swaps
// the folder on the same origin, as a new deploy does.
export async function serve(dir: string) {
  let root = dir;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    const file = normalize(join(root, decodeURIComponent(path.endsWith('/') ? path + 'index.html' : path)));
    if (file !== root && !file.startsWith(root + sep)) return void res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    setRoot: (d: string) => void (root = d),
    close: () => new Promise<void>(ok => server.close(() => ok())),
  };
}

// The app as it was before the restructure (tag pre-restructure), written to a new temp folder.
export function oldApp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'actionplan-old-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  const files = git('ls-tree', '-r', '--name-only', 'pre-restructure', 'index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons')
    .toString()
    .split('\n')
    .filter(Boolean);
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), git('show', `pre-restructure:${f}`));
  }
  return dir;
}

// English, and no first-visit tour, as tests/pre.js sets for the page tests.
export const quietStart = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem('actionplan.lang', 'en');
    localStorage.setItem('actionplan.v1.tourSeen', 'true');
  });
