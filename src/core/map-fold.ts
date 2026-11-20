/** Folded Map bands (preference `mapFold`, per user, synced): reading it safely and merging two copies. */
import type { ISOTime } from './model';

export const FOLD_KINDS = ['vision', 'goal', 'activity', 'state'] as const;
export type FoldKind = (typeof FOLD_KINDS)[number];
// `at`: when it last changed; of two copies the later one wins.
export type MapFold = { kinds: FoldKind[]; at: ISOTime | '' };

export function readMapFold(raw: unknown): MapFold {
  const r = raw as Partial<MapFold> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.kinds)) return { kinds: [], at: '' };
  return {
    kinds: FOLD_KINDS.filter(k => r.kinds!.includes(k)),
    at: typeof r.at === 'string' ? r.at : '',
  };
}

export const mergeMapFold = (a?: MapFold, b?: MapFold): MapFold => (!a ? b! : !b ? a : b.at > a.at ? b : a);
