/** The visions view: visions top down, how near they are to a Purpose, and the goals serving each. */
import { locale, t, tp } from '../i18n/index';
import { visions } from '../core/state';
import { findVision, visionParents, visionRoots } from '../core/visions';
import { esc, linkTag } from '../ui/dom';
import { plans } from '../store/state';
import { purposeState, reachedVisions, servingGoals } from '../store/visions';

/* ---------- Visions ---------- */

// Visions top down: each one under its first parent, children by title; one with more parents names the others.
export function visionOrder() {
  const out = [], seen = new Set(), byTitle = (a, b) => a.title.localeCompare(b.title, locale());
  const walk = (v, depth) => {
    if (seen.has(v.id)) return;
    seen.add(v.id);
    out.push({ v, depth });
    visions.list.filter(c => visionParents(c)[0] === v.id).sort(byTitle).forEach(c => walk(c, depth + 1));
  };
  visionRoots().sort(byTitle).forEach(v => walk(v, 0));
  visions.list.forEach(v => walk(v, 0));
  return out;
}

// How far the visions are from a Purpose, or that it is found.
export function purposeStatus(ps) {
  if (ps.on) return `<div class="vis-status found" role="status">${esc(t('vis.found', { name: ps.root.title }))}</div>`;
  const lines = [];
  if (ps.roots.length > 1) lines.push(tp('vis.manyRoots', ps.roots.length, { names: ps.roots.map(v => `“${v.title}”`).join(', ') }));
  if (!ps.active) lines.push(t('vis.noGoals'));
  else if (ps.unlinked.length) lines.push(tp('vis.unlinked', ps.unlinked.length, { names: ps.unlinked.map(({ plan, goal }) => plans.list.length > 1 ? t('vis.goalInPlan', { goal: goal.title, plan: plan.name }) : goal.title).join(', ') }));
  return lines.length ? `<div class="vis-status">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : '';
}

export const purposeTag = () => `<span class="tag purpose">${esc(t('vis.purpose'))}</span>`;

export function visionCard(v, depth, ps, reached) {
  const also = visionParents(v).slice(1).map(findVision);
  const goals = servingGoals(v.id).map(({ plan, goal }) => plan.id === plans.current ? linkTag(goal.id)
    : `<span class="tag goal other-plan" title="${esc(plan.name)}">${esc(t('vis.goalInPlan', { goal: goal.title, plan: plan.name }))}</span>`).join('');
  return `<article class="card vision${reached.has(v.id) ? ' reached' : ''}${ps.root?.id === v.id ? ' purpose' : ''}" style="--level:${depth}" data-open="${v.id}" data-ctx-item="${v.id}">
    <div class="card-head"><h3>${esc(v.title)}</h3>${ps.root?.id === v.id ? purposeTag() : ''}</div>
    ${v.description ? `<p class="desc">${esc(v.description)}</p>` : ''}
    ${also.length ? `<div class="links"><span class="meta">${t('vis.alsoUnder')}</span>${also.map(p => `<span class="tag vision" data-open="${p.id}">${esc(p.title)}</span>`).join('')}</div>` : ''}
    ${goals ? `<div class="links"><span class="meta">${t('vis.servedBy')}</span>${goals}</div>` : ''}
  </article>`;
}

export function renderVisions() {
  const note = `<p class="meta vis-note">${t('vis.shared')}</p>`;
  if (!visions.list.length) return `<div class="empty"><h3>${t('vis.emptyTitle')}</h3><div>${t('vis.emptyText')}</div>
    <button class="btn primary" data-new="vision"><span aria-hidden="true">+</span> ${t('add.vision')}</button></div>${note}`;
  const ps = purposeState(), reached = reachedVisions();
  return `${note}${purposeStatus(ps)}<div class="vision-tree">${visionOrder().map(({ v, depth }) => visionCard(v, depth, ps, reached)).join('')}</div>`;
}

