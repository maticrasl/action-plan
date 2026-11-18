/** What storage and sync tell the screen: a minimal typed emitter, wired in main.ts. */

// Listeners run at once, in the order they were added, so an emit stands exactly where the call was.
type Events = {
  saving: void; // save() is about to stamp and write the open plan
  saved: void; // a plan or the visions were written
  plansChanged: void; // another plan opened, or the open one got new items
  storeReplaced: boolean; // a sync stored its result; true if the open plan or the visions changed
  storageError: void; // a write did not fit
  syncChanged: void; // the sync status changed
};

const listeners = new Map<keyof Events, ((p: never) => void)[]>();

export function on<K extends keyof Events>(name: K, fn: (p: Events[K]) => void): void {
  listeners.set(name, [...(listeners.get(name) ?? []), fn]);
}

export function emit<K extends keyof Events>(name: K, ...[p]: Events[K] extends void ? [] : [Events[K]]): void {
  listeners.get(name)?.forEach(fn => (fn as (p: Events[K]) => void)(p as Events[K]));
}
