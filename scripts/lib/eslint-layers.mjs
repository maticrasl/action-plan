/** ESLint rule `layers/order`: imports follow the layer order, views do not import each other, nothing imports the test bridge. */
import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const SRC = resolve(import.meta.dirname, '../../src');
// A module may import from its own layer and the ones before it. main is src/main.ts and src/boot.ts.
const LAYERS = ['i18n', 'core', 'store', 'sync', 'ui', 'views', 'tutorial', 'main'];
// Inside src/views: the views, by file or folder. index.ts (the table of views) and events.ts (their listeners) sit
// above them and may import any; every other file directly in src/views is a piece the views share, and imports none.
const VIEWS = new Set(['dashboard', 'goals', 'activities', 'states', 'visions', 'map', 'timeline', 'graphs']);
const HUBS = new Set(['index', 'events']);

// A file under src/ ('views/map/zoom.ts'): its layer, and inside src/views which view or piece it belongs to.
function place(file) {
  const parts = file.split('/');
  if (parts.length === 1) return { layer: parts[0].startsWith('test-') ? 'test' : 'main' };
  const unit = parts[0] === 'views' ? parts[1].replace(/\.ts$/, '') : '';
  return { layer: parts[0], unit, kind: VIEWS.has(unit) ? 'view' : HUBS.has(unit) ? 'hub' : 'shared' };
}

function resolveImport(from, spec) {
  const base = resolve(dirname(from), spec);
  const file = [base + '.ts', resolve(base, 'index.ts'), base].find(f => /\.ts$/.test(f) && existsSync(f));
  const rel = file && relative(SRC, file).replaceAll('\\', '/');
  return rel && !rel.startsWith('..') ? rel : null;
}

function problem(fromFile, toFile, allowed) {
  const a = place(fromFile), b = place(toFile);
  if (toFile === 'test-bridge.ts') return 'nothing imports the test bridge';
  if (a.layer === 'test') return null;
  if (b.layer === 'test') return 'app code does not import the test build';
  if (LAYERS.indexOf(b.layer) > LAYERS.indexOf(a.layer))
    return `${a.layer}/ is below ${b.layer}/ (order: ${LAYERS.join(' → ')})`;
  if (a.layer !== 'views' || b.layer !== 'views' || a.unit === b.unit || a.kind === 'hub') return null;
  if (b.kind === 'shared' && a.kind !== 'hub') return null;
  if (allowed.has(`${fromFile} -> ${toFile}`)) return null;
  return b.kind === 'hub'
    ? `views/${b.unit}.ts sits above the views; import what you need from a lower layer`
    : `views do not import each other (${a.unit} → ${b.unit}): move the shared piece down a layer`;
}

const order = {
  meta: {
    type: 'problem',
    docs: { description: 'Imports follow the layer order; views do not import each other' },
    schema: [{ type: 'object', properties: { allow: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }],
  },
  create(context) {
    const allowed = new Set(context.options[0]?.allow ?? []);
    const from = relative(SRC, context.filename).replaceAll('\\', '/');
    if (from.startsWith('..')) return {};
    const check = node => {
      const spec = node.source?.value;
      if (typeof spec !== 'string' || !spec.startsWith('.')) return;
      const to = resolveImport(context.filename, spec);
      const message = to && problem(from, to, allowed);
      if (message) context.report({ node: node.source, message: `${message} (${from} → ${to})` });
    };
    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check, ImportExpression: check };
  },
};

export default { rules: { order } };
