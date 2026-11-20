/** Plan emojis: the common ones offered first, the one shown when a plan has none, and search by name. */

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

// One emoji from the generated lists (emoji-names.<lang>.ts); `words` is ready to search:
// lower case, no accents, every word with a space before it.
export interface EmojiEntry {
  e: string;
  group: string;
  words: string;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ');

export function parseEmojis(data: [group: string, rows: string][]): EmojiEntry[] {
  return data.flatMap(([group, rows]) =>
    rows.split('\n').map(row => {
      const [e, words] = row.split('\t');
      return { e, group, words: ' ' + fold(words) };
    }),
  );
}

// The emojis whose name or keywords hold a word starting with each word of the query, in list order.
export function searchEmojis(list: EmojiEntry[], query: string): string[] {
  const parts = fold(query).split(' ').filter(Boolean);
  if (!parts.length) return [];
  return list.filter(x => parts.every(p => x.words.includes(' ' + p))).map(x => x.e);
}
