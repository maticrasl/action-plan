/** Prints the circular imports among the modules under src/ (value and type imports), shortest cycles first. */
// usage: npm run cycles [-- --values]   (--values: leave out `import type` and `export type … from`)
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { readText } from './lib/ast.mjs';

const ROOT = join(import.meta.dirname, '..');
const valuesOnly = process.argv.includes('--values');
const rel = f => relative(ROOT, f).replaceAll('\\', '/');
const files = readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
  .filter(e => e.isFile() && /\.ts$/.test(e.name) && !e.name.endsWith('.test.ts'))
  .map(e => join(e.parentPath, e.name));

// Each file's relative imports, resolved to files under src/.
const graph = new Map();
for (const file of files) {
  const src = ts.createSourceFile(file, readText(file).text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const deps = new Set();
  for (const s of src.statements) {
    const spec = (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) && s.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec) || !spec.text.startsWith('.')) continue;
    const typeOnly = ts.isImportDeclaration(s)
      ? s.importClause?.isTypeOnly ||
        (s.importClause && !s.importClause.name && s.importClause.namedBindings && ts.isNamedImports(s.importClause.namedBindings) &&
          s.importClause.namedBindings.elements.length > 0 && s.importClause.namedBindings.elements.every(e => e.isTypeOnly))
      : s.isTypeOnly;
    if (valuesOnly && typeOnly) continue;
    const base = resolve(dirname(file), spec.text);
    const target = [base, base + '.ts', join(base, 'index.ts')].find(p => existsSync(p) && p.endsWith('.ts'));
    if (target) deps.add(rel(target));
  }
  graph.set(rel(file), deps);
}

// Strongly connected components (Tarjan); each with more than one file holds cycles.
let index = 0;
const idx = new Map(), low = new Map(), stack = [], on = new Set(), sccs = [];
function visit(v) {
  idx.set(v, index), low.set(v, index++), stack.push(v), on.add(v);
  for (const w of graph.get(v) ?? []) {
    if (!idx.has(w)) visit(w), low.set(v, Math.min(low.get(v), low.get(w)));
    else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
  }
  if (low.get(v) === idx.get(v)) {
    const c = [];
    let w;
    do (w = stack.pop()), on.delete(w), c.push(w);
    while (w !== v);
    if (c.length > 1) sccs.push(c.sort());
  }
}
for (const v of graph.keys()) if (!idx.has(v)) visit(v);

// The shortest cycle through each edge inside a component, each cycle printed once.
const seen = new Set(), cycles = [];
for (const c of sccs) {
  const inC = new Set(c);
  for (const a of c)
    for (const b of graph.get(a))
      if (inC.has(b)) {
        // Breadth-first from b back to a: the cycle is a → b → … → a.
        const prev = new Map([[b, null]]), queue = [b];
        while (queue.length && !prev.has(a)) {
          const u = queue.shift();
          for (const w of graph.get(u)) if (inC.has(w) && !prev.has(w)) prev.set(w, u), queue.push(w);
        }
        if (!prev.has(a)) continue;
        const cycle = [];
        for (let w = a; w !== null; w = prev.get(w)) cycle.unshift(w);
        // Printed from its alphabetically first file, so each cycle is listed once.
        const start = cycle.indexOf([...cycle].sort()[0]);
        const key = [...cycle.slice(start), ...cycle.slice(0, start)].join(' → ');
        if (!seen.has(key)) seen.add(key), cycles.push(key);
      }
}
cycles.sort((x, y) => x.split(' → ').length - y.split(' → ').length || x.localeCompare(y));
console.log(`${sccs.length} groups of files in cycles (${sccs.map(c => c.length).join(', ') || 'none'}), ${cycles.length} shortest cycles:`);
for (const c of cycles) console.log(`  ${c} → (back)`);
