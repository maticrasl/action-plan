/** Claude Code hook after Edit/Write: formats the edited file with Prettier, silently; .prettierignore says which files. */
// Reads the hook's JSON from stdin. Never fails the edit: any problem (a syntax error mid-edit) leaves the file as it is.
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as prettier from 'prettier';

const ROOT = resolve(import.meta.dirname, '..');

try {
  const { tool_input: input } = JSON.parse(readFileSync(0, 'utf8'));
  const file = resolve(input.file_path);
  const rel = relative(ROOT, file);
  if (rel && !rel.startsWith('..')) {
    const info = await prettier.getFileInfo(file, { ignorePath: resolve(ROOT, '.prettierignore') });
    if (!info.ignored && info.inferredParser) {
      const text = readFileSync(file, 'utf8');
      const options = { ...(await prettier.resolveConfig(file)), filepath: file };
      const out = await prettier.format(text, options);
      if (out !== text) writeFileSync(file, out);
    }
  }
} catch {
  // Silent by design (see the first line).
}
