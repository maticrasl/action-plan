/** The Guide's text rules: live parts of an article, links between articles, and search without case or diacritics. */
import type { GuideFact } from '../../i18n/guide';

// Lower case, without diacritics: č, š and ž match c, s and z.
export const foldText = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Whether every word of the query occurs in the text (as a word or part of one). A blank query matches all.
export function matchesQuery(text: string, query: string): boolean {
  const hay = foldText(text);
  return foldText(query)
    .split(/\s+/)
    .filter(Boolean)
    .every(w => hay.includes(w));
}

// An article's HTML as words only.
export const plainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Each [[id]] link drawn by `draw` (a link with the article's title, or the title alone for search).
export const withRefs = (html: string, draw: (id: string) => string) =>
  html.replace(/\[\[([\w-]+)\]\]/g, (_, id: string) => draw(id));

// Drops each <p> or <ul> marked data-only="<fact>" whose fact does not hold now.
export const liveBody = (html: string, facts: Partial<Record<GuideFact, boolean>>) =>
  html.replace(/<(p|ul) data-only="(\w+)">[\s\S]*?<\/\1>/g, (el, _tag, fact: GuideFact) => (facts[fact] ? el : ''));
