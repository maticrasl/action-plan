/** Target reached: offers to mark a goal achieved once its target is met. */
import { plans } from '../store/state';
import { prefs } from '../store/prefs';
import { db } from '../core/state';
import type { Goal } from '../core/model';
import { goalReached } from '../core/progress';
import { today } from '../core/dates';
import { $ } from './dom';
import { t } from '../i18n/index';
import { save } from '../store/plans';
import { requestRender } from './render';
import { toast } from './toast';

/* ---------- "Target reached": offer to mark a goal achieved ----------
   After a change, each active goal that has reached its target since it was last offered gets a
   toast with a button to mark it achieved, one goal at a time; `offeredAt` remembers the offer
   until the goal drops below its target again. The first check of a plan on a device only notes
   which goals are there already, so an existing plan does not greet you with a row of toasts. */

export const reachedQueue: string[] = [];

export function offerReached() {
  const key = 'reachedChecked.' + plans.current,
    quiet = !prefs.get(key, false);
  let changed = false;
  db.goals.forEach(g => {
    const reached = goalReached(g);
    if (reached && !g.offeredAt) {
      g.offeredAt = today();
      changed = true;
      if (!quiet && !reachedQueue.includes(g.id)) reachedQueue.push(g.id);
    } else if (!reached && g.offeredAt) {
      delete g.offeredAt;
      changed = true;
    }
  });
  if (quiet) prefs.set(key, true);
  if (reachedQueue.length && !$('#toast').classList.contains('has-action')) setTimeout(showReached, 0);
  return changed;
}

export function showReached() {
  if ($('#toast').classList.contains('has-action')) return;
  let g: Goal | undefined;
  while (reachedQueue.length && !(g = db.goals.find(x => x.id === reachedQueue[0] && goalReached(x))))
    reachedQueue.shift();
  if (!g) return;
  reachedQueue.shift();
  toast(t('reached.text', { name: g.title }), {
    label: t('reached.mark'),
    run: () => {
      g!.status = 'achieved';
      save();
      requestRender();
      toast(t('ctx.statusSet', { s: t('goal.achieved') }));
    },
  });
}
