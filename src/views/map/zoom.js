/** Zoom and pan for the map, timeline and graphs: wheel, pinch, tap-and-drag, mouse drag, Safari gestures. */
import { $, viewEl } from '../../ui/dom';
import { ui } from '../../store/state';
import { clamp } from '../../core/util';
import { GR, TL, grCharts, grDrawW, graphFor } from '../../legacy/app.js';
import { prefs } from '../../store/prefs';
import { render } from '../index';
import { findEntity } from '../../core/relations';
import { linkDrag } from './link';
import { press, setPress } from './menu';
import { MAP } from './layout';
import { endTlDrag, tlDrag } from '../timeline/drag';

/* ---------- Zoom: ctrl + scroll, pinch, trackpad gestures ---------- */
// The map scales as a whole; the timeline and the graphs only stretch their time axis. All keep the point
// under the pointer (or between the fingers) in place.

export function zoomMap(scale, cx, cy) {
  const wrap = $('.map-wrap'), svg = wrap?.querySelector('svg');
  const s0 = ui.mapScale, s = clamp(scale, MAP.MIN_SCALE, MAP.MAX_SCALE);
  if (!svg || s === s0) return;
  const before = svg.getBoundingClientRect();
  const u = (cx - before.left) / s0, v = (cy - before.top) / s0;
  const [, , width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
  svg.setAttribute('width', width * s);
  svg.setAttribute('height', height * s);
  const after = svg.getBoundingClientRect();
  wrap.scrollLeft += after.left + u * s - cx;
  wrap.scrollTop += after.top + v * s - cy;
  ui.mapScale = s;
  prefs.set('mapScale', s);
  $('.zoom-pct').textContent = `${Math.round(s * 100)} %`;
}

export function zoomTimeline(factor, cx) {
  const p0 = ui.tlPx, p = clamp(p0 * factor, TL.MIN, TL.MAX);
  if (!$('.tl-scale') || p === p0) return;
  // Anchor on the day under the pointer, but never on the sticky label column.
  const at = () => ({ left: $('.tl-scale').getBoundingClientRect().left, from: Number($('.tl-scroll').dataset.from) });
  const x = Math.max(cx, $('.tl-corner').getBoundingClientRect().right);
  const b = at(), day = (x - b.left) / p0 + b.from;
  ui.tlPx = p;
  prefs.set('tlPx', p);
  render();
  const a = at();
  $('.tl-scroll').scrollLeft += a.left + (day - a.from) * p - x;
}

// Only that graph is redrawn, into the same element, so a pinch that started on it keeps going.
export function zoomGraph(plot, factor, cx) {
  const id = plot.closest('[data-gr]')?.dataset.gr, c = grCharts[id], item = id && findEntity(id)?.item;
  if (!c || !item) return;
  const z0 = clamp(ui.grZoom[id] || 1, ...c.zoom), z = clamp(z0 * factor, ...c.zoom);
  if (z === z0) return;
  const svg = plot.querySelector('svg'), w0 = Number(svg.getAttribute('width'));
  const u = (cx - svg.getBoundingClientRect().left - GR.L) / (w0 - GR.L - GR.R);
  ui.grZoom[id] = z;
  const fresh = document.createElement('div');
  fresh.innerHTML = graphFor(item, grDrawW);
  const next = fresh.querySelector('.gr-plot');
  plot.className = next.className;
  plot.replaceChildren(...next.childNodes);
  const now = plot.querySelector('svg'), w = Number(now.getAttribute('width'));
  plot.scrollLeft += now.getBoundingClientRect().left + GR.L + u * (w - GR.L - GR.R) - cx;
}

// Coalesce bursts of wheel / touch events into one zoom per frame.
export let zoomQueue = null;
export function queueZoom(wrap, factor, cx, cy) {
  if (zoomQueue) return Object.assign(zoomQueue, { factor: zoomQueue.factor * factor, cx, cy });
  zoomQueue = { wrap, factor, cx, cy };
  requestAnimationFrame(() => {
    const z = zoomQueue;
    zoomQueue = null;
    if (z.wrap.classList.contains('map-wrap')) zoomMap(ui.mapScale * z.factor, z.cx, z.cy);
    else if (z.wrap.classList.contains('gr-plot')) zoomGraph(z.wrap, z.factor, z.cx);
    else zoomTimeline(z.factor, z.cx);
  });
}
export const ZOOM_SEL = '.map-wrap, .tl-scroll, .gr-plot';

// Two-finger pinch on touch screens. Touch events keep going to the element each finger started on,
// even after re-rendering the timeline detaches it, so the handlers are attached to those elements.
export let pinch = null;
export const touchGap = ([a, b]) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
export function pinchMove(e) {
  if (!pinch || e.touches.length !== 2) return;
  if (e.cancelable) e.preventDefault();
  const gap = touchGap(e.touches), [a, b] = e.touches;
  queueZoom(pinch.wrap, gap / pinch.gap, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
  pinch.gap = gap;
}
export function pinchEnd(e) {
  if (!pinch || e.touches.length >= 2) return;
  pinch.targets.forEach(el => {
    el.removeEventListener('touchmove', pinchMove);
    ['touchend', 'touchcancel'].forEach(type => el.removeEventListener(type, pinchEnd));
  });
  pinch = null;
}

// One-finger zoom on touch screens: tap, then touch again and drag – down zooms in, up zooms out,
// around the point first tapped. A second tap that doesn't move stays a double-tap (which edits).
export const TAP_ZOOM = { GAP_MS: 300, NEAR: 30, START: 8, RATE: 0.01 };
export let lastTap = null, tapZoom = null;
export function tapZoomMove(e) {
  if (!tapZoom || e.touches.length !== 1) return;
  // From the first move on, so the drag never starts scrolling the view instead.
  if (e.cancelable) e.preventDefault();
  const y = e.touches[0].clientY;
  if (!tapZoom.moved) {
    if (Math.abs(y - tapZoom.y0) < TAP_ZOOM.START) return;
    tapZoom.moved = true;
    if (press) { clearTimeout(press.timer); setPress(null); }
    if (tlDrag && !tlDrag.moved) endTlDrag(false);
  }
  queueZoom(tapZoom.wrap, Math.exp((y - tapZoom.y) * TAP_ZOOM.RATE), tapZoom.x, tapZoom.y0);
  tapZoom.y = y;
}
export function tapZoomEnd() {
  const z = tapZoom;
  if (!z) return;
  z.target.removeEventListener('touchmove', tapZoomMove);
  ['touchend', 'touchcancel'].forEach(type => z.target.removeEventListener(type, tapZoomEnd));
  // Keep it until the click the lifted finger may produce has been swallowed (see below).
  setTimeout(() => { if (tapZoom === z) tapZoom = null; });
}
export let touchDown = null; // where and when the current one-finger touch began

// Click and drag with the mouse pans the map, the timeline and a zoomed graph (touch screens pan natively).
export let pan = null;

// Safari: trackpad pinch on macOS arrives as gesture events; on iOS they duplicate the touches above.
export let gesture = null;
export function gestureChange(e) {
  e.preventDefault();
  if (!pinch) queueZoom(gesture.wrap, e.scale / gesture.scale, e.clientX, e.clientY);
  gesture.scale = e.scale;
}
export function gestureEnd() {
  gesture.target.removeEventListener('gesturechange', gestureChange);
  gesture.target.removeEventListener('gestureend', gestureEnd);
  gesture = null;
}

export function listenZoom() {
// Ctrl + wheel; trackpad pinch in Chrome, Edge and Firefox also arrives as ctrl + wheel.
viewEl.addEventListener('wheel', e => {
  const wrap = e.ctrlKey && e.target.closest(ZOOM_SEL);
  if (!wrap) return;
  e.preventDefault();
  const dy = e.deltaY * ([1, 16, 400][e.deltaMode] ?? 1); // deltaMode: pixels, lines or pages
  queueZoom(wrap, Math.exp(-clamp(dy, -100, 100) * 0.0025), e.clientX, e.clientY);
}, { passive: false });

viewEl.addEventListener('touchstart', e => {
  const wrap = e.touches.length === 2 && e.target.closest(ZOOM_SEL);
  if (!wrap) return;
  pinch = { wrap, gap: touchGap(e.touches), targets: new Set([...e.touches].map(x => x.target)) };
  pinch.targets.forEach(el => {
    el.addEventListener('touchmove', pinchMove, { passive: false });
    ['touchend', 'touchcancel'].forEach(type => el.addEventListener(type, pinchEnd));
  });
  if (press) { clearTimeout(press.timer); setPress(null); }
  // Nor does a pinch pick up the selected timeline bar.
  if (tlDrag && !tlDrag.moved) endTlDrag(false);
}, { passive: true });

viewEl.addEventListener('touchstart', e => {
  const t = e.touches.length === 1 && e.touches[0], prev = lastTap;
  touchDown = t && { x: t.clientX, y: t.clientY, t: e.timeStamp };
  lastTap = null;
  const wrap = t && e.target.closest(ZOOM_SEL);
  if (!wrap || !prev || e.timeStamp - prev.t > TAP_ZOOM.GAP_MS || Math.hypot(t.clientX - prev.x, t.clientY - prev.y) > TAP_ZOOM.NEAR) return;
  tapZoom = { wrap, target: e.target, x: prev.x, y0: t.clientY, y: t.clientY, moved: false };
  e.target.addEventListener('touchmove', tapZoomMove, { passive: false });
  ['touchend', 'touchcancel'].forEach(type => e.target.addEventListener(type, tapZoomEnd));
}, { passive: true });
// A tap: one finger, down and up quickly, without moving. Only a tap can start a tap-and-drag.
viewEl.addEventListener('touchend', e => {
  const t = e.changedTouches[0], down = touchDown;
  touchDown = null;
  const tap = down && t && !e.touches.length && !tapZoom && e.timeStamp - down.t < TAP_ZOOM.GAP_MS && Math.hypot(t.clientX - down.x, t.clientY - down.y) < TAP_ZOOM.START;
  lastTap = tap ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
});

viewEl.addEventListener('pointerdown', e => {
  const wrap = e.pointerType === 'mouse' && e.button === 0 && !e.target.closest('[data-map-node],[data-tl-drag]') && e.target.closest(ZOOM_SEL);
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  if (e.clientX - r.left - wrap.clientLeft >= wrap.clientWidth || e.clientY - r.top - wrap.clientTop >= wrap.clientHeight) return; // scrollbar
  pan = { wrap, id: e.pointerId, x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!pan || e.pointerId !== pan.id) return;
  const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
  if (!pan.moved) {
    if (Math.hypot(dx, dy) < 5) return;
    // Capture only once dragging starts, so a plain click still reaches the box under the pointer.
    pan.moved = true;
    pan.wrap.setPointerCapture(e.pointerId);
    pan.wrap.classList.add('panning');
    getSelection().removeAllRanges();
  }
  pan.wrap.scrollLeft = pan.left - dx;
  pan.wrap.scrollTop = pan.top - dy;
});
['pointerup', 'pointercancel'].forEach(type => document.addEventListener(type, e => {
  if (!pan || e.pointerId !== pan.id) return;
  pan.wrap.classList.remove('panning');
  // Keep the drag until the click it may produce has been swallowed below.
  setTimeout(() => { pan = null; });
}));
// The click that ends a drag (panning, or linking two boxes) must not select a box.
document.addEventListener('click', e => {
  if (pan?.moved || linkDrag?.moved || tapZoom?.moved) { e.stopPropagation(); e.preventDefault(); }
}, true);

viewEl.addEventListener('gesturestart', e => {
  const wrap = e.target.closest?.(ZOOM_SEL);
  if (!wrap) return;
  e.preventDefault();
  gesture = { wrap, target: e.target, scale: 1 };
  e.target.addEventListener('gesturechange', gestureChange);
  e.target.addEventListener('gestureend', gestureEnd);
});
}
