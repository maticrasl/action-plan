/** Moves page-test steps between suite files byte for byte, and lists what each statement of a suite uses. */
// usage: npm run move-steps -- <from> <to> <what> [<what> …]
//        npm run move-steps -- --drop <from> <what> [<what> …]   (a step replaced by unit tests)
//        npm run move-steps -- --list <file>
//   <what>     a step, by the start of its name; or line:<n>, the suite statement whose code starts on line n;
//              or <a>..<b>, every statement from the one <a> names to the one <b> names; or top:<n>, the
//              file's top-level statement (outside the suite) whose code starts on line n
//   <to>       a tests/browser file; made as `suite(async () => { … });` with a purpose line if missing.
//              Moved statements go to the end of its suite body, in source order, with their comments.
//   --top      the statements go to the end of <to> at its top level (the harness), each line losing the
//              suite body's indent; <to> must exist
//   --list     every statement in the suite body: its lines, the step name or the names it declares, and
//              the names it uses that other statements of the body declare
// The suite body is the function passed to suite() in a browser file; elsewhere the function whose body
// holds the `await step(…)` calls (more.js: moreTests; test.js: the async IIFE).
import { existsSync } from 'node:fs';
import ts from 'typescript';
import { chunkOf, declNames, line, parse, readText, writeText } from './lib/ast.mjs';

const args = process.argv.slice(2);

// The statements of the suite body, as chunks with the step name (or null) and what they declare/use.
function suiteOf(file) {
  const { text } = readText(file);
  const sf = parse(file, text);
  let body = null;
  const isFn = n => (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.body && ts.isBlock(n.body);
  const visit = node => {
    if (body) return;
    if (isFn(node) && node.body.statements.some(stepName)) return void (body = node.body);
    ts.forEachChild(node, visit);
  };
  // A browser file: the function passed to suite(); otherwise the one that holds the steps.
  for (const s of sf.statements) {
    const call = ts.isExpressionStatement(s) && s.expression;
    if (call && ts.isCallExpression(call) && call.expression.getText() === 'suite' && isFn(call.arguments[0]))
      body = call.arguments[0].body;
  }
  visit(sf);
  if (!body) throw new Error(`${file}: no suite body (a function with await step(…) calls)`);
  const chunks = body.statements.map(stmt => {
    const c = chunkOf(sf, stmt);
    return { ...c, step: stepName(stmt), from: line(sf, stmt.getStart()), to: line(sf, stmt.end), used: usedNames(stmt) };
  });
  return { sf, text, body, chunks };
}

// `await step('name', …)` → 'name' (a template's raw text, a variable's name in brackets); otherwise null.
function stepName(stmt) {
  if (!ts.isExpressionStatement(stmt) || !ts.isAwaitExpression(stmt.expression)) return null;
  const call = stmt.expression.expression;
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== 'step') return null;
  const a = call.arguments[0];
  if (ts.isStringLiteralLike(a)) return a.text;
  if (ts.isTemplateExpression(a)) return a.getText().slice(1, -1);
  return `[${a.getText()}]`;
}

function usedNames(stmt) {
  const out = new Set();
  const visit = n => {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isProp = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n);
      if (!isProp) out.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(stmt);
  return out;
}

function list(file) {
  const { chunks } = suiteOf(file);
  const declared = new Map();
  chunks.forEach((c, i) => c.step === null && declNames(c.stmt).forEach(n => declared.set(n, i)));
  for (const [i, c] of chunks.entries()) {
    const own = new Set(c.step === null ? declNames(c.stmt) : []);
    const uses = [...c.used].filter(n => declared.has(n) && !own.has(n));
    const what = c.step !== null ? `step ${c.step}` : own.size ? `decl ${[...own].join(', ')}` : `code ${c.text.trim().split('\n')[0].slice(0, 60)}`;
    console.log(`${String(i).padStart(3)} ${c.from}-${c.to}  ${what}${uses.length ? `  [uses ${uses.join(', ')}]` : ''}`);
  }
}

// Which chunks a <what> names, as indices.
function pick(chunks, what) {
  const find = w => {
    const m = /^line:(\d+)$/.exec(w);
    const hits = m
      ? chunks.flatMap((c, i) => (c.from === Number(m[1]) ? [i] : []))
      : chunks.flatMap((c, i) => (c.step !== null && c.step.startsWith(w) ? [i] : []));
    if (hits.length !== 1) throw new Error(`"${w}" names ${hits.length} statements`);
    return hits[0];
  };
  const range = what.split('..');
  if (range.length === 2) {
    const [a, b] = range.map(find);
    if (b < a) throw new Error(`"${what}": the end comes before the start`);
    return Array.from({ length: b - a + 1 }, (_, k) => a + k);
  }
  return [find(what)];
}

function move(from, to, whats, top) {
  const src = suiteOf(from);
  const tops = whats.filter(w => w.startsWith('top:'));
  const picked = [...new Set(whats.filter(w => !tops.includes(w)).flatMap(w => pick(src.chunks, w)))];
  const topChunks = tops.map(w => {
    const stmt = src.sf.statements.find(s => line(src.sf, s.getStart()) === Number(w.slice(4)));
    if (!stmt) throw new Error(`"${w}" names no top-level statement`);
    return { ...chunkOf(src.sf, stmt), step: null, from: line(src.sf, stmt.getStart()), to: line(src.sf, stmt.end) };
  });
  const moved = [...topChunks, ...picked.map(i => src.chunks[i])].sort((a, b) => a.start - b.start);
  if (to === null) {
    // --drop: nowhere to write
  } else if (top) {
    const indent = /^[ \t]*/.exec(src.chunks[0].text)[0];
    const dedent = t => t.replace(new RegExp(`^${indent}`, 'gm'), '');
    const { text } = readText(to);
    writeText(to, text + (text.endsWith('\n\n') ? '' : '\n') + moved.map(c => dedent(c.text)).join(''));
  } else if (!existsSync(to)) {
    writeText(to, `/** Page tests: ${to.replace(/^.*[\\/]/, '').replace(/\.js$/, '')}. */\nsuite(async () => {\n  await step('placeholder', () => {});\n});\n`);
    const dst = suiteOf(to);
    const ph = dst.chunks[0];
    writeText(to, dst.text.slice(0, ph.start) + moved.map(c => c.text).join('') + dst.text.slice(ph.end));
  } else {
    const dst = suiteOf(to);
    const at = dst.chunks.length ? dst.chunks.at(-1).end : dst.body.getStart() + 2;
    const gap = dst.chunks.length ? '\n' : '';
    writeText(to, dst.text.slice(0, at) + gap + moved.map(c => c.text).join('') + dst.text.slice(at));
  }
  // Cut from the source, the blank line after each chunk included, from the end so offsets hold.
  let text = src.text;
  for (const c of [...moved].reverse()) {
    let end = c.end;
    if (text.slice(end).startsWith('\n')) end += 1;
    text = text.slice(0, c.start) + text.slice(end);
  }
  writeText(from, text);
  for (const c of moved) console.log(`${to === null ? 'dropped' : 'moved'} ${from}:${c.from}-${c.to} ${c.step !== null ? `step ${c.step}` : declNames(c.stmt).join(', ') || 'code'}`);
}

const top = args.includes('--top');
if (top) args.splice(args.indexOf('--top'), 1);
if (args[0] === '--list') list(args[1]);
else if (args[0] === '--drop' && args.length >= 3) move(args[1], null, args.slice(2), false);
else if (args.length >= 3) move(args[0], args[1], args.slice(2), top);
else {
  console.error('usage: npm run move-steps -- <from> <to> <what> [<what> …] | --list <file>');
  process.exit(2);
}
