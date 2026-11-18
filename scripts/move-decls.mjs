/** Moves top-level declarations between modules byte for byte, fixes imports, and checks a move was verbatim. */
// usage: npm run move -- <from> <to> <name> [<name> …] [--section "<header text>"] [--fix-imports]
//        npm run move -- --check <from> <to> [--ref <rev> | --commit <rev>]
//   <name>        a top-level declaration, with the comments directly above it and the rest of its last line
//   Obj.prop      a property of the top-level object literal Obj: becomes `export const prop = <value>;`
//                 in <to>, and the property in Obj becomes the shorthand `prop`
//   Arr[Title]:NAME  the elements under the header /* ---------- Title ---------- */ inside the
//                 top-level array literal Arr: become `export const NAME = [ … ];` in <to>, the header
//                 above it, and Arr holds `...NAME,` in their place
//   comment:<n>   the comment that starts on line n and stands alone between statements (a banner)
//   line:<n>      the top-level statement whose code starts on line n, with its comments (a listener)
//   --section     everything under one /* ---------- header ---------- */ up to the next header, header included
//   --fix-imports rewrite the import lines of <from>, <to> and every file that imports a moved name;
//                 without it the tool only prints what has to change
//   --check       every declaration and comment in <to> must be in <ref>:<from> (moved) or <ref>:<to>
//                 (already there), byte for byte; only `x = v;` → `setX(v);` may differ. Default ref HEAD.
//                 --commit <rev> checks a committed move: <rev>'s files against its parent's.
// New files are .js until their type commit renames them; imports to files outside src/legacy are
// written without an extension, so the rename needs no import change.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { arrayAsDecl, arrayChunk, arraySections, chunkOf, declNames, parse, propertyAsDecl, propertyChunk, readText, SECTION, writeText } from './lib/ast.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
};
const has = name => {
  const i = args.indexOf(name);
  return i >= 0 && args.splice(i, 1).length > 0;
};
const section = flag('--section');
const commit = flag('--commit');
const ref = commit ? `${commit}~1` : (flag('--ref') ?? 'HEAD');
const fix = has('--fix-imports');
const check = has('--check');
const [fromArg, toArg, ...names] = args;
if (!fromArg || !toArg || (!check && !names.length && section === undefined)) {
  console.error('usage: npm run move -- <from> <to> <name> […] [--section "<header>"] [--fix-imports] | --check <from> <to> [--ref <rev>]');
  process.exit(2);
}
const FROM = resolve(fromArg), TO = resolve(toArg);
const rel = f => relative(ROOT, f).replaceAll('\\', '/');
const cap = s => s[0].toUpperCase() + s.slice(1);

/* ---------- Moving ---------- */

function move() {
  const program = makeProgram();
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(FROM);
  if (!sf) throw new Error(`${rel(FROM)} is not in tsconfig.json's program`);
  const text = sf.text;

  // What moves: whole-statement chunks, object properties, or sections of an array literal.
  const chunks = [], props = [], arrs = [];
  const byName = new Map();
  for (const stmt of sf.statements) for (const n of declNames(stmt)) byName.set(n, stmt);
  if (section !== undefined) chunks.push(...sectionChunks(sf, section));
  for (const n of names) {
    const [obj, prop] = n.split('.');
    const arr = n.match(/^([\w$]+)\[(.+)\]:([\w$]+)$/);
    if (n.startsWith('comment:')) chunks.push(looseComment(sf, Number(n.slice(8))));
    else if (n.startsWith('line:')) chunks.push(statementAt(sf, Number(n.slice(5))));
    else if (arr) arrs.push({ name: arr[3], ...arrayChunk(sf, arr[1], arr[2]) });
    else if (prop) props.push({ name: prop, ...propertyChunk(sf, obj, prop) });
    else if (!byName.has(n)) throw new Error(`${rel(FROM)} has no top-level ${n}`);
    else if (!chunks.some(c => c.stmt === byName.get(n))) chunks.push(chunkOf(sf, byName.get(n)));
  }
  chunks.sort((a, b) => a.start - b.start);
  const movedStmts = new Set(chunks.flatMap(c => c.stmts ?? [c.stmt]));
  const movedNodes = [...movedStmts, ...props.map(p => p.node), ...arrs.flatMap(a => a.nodes)];
  const movedNames = new Set([...[...movedStmts].flatMap(declNames), ...props.map(p => p.name), ...arrs.map(a => a.name)]);
  for (const s of movedStmts) {
    const partial = ts.isVariableStatement(s) && declNames(s).some(n => !names.includes(n)) && section === undefined;
    if (partial) console.log(`note: ${declNames(s).join(', ')} are one statement and move together`);
  }

  // What an identifier refers to, by its declaration: a top-level name of <from> or one of its imports.
  const imports = new Map(); // import binding node -> { file, local, imported, ns }
  for (const decl of sf.statements.filter(ts.isImportDeclaration)) {
    const file = resolveSpec(FROM, decl.moduleSpecifier.text);
    const b = decl.importClause?.namedBindings;
    if (decl.importClause?.name) throw new Error(`${rel(FROM)}: default imports are not handled`);
    if (b && ts.isNamespaceImport(b)) imports.set(b, { file, local: b.name.text, ns: true });
    if (b && ts.isNamedImports(b)) for (const e of b.elements) imports.set(e, { file, local: e.name.text, imported: (e.propertyName ?? e.name).text });
  }
  const refOf = id => {
    // A property moved out of an object literal is used through its new shorthand.
    const sym = ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id ? checker.getShorthandAssignmentValueSymbol(id.parent) : checker.getSymbolAtLocation(id);
    for (const d of sym?.declarations ?? []) {
      if (d.getSourceFile() !== sf) continue;
      if (imports.has(d)) return { imp: imports.get(d), key: d };
      if (topStatement(sf, d)) return { top: sym.name };
    }
    return {};
  };
  const importName = imp => (imp.ns ? `* as ${imp.local}` : imp.imported === imp.local ? imp.local : `${imp.imported} as ${imp.local}`);

  // <to> needs: names left in <from>, and <from>'s imports that moved code uses.
  const toNeeds = new Needs(), usedByMoved = new Set(), setters = [];
  for (const node of movedNodes)
    eachId(node, id => {
      const r = refOf(id);
      if (r.top && !movedNames.has(r.top)) toNeeds.add(FROM, r.top);
      if ((r.top && !movedNames.has(r.top)) || r.imp)
        if (isAssigned(id)) setters.push(`${rel(FROM)}:${line(sf, id)} (moving) assigns ${id.text}: use set${cap(id.text)}()`);
      if (r.imp) usedByMoved.add(r.key);
      if (r.imp && r.imp.file !== TO) toNeeds.add(r.imp.file, importName(r.imp));
    });
  // <from> needs: moved names its remaining code uses; its imports that only moved code used go.
  const fromNeeds = new Needs(), stillUsed = new Set();
  const inMoved = node => movedNodes.some(m => node.pos >= m.pos && node.end <= m.end);
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) continue;
    eachId(stmt, id => {
      if (inMoved(id)) return;
      const r = refOf(id);
      if (r.top && movedNames.has(r.top)) {
        fromNeeds.add(TO, r.top);
        if (isAssigned(id)) setters.push(`${rel(FROM)}:${line(sf, id)} assigns ${id.text}: use set${cap(id.text)}()`);
      }
      if (r.imp) stillUsed.add(r.key);
    });
  }
  for (const p of [...props, ...arrs]) fromNeeds.add(TO, p.name); // the shorthand or spread left behind
  const fromDrops = new Needs();
  for (const key of usedByMoved) if (!stillUsed.has(key)) fromDrops.add(imports.get(key).file, importName(imports.get(key)));

  // Other files that import moved names from <from> (<to> itself only loses them).
  const others = new Map(); // file -> names
  for (const other of program.getSourceFiles()) {
    const f = resolve(other.fileName);
    if (f === FROM || other.isDeclarationFile || !f.startsWith(join(ROOT, 'src'))) continue;
    for (const decl of other.statements.filter(ts.isImportDeclaration)) {
      if (resolveSpec(f, decl.moduleSpecifier.text) !== FROM) continue;
      const b = decl.importClause?.namedBindings;
      if (b && ts.isNamespaceImport(b)) console.log(`check by hand: ${rel(f)} imports ${rel(FROM)} as a namespace`);
      if (b && ts.isNamedImports(b))
        for (const e of b.elements) {
          const n = (e.propertyName ?? e.name).text;
          if (movedNames.has(n)) others.set(f, [...(others.get(f) ?? []), e.propertyName ? `${n} as ${e.name.text}` : n]);
        }
    }
  }
  for (const n of movedNames)
    for (const other of program.getSourceFiles())
      if (resolve(other.fileName) !== FROM && !other.isDeclarationFile)
        eachId(other, id => id.text === n && isAssigned(id) && setters.push(`${rel(other.fileName)}:${line(other, id)} assigns ${n}: use set${cap(n)}()`));

  // Cut from <from> (back to front, so positions stay valid) and append to <to>.
  let out = text;
  const cuts = [
    ...chunks.map(c => ({ ...c, put: '' })),
    ...props.map(p => ({ ...p, put: p.indent + p.name })),
    ...arrs.map(a => ({ ...a, put: `${a.indent}...${a.name},\n${text.slice(a.bodyEnd, a.end)}` })),
  ].sort((a, b) => b.start - a.start);
  for (const c of cuts) out = out.slice(0, c.start) + c.put + out.slice(c.end);
  out = out.replace(/\n{3,}/g, m => (text.includes(m) ? m : '\n\n'));
  const pieces = [
    ...chunks.map(c => ({ start: c.start, end: c.end, text: c.text })),
    ...props.map(p => ({ start: p.start, end: p.end, text: propertyAsDecl(p.name, p) })),
    ...arrs.map(a => ({ start: a.start, end: a.end, text: `${a.head}\n${arrayAsDecl(a.name, a)}` })),
  ].sort((a, b) => a.start - b.start);
  let added = '';
  pieces.forEach((p, i) => {
    const t = p.text.endsWith('\n') ? p.text : p.text + '\n';
    added += i && pieces[i - 1].end === p.start ? t : (i ? '\n' : '') + t;
  });
  const existed = existsSync(TO);
  const toText = existed ? readText(TO).text : '';
  const newTo = toText ? toText.replace(/\n*$/, '\n\n') + added : added;
  writeText(FROM, out);
  mkdirSync(dirname(TO), { recursive: true });
  writeText(TO, newTo);

  // Imports.
  const edits = new Map(); // file -> { add: Needs, drop: Needs }
  const edit = f => edits.get(f) ?? edits.set(f, { add: new Needs(), drop: new Needs() }).get(f);
  for (const [file, set] of toNeeds) for (const n of set) edit(TO).add.add(file, n);
  for (const [file, set] of fromNeeds) for (const n of set) edit(FROM).add.add(file, n);
  for (const [file, set] of fromDrops) for (const n of set) edit(FROM).drop.add(file, n);
  for (const [f, list] of others)
    for (const n of list) {
      edit(f).drop.add(FROM, n);
      if (f !== TO) edit(f).add.add(TO, n);
    }

  console.log(`moved ${pieces.length} chunk(s) to ${rel(TO)}${existed ? '' : ' (new file: give it its one-line /** … */ description)'}: ${[...movedNames].join(', ')}`);
  for (const [f, { add, drop }] of edits) {
    for (const [file, set] of add) console.log(`${rel(f)}: import { ${[...set].join(', ')} } from ${rel(file)}`);
    for (const [file, set] of drop) console.log(`${rel(f)}: no longer import { ${[...set].join(', ')} } from ${rel(file)}`);
    if (fix) writeText(f, rewriteImports(f, readText(f).text, add, drop));
  }
  setters.forEach(s => console.log(s));
  if (!fix && edits.size) console.log('imports not changed: run again with --fix-imports, or edit them by hand');
  if (!sf.statements.some(s => !ts.isImportDeclaration(s) && !movedStmts.has(s))) console.log(`${rel(FROM)} has no code left: delete it`);
  return 0;
}

// The statements under a top-level section header, as one chunk (header included).
function sectionChunks(sf, title) {
  const heads = [];
  for (const node of [...sf.statements, sf.endOfFileToken])
    for (const r of ts.getLeadingCommentRanges(sf.text, node.pos) ?? []) {
      const m = sf.text.slice(r.pos, r.end).match(SECTION);
      if (m) heads.push({ pos: sf.text.lastIndexOf('\n', r.pos) + 1, title: m[1] });
    }
  const i = heads.findIndex(h => h.title === title);
  if (i < 0) throw new Error(`no section "${title}"; sections: ${heads.map(h => h.title).join(' | ')}`);
  const start = heads[i].pos, end = heads[i + 1]?.pos ?? sf.text.length;
  const stmts = sf.statements.filter(s => s.getStart() >= start && s.getStart() < end);
  if (stmts.some(s => s.end > end)) throw new Error(`section "${title}" ends inside a statement`);
  if (stmts.some(ts.isImportDeclaration)) throw new Error(`section "${title}" holds an import`);
  return [{ stmts, start, end, text: sf.text.slice(start, end) }];
}

// A comment between top-level statements that starts on line `n` (1-based), as whole lines.
function looseComment(sf, n) {
  for (const node of [...sf.statements, sf.endOfFileToken])
    for (const r of ts.getLeadingCommentRanges(sf.text, node.pos) ?? []) {
      if (sf.getLineAndCharacterOfPosition(r.pos).line + 1 !== n) continue;
      const start = sf.text.lastIndexOf('\n', r.pos - 1) + 1, end = lineEndOf(sf.text, r.end);
      if (sf.text.slice(start, r.pos).trim() || sf.text.slice(r.end, end).trim()) throw new Error(`comment on line ${n} shares its lines with code`);
      return { stmts: [], start, end, text: sf.text.slice(start, end) };
    }
  throw new Error(`no comment between top-level statements starts on line ${n}`);
}

// The top-level statement whose code starts on line `n` (1-based), with its comments: for statements
// without a name, such as a listener registration.
function statementAt(sf, n) {
  const stmt = sf.statements.find(s => !ts.isImportDeclaration(s) && line(sf, s) === n);
  if (!stmt) throw new Error(`no top-level statement starts on line ${n}`);
  return chunkOf(sf, stmt);
}

// A Map of file -> Set of import names.
class Needs extends Map {
  add(file, name) {
    if (!this.has(file)) this.set(file, new Set());
    this.get(file).add(name);
  }
}

function makeProgram() {
  const config = ts.getParsedCommandLineOfConfigFile(join(ROOT, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => { throw new Error(String(d.messageText)); } });
  const host = ts.createCompilerHost(config.options);
  const cache = new Map();
  host.getSourceFile = (f, lang) => {
    if (!cache.has(f)) {
      const raw = ts.sys.readFile(f);
      cache.set(f, raw === undefined ? undefined : ts.createSourceFile(f, raw.replace(/\r\n/g, '\n'), lang, true));
    }
    return cache.get(f);
  };
  const files = config.fileNames.map(f => resolve(f));
  if (!files.includes(FROM)) files.push(FROM);
  const program = ts.createProgram(files, config.options, host);
  // getSourceFile wants the program's own spelling of the path.
  const bySpelling = new Map(program.getSourceFiles().map(s => [resolve(s.fileName), s]));
  const get = program.getSourceFile.bind(program);
  program.getSourceFile = f => bySpelling.get(resolve(f)) ?? get(f);
  return program;
}

// The file an import specifier points to (by the same rules Vite and tsc use here), or the bare spec.
function resolveSpec(importer, spec) {
  if (!spec.startsWith('.')) return spec;
  const p = resolve(dirname(importer), spec);
  for (const c of [p, p.replace(/\.js$/, '.ts'), p + '.ts', p + '.js', join(p, 'index.ts'), join(p, 'index.js')])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return p;
}
// How `importer` names `file`: relative, with .js kept for legacy files, else without an extension.
function specFor(importer, file) {
  if (!file.startsWith(ROOT)) return file;
  let s = relative(dirname(importer), file).replaceAll('\\', '/');
  if (!s.startsWith('.')) s = './' + s;
  return rel(file).startsWith('src/legacy/') ? s : s.replace(/\.[jt]s$/, '');
}
// The top-level statement that declares `d` itself (not a local inside it), or null.
function topStatement(sf, d) {
  let n = d;
  while (ts.isBindingElement(n) || ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) n = n.parent;
  if (ts.isVariableDeclaration(n)) n = n.parent.parent;
  return n.parent === sf ? n : null;
}

function rewriteImports(file, text, add, drop) {
  const sf = parse(file, text);
  const decls = sf.statements.filter(ts.isImportDeclaration);
  const edits = []; // { start, end, put }
  const pending = new Map([...add].map(([f, s]) => [f, new Set(s)]));
  for (const d of decls) {
    const target = resolveSpec(file, d.moduleSpecifier.text);
    const b = d.importClause?.namedBindings;
    if (!b || !ts.isNamedImports(b)) {
      if (b && drop.get(target)?.has(`* as ${b.name.text}`)) edits.push({ start: d.getStart(), end: lineEndOf(text, d.end), put: '' });
      continue;
    }
    const before = b.elements.map(e => e.getText());
    let names = before.filter(n => !drop.get(target)?.has(n));
    for (const n of pending.get(target) ?? []) if (!names.includes(n)) names.push(n);
    pending.delete(target);
    if (names.length === before.length && names.every((n, i) => n === before[i])) continue;
    names = [...new Set(names)].sort();
    const quote = d.moduleSpecifier.getText()[0];
    const put = names.length ? `import { ${names.join(', ')} } from ${quote}${d.moduleSpecifier.text}${quote};` : '';
    edits.push(names.length ? { start: d.getStart(), end: d.end, put } : { start: d.getStart(), end: lineEndOf(text, d.end), put });
  }
  const fresh = [...pending].filter(([, s]) => s.size).map(([f, s]) => {
    const ns = [...s].filter(n => n.startsWith('* as '));
    const named = [...s].filter(n => !n.startsWith('* as ')).sort();
    return [...ns.map(n => `import ${n} from '${specFor(file, f)}';`), ...(named.length ? [`import { ${named.join(', ')} } from '${specFor(file, f)}';`] : [])].join('\n');
  });
  if (fresh.length) {
    const last = decls.at(-1);
    const at = last ? lineEndOf(text, last.end) : /^\/\*\*.*\*\/\n/.test(text) ? text.indexOf('\n') + 1 : 0;
    const blankAfter = last || !text.slice(at).trim() || text.startsWith('\n', at);
    edits.push({ start: at, end: at, put: fresh.join('\n') + '\n' + (blankAfter ? '' : '\n') });
  }
  for (const e of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.put + text.slice(e.end);
  return text;
}
const lineEndOf = (text, pos) => (text.indexOf('\n', pos) < 0 ? text.length : text.indexOf('\n', pos) + 1);

function eachId(node, fn) {
  const visit = n => {
    if (ts.isIdentifier(n)) fn(n);
    ts.forEachChild(n, visit);
  };
  visit(node);
}
function isAssigned(id) {
  const p = id.parent;
  if (ts.isBinaryExpression(p) && p.left === id && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
  return (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(p.operator);
}
const line = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

/* ---------- Checking ---------- */

function checkMove() {
  const show = (file, rev = ref) => {
    try {
      return execFileSync('git', ['show', `${rev}:${rel(file)}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r\n/g, '\n');
    } catch {
      return '';
    }
  };
  // The files after the move: the working tree, or the commit being checked.
  const now = file => (commit ? show(file, commit) || null : existsSync(file) ? readText(file).text : null);
  const headFrom = show(FROM), headTo = show(TO);
  if (!headFrom) throw new Error(`${ref}:${rel(FROM)} does not exist`);
  const hf = parse(FROM, headFrom);
  if (now(TO) === null) throw new Error(`${commit ?? 'the working tree'} has no ${rel(TO)}`);
  const to = parse(TO, now(TO));
  const nowFrom = now(FROM) === null ? null : parse(FROM, now(FROM));
  const fails = [];
  let moved = 0, kept = 0;
  const strip = s => s.replace(/\n$/, '');
  const found = s => (headTo.includes(strip(s)) ? 'kept' : headFrom.includes(strip(s)) ? 'moved' : null);

  const covered = []; // [start, end) of <to> accounted for
  for (const stmt of to.statements) {
    if (ts.isImportDeclaration(stmt)) continue;
    const c = chunkOf(to, stmt);
    covered.push([c.start, c.end]);
    const label = c.names.join(', ') || `statement at line ${line(to, stmt)}`;
    const how = found(c.text);
    if (how === 'kept') kept++;
    if (how === 'moved') moved++;
    if (how) continue;
    if (c.names.length === 1 && arrayCandidates(hf, c.names[0]).includes(c.text)) {
      moved++;
      continue;
    }
    const want = expected(hf, c.names[0]);
    if (want === null) {
      if (c.names.length === 1 && /^set[A-Z]/.test(c.names[0])) console.log(`added by hand: ${c.names[0]} (a setter)`);
      else fails.push(`FAIL ${label}: not in ${ref}:${rel(FROM)} or ${ref}:${rel(TO)}`);
      continue;
    }
    const diff = setterDiff(strip(want), strip(c.text));
    if (diff) fails.push(`FAIL ${label}: not verbatim\n${diff}`);
    else moved++;
  }
  // Comments not attached to a statement (section headers, banners) must be in the old text too.
  for (const node of [...to.statements, to.endOfFileToken])
    for (const r of ts.getLeadingCommentRanges(to.text, node.pos) ?? []) {
      if (r.pos === 0 || covered.some(([s, e]) => r.pos >= s && r.end <= e)) continue;
      if (!found(to.text.slice(r.pos, r.end))) fails.push(`FAIL comment at line ${to.getLineAndCharacterOfPosition(r.pos).line + 1}: not in the old files`);
    }
  // Nothing may be left behind twice.
  if (nowFrom) {
    const left = new Set(nowFrom.statements.flatMap(declNames));
    for (const n of to.statements.flatMap(declNames)) if (left.has(n)) fails.push(`FAIL ${n}: still declared in ${rel(FROM)}`);
  }
  fails.forEach(f => console.log(f));
  console.log(`move check: ${moved} moved verbatim, ${kept} already in ${rel(TO)}, ${fails.length} failed`);
  return fails.length ? 1 : 0;
}

// What a declaration named `name` looked like in the old <from>: the statement, or a moved property.
function expected(hf, name) {
  for (const stmt of hf.statements) if (declNames(stmt).includes(name)) return chunkOf(hf, stmt).text;
  for (const stmt of hf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer || !ts.isObjectLiteralExpression(d.initializer)) continue;
      if (d.initializer.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText() === name))
        return propertyAsDecl(name, propertyChunk(hf, d.name.text, name));
    }
  }
  return null;
}

// The ways `text` (an `export const name = [ … ];` in <to>) can have come from an array section of
// the old <from>: one per section header inside a top-level array literal.
function arrayCandidates(hf, name) {
  const out = [];
  for (const stmt of hf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations)
      if (ts.isIdentifier(d.name) && d.initializer && ts.isArrayLiteralExpression(d.initializer))
        for (const h of arraySections(hf, d.initializer)) out.push(arrayAsDecl(name, arrayChunk(hf, d.name.text, h.title)));
  }
  return out;
}

// '' when `now` is `old` with only `x = v;` turned into `setX(v);`; else the differing lines.
function setterDiff(old, now) {
  const a = old.split('\n'), b = now.split('\n');
  const toSetter = l => l.replace(/\b([A-Za-z_$][\w$]*)\s*=\s*([^=;][^;]*);/g, (m, n, v) => `set${cap(n)}(${v});`);
  const bad = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i] || (a[i] !== undefined && toSetter(a[i]) === b[i])) continue;
    bad.push(`  line ${i + 1}: was ${JSON.stringify(a[i] ?? '')}`, `  line ${i + 1}: now ${JSON.stringify(b[i] ?? '')}`);
    if (bad.length >= 6) break;
  }
  return bad.join('\n');
}

process.exitCode = check ? checkMove() : move();