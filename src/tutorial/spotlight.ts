/** "Show me": a ring around one control until the next click, scrolled into view. */
import { $, scrollBox } from '../ui/dom';

export const SPOT_PAD = 6;

export const isVisible = (el: Element | null | undefined): el is Element =>
  !!el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
export const firstVisible = (sels?: string[]) =>
  (sels || []).map(s => document.querySelector(s)).find(isVisible) || null;

// The map (with the main pane) and the timeline scroll on their own; a target inside them is only partly on screen.
export const SCROLLER = '.map-wrap, .tl-scroll';
export const scrollerOf = (el: Element) => {
  const wrap = el.parentElement?.closest(SCROLLER);
  return wrap ? scrollBox(wrap) : null;
};

// Scroll so the target's top sits just under the (sticky) top bar; a target inside the map or
// timeline is first scrolled to the middle of it.
export function bringIntoView(el: Element | null) {
  if (!el || el.closest('.topbar, .nav') || getComputedStyle(el).position === 'fixed') return;
  const wrap = scrollerOf(el);
  if (wrap) {
    const r = el.getBoundingClientRect(),
      w = wrap.getBoundingClientRect();
    wrap.scrollLeft += r.left + r.width / 2 - (w.left + wrap.clientLeft + wrap.clientWidth / 2);
    wrap.scrollTop += r.top + r.height / 2 - (w.top + wrap.clientTop + wrap.clientHeight / 2);
  }
  const r = el.getBoundingClientRect();
  const top = $('.topbar').getBoundingClientRect().bottom + 8;
  if (r.top < top || r.bottom > innerHeight) window.scrollBy(0, r.top - top);
}

/* ---------- The ring ---------- */

let spotSels: string[] | null = null;

// The ring around the target, clipped to the screen and to the map or timeline it sits in.
function placeSpot() {
  const ring = document.querySelector<HTMLElement>('.spot-ring');
  const target = spotSels && firstVisible(spotSels);
  if (!ring || !target) return;
  const r = target.getBoundingClientRect();
  const w = scrollerOf(target)?.getBoundingClientRect() || { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 };
  const vw = document.documentElement.clientWidth;
  const left = Math.max(r.left - SPOT_PAD, w.left, 4),
    top = Math.max(r.top - SPOT_PAD, w.top, 4);
  Object.assign(ring.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${Math.min(r.right + SPOT_PAD, w.right, vw - 4) - left}px`,
    height: `${Math.min(r.bottom + SPOT_PAD, w.bottom, innerHeight - 4) - top}px`,
  });
}

const spotKeys = (e: KeyboardEvent) => {
  if (e.key === 'Escape') clearSpotlight();
};

// Points at the first visible of `sels` until the next click or Esc. False when none is on screen.
export function spotlight(sels: string[]): boolean {
  clearSpotlight();
  const target = firstVisible(sels);
  if (!target) return false;
  spotSels = sels;
  bringIntoView(target);
  document.body.insertAdjacentHTML('beforeend', '<div class="spot-ring" aria-hidden="true"></div>');
  placeSpot();
  addEventListener('resize', placeSpot);
  addEventListener('scroll', placeSpot, true);
  addEventListener('keydown', spotKeys, true);
  // From the next press on: the click on "Show me" itself has finished by then.
  setTimeout(() => spotSels && addEventListener('pointerdown', clearSpotlight, true), 0);
  return true;
}

export const spotlightOn = () => !!spotSels;

export function clearSpotlight() {
  if (!spotSels) return;
  spotSels = null;
  document.querySelectorAll('.spot-ring').forEach(el => el.remove());
  removeEventListener('resize', placeSpot);
  removeEventListener('scroll', placeSpot, true);
  removeEventListener('keydown', spotKeys, true);
  removeEventListener('pointerdown', clearSpotlight, true);
}
