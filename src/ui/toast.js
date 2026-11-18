/** Short messages at the bottom of the screen, with an optional button (such as undo). */
import { $ } from './dom';
import { reachedQueue, showReached } from './reached';

// `action` ({ label, run }) adds a button, and the toast stays longer so there is time to use it.
export function toast(msg, action = null) {
  const box = $('#toast');
  box.textContent = msg;
  box.classList.toggle('has-action', !!action);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { hideToast(); action.run(); });
    box.append(' ', btn);
  }
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(hideToast, action ? 8000 : 2200);
}
export function hideToast() {
  clearTimeout(toast.timer);
  $('#toast').classList.remove('show', 'has-action');
  $('#toast').replaceChildren();
  // Goals waiting to be offered come next.
  if (reachedQueue.length) setTimeout(showReached, 250);
}
