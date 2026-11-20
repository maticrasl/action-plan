import { describe, expect, test } from 'vitest';
import { allEmojis, COMMON_EMOJIS, NO_EMOJI, planEmoji } from './emoji';

describe('plan emoji', () => {
  test('a plan without one shows the sad face; bad stored values too', () => {
    expect(planEmoji({ emoji: '🏃' })).toBe('🏃');
    expect(planEmoji({})).toBe(NO_EMOJI);
    expect(planEmoji({ emoji: '' })).toBe(NO_EMOJI);
    expect(planEmoji({ emoji: 5 as unknown as string })).toBe(NO_EMOJI);
  });
  test('the full list holds only single emojis, no skin tones, and every common one', () => {
    expect(allEmojis().length).toBeGreaterThan(900);
    expect(allEmojis().every(e => /^\p{Emoji_Presentation}$/u.test(e))).toBe(true);
    expect(allEmojis().some(e => /\p{Emoji_Modifier}/u.test(e))).toBe(false);
    expect(new Set(allEmojis()).size).toBe(allEmojis().length);
    expect(COMMON_EMOJIS.every(e => allEmojis().includes(e))).toBe(true);
    expect(COMMON_EMOJIS.includes(NO_EMOJI)).toBe(true);
  });
});
