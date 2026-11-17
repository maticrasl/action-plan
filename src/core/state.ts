/** What is loaded now: the open plan and the visions (phase 4 gives them a store). */
import type { Db, VisionList } from './model';

// main.ts starts it as an empty plan before boot reads the user's own.
export let db: Db;
export function setDb(v: Db) {
  db = v;
}

export let visions: VisionList = { list: [], deleted: {} };
export function setVisions(v: VisionList) {
  visions = v;
}
