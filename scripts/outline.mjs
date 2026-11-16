/** Prints a file's top-level declarations and section comments with line numbers. */
// usage: npm run outline -- <file> [<file> …]
// Top-level means starting at column 0; regex is enough while the code keeps that layout.
import { readFileSync } from 'node:fs';

const DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+[\w$]+|class\s+[\w$]+|(?:const|let|var)\s+(?:[\w$]+|\{[^}]*\}|\[[^\]]*\])|interface\s+[\w$]+|type\s+[\w$]+|enum\s+[\w$]+)/;
const SECTION = /^\s*\/\*\s*-{3,}\s*(.*?)\s*-{3,}/;

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: npm run outline -- <file> [<file> …]');
  process.exit(2);
}
for (const file of files) {
  if (files.length > 1) console.log(`== ${file}`);
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const width = String(lines.length).length;
  lines.forEach((line, i) => {
    const n = String(i + 1).padStart(width);
    const s = line.match(SECTION);
    if (s) return console.log(`${n}  ---- ${s[1]}`);
    const d = line.match(DECL);
    if (d) console.log(`${n}  ${d[0].replace(/\s+/g, ' ')}`);
  });
}
