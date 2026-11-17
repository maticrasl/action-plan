/** Prints every file under src/ with its line count and its first-line description: the table of contents. */
// usage: npm run map
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readText } from './lib/ast.mjs';

const ROOT = join(import.meta.dirname, '..');
const files = readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
  .filter(e => e.isFile())
  .map(e => relative(ROOT, join(e.parentPath, e.name)).replaceAll('\\', '/'))
  .sort();
const rows = files.map(f => {
  const { text } = readText(join(ROOT, f));
  const lines = text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  const about = text.match(/^\/\*\*\s*(.*?)\s*\*\//)?.[1] ?? (/\.(ts|js)$/.test(f) ? '(no description)' : '');
  return [f, String(lines), about];
});
const w = [0, 1].map(i => Math.max(...rows.map(r => r[i].length)));
for (const [f, n, about] of rows) console.log(`${f.padEnd(w[0])}  ${n.padStart(w[1])}  ${about}`.trimEnd());
