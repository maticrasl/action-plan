/** Short messages at the bottom of the screen, with an optional button (such as undo). */
import { $ } from './dom';
import { reachedQueue, showReached } from './reached';
import { rewardToast } from '../core/reward';
import { today } from '../core/dates';
import type { Activity, ISODate } from '../core/model';

// A tick for today of an activity with a reward says it (feature 25), after `base` (a met week),
// and stays twice as long to be read. False when there is nothing to say: the caller's usual message follows.
export function tickToast(a: Activity, base = '', iso: ISODate = today()): boolean {
  if (iso !== today() || !a.reward?.trim()) return false;
  toast(rewardToast(a.reward, base), null, 4400);
  return true;
}

// `action` ({ label, run }) adds a button, and the toast stays longer so there is time to use it.
export function toast(msg: string, action: { label: string; run: () => void } | null = null, ms = 0) {
  const box = $('#toast');
  box.textContent = msg;
  box.classList.toggle('has-action', !!action);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      hideToast();
      action.run();
    });
    box.append(' ', btn);
  }
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(hideToast, ms || (action ? 8000 : 2200));
}
// The timer that hides the toast, kept on the function.
toast.timer = undefined as ReturnType<typeof setTimeout> | undefined;
export function hideToast() {
  clearTimeout(toast.timer);
  $('#toast').classList.remove('show', 'has-action');
  $('#toast').replaceChildren();
  // Goals waiting to be offered come next.
  if (reachedQueue.length) setTimeout(showReached, 250);
}
