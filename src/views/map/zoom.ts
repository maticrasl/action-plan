/** Zoom and pan for the map, timeline and graphs: wheel, pinch, tap-and-drag, mouse drag, Safari gestures. */
import { $, scrollBox, viewEl } from '../../ui/dom';
import { ui } from '../../store/state';
import { clamp } from '../../core/util';
import { prefs } from '../../store/prefs';
import { requestRender as render } from '../../ui/render';
import { linkDrag } from './link';
import { press, setPress } from './menu';
import { MAP } from './layout';
import { endTlDrag, tlDrag } from '../timeline/drag';
import { TL } from '../timeline/render';
import { zoomGraph } from '../graphs/points';

// Safari's gesture events (not in TypeScript's DOM types).
interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

/* ---------- Zoom: ctrl + scroll, pinch, trackpad gestures ---------- */
// The map scales as a whole; the timeline and the graphs only stretch their time axis. All keep the point
// under the pointer (or between the fingers) in place.

export function zoomMap(scale: number, cx: number, cy: number) {
  const wrap = $('.map-wrap'),
    svg = wrap?.querySelector('svg');
  const s0 = ui.mapScale,
    s = clamp(scale, MAP.MIN_SCALE, MAP.MAX_SCALE);
  if (!svg || s === s0) return;
  const before = svg.getBoundingClientRect();
  const u = (cx - before.left) / s0,
    v = (cy - before.top) / s0;
  const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  svg.setAttribute('width', String(width * s));
  svg.setAttribute('height', String(height * s));
  const after = svg.getBoundingClientRect();
  wrap.style.setProperty('--map-s', String(s));
  const box = scrollBox(wrap);
  box.scrollLeft += after.left + u * s - cx;
  box.scrollTop += after.top + v * s - cy;
  ui.mapScale = s;
  prefs.set('mapScale', s);
  $('.zoom-pct').textContent = `${Math.round(s * 100)} %`;
}

export function zoomTimeline(factor: number, cx: number) {
  const p0 = ui.tlPx,
    p = clamp(p0 * factor, TL.MIN, TL.MAX);
  if (!$('.tl-scale') || p === p0) return;
  // Anchor on the day under the pointer, but never on the sticky label column.
  const at = () => ({ left: $('.tl-scale').getBoundingClientRect().left, from: Number($('.tl-scroll').dataset.from) });
  const x = Math.max(cx, $('.tl-corner').getBoundingClientRect().right);
  const b = at(),
    day = (x - b.left) / p0 + b.from;
  ui.tlPx = p;
  prefs.set('tlPx', p);
  render();
  const a = at();
  scrollBox($('.tl-scroll')).scrollLeft += a.left + (day - a.from) * p - x;
}

// Coalesce bursts of wheel / touch events into one zoom per frame.
let zoomQueue: { wrap: HTMLElement; factor: number; cx: number; cy: number } | null = null;
export function queueZoom(wrap: HTMLElement, factor: number, cx: number, cy: number) {
  if (zoomQueue) return Object.assign(zoomQueue, { factor: zoomQueue.factor * factor, cx, cy });
  zoomQueue = { wrap, factor, cx, cy };
  requestAnimationFrame(() => {
    const z = zoomQueue!;
    zoomQueue = null;
    if (z.wrap.classList.contains('map-wrap')) zoomMap(ui.mapScale * z.factor, z.cx, z.cy);
    else if (z.wrap.classList.contains('gr-plot')) zoomGraph(z.wrap, z.factor, z.cx);
    else zoomTimeline(z.factor, z.cx);
  });
}
export const ZOOM_SEL = '.map-wrap, .tl-scroll, .gr-plot';

// Two-finger pinch on touch screens. Touch events keep going to the element each finger started on,
// even after re-rendering the timeline detaches it, so the handlers are attached to those elements.
export let pinch: { wrap: HTMLElement; gap: number; targets: Set<HTMLElement> } | null = null;
export const touchGap = ([a, b]: TouchList) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
export function pinchMove(e: TouchEvent) {
  if (!pinch || e.touches.length !== 2) return;
  if (e.cancelable) e.preventDefault();
  const gap = touchGap(e.touches),
    [a, b] = e.touches;
  queueZoom(pinch.wrap, gap / pinch.gap, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
  pinch.gap = gap;
}
export function pinchEnd(e: TouchEvent) {
  if (!pinch || e.touches.length >= 2) return;
  pinch.targets.forEach(el => {
    el.removeEventListener('touchmove', pinchMove);
    (['touchend', 'touchcancel'] as const).forEach(type => el.removeEventListener(type, pinchEnd));
  });
  pinch = null;
}

// One-finger zoom on touch screens: tap, then touch again and drag – down zooms in, up zooms out,
// around the point first tapped. A second tap that doesn't move stays a double-tap (which edits).
export const TAP_ZOOM = { GAP_MS: 300, NEAR: 30, START: 8, RATE: 0.01 };
type Tap = { x: number; y: number; t: number };
let lastTap: Tap | null = null,
  tapZoom: { wrap: HTMLElement; target: HTMLElement; x: number; y0: number; y: number; moved: boolean } | null = null;
export function tapZoomMove(e: TouchEvent) {
  if (!tapZoom || e.touches.length !== 1) return;
  // From the first move on, so the drag never starts scrolling the view instead.
  if (e.cancelable) e.preventDefault();
  const y = e.touches[0].clientY;
  if (!tapZoom.moved) {
    if (Math.abs(y - tapZoom.y0) < TAP_ZOOM.START) return;
    tapZoom.moved = true;
    if (press) {
      clearTimeout(press.timer);
      setPress(null);
    }
    if (tlDrag && !tlDrag.moved) endTlDrag(false);
  }
  queueZoom(tapZoom.wrap, Math.exp((y - tapZoom.y) * TAP_ZOOM.RATE), tapZoom.x, tapZoom.y0);
  tapZoom.y = y;
}
export function tapZoomEnd() {
  const z = tapZoom;
  if (!z) return;
  z.target.removeEventListener('touchmove', tapZoomMove);
  (['touchend', 'touchcancel'] as const).forEach(type => z.target.removeEventListener(type, tapZoomEnd));
  // Keep it until the click the lifted finger may produce has been swallowed (see below).
  setTimeout(() => {
    if (tapZoom === z) tapZoom = null;
  });
}
let touchDown: Tap | false | null = null; // where and when the current one-finger touch began

// Click and drag with the mouse pans the map, the timeline and a zoomed graph (touch screens pan natively).
let pan: {
  wrap: HTMLElement;
  box: HTMLElement; // what scrolls
  id: number;
  x: number;
  y: number;
  left: number;
  top: number;
  moved: boolean;
} | null = null;

// Safari: trackpad pinch on macOS arrives as gesture events; on iOS they duplicate the touches above.
let gesture: { wrap: HTMLElement; target: EventTarget; scale: number } | null = null;
export function gestureChange(e: GestureEvent) {
  e.preventDefault();
  if (!pinch) queueZoom(gesture!.wrap, e.scale / gesture!.scale, e.clientX, e.clientY);
  gesture!.scale = e.scale;
}
export function gestureEnd() {
  gesture!.target.removeEventListener('gesturechange', gestureChange as EventListener);
  gesture!.target.removeEventListener('gestureend', gestureEnd);
  gesture = null;
}

export function listenZoom() {
  // Ctrl + wheel; trackpad pinch in Chrome, Edge and Firefox also arrives as ctrl + wheel.
  viewEl.addEventListener(
    'wheel',
    e => {
      const wrap = e.ctrlKey && (e.target as Element).closest<HTMLElement>(ZOOM_SEL);
      if (!wrap) return;
      e.preventDefault();
      const dy = e.deltaY * ([1, 16, 400][e.deltaMode] ?? 1); // deltaMode: pixels, lines or pages
      queueZoom(wrap, Math.exp(-clamp(dy, -100, 100) * 0.0025), e.clientX, e.clientY);
    },
    { passive: false },
  );

  viewEl.addEventListener(
    'touchstart',
    e => {
      const wrap = e.touches.length === 2 && (e.target as Element).closest<HTMLElement>(ZOOM_SEL);
      if (!wrap) return;
      pinch = { wrap, gap: touchGap(e.touches), targets: new Set([...e.touches].map(x => x.target as HTMLElement)) };
      pinch.targets.forEach(el => {
        el.addEventListener('touchmove', pinchMove, { passive: false });
        (['touchend', 'touchcancel'] as const).forEach(type => el.addEventListener(type, pinchEnd));
      });
      if (press) {
        clearTimeout(press.timer);
        setPress(null);
      }
      // Nor does a pinch pick up the selected timeline bar.
      if (tlDrag && !tlDrag.moved) endTlDrag(false);
    },
    { passive: true },
  );

  viewEl.addEventListener(
    'touchstart',
    e => {
      const t = e.touches.length === 1 && e.touches[0],
        prev = lastTap;
      touchDown = t && { x: t.clientX, y: t.clientY, t: e.timeStamp };
      lastTap = null;
      const wrap = t && (e.target as Element).closest<HTMLElement>(ZOOM_SEL);
      if (
        !wrap ||
        !prev ||
        e.timeStamp - prev.t > TAP_ZOOM.GAP_MS ||
        Math.hypot((t as Touch).clientX - prev.x, (t as Touch).clientY - prev.y) > TAP_ZOOM.NEAR
      )
        return;
      tapZoom = {
        wrap,
        target: e.target as HTMLElement,
        x: prev.x,
        y0: (t as Touch).clientY,
        y: (t as Touch).clientY,
        moved: false,
      };
      (e.target as HTMLElement).addEventListener('touchmove', tapZoomMove, { passive: false });
      (['touchend', 'touchcancel'] as const).forEach(type =>
        (e.target as HTMLElement).addEventListener(type, tapZoomEnd),
      );
    },
    { passive: true },
  );
  // A tap: one finger, down and up quickly, without moving. Only a tap can start a tap-and-drag.
  viewEl.addEventListener('touchend', e => {
    const t = e.changedTouches[0],
      down = touchDown;
    touchDown = null;
    const tap =
      down &&
      t &&
      !e.touches.length &&
      !tapZoom &&
      e.timeStamp - down.t < TAP_ZOOM.GAP_MS &&
      Math.hypot(t.clientX - down.x, t.clientY - down.y) < TAP_ZOOM.START;
    lastTap = tap ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
  });

  viewEl.addEventListener('pointerdown', e => {
    const wrap =
      e.pointerType === 'mouse' &&
      e.button === 0 &&
      !(e.target as Element).closest('[data-map-node],[data-tl-drag]') &&
      (e.target as Element).closest<HTMLElement>(ZOOM_SEL);
    if (!wrap) return;
    const box = scrollBox(wrap),
      r = box.getBoundingClientRect();
    if (e.clientX - r.left - box.clientLeft >= box.clientWidth || e.clientY - r.top - box.clientTop >= box.clientHeight)
      return; // scrollbar
    pan = {
      wrap,
      box,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: box.scrollLeft,
      top: box.scrollTop,
      moved: false,
    };
  });
  document.addEventListener('pointermove', e => {
    if (!pan || e.pointerId !== pan.id) return;
    const dx = e.clientX - pan.x,
      dy = e.clientY - pan.y;
    if (!pan.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      // Capture only once dragging starts, so a plain click still reaches the box under the pointer.
      pan.moved = true;
      pan.wrap.setPointerCapture(e.pointerId);
      pan.wrap.classList.add('panning');
      getSelection()!.removeAllRanges();
    }
    pan.box.scrollLeft = pan.left - dx;
    pan.box.scrollTop = pan.top - dy;
  });
  (['pointerup', 'pointercancel'] as const).forEach(type =>
    document.addEventListener(type, e => {
      if (!pan || e.pointerId !== pan.id) return;
      pan.wrap.classList.remove('panning');
      // Keep the drag until the click it may produce has been swallowed below.
      setTimeout(() => {
        pan = null;
      });
    }),
  );
  // The click that ends a drag (panning, or linking two boxes) must not select a box.
  document.addEventListener(
    'click',
    e => {
      if (pan?.moved || linkDrag?.moved || tapZoom?.moved) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );

  viewEl.addEventListener('gesturestart', e => {
    const wrap = (e.target as Element).closest?.<HTMLElement>(ZOOM_SEL);
    if (!wrap) return;
    e.preventDefault();
    gesture = { wrap, target: e.target!, scale: 1 };
    e.target!.addEventListener('gesturechange', gestureChange as EventListener);
    e.target!.addEventListener('gestureend', gestureEnd);
  });
}
