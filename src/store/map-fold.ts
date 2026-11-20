/** Folded Map bands as stored (preference `mapFold`, per user, synced): read, and fold or unfold a band. */
import { readMapFold, type FoldKind, type MapFold } from '../core/map-fold';
import { prefs } from './prefs';

export const hasMapFold = (): boolean => prefs.get<unknown>('mapFold') !== undefined;
export const getMapFold = (): MapFold => readMapFold(prefs.get<unknown>('mapFold'));
export const saveMapFold = (f: MapFold) => prefs.set('mapFold', f);
export const isFolded = (k: FoldKind) => getMapFold().kinds.includes(k);

export function toggleFold(k: FoldKind) {
  const kinds = getMapFold().kinds;
  saveMapFold({
    kinds: kinds.includes(k) ? kinds.filter(x => x !== k) : [...kinds, k],
    at: new Date().toISOString(),
  });
}
