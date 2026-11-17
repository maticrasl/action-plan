import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { emptyDb } from './model';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../../tests/fixtures');

// Every stored plan, plan list and vision list in the fixtures (rich.storage.json has one of every
// field), with the type it must satisfy. The single-plan version's key (actionplan.v1) is left out:
// it is only read to be migrated.
function storedValues() {
  const out: { where: string; type: string; json: string }[] = [];
  const typeOf = (key: string) =>
    /^actionplan\.(u\.[^.]+\.)?plan\./.test(key)
      ? 'Db'
      : /\.plans$/.test(key)
        ? 'PlanList'
        : /\.visions$/.test(key)
          ? 'VisionList'
          : null;
  for (const file of readdirSync(fixtures).filter(f => f.endsWith('.storage.json'))) {
    const storage: Record<string, string> = JSON.parse(readFileSync(join(fixtures, file), 'utf8'));
    for (const [key, json] of Object.entries(storage)) {
      const type = typeOf(key);
      if (type) out.push({ where: `${file} ${key}`, type, json });
    }
  }
  return out;
}

// Type-checks `<json> satisfies <type>` for each value, as object literals, so a field the types
// do not know is an error too. Returns the compiler's messages.
function typeCheck(values: { where: string; type: string; json: string }[]) {
  const file = join(here, '__stored__.ts');
  const source =
    `import type { Db, PlanList, VisionList } from './model';\n` +
    values.map((v, i) => `// ${v.where}\nexport const v${i} = ${v.json} satisfies ${v.type};\n`).join('');
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts'],
    types: [],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile;
  host.getSourceFile = (name, lang, ...rest) =>
    name === file.replaceAll('\\', '/') || name === file
      ? ts.createSourceFile(name, source, lang)
      : read(name, lang, ...rest);
  const program = ts.createProgram([file], options, host);
  // Line 1 is the import; each value takes two lines, its comment and itself.
  return ts.getPreEmitDiagnostics(program).map(d => {
    const line = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line : -1;
    const where = values[Math.floor((line - 1) / 2)]?.where ?? 'model.ts';
    return `${where}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
  });
}

describe('the stored shapes', () => {
  test('every plan, plan list and vision list in the fixtures fits the types', () => {
    const values = storedValues();
    expect(values.filter(v => v.type === 'Db').length).toBeGreaterThan(5);
    expect(typeCheck(values)).toEqual([]);
  });

  test('the types refuse a field they do not know and a wrong status', () => {
    const bad = [
      {
        where: 'unknown field',
        type: 'Db',
        json: '{"goals":[{"id":"g","title":"x","status":"active","colour":"red"}],"states":[],"activities":[],"relations":[],"deleted":{}}',
      },
      {
        where: 'wrong status',
        type: 'Db',
        json: '{"goals":[],"states":[],"activities":[{"id":"a","title":"x","description":"","status":"started"}],"relations":[],"deleted":{}}',
      },
    ];
    expect(typeCheck(bad)).toHaveLength(2);
  });

  test('emptyDb: a new, empty plan each time', () => {
    const a = emptyDb();
    expect(a).toEqual({ goals: [], states: [], activities: [], relations: [], deleted: {} });
    expect(emptyDb()).not.toBe(a);
  });
});
