/** The toast for a tick with a planned reward (feature 25): the person's own words after "Now:". */
import { t } from '../i18n/index';

// `base` is the toast the tick would show anyway; without a reward it is returned as it is.
export function rewardToast(reward: string | undefined, base = ''): string {
  const r = reward?.trim();
  if (!r) return base;
  const text = /[.!?…]$/.test(r) ? r : `${r}.`;
  return base ? t('reward.toastWith', { base, reward: text }) : t('reward.toast', { reward: text });
}
