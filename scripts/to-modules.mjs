/** One-off (phase 1): turns the classic scripts in src/legacy into ES modules with explicit imports. */
// usage: node scripts/to-modules.mjs [--report]
//   default   rewrites src/legacy/*.js in place
//   --report  changes nothing; lists load-time references to other files (RULES §8)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const DIR = resolve(import.meta.dirname, '..', 'src', 'legacy');
const ORDER = ['i18n', 'config', 'templates', 'tutorial', 'sync', 'users', 'visions', 'drive', 'backup', 'app'];
const HEADER = {
  i18n: 'Translations (English, Slovenian) and the t()/tp() lookups.',
  config: 'Build-time settings: the Google OAuth client id.',
  templates: 'Ready-made plan templates, as data.',
  tutorial: 'The guided tour and help mode.',
  sync: 'Change tracking and the per-item merge of plans and visions.',
  users: 'Several users on one device: per-user storage keys.',
  visions: 'Visions: the global list above goals, stored apart from plans.',
  drive: 'Google Drive sync: sign-in, the sync file, merging and status.',
  backup: 'Full backup and restore of every plan and the visions.',
  app: 'The app: data model, storage, views, forms and event wiring.',
};
const report = process.argv.includes('--report');
const files = ORDER.map(n => join(DIR, n + '.js'));
const program = ts.createProgram(files, { allowJs: true, checkJs: false, noEmit: true, target: ts.ScriptTarget.ES2022 });
const checker = program.getTypeChecker();
const source = f => program.getSourceFile(f);
const fileOf = new Map(files.map((f, i) => [source(f), ORDER[i]]));

// Top-level declarations per file: name -> file.
const owner = new Map();
const topNames = sf => {
  const names = [];
  const bind = n => (ts.isIdentifier(n) ? names.push(n.text) : n.elements.forEach(e => !ts.isOmittedExpression(e) && bind(e.name)));
  for (const s of sf.statements) {
    if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name) names.push(s.name.text);
    else if (ts.isVariableStatement(s)) s.declarationList.declarations.forEach(d => bind(d.name));
  }
  return names;
};
for (const f of files) for (const n of topNames(source(f))) {
  if (owner.has(n)) throw new Error(`${n} is declared in ${owner.get(n)} and ${fileOf.get(source(f))}`);
  owner.set(n, fileOf.get(source(f)));
}

// The file whose top-level declaration `id` refers to, if it is another legacy file.
function target(id, here) {
  const sym = ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id
    ? checker.getShorthandAssignmentValueSymbol(id.parent)
    : checker.getSymbolAtLocation(id);
  const decl = sym?.declarations?.[0];
  if (!decl) return null;
  const file = fileOf.get(decl.getSourceFile());
  if (!file || file === here || owner.get(id.text) !== file) return null;
  let top = decl;
  while (top.parent && !ts.isSourceFile(top.parent)) top = top.parent;
  return ts.isSourceFile(top.parent) ? file : null;
}

const isFunctionLike = n => ts.isFunctionLike(n) && !ts.isFunctionDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isClassStaticBlockDeclaration(n);

for (const f of files) {
  const sf = source(f), here = fileOf.get(sf);
  if (report) {
    // Identifiers of other files reached while the module loads (outside any function body).
    for (const s of sf.statements) {
      if (ts.isFunctionDeclaration(s)) continue;
      const hits = new Set();
      const walk = n => {
        if (isFunctionLike(n)) return;
        if (ts.isIdentifier(n) && target(n, here)) hits.add(n.text);
        ts.forEachChild(n, walk);
      };
      walk(s);
      if (hits.size) console.log(`${here}.js:${sf.getLineAndCharacterOfPosition(s.getStart()).line + 1}: ${[...hits].join(', ')}`);
    }
    continue;
  }
  const imports = new Map();
  const walk = n => {
    if (ts.isIdentifier(n)) {
      const from = target(n, here);
      if (from) (imports.get(from) ?? imports.set(from, new Set()).get(from)).add(n.text);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  // Edits from the end, so positions stay valid.
  const edits = [];
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isVariableStatement(s)) edits.push([s.getStart(sf), 0, 'export ']);
  }
  const first = sf.statements[0];
  const head = [`/** ${HEADER[here]} */`];
  for (const name of ORDER) if (imports.has(name)) head.push(`import { ${[...imports.get(name)].sort().join(', ')} } from './${name}.js';`);
  if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'use strict') {
    edits.push([first.getStart(sf), first.getEnd() - first.getStart(sf), head.join('\n')]);
  } else edits.push([0, 0, head.join('\n') + '\n']);
  let text = sf.text;
  for (const [pos, len, ins] of edits.sort((a, b) => b[0] - a[0])) text = text.slice(0, pos) + ins + text.slice(pos + len);
  writeFileSync(f, text);
  console.log(`${here}.js: ${[...imports.values()].reduce((a, s) => a + s.size, 0)} imports from ${imports.size} files`);
}
