/** Getting started as stored: per user, on this device, never synced. */
import { mergeWalk, readWalk, walkOff, type Walk } from '../core/guidance/walk';
import { prefs } from './prefs';

// Also kept in memory, so the card works for the session when storage is full.
let current: Walk | null = null;

export const storedWalk = (): Walk | null => readWalk(prefs.get<unknown>('walk'));

// This session's state with the ticks another tab saved; off when nothing is set.
export function getWalk(): Walk {
  const stored = storedWalk();
  return current ? mergeWalk(current, stored) : stored || walkOff();
}

export function setWalk(w: Walk) {
  current = mergeWalk(w, storedWalk());
  prefs.set('walk', current);
}

// "Start over" takes ticks away, so it is not merged with what is stored.
export function replaceWalk(w: Walk) {
  current = w;
  prefs.set('walk', w);
}

// Another user takes over: nothing of the one before stays in memory.
export function forgetWalk() {
  current = null;
}
