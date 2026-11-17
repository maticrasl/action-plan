/** Shared by outline, map and move-decls: parse a source file and find its top-level chunks. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

// Section headers: /* ---------- Name ---------- */ (and the /* ===== */ banners, which are not sections).
export const SECTION = /^\/\*\s*-{3,}\s*(.*?)\s*-{3,}/;
const BANNER = /^\/\*\s*[-=]{3,}/;

// Text with LF line ends, and the line end the file uses on disk (git checks out CRLF on Windows).
export function readText(file) {
  const raw = readFileSync(file, 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), eol: raw.includes('\r\n') ? '\r\n' : '\n' };
}
export function writeText(file, text, eol = existsSync(file) ? readText(file).eol : '\n') {
  writeFileSync(file, eol === '\n' ? text : text.replace(/\n/g, eol));
}

export function parse(fileName, text) {
  const kind = /\.tsx?$/.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
}

const lineStart = (text, pos) => text.lastIndexOf('\n', pos - 1) + 1;
const lineEnd = (text, pos) => {
  const n = text.indexOf('\n', pos);
  return n < 0 ? text.length : n + 1;
};
const blankBetween = (text, a, b) => /\n[ \t]*\n/.test(text.slice(a, b));

// The comments directly above a node (no blank line between), leaving out section headers and banners.
function attachedComments(text, node) {
  const ranges = ts.getLeadingCommentRanges(text, node.pos) ?? [];
  let next = node.getStart();
  const out = [];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    const body = text.slice(r.pos, r.end);
    if (BANNER.test(body) || blankBetween(text, r.end, next) || r.pos === 0) break;
    out.unshift(r);
    next = r.pos;
  }
  return out;
}

// Names a top-level statement declares ([] for one that declares nothing, such as a call).
export function declNames(stmt) {
  if (ts.isVariableStatement(stmt)) return stmt.declarationList.declarations.flatMap(d => bindingNames(d.name));
  if (stmt.name && ts.isIdentifier(stmt.name)) return [stmt.name.text];
  return [];
}
function bindingNames(name) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap(e => (ts.isOmittedExpression(e) ? [] : bindingNames(e.name)));
}

// A top-level statement as the text it takes: its comments, the statement, the rest of its last line.
// `start`/`end` cover whole lines; `text` is that slice (it ends with a newline unless at end of file).
export function chunkOf(sf, stmt) {
  const text = sf.text;
  const comments = attachedComments(text, stmt);
  const first = comments.length ? comments[0].pos : stmt.getStart();
  const start = lineStart(text, first);
  if (text.slice(start, first).trim()) throw new Error(`${sf.fileName}:${line(sf, first)}: does not start its line`);
  let end = stmt.end;
  for (const c of ts.getTrailingCommentRanges(text, end) ?? []) end = c.end;
  end = lineEnd(text, end);
  if (text.slice(stmt.end, end).replace(/\/\/.*|\/\*.*?\*\//g, '').trim()) throw new Error(`${sf.fileName}:${line(sf, stmt.end)}: more code after it on its line`);
  return { stmt, names: declNames(stmt), start, end, text: text.slice(start, end) };
}

// A property of a top-level object literal (`I18N.en`) as a chunk: its comments and `key: value`,
// whole lines from its first line to the end of the value (the comma after it stays).
export function propertyChunk(sf, objName, prop) {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const decl = stmt.declarationList.declarations.find(d => ts.isIdentifier(d.name) && d.name.text === objName);
    if (!decl) continue;
    if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) throw new Error(`${objName} is not an object literal`);
    const p = decl.initializer.properties.find(x => ts.isPropertyAssignment(x) && x.name.getText() === prop);
    if (!p) throw new Error(`${objName} has no property ${prop}`);
    const text = sf.text;
    const comments = attachedComments(text, p);
    const start = lineStart(text, comments.length ? comments[0].pos : p.getStart());
    return {
      node: p,
      start,
      end: p.end,
      indent: text.slice(start, p.getStart()).match(/[ \t]*$/)[0],
      comments: text.slice(start, lineStart(text, p.getStart())),
      value: text.slice(p.initializer.getStart(), p.initializer.end),
    };
  }
  throw new Error(`no top-level ${objName}`);
}
// The text a moved property becomes in its new file.
export const propertyAsDecl = (name, c) => `${c.comments}export const ${name} = ${c.value};\n`;

// Section header comments anywhere in the file, as { pos, title }.
export function sections(sf) {
  const seen = new Set(), out = [];
  const visit = node => {
    for (const r of ts.getLeadingCommentRanges(sf.text, node.pos) ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      const m = sf.text.slice(r.pos, r.end).match(SECTION);
      if (m) out.push({ pos: r.pos, title: m[1] });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf); // the end-of-file token is a child too, so comments at the end count
  return out.sort((a, b) => a.pos - b.pos);
}

export const line = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

// What the outline prints for a declaration: its modifiers, keyword and name, e.g. "export async function load".
export function declHead(sf, stmt) {
  const isDecl =
    ts.isVariableStatement(stmt) || ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) ||
    ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isEnumDeclaration(stmt);
  if (!isDecl) return null;
  const nameEnd = ts.isVariableStatement(stmt) ? stmt.declarationList.declarations[0].name.end : stmt.name?.end;
  if (nameEnd === undefined) return null;
  return sf.text.slice(stmt.getStart(), nameEnd).replace(/\s+/g, ' ');
}
