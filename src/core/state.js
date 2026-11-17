/** What is loaded now: the open plan and the visions (phase 4 gives them a store). */
// main.ts starts it as an empty plan before boot reads the user's own.
export let db;
export function setDb(v) { db = v; }

export let visions = { list: [], deleted: {} };
export function setVisions(v) { visions = v; }
