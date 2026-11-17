/** Prints a file's top-level declarations and section comments with line numbers. */
// usage: npm run outline -- <file> [<file> …]
import { declHead, line, parse, readText, sections } from './lib/ast.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: npm run outline -- <file> [<file> …]');
  process.exit(2);
}
for (const file of files) {
  if (files.length > 1) console.log(`== ${file}`);
  const sf = parse(file, readText(file).text);
  const width = String(sf.getLineAndCharacterOfPosition(sf.end).line + 1).length;
  const rows = [
    ...sections(sf).map(s => ({ pos: s.pos, text: `---- ${s.title}` })),
    ...sf.statements.map(s => ({ pos: s.getStart(), text: declHead(sf, s) })).filter(r => r.text),
  ].sort((a, b) => a.pos - b.pos);
  for (const r of rows) console.log(`${String(line(sf, r.pos)).padStart(width)}  ${r.text}`);
}
