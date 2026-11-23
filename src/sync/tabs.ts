/** Another tab saved plans or visions: this tab merges what it stored with its own copy, so neither tab's edits are lost. */
import { userKey, userStorage } from '../store/users';
import { PLANS_KEY, planKey, readPlan } from '../store/plans';
import { VISIONS_KEY } from '../store/visions';
import { normalizeVisions } from '../core/visions';
import { mergeStores, type Store } from '../core/merge';
import type { PlanList } from '../core/model';
import { applyStore, localStore } from './sync';

// What the other tab left in storage: the plan list, every plan in it, the visions.
function storedStore(): Store | null {
  try {
    const list = JSON.parse(userStorage.getItem(PLANS_KEY) as string) as PlanList | null;
    if (!Array.isArray(list?.list)) return null;
    const visions = userStorage.getItem(VISIONS_KEY);
    return {
      plans: { list: list.list, deleted: list.deleted || {} },
      data: Object.fromEntries(list.list.map(p => [p.id, readPlan(p.id)])),
      ...(visions && { visions: normalizeVisions(JSON.parse(visions)) }),
    };
  } catch (e) {
    return null;
  }
}

const watched = (key: string) =>
  key === userKey(PLANS_KEY) || key === userKey(VISIONS_KEY) || key.startsWith(userKey(planKey('')));

// The stored copy goes first, so its order wins and the other tab's merge of the result changes
// nothing: the two tabs settle instead of rewriting each other.
export function takeOtherTab(key: string | null) {
  if (!key || !watched(key)) return;
  const stored = storedStore();
  if (stored) applyStore(mergeStores(stored, localStore()));
}
