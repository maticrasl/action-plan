/** The monthly review (feature 14 B): the month, your goals with one choice each, what is waiting, is it working, one sentence. */
import { esc } from '../ui/dom';
import { t, tp, type TextKey } from '../i18n/index';
import { fmtDay, today } from '../core/dates';
import { doneLog, doneDay, weekCounts } from '../core/done-log';
import { asOpen, type PlanSource } from '../core/today';
import { monthKept, monthRange, progressAt, reviewMonth, shiftMonth } from '../core/reviews-month';
import { goalProgress, goalRoutines, treeActivities } from '../core/progress';
import { goalPace } from '../core/pace';
import { isRoutine, type Routine } from '../core/routines/schedule';
import { areaReport, areaSentences } from '../core/areas';
import { unservedVisions } from '../core/line-of-sight';
import { compare } from '../core/working';
import { findVision, ownVisions } from '../core/visions';
import { relsFrom } from '../core/relations';
import { db } from '../core/state';
import { openPlan, removeEntity, save } from '../store/plans';
import { plans } from '../store/state';
import { allPlansData } from '../store/visions';
import { requestRender as render, inPlan } from '../ui/render';
import { toast } from '../ui/toast';
import { hasItems, openIn, planName } from './focus';
import {
  draftOf,
  finishHtml,
  finishedOf,
  firstPeriod,
  firstUse,
  headHtml,
  reviewSources,
  reviewView,
  saveDraft,
  sectionHtml,
  storeReview,
  textField,
  textOf,
} from './review-frame';
import type { Goal, State, Vision } from '../core/model';
import type { Review } from '../core/journal';

export const CHOICES = ['keep', 'change', 'pause', 'drop'] as const;
export type Choice = (typeof CHOICES)[number];
export interface GoalChoice {
  plan: string;
  title: string;
  choice: Choice;
  from: number | null;
  to: number;
}
const WORK_MAX = 3; // results of "Is it working?" shown

const firstMonth = () => firstPeriod(firstUse().slice(0, 7), reviewMonth(today()));
export const shownMonthOf = (now = today()) => reviewView.period.month || reviewMonth(now);
export function shiftMonthView(dir: number) {
  const next = shiftMonth(shownMonthOf(), dir);
  reviewView.period.month = next > today().slice(0, 7) ? today().slice(0, 7) : next < firstMonth() ? firstMonth() : next;
}
const monthName = (ym: string) => fmtDay(`${ym}-01`, { month: 'long', year: 'numeric' });
const pct = (n: number) => `${Math.round(n)} %`;

// The choices made so far: the draft while the review is open, else what the finished review kept.
function choicesOf(period: string, kept: Review | undefined): Record<string, GoalChoice> {
  const out: Record<string, GoalChoice> = { ...((kept?.answers.goals as Record<string, GoalChoice>) || {}) };
  Object.entries(draftOf(period)).forEach(([k, v]) => {
    if (!k.startsWith('goal.')) return;
    try {
      out[k.slice(5)] = JSON.parse(v);
    } catch (e) {
      /* a broken draft line is skipped */
    }
  });
  return out;
}

function monthPart(sources: PlanSource[], from: string, to: string, now: string) {
  const c = weekCounts(doneLog(sources, from, to));
  const counts = [
    tp('log.steps', c.steps),
    tp('log.ticks', c.routineDays),
    tp('log.values', c.values),
    c.goals && tp('review.goals', c.goals),
  ].filter(Boolean);
  const most = areaSentences(areaReport(sources, to < now ? to : now)).find(s => s.key === 'most');
  return `<p class="rv-counts">${esc(counts.join(' · '))}</p>${most?.key === 'most' ? `<p>${esc(t('areas.most', { area: most.area }))}</p>` : ''}`;
}

// One goal's card: from → to, pace, the month's facts, why and cost, its visions' "If I let it slide", four choices.
function goalCard(
  src: PlanSource,
  g: Goal,
  from: string,
  to: string,
  now: string,
  chosen: GoalChoice | undefined,
  many: boolean,
) {
  return asOpen(src.data, () => {
    const start = progressAt(g, from),
      cur = goalProgress(g);
    const moved = start !== null && Math.round(start) !== Math.round(cur);
    const pace = g.status === 'active' ? goalPace(g, now) : null;
    const steps = treeActivities(g).filter(
      a => !isRoutine(a) && (doneDay(a) || '') >= from && (doneDay(a) || '') <= to,
    ).length;
    const routines = [...new Set([...goalRoutines(g), ...treeActivities(g).filter(isRoutine)])] as Routine[];
    const kept = routines
      .map(r => ({ r, k: monthKept(r, from.slice(0, 7)) }))
      .filter(x => x.k.m)
      .map(x => t('review.kept', { name: x.r.title, n: x.k.n, m: x.k.m }));
    const facts = [steps ? tp('review.monthSteps', steps) : '', ...kept].filter(Boolean);
    const avoid = ownVisions(g)
      .map(findVision)
      .filter((v): v is Vision => !!v && !!v.avoid?.trim())
      .map(
        v =>
          `<details class="vis-avoid"><summary>${esc(t('vis.avoid'))} · ${esc(v.title)}</summary><p>${esc(v.avoid!)}</p></details>`,
      )
      .join('');
    const buttons = CHOICES.map(
      k =>
        `<button type="button" class="chip${chosen?.choice === k ? ' active' : ''}" data-review="choice" data-v="${k}" data-plan="${esc(src.plan)}" data-id="${esc(g.id)}" aria-pressed="${chosen?.choice === k}">${t(`review.choice.${k}` as TextKey)}</button>`,
    ).join('');
    return `<div class="card glass rv-goal st-${g.status}">
      <div class="rv-goal-head"><h4>${esc(g.title)}</h4>${many ? `<span class="log-plan">${esc(planName(src.plan))}</span>` : ''}</div>
      <p class="rv-progress"><strong>${moved ? `${pct(start!)} → ${pct(cur)}` : pct(cur)}</strong>${pace ? ` <span class="tag">${esc(t(`pace.${pace.status}` as TextKey))}</span>` : ''}${g.status === 'paused' ? ` <span class="tag">${esc(t('goal.paused'))}</span>` : ''}</p>
      ${facts.length ? `<p class="meta">${esc(facts.join(' · '))}</p>` : ''}
      ${g.relevant?.trim() ? `<p class="rv-why">${esc(t('review.why', { text: g.relevant.trim() }))}</p>` : ''}
      ${g.cost?.trim() ? `<p class="rv-why">${esc(t('review.cost', { text: g.cost.trim() }))}</p>` : ''}
      ${avoid}
      <div class="chips rv-choices" role="group" aria-label="${esc(g.title)}">${buttons}</div>
    </div>`;
  });
}

function goalsPart(
  sources: PlanSource[],
  period: string,
  from: string,
  to: string,
  now: string,
  kept: Review | undefined,
) {
  const choices = choicesOf(period, kept);
  const many = sources.length > 1;
  const rows = sources
    .flatMap(src => src.data.goals.filter(g => g.status === 'active' || choices[g.id]).map(g => ({ src, g })))
    .sort((a, b) => (a.g.deadline || '9999').localeCompare(b.g.deadline || '9999'));
  const present = new Set(rows.map(r => r.g.id));
  // A goal let go is no longer in any plan: its line keeps its title.
  const gone = Object.entries(choices)
    .filter(([id, c]) => !present.has(id) && c.choice === 'drop')
    .map(([, c]) => `<p class="meta rv-gone">${esc(t('review.choice.drop'))}: ${esc(c.title)}</p>`)
    .join('');
  if (!rows.length && !gone) return `<p class="hint">${t('review.noGoals')}</p>`;
  return `<p class="rv-sub">${esc(tp('review.activeGoals', rows.filter(r => r.g.status === 'active').length))}</p>
    <div class="rv-goals">${rows.map(r => goalCard(r.src, r.g, from, to, now, choices[r.g.id], many)).join('')}</div>${gone}`;
}

function waitingPart(sources: PlanSource[], now: string) {
  const many = sources.length > 1;
  const paused = sources.flatMap(src =>
    src.data.goals
      .filter(g => g.status === 'paused')
      .map(
        g =>
          `<li><span class="grow">${esc(t('review.paused', { name: g.title }))}${many ? ` <span class="log-plan">${esc(planName(src.plan))}</span>` : ''}</span><button type="button" class="btn small" data-review="unpause" data-plan="${esc(src.plan)}" data-id="${esc(g.id)}">${t('review.bringBack')}</button></li>`,
      ),
  );
  const unserved = unservedVisions(allPlansData(), now).map(
    ({ vision: v }) =>
      `<li><span class="grow">“${esc(v.title)}” · ${esc(t('los.unserved'))}</span><button type="button" class="btn small" data-los-next="${esc(v.id)}">${t('los.next')}</button></li>`,
  );
  const all = [...paused, ...unserved];
  return all.length ? `<ul class="rv-fix">${all.join('')}</ul>` : `<p class="hint">${t('review.nothingWaiting')}</p>`;
}

// The clear results of feature 16 over every plan's routine–state pairs, at most three.
function workingPart(sources: PlanSource[], now: string) {
  const lines = sources
    .flatMap(src =>
      asOpen(src.data, () =>
        src.data.activities.filter(isRoutine).flatMap(a =>
          relsFrom(a.id, 'improves')
            .map(r => db.states.find(s => s.id === r.to))
            .filter((s): s is State => !!s)
            .map(s => {
              const goals = relsFrom(s.id, 'measures')
                .map(r => db.goals.find(g => g.id === r.to))
                .filter((g): g is Goal => !!g);
              const w = compare(a, s, goals, now);
              return w && ['better', 'worse', 'more', 'less'].includes(w.kind)
                ? t('review.work', { routine: a.title, state: s.title, text: t(`work.${w.kind}` as TextKey) })
                : '';
            }),
        ),
      ),
    )
    .filter(Boolean);
  return lines.length
    ? `<ul class="rv-work">${lines
        .slice(0, WORK_MAX)
        .map(l => `<li>${esc(l)}</li>`)
        .join('')}</ul>`
    : `<p class="hint">${t('review.noWork')}</p>`;
}

export function renderMonthReview() {
  const sources = reviewSources();
  if (!sources.some(hasItems)) return `<div class="empty">${t('review.empty')}</div>`;
  const now = today(),
    period = shownMonthOf(now),
    { from, to } = monthRange(period);
  const kept = finishedOf('month', period),
    locked = !!kept && reviewView.editing !== period;
  const parts: [string, string, string][] = [
    [t('review.s.month'), '', monthPart(sources, from, to, now)],
    [t('review.s.goals'), t('review.lead.goals'), goalsPart(sources, period, from, to, now, kept)],
    [t('review.s.waiting'), t('review.lead.waiting'), waitingPart(sources, now)],
    [t('review.s.working'), t('review.lead.working'), workingPart(sources, now)],
    [t('review.s.sentence'), '', textField(period, 'sentence', t('review.monthAbout'), kept, locked)],
  ];
  return `<article class="rv-page" data-rv-kind="month" data-period="${period}">
    ${headHtml(t('review.month.title', { month: monthName(period) }), period < now.slice(0, 7), period > firstMonth())}
    ${parts.map(([title, lead, body], i) => sectionHtml(i + 1, title, lead, body)).join('')}
    ${finishHtml(kept, period, iso => fmtDay(iso.slice(0, 10), { day: 'numeric', month: 'long' }))}
  </article>`;
}

// A choice on a goal's card. Pause and Let it go are carried out at once, in the goal's plan.
export function chooseForGoal(plan: string, id: string, choice: Choice) {
  const period = shownMonthOf(),
    { from } = monthRange(period);
  const src = reviewSources().find(s => s.plan === plan),
    g = src?.data.goals.find(x => x.id === id);
  if (!src || !g) return;
  if (choice === 'drop' && !confirm(t('review.dropConfirm', { name: g.title }))) return;
  const record: GoalChoice = {
    plan,
    title: g.title,
    choice,
    from: asOpen(src.data, () => progressAt(g, from)),
    to: asOpen(src.data, () => goalProgress(g)),
  };
  saveDraft(period, `goal.${id}`, JSON.stringify(record));
  if (choice === 'change') return openIn(plan, id);
  if (choice === 'pause')
    inPlan(plan, () => {
      const goal = db.goals.find(x => x.id === id);
      if (goal) goal.status = 'paused';
      save();
    });
  if (choice === 'drop') {
    // Recently deleted names the plan an item came from: the goal's plan is opened first.
    if (plan !== plans.current) {
      openPlan(plan);
      toast(t('log.openedPlan', { name: planName(plan) }));
    }
    removeEntity('goal', id);
    save();
  }
  render();
}

export function unpauseGoal(plan: string, id: string) {
  inPlan(plan, () => {
    const g = db.goals.find(x => x.id === id);
    if (!g) return;
    g.status = 'active';
    save();
  });
  render();
}

export function finishMonth() {
  const period = shownMonthOf(),
    { from, to } = monthRange(period),
    kept = finishedOf('month', period);
  storeReview('month', period, {
    sentence: textOf(period, 'sentence', kept),
    goals: choicesOf(period, kept),
    stats: weekCounts(doneLog(reviewSources(), from, to)),
  });
  toast(t('review.toast'));
}
