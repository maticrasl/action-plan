/** The journal: personal data that belongs to no plan (reviews, discovery sessions, this week's focus); checking and merging it. */
import { safeId } from './normalize';
import { mergeDeleted, newerOf, stamp } from './merge';
import type { IdSet, ISODate, ISOTime } from './model';

/* Shape and rules: docs/features/00-foundation.md part 1. The store does not look inside
   `answers` or `made`; the features that own them do (14 reviews, 01 discovery). */

export interface Review {
  id: string;
  kind: 'week' | 'month' | 'year';
  period: string; // '2026-W47', '2026-11' or '2026'
  doneAt?: ISOTime;
  answers: Record<string, unknown>;
  updatedAt?: ISOTime;
}
export interface Session {
  id: string;
  exercise: string;
  date: ISODate;
  done: boolean;
  answers: Record<string, unknown>;
  made: unknown[];
  updatedAt?: ISOTime;
}
export interface Focus {
  week: ISODate; // the Monday of the week
  plan: string;
  item: string;
  at: ISOTime;
}
export interface Journal {
  reviews: Review[];
  sessions: Session[];
  focus?: Focus;
  deleted: IdSet<ISOTime>;
}

const KINDS = ['week', 'month', 'year'];
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const items = (x: unknown) => (Array.isArray(x) ? x.filter(i => isObj(i) && safeId(i.id)) : []);
// `answers` must be an object; a wrong one becomes empty rather than dropping the item.
const withAnswers = <T extends Record<string, unknown>>(x: T) => (isObj(x.answers) ? x : { ...x, answers: {} });

export function normalizeJournal(input: unknown): Journal {
  const raw = isObj(input) ? input : {};
  const out: Journal = {
    reviews: items(raw.reviews)
      .filter(r => KINDS.includes(r.kind as string) && typeof r.period === 'string')
      .map(withAnswers) as unknown as Review[],
    sessions: items(raw.sessions)
      .filter(s => typeof s.exercise === 'string' && typeof s.date === 'string')
      .map(s => ({
        ...withAnswers(s),
        done: s.done === true,
        made: Array.isArray(s.made) ? s.made : [],
      })) as unknown as Session[],
    deleted: isObj(raw.deleted) ? (raw.deleted as IdSet<ISOTime>) : {},
  };
  const f = raw.focus;
  if (isObj(f) && typeof f.week === 'string' && safeId(f.plan) && safeId(f.item) && typeof f.at === 'string')
    out.focus = f as unknown as Focus;
  return out;
}

// By id the newer version wins; a deletion later than an item's last change removes it.
function mergeItems<T extends { id: string; updatedAt?: ISOTime }>(a: T[], b: T[], deleted: IdSet<ISOTime>): T[] {
  const byId = new Map<string, T>();
  [...a, ...b].forEach(x => {
    const cur = byId.get(x.id);
    byId.set(x.id, cur ? newerOf(cur, x) : x);
  });
  return [...byId.values()]
    .filter(x => !(deleted[x.id] && deleted[x.id] >= stamp(x)))
    .sort((x, y) => x.id.localeCompare(y.id)); // the same order on every device
}

export function mergeJournal(rawA: unknown, rawB: unknown): Journal {
  const a = normalizeJournal(rawA),
    b = normalizeJournal(rawB);
  const deleted = mergeDeleted(a.deleted, b.deleted);
  const out: Journal = {
    reviews: mergeItems(a.reviews, b.reviews, deleted),
    sessions: mergeItems(a.sessions, b.sessions, deleted),
    deleted,
  };
  // The later one; on a tie the larger by content, so both devices keep the same.
  const later = (x: Focus, y: Focus) => (y.at !== x.at ? y.at > x.at : JSON.stringify(y) > JSON.stringify(x)) ? y : x;
  const focus = a.focus && b.focus ? later(a.focus, b.focus) : a.focus || b.focus;
  if (focus) out.focus = focus;
  return out;
}
