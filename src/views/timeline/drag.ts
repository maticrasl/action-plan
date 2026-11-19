/** Moving dates in the timeline by dragging a bar or one of its ends. */
import { dayNum, dayStr } from '../../core/days';
import { addDays, lastOccurrence } from '../../core/routines/schedule';
import { findEntity } from '../../core/relations';
import { $, viewEl } from '../../ui/dom';
import { ui } from '../../store/state';
import { fmtRel, fmtSpan, today } from '../../core/dates';
import { t } from '../../i18n/index';
import { clamp } from '../../core/util';
import { requestRender as render } from '../../ui/render';
import { save } from '../../store/plans';
import { toast } from '../../ui/toast';
import { LONG_PRESS_MS, openCtxMenu } from '../map/menu';
import type { Activity, Goal, ISODate, ItemKind } from '../../core/model';
import type { Routine } from '../../core/routines/schedule';
import { endOf, fixedEnd, tlGrip } from './render';

/* ---------- Moving dates in the timeline ----------
   The selected item's bar can be dragged along the time axis: from its middle it moves both dates,
   from one of its grips only that date. With a mouse the drag starts once the pointer moves; on touch
   screens (where dragging scrolls) after a long-press, and a long-press let go without moving still
   opens the menu. The bar follows whole days as it goes; the dates are saved when it is let go, and
   Esc puts it back. */

// A bar being dragged: which end (edge '' for both), its dates before, how many days it may move either way,
// where the pointer went down and is now (cy), whether a long-press has picked it up (armed), and the days moved.
interface TlDrag {
  id: string;
  kind: ItemKind;
  edge: string;
  s0: ISODate;
  e0: ISODate;
  lo: number;
  hi: number;
  x: number;
  y: number;
  cy?: number;
  pointerId: number;
  touch: boolean;
  armed: boolean;
  moved: boolean;
  days: number;
  timer?: ReturnType<typeof setTimeout>;
  target?: HTMLElement;
}
export let tlDrag: TlDrag | null = null;
let tlDragClick = false; // the click that ends a drag must not toggle the selection

// The dates the drag has reached: each end keeps at least the length the item's form asks for.
export function tlDragDates(d: TlDrag, days = d.days) {
  const min = d.kind === 'goal' ? 1 : 0;
  let s = d.s0,
    e = d.e0;
  if (d.edge === 'start') s = dayStr(Math.min(dayNum(d.s0) + days, dayNum(d.e0) - min));
  else if (d.edge === 'end') e = dayStr(Math.max(dayNum(d.e0) + days, dayNum(d.s0) + min));
  else {
    s = s && addDays(s, days);
    e = e && addDays(e, days);
  }
  const item = findEntity(d.id)?.item;
  if (item && fixedEnd(item))
    e = lastOccurrence({ ...(item as Routine), startDate: s }, (item as Routine).repeat.count!) || e;
  return { s, e };
}

// Redraws the dragged item's bar (in every row it is listed in) without redrawing the timeline.
export function previewTlDrag(d: TlDrag) {
  const scroll = $('.tl-scroll');
  if (!scroll) return;
  const { s, e } = tlDragDates(d),
    px = ui.tlPx,
    from = Number(scroll.dataset.from);
  // A goal without a deadline runs to today (see renderTimeline).
  const a = dayNum(s || e),
    b = d.kind === 'goal' && !e ? Math.max(a, dayNum(today())) : dayNum(e || s),
    left = (a - from) * px,
    width = (b - a + 1) * px;
  document.querySelectorAll(`[data-tl-node="${d.id}"]`).forEach(row => {
    row.querySelector('.tl-overdue')?.remove();
    const bar = row.querySelector<HTMLElement>('.tl-bar'),
      dot = row.querySelector<HTMLElement>('.tl-milestone'),
      label = row.querySelector<HTMLElement>('.tl-bar-label');
    if (bar) Object.assign(bar.style, { left: `${left}px`, width: `${width}px` });
    if (dot) dot.style.left = `${left + px / 2}px`;
    if (label) label.style.left = `${bar ? left + width + 8 : left + px / 2 + 14}px`;
    row.querySelectorAll<HTMLElement>('[data-tl-edge]').forEach(g => {
      g.style.cssText = tlGrip(g.dataset.tlEdge, left, width);
    });
    row.querySelector('.tl-dates')!.textContent = fmtSpan(s, e, true);
  });
  showTlDragTip(d, s, e);
}

// A label above the dragged bar with the date (or dates) it would get, over the end that moves.
// On touch screens it stays clear of the finger.
export function showTlDragTip(d: TlDrag, s: ISODate, e: ISODate) {
  const mark = $(`[data-tl-node="${d.id}"] :is(.tl-bar, .tl-milestone)`);
  if (!mark) return;
  let tip = $('.tl-drag-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tl-drag-tip';
    tip.setAttribute('role', 'status');
    document.body.append(tip);
  }
  const endKey = d.kind === 'goal' ? 'f.deadline' : 'f.dueDate';
  tip.textContent = d.edge
    ? `${t(d.edge === 'start' ? 'f.startDate' : endKey)}: ${fmtRel(d.edge === 'start' ? s : e)}`
    : fmtSpan(s, e, true);
  const r = mark.getBoundingClientRect(),
    w = tip.offsetWidth;
  const x = d.edge === 'start' ? r.left : d.edge === 'end' ? r.right : r.left + r.width / 2;
  const top = Math.min(r.top, d.touch ? d.cy! - 40 : r.top) - 8;
  tip.style.left = `${clamp(x - w / 2, 8, innerWidth - w - 8)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

export function startTlDrag(d: TlDrag) {
  d.moved = true;
  $('.tl-scroll')?.classList.add('tl-dragging', d.edge ? 'tl-resizing' : 'tl-moving');
  getSelection()!.removeAllRanges();
}

// Saves the new dates (or, with `keep` false, puts the bar back) and redraws the timeline.
export function endTlDrag(keep: boolean) {
  const d = tlDrag;
  if (!d) return;
  clearTimeout(d.timer);
  tlDrag = null;
  tlDragClick = d.moved || d.armed;
  $('.tl-scroll')?.classList.remove('tl-dragging', 'tl-resizing', 'tl-moving');
  $('.tl-drag-tip')?.remove();
  d.target?.removeEventListener('touchmove', tlDragTouchMove);
  const ent = findEntity(d.id);
  if (!keep || !d.days || !ent) return d.moved && render();
  const { s, e } = tlDragDates(d);
  if (d.s0) (ent.item as Goal | Activity).startDate = s;
  if (d.e0 || fixedEnd(ent.item))
    (ent.item as { deadline?: ISODate; dueDate?: ISODate })[ent.kind === 'goal' ? 'deadline' : 'dueDate'] = e;
  save();
  render();
  toast(t('tl.datesMoved', { name: ent.item.title, dates: fmtSpan(s, e, true) }));
}

// Once a long-press has picked the bar up, moving the finger drags it instead of scrolling.
export function tlDragTouchMove(e: TouchEvent) {
  if (tlDrag?.armed && e.cancelable) e.preventDefault();
}

export function listenTlDrag() {
  viewEl.addEventListener('pointerdown', e => {
    const el = (e.target as Element).closest<HTMLElement>('[data-tl-drag]'),
      ent = el && findEntity(el.dataset.tlDrag!);
    if (!ent || (e.pointerType === 'mouse' && e.button !== 0) || tlDrag) return;
    const { kind, item } = ent,
      edge = el.dataset.tlEdge || '';
    const s0 = (item as Goal | Activity).startDate || '',
      e0 = endOf(kind, item as Goal | Activity) || '';
    // How far the drag may go: to the ends of the timeline as drawn.
    const scroll = $('.tl-scroll'),
      from = Number(scroll.dataset.from),
      to = Number(scroll.dataset.to);
    const ends = (edge === 'start' ? [s0] : edge === 'end' ? [e0] : [s0, e0]).filter(Boolean).map(dayNum);
    const d: TlDrag = (tlDrag = {
      id: item.id,
      kind,
      edge,
      s0,
      e0,
      lo: from - Math.min(...ends),
      hi: to - Math.max(...ends),
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      touch: e.pointerType !== 'mouse',
      armed: false,
      moved: false,
      days: 0,
    });
    if (!d.touch) return;
    // Touch events keep going to the element the finger started on, even after a redraw detaches it.
    d.target = e.target as HTMLElement;
    d.target.addEventListener('touchmove', tlDragTouchMove, { passive: false });
    d.timer = setTimeout(() => {
      d.armed = true;
      $('.tl-scroll')?.classList.add('tl-dragging');
      navigator.vibrate?.(15);
    }, LONG_PRESS_MS);
  });
  document.addEventListener('pointermove', e => {
    const d = tlDrag;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.x;
    d.cy = e.clientY;
    if (!d.moved) {
      const far = Math.hypot(dx, e.clientY - d.y);
      // A finger that moves before the long-press is up scrolls the timeline as usual.
      if (d.touch && !d.armed) return far > 10 && endTlDrag(false);
      if (far < 4) return;
      startTlDrag(d);
      if (!d.days) previewTlDrag(d);
    }
    const days = clamp(Math.round(dx / ui.tlPx), d.lo, d.hi);
    if (days === d.days) return;
    d.days = days;
    previewTlDrag(d);
  });
  document.addEventListener('pointerup', e => {
    const d = tlDrag;
    if (!d || e.pointerId !== d.pointerId) return;
    // A long-press let go where it started opens the menu, as it does elsewhere.
    if (d.armed && !d.moved) {
      endTlDrag(false);
      return openCtxMenu(d.id, d.x, d.y + 12);
    }
    endTlDrag(true);
  });
  document.addEventListener('pointercancel', e => {
    if (tlDrag && e.pointerId === tlDrag.pointerId) endTlDrag(false);
  });
  document.addEventListener(
    'click',
    e => {
      if (tlDragClick) {
        e.stopPropagation();
        e.preventDefault();
      }
      tlDragClick = false;
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    () => {
      tlDragClick = false;
    },
    true,
  );
}
