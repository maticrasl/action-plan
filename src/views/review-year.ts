/** The yearly review (feature 14 C): the year, your visions with one choice each, look back, look ahead. */
import { esc } from '../ui/dom';
import { t, tp, type TextKey } from '../i18n/index';
import { fmtDay, today } from '../core/dates';
import { fmtNum } from '../core/util';
import { achievedDay } from '../core/done-log';
import { reviewYear } from '../core/reviews-month';
import { yearFacts, yearRange, type YearFacts } from '../core/reviews-year';
import { areaReport } from '../core/areas';
import { goalVisionIds, isActiveGoal, visionChildren, visionRoots } from '../core/visions';
import { visions } from '../core/state';
import { removeEntity } from '../store/plans';
import { plansVersion } from '../store/state';
import { withUnit } from '../ui/text';
import { toast } from '../ui/toast';
import { requestRender as render } from '../ui/render';
import { openForm } from '../ui/forms/form';
import { hasItems } from './focus';
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
import type { Vision } from '../core/model';
import type { PlanSource } from '../core/today';
import type { Review } from '../core/journal';

export const VCHOICES = ['true', 'change', 'drop'] as const;
export type VChoice = (typeof VCHOICES)[number];
const CHANGES_SHOWN = 3;

const firstYear = () => firstPeriod(firstUse().slice(0, 4), reviewYear(today()));
export const shownYearOf = (now = today()) => reviewView.period.year || reviewYear(now);
export function shiftYearView(dir: number) {
  const y = Number(shownYearOf()) + dir;
  reviewView.period.year = String(Math.max(Math.min(y, Number(today().slice(0, 4))), Number(firstYear())));
}

// Worked out once per year shown and change of the plans, not on every draw (npm run perf, "yearly review").
let cache: { key: string; facts: YearFacts | null } = { key: '', facts: null };
function factsOf(sources: PlanSource[], year: string) {
  const key = `${plansVersion}|${year}|${today()}|${sources.map(s => s.plan).join()}`;
  if (cache.key !== key) cache = { key, facts: yearFacts(sources, year) };
  return cache.facts!;
}

function yearPart(sources: PlanSource[], year: string, now: string) {
  const f = factsOf(sources, year),
    { from, to } = yearRange(year);
  const line = [
    f.stats.goals && esc(tp('review.goals', f.stats.goals)),
    esc(tp('log.steps', f.stats.steps)),
    esc(tp('log.ticks', f.stats.routineDays)),
    esc(tp('log.values', f.stats.values)),
  ]
    .filter(Boolean)
    .join(' · ');
  const month = (d: string) => fmtDay(d, { month: 'long' });
  const reached = f.reached.length
    ? `<p>${esc(t('review.reached', { list: f.reached.map(r => t('review.reachedOne', { name: r.title, month: month(r.day) })).join(' · ') }))}</p>${f.reached
        .filter(r => r.note)
        .map(r => `<p class="rv-why">${esc(t('review.difference', { text: r.note! }))}</p>`)
        .join('')}`
    : '';
  const change = (c: YearFacts['changes'][number]) =>
    t('review.changeLine', {
      name: c.state.title,
      from: fmtNum(c.first),
      to: withUnit(fmtNum(c.last), c.state.unit || ''),
    });
  const changes = f.changes.length
    ? `<p>${esc(t('review.changes', { list: f.changes.slice(0, CHANGES_SHOWN).map(change).join(' · ') }))}</p>${
        f.changes.length > CHANGES_SHOWN
          ? `<details class="rv-log"><summary>${t('review.showAllChanges')}</summary><ul class="rv-work">${f.changes.map(c => `<li>${esc(change(c))}</li>`).join('')}</ul></details>`
          : ''
      }`
    : '';
  const areas = areaReport(sources, to < now ? to : now, from)
    .blocks.filter(b => b.share >= 1)
    .map(b => `${b.name} ${Math.round(b.share)} %`);
  return `<p class="rv-counts">${line}</p>${reached}${changes}${areas.length ? `<p>${esc(t('review.byArea', { list: areas.join(' · ') }))}</p>` : ''}`;
}

// Every vision in the tree's order: each root, then what sits under it.
function treeOrder(): Vision[] {
  const out: Vision[] = [],
    seen = new Set<string>();
  const walk = (v: Vision) => {
    if (seen.has(v.id)) return;
    seen.add(v.id);
    out.push(v);
    visionChildren(v.id).forEach(walk);
  };
  visionRoots().forEach(walk);
  visions.list.forEach(walk); // any left in a loop
  return out;
}

function choicesOf(period: string, kept: Review | undefined): Record<string, { title: string; choice: VChoice }> {
  const out = { ...((kept?.answers.visions as Record<string, { title: string; choice: VChoice }>) || {}) };
  Object.entries(draftOf(period)).forEach(([k, v]) => {
    if (!k.startsWith('vision.')) return;
    try {
      out[k.slice(7)] = JSON.parse(v);
    } catch (e) {
      /* a broken draft line is skipped */
    }
  });
  return out;
}

function visionsPart(sources: PlanSource[], period: string, kept: Review | undefined) {
  const list = treeOrder();
  const choices = choicesOf(period, kept),
    { from, to } = yearRange(period);
  // A vision let go is gone from the list: its line keeps its title.
  const gone = Object.entries(choices)
    .filter(([id, c]) => c.choice === 'drop' && !list.some(v => v.id === id))
    .map(([, c]) => `<p class="meta rv-gone">${esc(t('review.vchoice.drop'))}: ${esc(c.title)}</p>`)
    .join('');
  if (!list.length)
    return `<p class="hint">${t('review.noVisions')}</p>${gone}<p class="rv-actions"><button type="button" class="btn" data-disc>${t('review.findVisions')}</button></p>`;
  const goals = sources.flatMap(s => s.data.goals.map(g => ({ g, ids: goalVisionIds(g, s.data) })));
  const cards = list.map(v => {
    const serving = goals.filter(x => x.ids.includes(v.id)).map(x => x.g);
    const reached = serving.filter(g => {
      const d = achievedDay(g);
      return !!d && d >= from && d <= to;
    }).length;
    const active = serving.filter(isActiveGoal).length;
    const chosen = choices[v.id]?.choice;
    return `<div class="card glass rv-goal rv-vision">
      <div class="rv-goal-head"><h4>${esc(v.title)}</h4></div>
      ${v.description?.trim() ? `<p>${esc(v.description)}</p>` : ''}
      ${v.avoid?.trim() ? `<p class="rv-why"><strong>${esc(t('vis.avoid'))}:</strong> ${esc(v.avoid)}</p>` : ''}
      <p class="meta">${esc(t('review.visionYear', { reached, active }))}</p>
      <div class="chips rv-choices" role="group" aria-label="${esc(v.title)}">${VCHOICES.map(
        k =>
          `<button type="button" class="chip${chosen === k ? ' active' : ''}" data-review="vchoice" data-v="${k}" data-id="${esc(v.id)}" aria-pressed="${chosen === k}">${t(`review.vchoice.${k}` as TextKey)}</button>`,
      ).join('')}</div>
    </div>`;
  });
  return `<div class="rv-goals">${cards.join('')}</div>${gone}`;
}

export function renderYearReview() {
  const sources = reviewSources();
  if (!sources.some(hasItems) && !visions.list.length) return `<div class="empty">${t('review.empty')}</div>`;
  const now = today(),
    period = shownYearOf(now);
  const kept = finishedOf('year', period),
    locked = !!kept && reviewView.editing !== period;
  const parts: [string, string, string][] = [
    [t('review.s.year'), '', yearPart(sources, period, now)],
    [t('review.s.visions'), t('review.lead.visions'), visionsPart(sources, period, kept)],
    [
      t('review.s.back'),
      '',
      textField(period, 'glad', t('review.glad'), kept, locked) +
        textField(period, 'differently', t('review.differently'), kept, locked),
    ],
    [
      t('review.s.ahead'),
      '',
      textField(period, 'next', t('review.nextYear'), kept, locked) +
        `<p class="rv-actions"><button type="button" class="btn" data-disc>${t('review.findVisions')}</button><button type="button" class="btn ghost" data-new="goal">${t('review.addGoal')}</button></p>`,
    ],
  ];
  return `<article class="rv-page" data-rv-kind="year" data-period="${period}">
    ${headHtml(t('review.year.title', { year: period }), period < now.slice(0, 4), period > firstYear())}
    ${parts.map(([title, lead, body], i) => sectionHtml(i + 1, title, lead, body)).join('')}
    ${finishHtml(kept, period, iso => fmtDay(iso.slice(0, 10), { day: 'numeric', month: 'long' }))}
  </article>`;
}

// A choice on a vision: Change it opens its form; Let it go deletes it after asking (Recently deleted keeps it).
export function chooseForVision(id: string, choice: VChoice) {
  const period = shownYearOf(),
    v = visions.list.find(x => x.id === id);
  if (!v) return;
  if (choice === 'drop' && !confirm(t('review.dropConfirm', { name: v.title }))) return;
  saveDraft(period, `vision.${id}`, JSON.stringify({ title: v.title, choice }));
  if (choice === 'change') return openForm('vision', id);
  if (choice === 'drop') removeEntity('vision', id);
  render();
}

export function finishYear() {
  const period = shownYearOf(),
    kept = finishedOf('year', period);
  storeReview('year', period, {
    glad: textOf(period, 'glad', kept),
    differently: textOf(period, 'differently', kept),
    next: textOf(period, 'next', kept),
    visions: choicesOf(period, kept),
    stats: factsOf(reviewSources(), period).stats,
  });
  toast(t('review.toast'));
}
