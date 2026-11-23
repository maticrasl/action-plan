/** Page lookups, HTML escaping, text cut to fit a width, and small HTML pieces shared by the views and dialogs. */
import { db } from '../core/state';
import { smartCheck } from '../core/progress';
import { t, tp, type TextKey } from '../i18n/index';
import { daysUntil, fmtDate, fmtRel } from '../core/dates';
import { ui } from '../store/state';
import { type Activity, type Goal, type ISODate, type Item, type Relation, type WithNotes } from '../core/model';
import { findEntity } from '../core/relations';

/* ---------- Utilities ---------- */

// A card's notes as a small tag; it opens the item's form at its Notes (feature 15).
export function noteTag(x: Item & WithNotes): string {
  const n = x.notes?.length || 0;
  if (!n) return '';
  const label = esc(tp('notes.count', n));
  return `<button type="button" class="tag note-tag" data-notes="${x.id}" title="${label}" aria-label="${label}">✎ ${n}</button>`;
}

// The element is taken to exist; lookups that may find none use `?.`.
export const $ = <E extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as E;
export const viewEl = $('#view');
// What scrolls a map or timeline: the whole main pane.
export const scrollBox = (wrap: Element) =>
  (wrap.closest('.main') || wrap) as HTMLElement;
export const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c as '&'],
  );

export const itemCount = () => db.goals.length + db.states.length + db.activities.length;

/* ---------- Small render helpers ---------- */

export function smartBadge(g: Goal) {
  const c = smartCheck(g);
  return `<span class="smart" aria-label="SMART">${'SMART'
    .split('')
    .map(l => `<b class="${c[l as 'S'] ? 'on' : ''}" title="${esc(t(('smart.' + l) as TextKey))}">${l}</b>`)
    .join('')}</span>`;
}

export function deadlineTag(date: ISODate | undefined, done?: boolean) {
  if (!date) return '';
  const d = daysUntil(date)!;
  if (done) return `<span class="tag">${fmtRel(date, true)}</span>`;
  if (d < 0) return `<span class="tag bad">${t('due.overdue', { n: -d })}</span>`;
  if (d <= 1) return `<span class="tag warn">${fmtRel(date, true)}</span>`;
  if (d <= 7) return `<span class="tag warn">${t('due.left', { n: d })}</span>`;
  return `<span class="tag">${fmtDate(date)}</span>`;
}

export function progressBar(pct: number, label?: string) {
  return `<div class="progress-row"><div class="progress"><i style="width:${pct.toFixed(1)}%"></i></div><span>${label ?? Math.round(pct) + '%'}</span></div>`;
}

// Goal progress as a trail from the starting value to the target, with a blaze where you are now.
export function trail(pct: number, from: string, to: string) {
  return `<div class="trail" role="img" aria-label="${Math.round(pct)}%">
    <div class="trail-line"><i style="width:${pct.toFixed(1)}%"></i><b class="blaze" style="left:${pct.toFixed(1)}%"></b></div>
    <div class="trail-ends"><span>${from}</span><strong>${Math.round(pct)}%</strong><span>${to}</span></div>
  </div>`;
}

export function hideDoneToggle() {
  return `<button class="chip" data-hide-done aria-pressed="${ui.hideDone}">${t(ui.hideDone ? 'acts.showDone' : 'acts.hideDone')}</button>`;
}

// "waits for n" tag listing the unfinished items something waits for.
export function waitsForTag(waits: { title: string }[]) {
  return `<span class="tag bad" title="${esc(waits.map(w => w.title).join(', '))}">${t('acts.waitsFor', { n: waits.length })}</span>`;
}

// The selected item and everything directly linked to it.
export function neighbourhood(sel: string | null, rels: Pick<Relation, 'from' | 'to'>[]) {
  const near = new Set(sel ? [sel] : []);
  if (sel)
    rels.forEach(r => {
      if (r.from === sel) near.add(r.to);
      if (r.to === sel) near.add(r.from);
    });
  return near;
}

export function linkTag(id: string) {
  const e = findEntity(id);
  if (!e) return '';
  return `<span class="tag ${e.kind}" data-open="${e.item.id}">${esc(e.item.title)}</span>`;
}

export function statusCheck(a: Activity) {
  const cls = a.status === 'done' || a.status === 'doing' ? a.status : '';
  const label = t(('activity.' + a.status) as TextKey);
  return `<button class="check ${cls}" data-cycle="${a.id}" aria-label="${esc(t('status.aria', { s: label }))}" title="${esc(t('status.title', { s: label }))}">${a.status === 'done' ? '✓' : ''}</button>`;
}

export function emptyState(title: string, text: string, kind: string) {
  return `<div class="empty"><h3>${title}</h3><div>${text}</div>
    <button class="btn primary" data-new="${kind}"><span aria-hidden="true">+</span> ${t(('add.' + kind) as TextKey)}</button>
    ${itemCount() === 0 ? `<div class="empty-alt"><button class="btn ghost" data-templates>${t('btn.templatesAlt')}</button><button class="btn ghost" data-sample>${t('btn.sampleAlt')}</button></div>` : ''}</div>`;
}

export const byDueDate = (a: Activity, b: Activity) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
// Goals everywhere: the nearest deadline first, those without one last.
export const byDeadline = (a: { deadline?: ISODate }, b: { deadline?: ISODate }) =>
  (a.deadline || '9999').localeCompare(b.deadline || '9999');
export const matchesSearch = (
  item: Item & WithNotes & { title: string; description?: string; specific?: string; list?: { text: string }[] },
) =>
  !ui.search ||
  [
    item.title,
    item.description || item.specific || '',
    ...(item.list || []).map(i => i.text),
    ...(item.notes || []).map(n => n.text),
  ]
    .join(' ')
    .toLowerCase()
    .includes(ui.search.toLowerCase());

export const settings = $<HTMLDialogElement>('#settings');

// Box text is cut to fit its box, ending in "…": measured on a canvas in the fonts the map's CSS sets,
// with 4 % to spare, as SVG text can come out a little wider than the canvas measures it.
export let fitCtx: CanvasRenderingContext2D;
export function fitText(text: string, font: string, max: number) {
  fitCtx ||= document.createElement('canvas').getContext('2d')!;
  fitCtx.font = font;
  const fits = (s: string) => fitCtx.measureText(s).width * 1.04 <= max;
  if (fits(text)) return text;
  let s = text;
  while (s && !fits(s + '…')) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}
