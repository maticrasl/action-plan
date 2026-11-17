/** Stored data made safe to use: plans from storage, Drive and files checked and repaired. */
import { isRoutine } from './routines/schedule';

// Ids go into the page's HTML unescaped, so only items with a plain id are kept (a shared file could
// hide markup in one); relationships need plain ids at both ends too.
export const safeId = id => typeof id === 'string' && /^[\w-]{1,64}$/.test(id);

// Nothing may depend on a routine; older plans, and edits meeting in sync, can hold such links.
export const dropRoutineDeps = (rels, activities) => {
  const routines = new Set(activities.filter(isRoutine).map(a => a.id));
  return rels.filter(r => !(r.type === 'depends' && routines.has(r.to)));
};
