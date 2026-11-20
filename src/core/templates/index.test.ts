import { expect, test } from 'vitest';
import { isNum } from '../util';
import { TEMPLATES, TPL_AREAS, TPL_LANGS } from './index';

// Ported from tests/more.js "templates: data is complete in both languages and every link names an item of
// the right kind".

type Fields = Record<string, unknown> & { k: string; title?: unknown; list?: unknown };
const TEXT = ['name', 'about', 'title', 'specific', 'metric', 'unit', 'achievable', 'relevant', 'description'];
// A text is one string for every language, or one per language, none of them blank.
const textOk = (v: unknown) =>
  typeof v === 'string'
    ? !!v.trim()
    : Array.isArray(v) && v.length === TPL_LANGS.length && v.every(x => typeof x === 'string' && !!x.trim());

test('every template is complete in both languages and every link names an item of the right kind', () => {
  const seen = new Set<string>();
  for (const tpl of TEMPLATES) {
    expect(
      !seen.has(tpl.id) && TPL_AREAS.includes(tpl.area) && ['starter', 'ambitious'].includes(tpl.level),
      `${tpl.id}: id, area, level`,
    ).toBe(true);
    seen.add(tpl.id);
    expect(Array.isArray(tpl.name) && Array.isArray(tpl.about), `${tpl.id}: name and about in every language`).toBe(
      true,
    );
    const kinds: Record<string, string> = {};
    for (const [coll, kind] of [
      ['goals', 'goal'],
      ['states', 'state'],
      ['activities', 'activity'],
    ] as const) {
      for (const x of tpl[coll] as Fields[]) {
        expect(x.k && !kinds[x.k], `${tpl.id}: key ${x.k} unique`).toBeTruthy();
        kinds[x.k] = kind;
        expect(x.title, `${tpl.id}.${x.k}: title`).toBeTruthy();
        for (const f of TEXT)
          if (x[f] !== undefined)
            expect(textOk(x[f]), `text ${tpl.id}.${x.k}.${f}: ${JSON.stringify(x[f])}`).toBe(true);
        if (x.list !== undefined) {
          expect(kind === 'activity' && Array.isArray(x.list) && x.list.length, `${tpl.id}.${x.k}: list`).toBeTruthy();
          (x.list as unknown[]).forEach((v, i) => expect(textOk(v), `text ${tpl.id}.${x.k}.list.${i}`).toBe(true));
        }
      }
    }
    expect(textOk(tpl.name), `${tpl.id}.name`).toBe(true);
    expect(textOk(tpl.about), `${tpl.id}.about`).toBe(true);
    const links = { sub: 'goal', deps: null, measures: 'goal', goals: 'goal', improves: 'state', parent: 'activity' };
    for (const x of [...tpl.goals, ...tpl.states, ...tpl.activities] as Fields[])
      for (const [f, kind] of Object.entries(links))
        for (const k of ([] as string[]).concat((x[f] as string | string[] | undefined) || []))
          expect(kinds[k], `${tpl.id}.${x.k}.${f} → ${k}`).toBe(kind || kinds[x.k]);
    for (const g of tpl.goals as unknown as Fields[])
      expect(
        !!g.progress || (isNum(g.baseline) && isNum(g.target) && g.baseline !== g.target),
        `${tpl.id}.${g.k}: baseline and target`,
      ).toBe(true);
  }
  expect(TEMPLATES.length).toBeGreaterThan(0);
});

test('every template has its own emoji', () => {
  expect(new Set(TEMPLATES.map(tpl => tpl.emoji)).size).toBe(TEMPLATES.length);
});
