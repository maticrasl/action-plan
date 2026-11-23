import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { GUIDE, GUIDE_ACTIONS, GUIDE_FACTS, GUIDE_GROUPS, VIEW_ARTICLE, type Article } from './guide';

const langs = Object.entries(GUIDE) as [string, readonly Article[]][];
const ids = new Set(GUIDE.en.map(a => a.id));
// Every [[id]] link in a body or a review line.
const refsIn = (a: Article) =>
  [a.body, ...(a.review ?? []).map(r => r.text)].flatMap(s => [...s.matchAll(/\[\[([\w-]+)\]\]/g)].map(m => m[1]));

describe('Guide articles', () => {
  test('every language has the same articles, in the same order and groups', () => {
    for (const [, list] of langs) {
      expect(list.map(a => `${a.group}:${a.id}`)).toEqual(GUIDE.en.map(a => `${a.group}:${a.id}`));
      expect(list.map(a => a.action?.do)).toEqual(GUIDE.en.map(a => a.action?.do));
      expect(list.map(a => a.more?.do)).toEqual(GUIDE.en.map(a => a.more?.do));
      expect(list.map(a => (a.related ?? []).join())).toEqual(GUIDE.en.map(a => (a.related ?? []).join()));
      expect(list.map(a => (a.review ?? []).map(r => r.go).join())).toEqual(
        GUIDE.en.map(a => (a.review ?? []).map(r => r.go).join()),
      );
      expect(list.map(a => refsIn(a).join())).toEqual(GUIDE.en.map(a => refsIn(a).join()));
    }
  });

  test('ids are unique, groups and actions known, and every group has articles', () => {
    expect(ids.size).toBe(GUIDE.en.length);
    for (const [, list] of langs)
      for (const a of list) {
        expect(GUIDE_GROUPS, a.id).toContain(a.group);
        if (a.action) expect(GUIDE_ACTIONS, a.id).toContain(a.action.do);
        for (const r of a.review ?? []) expect(GUIDE_ACTIONS, a.id).toContain(r.go);
        expect(a.title.trim(), a.id).not.toBe('');
      }
    for (const g of GUIDE_GROUPS) expect(GUIDE.en.some(a => a.group === g), g).toBe(true);
  });

  test('every link to an article names one that exists', () => {
    for (const [, list] of langs)
      for (const a of list) {
        for (const r of a.related ?? []) expect(ids, `${a.id} related`).toContain(r);
        for (const r of refsIn(a)) expect(ids, `${a.id} body`).toContain(r);
        expect(a.related ?? [], `${a.id} relates to itself`).not.toContain(a.id);
      }
    for (const id of Object.values(VIEW_ARTICLE)) expect(ids).toContain(id);
  });

  // openGuide('') opens the page with nothing open, on purpose.
  test('every openGuide call in the code names an article that exists', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? files(join(dir, e.name)) : /\.ts$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const calls = files('src').flatMap(f =>
      [...readFileSync(f, 'utf8').matchAll(/openGuide\('([^']+)'\)/g)].map(m => [f, m[1]]),
    );
    for (const [f, id] of calls) if (!f.endsWith('.test.ts')) expect(ids, f).toContain(id);
  });

  test('bodies keep to the fixed HTML subset', () => {
    const allowed = /^<\/?(p|ul|ol|li|strong|em)( data-only="(\w+)")?>$/;
    for (const [lang, list] of langs)
      for (const a of list)
        for (const s of [a.body, ...(a.review ?? []).map(r => r.text)])
          for (const tag of s.match(/<[^>]*>/g) ?? []) {
            expect(tag, `${lang} ${a.id}`).toMatch(allowed);
            const fact = tag.match(/data-only="(\w+)"/)?.[1];
            if (fact) expect(GUIDE_FACTS, `${lang} ${a.id}`).toContain(fact);
          }
  });

  test('tags open and close in pairs', () => {
    for (const [lang, list] of langs)
      for (const a of list) {
        const stack: string[] = [];
        for (const [, close, name] of a.body.matchAll(/<(\/?)(\w+)[^>]*>/g)) {
          if (!close) stack.push(name);
          else expect(stack.pop(), `${lang} ${a.id}`).toBe(name);
        }
        expect(stack, `${lang} ${a.id}`).toEqual([]);
      }
  });
});
