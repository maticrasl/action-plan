/** The visions view: visions top down, how near they are to a Purpose, and the goals serving each. */
import { locale, t, tp } from '../i18n/index';
import { visions } from '../core/state';
import { findVision, visionParents, visionRoots } from '../core/visions';
import { $, esc, linkTag } from '../ui/dom';
import { plans } from '../store/state';
import { allPlansData, purposeState, reachedVisions, servingGoals } from '../store/visions';
import { unservedVisions } from '../core/line-of-sight';
import { fmtDay, today } from '../core/dates';
import { setView } from '../ui/nav';
import type { Vision } from '../core/model';

type PurposeState = ReturnType<typeof purposeState>;

/* ---------- Visions ---------- */

// Visions top down: each one under its first parent, children by title; one with more parents names the others.
export function visionOrder() {
  const out: { v: Vision; depth: number }[] = [],
    seen = new Set<string>(),
    byTitle = (a: Vision, b: Vision) => a.title.localeCompare(b.title, locale());
  const walk = (v: Vision, depth: number) => {
    if (seen.has(v.id)) return;
    seen.add(v.id);
    out.push({ v, depth });
    visions.list
      .filter(c => visionParents(c)[0] === v.id)
      .sort(byTitle)
      .forEach(c => walk(c, depth + 1));
  };
  visionRoots()
    .sort(byTitle)
    .forEach(v => walk(v, 0));
  visions.list.forEach(v => walk(v, 0));
  return out;
}

// How far the visions are from a Purpose, or that it is found.
export function purposeStatus(ps: PurposeState) {
  if (ps.on)
    return `<div class="vis-status found" role="status">${esc(t('vis.found', { name: ps.root!.title }))}</div>${vagueLine(ps)}`;
  const lines: string[] = [];
  if (ps.roots.length > 1)
    lines.push(tp('vis.manyRoots', ps.roots.length, { names: ps.roots.map(v => `“${v.title}”`).join(', ') }));
  if (!ps.active) lines.push(t('vis.noGoals'));
  else if (ps.unlinked.length)
    lines.push(
      tp('vis.unlinked', ps.unlinked.length, {
        names: ps.unlinked
          .map(({ plan, goal }) =>
            plans.list.length > 1 ? t('vis.goalInPlan', { goal: goal.title, plan: plan.name }) : goal.title,
          )
          .join(', '),
      }),
    );
  return lines.length ? `<div class="vis-status">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : '';
}

// With a Purpose, why the glow is not gold: the active goals that are not SMART. Those in the open plan
// open their form; those in other plans are named with their plan.
function vagueLine(ps: PurposeState) {
  if (!ps.vague.length) return '';
  const names = ps.vague
    .map(({ plan, goal }) =>
      plan.id === plans.current
        ? `<button type="button" class="vis-goal" data-open="${goal.id}">“${esc(goal.title)}”</button>`
        : esc(`“${t('vis.goalInPlan', { goal: goal.title, plan: plan.name })}”`),
    )
    .join(', ');
  const [before, after] = t('vis.vague', { names: '\u0000' }).split('\u0000');
  return `<div class="vis-status vis-vague"><p>${esc(before)}${names}${esc(after ?? '')}</p></div>`;
}

export const purposeTag = () => `<span class="tag purpose">${esc(t('vis.purpose'))}</span>`;

type Unserved = ReturnType<typeof unservedVisions>[number];

// A vision no active goal serves (feature 05): says so, or names the goal reached for it lately, and offers a new goal.
function unservedLine(u: Unserved | undefined) {
  if (!u) return '';
  const text = u.reached
    ? t('los.reached', { goal: u.reached.goal.title, date: fmtDay(u.reached.date, { day: 'numeric', month: 'short' }) })
    : t('los.unserved');
  return `<div class="vis-unserved"><p class="meta">${esc(text)}</p><button type="button" class="btn" data-los-next="${esc(u.vision.id)}">${t('los.next')}</button></div>`;
}

// From a vision tag on a row or card: the Visions view, with that vision's card in view.
export function showVision(id: string) {
  setView('visions');
  $(`.card.vision[data-open="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
}

export function visionCard(v: Vision, depth: number, ps: PurposeState, reached: Set<string>, unserved?: Unserved) {
  const also = visionParents(v).slice(1).map(findVision) as Vision[];
  const goals = servingGoals(v.id)
    .map(({ plan, goal }) =>
      plan.id === plans.current
        ? linkTag(goal.id)
        : `<span class="tag goal other-plan" title="${esc(plan.name)}">${esc(t('vis.goalInPlan', { goal: goal.title, plan: plan.name }))}</span>`,
    )
    .join('');
  return `<article class="card vision${reached.has(v.id) ? ' reached' : ''}${ps.root?.id === v.id ? ' purpose' : ''}" style="--level:${depth}" data-open="${v.id}" data-ctx-item="${v.id}">
    <div class="card-head"><h3>${esc(v.title)}</h3>${ps.root?.id === v.id ? purposeTag() : ''}</div>
    ${v.description ? `<p class="desc">${esc(v.description)}</p>` : ''}
    ${v.avoid ? `<details class="vis-avoid"><summary>${t('vis.avoid')}</summary><p>${esc(v.avoid)}</p></details>` : ''}
    ${also.length ? `<div class="links"><span class="meta">${t('vis.alsoUnder')}</span>${also.map(p => `<span class="tag vision" data-open="${p.id}">${esc(p.title)}</span>`).join('')}</div>` : ''}
    ${goals ? `<div class="links"><span class="meta">${t('vis.servedBy')}</span>${goals}</div>` : ''}
    ${unservedLine(unserved)}
  </article>`;
}

export function renderVisions() {
  const note = `<p class="meta vis-note">${t('vis.shared')}</p>`;
  if (!visions.list.length)
    return `<div class="empty"><h3>${t('vis.emptyTitle')}</h3><div>${t('vis.emptyText')}</div>
    <button class="btn primary" data-new="vision"><span aria-hidden="true">+</span> ${t('add.vision')}</button></div>${note}`;
  const ps = purposeState(),
    reached = reachedVisions(),
    unserved = new Map(unservedVisions(allPlansData(), today()).map(u => [u.vision.id, u]));
  return `${note}${purposeStatus(ps)}<div class="vision-tree">${visionOrder()
    .map(({ v, depth }) => visionCard(v, depth, ps, reached, unserved.get(v.id)))
    .join('')}</div>`;
}
