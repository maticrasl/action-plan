/** The frame the reviews share (feature 14): the tab and period shown, the page head, numbered sections, text drafts and finishing. */
import { esc } from '../ui/dom';
import { t, type TextKey } from '../i18n/index';
import { prefs } from '../store/prefs';
import { addReview, journal, updateReview } from '../store/journal';
import { latestReview } from '../core/reviews';
import { todaySources } from './focus';
import type { Review } from '../core/journal';

export type ReviewTab = 'week' | 'month' | 'year' | 'log' | 'past';
export const TABS: ReviewTab[] = ['week', 'month', 'year', 'log', 'past'];
export const REVIEW_TEXT_MAX = 2000;

// What the view shows; for this visit only. A period left empty is the one the calendar picks.
export const reviewView = {
  tab: 'week' as ReviewTab,
  period: {} as Partial<Record<Review['kind'], string>>,
  editing: '' as string, // the period whose finished review has its text open again
  open: '' as string, // the past review opened in "Past reviews"
};

// Every plan but a sample, the open one first (as Today reads them).
export const reviewSources = () => todaySources();

export const tabsHtml = () =>
  `<div class="chips rv-tabs" role="group" aria-label="${esc(t('review.tabs'))}">${TABS.map(
    k =>
      `<button type="button" class="chip ${reviewView.tab === k ? 'active' : ''}" data-review="tab" data-v="${k}" aria-pressed="${reviewView.tab === k}">${t(`review.tab.${k}` as TextKey)}</button>`,
  ).join('')}</div>`;

// The title with arrows to earlier and later periods; there is nothing to review after the current one.
export function headHtml(title: string, canNext: boolean) {
  const arrow = (dir: number, off = false) => {
    const tip = esc(t(dir < 0 ? 'review.prev' : 'review.next'));
    return `<button type="button" class="icon-btn rv-arrow" data-review="shift" data-dir="${dir}" title="${tip}" aria-label="${tip}" ${off ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg></button>`;
  };
  return `<div class="rv-head"><h2 class="rv-title">${esc(title)}</h2><span class="rv-arrows">${arrow(-1)}${arrow(1, !canNext)}</span></div>`;
}

export const sectionHtml = (n: number, title: string, lead: string, body: string) =>
  `<section class="rv-sec"><h3 class="rv-h"><span class="rv-n" aria-hidden="true">${n}</span>${esc(title)}</h3>${lead ? `<p class="rv-lead">${esc(lead)}</p>` : ''}${body}</section>`;

/* ---------- Text fields: a draft on this device (per user) until the review is finished ---------- */

const draftKey = (period: string) => `reviewDraft.${period}`;
export const draftOf = (period: string): Record<string, string> => {
  const d = prefs.get<unknown>(draftKey(period), {});
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, string>) : {};
};
export function saveDraft(period: string, name: string, value: string) {
  prefs.set(draftKey(period), { ...draftOf(period), [name]: value.slice(0, REVIEW_TEXT_MAX) });
}
export const clearDraft = (period: string) => prefs.set(draftKey(period), {});

// The text a field shows: the draft while typing, else what the finished review kept.
export const textOf = (period: string, name: string, kept?: Review) =>
  draftOf(period)[name] ?? (typeof kept?.answers[name] === 'string' ? (kept.answers[name] as string) : '');

// A text field of a review; read-only once finished, until Edit.
export const textField = (period: string, name: string, label: string, kept: Review | undefined, locked: boolean) =>
  `<label class="field rv-field"><span class="label">${esc(label)}</span><textarea rows="2" maxlength="${REVIEW_TEXT_MAX}" data-rv-text="${esc(name)}" data-period="${esc(period)}"${locked ? ' readonly' : ''}>${esc(textOf(period, name, kept))}</textarea></label>`;

export const finishedOf = (kind: Review['kind'], period: string) => latestReview(journal.reviews, kind, period);

// Finish: a new review, or the one already finished for that period updated (no second copy).
export function storeReview(kind: Review['kind'], period: string, answers: Record<string, unknown>): Review {
  const kept = finishedOf(kind, period);
  if (kept) updateReview(kept.id, { answers });
  clearDraft(period);
  reviewView.editing = '';
  return kept || addReview({ kind, period, doneAt: new Date().toISOString(), answers });
}

// The end of a review: Finish, or "Done on" with Edit (and Save while editing).
export function finishHtml(kept: Review | undefined, period: string, fmt: (iso: string) => string) {
  if (!kept)
    return `<p class="rv-finish"><button type="button" class="btn primary" data-review="finish">${t('review.finish')}</button></p>`;
  const editing = reviewView.editing === period;
  return `<p class="rv-finish rv-done"><span>${esc(t('review.doneOn', { date: fmt(kept.doneAt!) }))}</span>${
    editing
      ? `<button type="button" class="btn primary" data-review="finish">${t('review.save')}</button>`
      : `<button type="button" class="btn ghost" data-review="edit">${t('review.edit')}</button>`
  }</p>`;
}
