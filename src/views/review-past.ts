/** Past reviews (feature 14): every finished review, newest first, and one opened to read again, with Delete. */
import { esc } from '../ui/dom';
import { t, tp, type TextKey } from '../i18n/index';
import { fmtDay } from '../core/dates';
import { addDays } from '../core/routines/schedule';
import { weekMonday } from '../core/reviews';
import { deleteReview, journal } from '../store/journal';
import { toast } from '../ui/toast';
import { requestRender as render } from '../ui/render';
import { fmtRange } from './routines';
import { reviewView } from './review-frame';
import type { Review } from '../core/journal';
import type { DoneCounts } from '../core/done-log';

// The words a stored review was answered with, in the order they were asked.
const TEXTS: Record<Review['kind'], [string, TextKey][]> = {
  week: [
    ['well', 'review.well'],
    ['hard', 'review.hard'],
  ],
  month: [['sentence', 'review.monthAbout']],
  year: [
    ['glad', 'review.glad'],
    ['differently', 'review.differently'],
    ['next', 'review.nextYear'],
  ],
};

export function reviewTitle(r: Review) {
  if (r.kind === 'week') {
    const mon = weekMonday(r.period);
    return t('review.week.title', { range: fmtRange(mon, addDays(mon, 6)) });
  }
  if (r.kind === 'month')
    return t('review.month.title', { month: fmtDay(`${r.period}-01`, { month: 'long', year: 'numeric' }) });
  return t('review.year.title', { year: r.period });
}
const doneDate = (r: Review) => fmtDay(r.doneAt!.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' });
const finished = () =>
  journal.reviews
    .filter(r => r.doneAt)
    .sort((a, b) => b.doneAt!.localeCompare(a.doneAt!) || b.period.localeCompare(a.period));

export function renderPastReviews() {
  const open = journal.reviews.find(r => r.id === reviewView.open && r.doneAt);
  if (open) return pastReview(open);
  const list = finished();
  if (!list.length) return `<div class="empty">${t('review.past.empty')}</div>`;
  return `<ul class="rv-past">${list
    .map(
      r =>
        `<li><button type="button" class="rv-past-open" data-review="past" data-id="${esc(r.id)}"><span class="tag">${t(`review.kind.${r.kind}`)}</span><span class="grow">${esc(reviewTitle(r))}</span><small>${esc(t('review.past.done', { date: doneDate(r) }))}</small></button></li>`,
    )
    .join('')}</ul>`;
}

// One finished review, read-only: what was written and the facts kept with it.
function pastReview(r: Review) {
  const a = r.answers;
  const text = (k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : '');
  const texts = TEXTS[r.kind]
    .filter(([k]) => text(k))
    .map(([k, label]) => `<h4 class="rv-sub">${esc(t(label))}</h4><p class="rv-text">${esc(text(k))}</p>`)
    .join('');
  const s = a.stats as DoneCounts | undefined;
  const stats = s
    ? [
        s.goals && tp('review.goals', s.goals),
        tp('log.steps', s.steps),
        tp('log.ticks', s.routineDays),
        tp('log.values', s.values),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const focus = (a.focus as { title?: string } | null)?.title;
  const choices = (kind: 'goals' | 'visions', prefix: string) =>
    Object.values((a[kind] as Record<string, { title: string; choice: string }>) || {}).map(c =>
      t('review.past.choice', { title: c.title, choice: t(`${prefix}.${c.choice}` as TextKey) }),
    );
  const made = [...choices('goals', 'review.choice'), ...choices('visions', 'review.vchoice')];
  return `<article class="rv-page rv-past-one">
    <div class="rv-head"><h2 class="rv-title">${esc(reviewTitle(r))}</h2><button type="button" class="btn ghost small" data-review="pastBack">${t('review.past.back')}</button></div>
    <p class="meta">${esc(t('review.past.done', { date: doneDate(r) }))}</p>
    ${stats ? `<p class="rv-counts">${esc(stats)}</p>` : ''}
    ${texts}
    ${focus ? `<p>${esc(t('review.past.focus', { title: focus }))}</p>` : ''}
    ${made.length ? `<ul class="rv-work">${made.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    <p class="rv-actions"><button type="button" class="btn ghost" data-review="pastDelete" data-id="${esc(r.id)}">${t('review.past.delete')}</button></p>
  </article>`;
}

// Deleting is remembered in the journal, so a sync does not bring the review back.
export function deletePast(id: string) {
  if (!confirm(t('review.past.deleteConfirm'))) return;
  deleteReview(id);
  reviewView.open = '';
  toast(t('review.past.deleted'));
  render();
}
