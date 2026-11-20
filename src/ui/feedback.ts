/** Report a problem, suggest a feature: the dialog that shows what leaves the app first, and the version in Settings. */
import { $, esc } from './dom';
import { lang, t } from '../i18n/index';
import { toast } from './toast';
import { isInstalled } from './install';
import { FEEDBACK_REPO } from '../sync/config';
import { syncConfigured, syncConnected, syncState } from '../sync/sync';
import { envLine, feedbackDetails, feedbackUrl, type FeedbackEnv } from '../core/feedback';

declare const __APP_VERSION__: string; // vite.config.ts `define`
export const APP_VERSION = __APP_VERSION__;

const fbDlg = $<HTMLDialogElement>('#feedback');
let kind: 'bug' | 'idea' = 'bug';

export const feedbackEnv = (): FeedbackEnv => ({
  version: APP_VERSION,
  ua: navigator.userAgent,
  width: innerWidth,
  height: innerHeight,
  lang: lang === 'sl' ? 'Slovenian' : 'English',
  installed: isInstalled(),
  sync: !syncConfigured() ? 'not set up' : !syncConnected() ? 'off' : syncState.status === 'paused' ? 'paused' : 'on',
});

// The two rows, for the end of the Guide; none in a copy of the app with no repository to report to.
export const feedbackRows = (repo = FEEDBACK_REPO) =>
  repo
    ? `<section class="guide-fb"><h2>${esc(t('fb.heading'))}</h2><div class="set-actions">
      <button type="button" class="btn small" data-fb="bug">${esc(t('fb.bug'))}</button>
      <button type="button" class="btn small" data-fb="idea">${esc(t('fb.idea'))}</button></div></section>`
    : '';

export function openFeedback(which: 'bug' | 'idea') {
  kind = which;
  $('#feedbackTitle').textContent = t(which === 'bug' ? 'fb.bug' : 'fb.idea');
  $('#feedbackBody').innerHTML =
    which === 'bug'
      ? `<p>${esc(t('fb.bugText'))}</p><p>${esc(t('fb.details'))}</p><code class="fb-details">${esc(feedbackDetails(feedbackEnv()))}</code>`
      : `<p>${esc(t('fb.ideaText'))}</p>`;
  $('#feedbackCopy').hidden = which !== 'bug';
  fbDlg.showModal();
}

const copy = (text: string) =>
  navigator.clipboard?.writeText(text).then(
    () => toast(t('fb.copied')),
    () => undefined, // no clipboard permission: the text is on screen to select by hand
  );

export function listenFeedback() {
  $('#appVersion').textContent = APP_VERSION;
  $('[data-fb-rows]').hidden = !FEEDBACK_REPO;
  $('#versionBtn').addEventListener('click', () => copy(APP_VERSION));
  document.addEventListener('click', e => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-fb]');
    if (row) openFeedback(row.dataset.fb as 'bug' | 'idea');
  });
  fbDlg.addEventListener('click', e => {
    const el = e.target as HTMLElement;
    if (el === fbDlg || el.closest('[data-fb-close]')) fbDlg.close();
  });
  $('#feedbackCopy').addEventListener('click', () => copy(feedbackDetails(feedbackEnv())));
  $('#feedbackOpen').addEventListener('click', () => {
    const env = feedbackEnv();
    open(
      feedbackUrl(FEEDBACK_REPO, kind, env.version, kind === 'bug' ? envLine(env) : undefined),
      '_blank',
      'noopener',
    );
    fbDlg.close();
  });
}
