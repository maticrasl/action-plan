import { describe, expect, test } from 'vitest';
import { COMMON_EMOJIS, NO_EMOJI, parseEmojis, planEmoji, searchEmojis } from './emoji';
import { EMOJI_NAMES as EN } from './emoji-names.en';
import { EMOJI_NAMES as SL } from './emoji-names.sl';
import { TEMPLATES } from './templates/index';

const en = parseEmojis(EN),
  sl = parseEmojis(SL);
const all = en.map(x => x.e);

describe('plan emoji', () => {
  test('a plan without one shows the sad face; bad stored values too', () => {
    expect(planEmoji({ emoji: '🏃' })).toBe('🏃');
    expect(planEmoji({})).toBe(NO_EMOJI);
    expect(planEmoji({ emoji: '' })).toBe(NO_EMOJI);
    expect(planEmoji({ emoji: 5 as unknown as string })).toBe(NO_EMOJI);
  });
  test('the list: joined emojis and ones like ❤️ in, flags and skin tones out; the same in both languages', () => {
    expect(all.length).toBeGreaterThan(1500);
    expect(all).toContain('👨‍👩‍👧');
    expect(all).toContain('❤️');
    expect(all.some(e => /[\u{1F1E6}-\u{1F1FF}]/u.test(e))).toBe(false);
    expect(all.some(e => /[\u{1F3FB}-\u{1F3FF}]/u.test(e))).toBe(false);
    expect(new Set(all).size).toBe(all.length);
    expect(sl.map(x => x.e)).toEqual(all);
    expect(en.every(x => x.words.trim() && x.group)).toBe(true);
  });
  test('every common and template emoji is in the list', () => {
    expect(COMMON_EMOJIS.filter(e => !all.includes(e))).toEqual([]);
    expect(TEMPLATES.map(tpl => tpl.emoji).filter(e => !all.includes(e))).toEqual([]);
    expect(COMMON_EMOJIS).toContain(NO_EMOJI);
  });
});

describe('searchEmojis', () => {
  const find = (list: typeof en, q: string) => searchEmojis(list, q);
  test('every word must start a word of the name or keywords', () => {
    expect(find(en, 'run')).toContain('🏃');
    expect(find(en, 'red heart')).toContain('❤️');
    expect(find(en, 'heart red')).toContain('❤️');
    expect(find(en, 'ant')).not.toContain('🐘'); // inside "elephant": not a word start
    expect(find(en, 'family girl')).toContain('👨‍👩‍👧');
  });
  test('Slovenian, with or without č š ž, and case does not matter', () => {
    expect(find(sl, 'tek')).toContain('🏃');
    expect(find(sl, 'žalosten')).toContain('🙁');
    expect(find(sl, 'ZALOSTEN')).toContain('🙁');
    expect(find(sl, 'owl')).toContain('🦉'); // English names work too
  });
  test('blank or unknown: nothing', () => {
    expect(find(en, '   ')).toEqual([]);
    expect(find(en, 'qqzzxx')).toEqual([]);
  });
});
