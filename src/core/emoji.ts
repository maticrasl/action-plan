/** Plan emojis: the common ones offered first, every single emoji, and the one shown when a plan has none. */

export const NO_EMOJI = '🙁';

export const planEmoji = (p: { emoji?: string }) => (typeof p.emoji === 'string' && p.emoji) || NO_EMOJI;

// Picked to cover what plans are usually about: health, work, money, learning, home, people, faith, fun.
// prettier-ignore
export const COMMON_EMOJIS = [
  '🎯', '🏃', '💪', '🧘', '🚴', '🏊', '⚽', '🥗', '🍳', '😴',
  '💰', '💼', '📈', '💻', '📚', '🎓', '🧠', '💬', '🎨', '🎵',
  '🏠', '🔨', '🧹', '🌱', '🌻', '🐶', '👪', '💑', '💖', '🙏',
  '⛪', '🌍', '🚗', '📷', '🎮', '🎉', '⭐', '🔥', '🙂', NO_EMOJI,
];

// Every emoji that is one code point and drawn as an emoji by default, in Unicode order (built on first use).
// shortcut: no flags, skin tones or joined emojis (👨‍👩‍👧); add a data list if users ask for them.
let all: string[] | null = null;
export function allEmojis(): string[] {
  if (all) return all;
  all = [];
  for (const [from, to] of [
    [0x231a, 0x2bff],
    [0x1f000, 0x1faff],
  ])
    for (let c = from; c <= to; c++) {
      const e = String.fromCodePoint(c);
      if (/^\p{Emoji_Presentation}$/u.test(e) && !/\p{Emoji_Modifier}/u.test(e)) all.push(e);
    }
  return all;
}
