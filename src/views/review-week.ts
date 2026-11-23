/** The weekly review (feature 14 A): what you did, measure, look back, fix the plan, next week's one thing. */
import { esc } from '../ui/dom';
import { t, tp, type TextKey } from '../i18n/index';
import { fmtDate, fmtDay, today } from '../core/dates';
import { addDays, weekday, type Routine } from '../core/routines/schedule';
import { doneLog, weekCounts, type DoneCounts } from '../core/done-log';
import { asOpen, type PlanSource } from '../core/today';
import { fixLines, focusWeek, forgotten, reviewWeek, unmeasured, weekPeriod } from '../core/reviews';
import { fmtNum } from '../core/util';
import { withUnit } from '../ui/text';
import { visions } from '../core/state';
import { journal } from '../store/journal';
import { markSeen } from '../store/seen';
import { toast } from '../ui/toast';
import { hasItems, planName, row } from './focus';
import { fmtRange, routineWeek } from './routines';
import { weeks } from './review';
import {
  finishHtml,
  finishedOf,
  headHtml,
  reviewSources,
  reviewView,
  sectionHtml,
  storeReview,
  textField,
  textOf,
} from './review-frame';

const LOG_LINES = 5; // the done log shows this many lines before "Show all"
const mondayOf = (iso: string) => addDays(iso, -weekday(iso));

// The Monday of the week shown: the one the calendar picks unless the arrows moved.
export const shownWeekOf = (now = today()) => reviewView.period.week || reviewWeek(now);
export const shiftWeek = (dir: number) => {
  const next = addDays(shownWeekOf(), dir * 7);
  reviewView.period.week = next > mondayOf(today()) ? mondayOf(today()) : next;
};

const inPlanDiv = (plan: string, body: string, many: boolean) =>
  `<div class="rv-plan" data-in-plan="${esc(plan)}">${many ? `<span class="log-plan">${esc(planName(plan))}</span>` : ''}${body}</div>`;

const countsText = (c: DoneCounts) =>
  [
    c.goals && tp('review.goals', c.goals),
    tp('log.steps', c.steps),
    tp('log.ticks', c.routineDays),
    tp('log.values', c.values),
  ]
    .filter(Boolean)
    .join(' · ');

function didPart(sources: PlanSource[], monday: string, sunday: string, now: string) {
  const entries = doneLog(sources, monday, sunday);
  const data = new Map(sources.map(s => [s.plan, s.data]));
  const many = sources.length > 1;
  const log = entries.length
    ? entries.length > LOG_LINES
      ? `<details class="rv-log"><summary>${esc(t('review.showAll', { n: entries.length }))}</summary>${weeks(entries, mondayOf(now), data)}</details>`
      : weeks(entries, mondayOf(now), data)
    : `<p class="hint">${t('review.nothingDone')}</p>`;
  const f = forgotten(sources, monday, sunday, now);
  const rows = [
    ...f.routines.map(r =>
      inPlanDiv(
        r.plan,
        asOpen(
          sources.find(s => s.plan === r.plan)!.data,
          () =>
            `<div class="row glass rv-routine" data-open="${r.activity.id}"><span class="grow">${esc(r.activity.title)}</span>${routineWeek(r.activity as Routine, monday)}</div>`,
        ),
        many,
      ),
    ),
    ...f.steps.map(r =>
      inPlanDiv(
        r.plan,
        row(
          sources.find(s => s.plan === r.plan),
          r.activity,
        ),
        many,
      ),
    ),
  ];
  return `<p class="rv-counts">${esc(countsText(weekCounts(entries)))}</p>${log}${
    rows.length ? `<h4 class="rv-sub">${t('review.forgot')}</h4><div class="list rv-forgot">${rows.join('')}</div>` : ''
  }`;
}

function measurePart(sources: PlanSource[], monday: string, sunday: string) {
  const { list, more } = unmeasured(sources, monday, sunday);
  if (!list.length) return `<p class="hint">${t('review.allMeasured')}</p>`;
  const many = sources.length > 1;
  const rows = list.map(({ plan, state: s, last }) =>
    inPlanDiv(
      plan,
      `<div class="rv-measure"><span class="grow"><strong>${esc(s.title)}</strong> <span class="meta">${esc(
        last
          ? t('review.last', { value: withUnit(fmtNum(last.value), s.unit || ''), date: fmtDate(last.date) })
          : t('review.never'),
      )}</span></span><span class="rv-value"><input type="text" inputmode="decimal" autocomplete="off" data-rv-value="${s.id}" aria-label="${esc(s.title)}">${s.unit ? `<span class="unit">${esc(s.unit)}</span>` : ''}<button type="button" class="btn small" data-review="record" data-id="${s.id}">${t('review.record')}</button></span></div>`,
      many,
    ),
  );
  return `<p class="rv-sub">${t('review.noValue')}</p><div class="rv-measures">${rows.join('')}</div>${
    more
      ? `<button type="button" class="list-more" data-review="states">${esc(tp('review.moreStates', more))}</button>`
      : ''
  }`;
}

function fixPart(sources: PlanSource[], now: string, past: boolean) {
  const lines = fixLines(sources, visions.list, now);
  const many = sources.length > 1;
  const body = lines.length
    ? `<ul class="rv-fix">${lines
        .map(l => {
          const text =
            l.tip === 'late' ? tp('review.fix.late', Number(l.vars!.n)) : t(`review.fix.${l.tip}` as TextKey, l.vars);
          const btn =
            l.tip === 'late'
              ? `<button type="button" class="btn small" data-review="replan" data-plan="${esc(l.plan)}">${t('replan.btn')}</button>`
              : `<button type="button" class="btn small" data-review="open" data-plan="${esc(l.plan)}" data-id="${esc(l.target || l.id || '')}">${esc(t(`tip.${l.tip}.btn` as TextKey, l.vars))}</button>`;
          return `<li><span class="grow">${esc(text)}${many ? ` <span class="log-plan">${esc(planName(l.plan))}</span>` : ''}</span>${btn}</li>`;
        })
        .join('')}</ul>`
    : `<p class="hint">${t('review.nothingToFix')}</p>`;
  return (past ? `<p class="rv-note">${t('review.asToday')}</p>` : '') + body;
}

// The step chosen for the week the review chooses for, if any.
function chosenFocus(sources: PlanSource[], week: string) {
  const f = journal.focus;
  if (!f?.item || f.week !== week) return null;
  const src = sources.find(s => s.plan === f.plan),
    a = src?.data.activities.find(x => x.id === f.item);
  return src && a ? { src, a } : null;
}

function nextPart(sources: PlanSource[], week: string, now: string) {
  const chosen = chosenFocus(sources, week);
  const coming = week > mondayOf(now);
  return `<p class="rv-sub">${t(coming ? 'review.which' : 'review.whichThis')}</p>${
    chosen ? `<div class="list" data-in-plan="${esc(chosen.src.plan)}">${row(chosen.src, chosen.a)}</div>` : ''
  }<p class="rv-actions"><button type="button" class="btn" data-review="focus" data-week="${week}">${t(chosen ? 'review.change' : 'review.choose')}</button><button type="button" class="btn ghost" data-new="activity">${t('review.addStep')}</button></p>`;
}

export function renderWeekReview() {
  const sources = reviewSources();
  if (!sources.some(hasItems)) return `<div class="empty">${t('review.empty')}</div>`;
  const now = today(),
    monday = shownWeekOf(now),
    sunday = addDays(monday, 6),
    period = weekPeriod(monday);
  const kept = finishedOf('week', period),
    locked = !!kept && reviewView.editing !== period;
  const hasGoal = sources.some(s => s.data.goals.some(g => g.status === 'active'));
  const parts: [string, string, string][] = [
    [t('review.s.did'), t('review.lead.did'), didPart(sources, monday, sunday, now)],
    ...(hasGoal
      ? [
          [t('review.s.measure'), t('review.lead.measure'), measurePart(sources, monday, sunday)] as [
            string,
            string,
            string,
          ],
        ]
      : []),
    [
      t('review.s.back'),
      t('review.lead.back'),
      textField(period, 'well', t('review.well'), kept, locked) +
        textField(period, 'hard', t('review.hard'), kept, locked),
    ],
    ...(hasGoal
      ? [
          [t('review.s.fix'), t('review.lead.fix'), fixPart(sources, now, monday < reviewWeek(now))] as [
            string,
            string,
            string,
          ],
        ]
      : []),
    [
      t(focusWeek(now) > mondayOf(now) ? 'review.s.next' : 'review.s.nextThis'),
      '',
      nextPart(sources, focusWeek(now), now),
    ],
  ];
  return `<article class="rv-page" data-rv-kind="week" data-period="${period}">
    ${headHtml(t('review.week.title', { range: fmtRange(monday, sunday) }), monday < mondayOf(now))}
    ${parts.map(([title, lead, body], i) => sectionHtml(i + 1, title, lead, body)).join('')}
    ${finishHtml(kept, period, iso => fmtDay(iso.slice(0, 10), { day: 'numeric', month: 'long' }))}
  </article>`;
}

// Finish (or Save after Edit): the texts, the focus chosen and the week's counts, kept as they are now.
export function finishWeek() {
  const sources = reviewSources(),
    now = today(),
    monday = shownWeekOf(now),
    period = weekPeriod(monday);
  const was = !!finishedOf('week', period);
  const chosen = chosenFocus(sources, focusWeek(now));
  storeReview('week', period, {
    well: textOf(period, 'well', finishedOf('week', period)),
    hard: textOf(period, 'hard', finishedOf('week', period)),
    focus: chosen ? { plan: chosen.src.plan, item: chosen.a.id, title: chosen.a.title } : null,
    stats: weekCounts(doneLog(sources, monday, addDays(monday, 6))),
  });
  markSeen({ lastReview: now });
  toast(t(was ? 'review.toast' : 'review.toast.week'));
}
