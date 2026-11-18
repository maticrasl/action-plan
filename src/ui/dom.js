/** Page lookups, HTML escaping and small HTML pieces shared by the views and dialogs. */
import { db } from '../core/state';
import { smartCheck } from '../core/progress';
import { t } from '../i18n/index';
import { daysUntil, fmtDate, fmtRel } from '../core/dates';
import { ui } from '../store/state';
import { NODE_STATES } from '../core/model';
import { findEntity } from '../core/relations';

/* ---------- Utilities ---------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const viewEl = $('#view');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const itemCount = () => db.goals.length + db.states.length + db.activities.length;

/* ---------- Small render helpers ---------- */

export function smartBadge(g) {
  const c = smartCheck(g);
  return `<span class="smart" aria-label="SMART">${'SMART'.split('').map(l => `<b class="${c[l] ? 'on' : ''}" title="${esc(t('smart.' + l))}">${l}</b>`).join('')}</span>`;
}

export function deadlineTag(date, done) {
  if (!date) return '';
  const d = daysUntil(date);
  if (done) return `<span class="tag">${fmtRel(date, true)}</span>`;
  if (d < 0) return `<span class="tag bad">${t('due.overdue', { n: -d })}</span>`;
  if (d <= 1) return `<span class="tag warn">${fmtRel(date, true)}</span>`;
  if (d <= 7) return `<span class="tag warn">${t('due.left', { n: d })}</span>`;
  return `<span class="tag">${fmtDate(date)}</span>`;
}

export function progressBar(pct, label) {
  return `<div class="progress-row"><div class="progress"><i style="width:${pct.toFixed(1)}%"></i></div><span>${label ?? Math.round(pct) + '%'}</span></div>`;
}

// Goal progress as a trail from the starting value to the target, with a blaze where you are now.
export function trail(pct, from, to) {
  return `<div class="trail" role="img" aria-label="${Math.round(pct)}%">
    <div class="trail-line"><i style="width:${pct.toFixed(1)}%"></i><b class="blaze" style="left:${pct.toFixed(1)}%"></b></div>
    <div class="trail-ends"><span>${from}</span><strong>${Math.round(pct)}%</strong><span>${to}</span></div>
  </div>`;
}

export function hideDoneToggle() {
  return `<button class="chip" data-hide-done aria-pressed="${ui.hideDone}">${t('acts.hideDone')}</button>`;
}

// "waits for n" tag listing the unfinished items something waits for.
export function waitsForTag(waits) {
  return `<span class="tag bad" title="${esc(waits.map(w => w.title).join(', '))}">${t('acts.waitsFor', { n: waits.length })}</span>`;
}

export function statusLegend() {
  return NODE_STATES.map(s => `<span><i class="swatch st-${s}"></i>${esc(t('nodeState.' + s))}</span>`).join('');
}

// The selected item and everything directly linked to it.
export function neighbourhood(sel, rels) {
  const near = new Set(sel ? [sel] : []);
  if (sel) rels.forEach(r => { if (r.from === sel) near.add(r.to); if (r.to === sel) near.add(r.from); });
  return near;
}

export function linkTag(id) {
  const e = findEntity(id);
  if (!e) return '';
  return `<span class="tag ${e.kind}" data-open="${e.item.id}">${esc(e.item.title)}</span>`;
}

export function statusCheck(a) {
  const cls = a.status === 'done' || a.status === 'doing' ? a.status : '';
  const label = t('activity.' + a.status);
  return `<button class="check ${cls}" data-cycle="${a.id}" aria-label="${esc(t('status.aria', { s: label }))}" title="${esc(t('status.title', { s: label }))}">${a.status === 'done' ? '✓' : ''}</button>`;
}

export function emptyState(title, text, kind) {
  return `<div class="empty"><h3>${title}</h3><div>${text}</div>
    <button class="btn primary" data-new="${kind}"><span aria-hidden="true">+</span> ${t('add.' + kind)}</button>
    ${itemCount() === 0 ? `<div class="empty-alt"><button class="btn ghost" data-templates>${t('btn.templatesAlt')}</button><button class="btn ghost" data-sample>${t('btn.sampleAlt')}</button></div>` : ''}</div>`;
}

export const byDueDate = (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
// Goals everywhere: the nearest deadline first, those without one last.
export const byDeadline = (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999');
export const matchesSearch = item => !ui.search || [item.title, item.description || item.specific || '', ...(item.list || []).map(i => i.text)].join(' ').toLowerCase().includes(ui.search.toLowerCase());
