/** The floating menu: shown at a point and kept on screen, moved through by keys, closed by a press elsewhere. */
import { $, esc } from './dom';
import { getSeen, markSeen } from '../store/seen';

export const ctxMenu = $('#ctxMenu');

// One item: `act` is what it does; `name` (with `icon`, a view) labels an icon-led item; `sub` makes a parent.
export interface MenuOption {
  act?: string;
  label: string;
  name?: string;
  icon?: string;
  danger?: boolean;
  checked?: boolean;
  sub?: MenuOption[];
}

export let ctxOpenedAt = 0;

// Fills the menu – a heading with a tag and a name (none without a title), then its options – and shows it at x, y, kept on screen.
// An option with a sub list is a parent that opens its items in place, below it (see toggleCtxSub).
// Opened from the keyboard, its first item takes focus; opened by a finger or the mouse, the menu itself
// does, so no item is marked under the finger (the arrow keys still reach them).
export function showCtxMenu(
  tagClass: string,
  tag: string,
  title: string,
  options: (MenuOption | '-')[],
  x: number,
  y: number,
  byKey = false,
) {
  ctxOpenedAt = performance.now();
  if (!getSeen().menu) markSeen({ menu: true }); // the tip about the menu is not needed any more
  ctxMenu.innerHTML =
    (title
      ? `<div class="ctx-head"><span class="tag ${tagClass}">${tag}</span><strong title="${esc(title)}">${esc(title)}</strong></div>`
      : '') +
    options
      .map(o =>
        o === '-'
          ? '<hr>'
          : o.sub
            ? `<button type="button" tabindex="-1" data-ctx-sub role="menuitem" aria-haspopup="true" aria-expanded="false" aria-controls="ctxSub">${esc(o.label)}<svg class="ctx-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>` +
              `<div class="ctx-sub" id="ctxSub" role="group" aria-label="${esc(o.label)}" hidden>${o.sub.map(ctxButton).join('')}</div>`
            : ctxButton(o),
      )
      .join('');
  ctxMenu.hidden = false;
  const { width, height } = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
  (byKey ? ctxMenu.querySelector('button')! : ctxMenu).focus();
}

// One item; a view's icon goes before its name in the "Show in…" list, after the words otherwise.
export const ctxButton = (o: MenuOption) => {
  const icon = o.icon ? $(`.nav-item[data-view="${o.icon}"] svg`).outerHTML : '';
  return `<button type="button" tabindex="-1" data-ctx="${o.act}" class="${o.danger ? 'danger' : ''}" role="${o.checked === undefined ? 'menuitem' : 'menuitemradio'}"${o.checked === undefined ? '' : ` aria-checked="${o.checked}"`}${o.name ? ` aria-label="${esc(o.name)}" title="${esc(o.name)}"` : ''}>${o.name ? icon : ''}${esc(o.label)}${o.name ? '' : icon}</button>`;
};

// Opens (or closes) the parent's items in place; the menu then moves up as far as it needs to stay
// on screen, and scrolls to the opened items when it is taller than the screen.
export function toggleCtxSub(open: boolean) {
  const parent = ctxMenu.querySelector('[data-ctx-sub]')!,
    sub = $('#ctxSub');
  sub.hidden = !open;
  parent.setAttribute('aria-expanded', String(open));
  const r = ctxMenu.getBoundingClientRect();
  ctxMenu.style.top = `${Math.max(8, Math.min(r.top, innerHeight - r.height - 8))}px`;
  const below = sub.getBoundingClientRect().bottom - ctxMenu.getBoundingClientRect().bottom + 6;
  if (open && below > 0) ctxMenu.scrollTop += below;
}

export function closeCtxMenu(refocus = false) {
  if (ctxMenu.hidden) return;
  ctxMenu.hidden = true;
  if (refocus)
    $(
      ctxMenu.dataset.add
        ? '#addBtn'
        : ctxMenu.dataset.rel
          ? `[data-rel-edit="${ctxMenu.dataset.rel}"]`
          : `[data-map-node="${ctxMenu.dataset.id}"], [data-tl-node="${ctxMenu.dataset.id}"]`,
    )?.focus();
}

ctxMenu.addEventListener('keydown', e => {
  const items = [...ctxMenu.querySelectorAll('button')].filter(b => !b.closest('[hidden]'));
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  // The "Show in…" parent: Right opens it onto its first item; Left (or Escape) on one of its items
  // closes it back onto the parent, as does Left on the open parent.
  const parent = ctxMenu.querySelector<HTMLElement>('[data-ctx-sub]'),
    inSub = !!document.activeElement!.closest('.ctx-sub');
  if (parent && e.key === 'ArrowRight' && document.activeElement === parent) {
    e.preventDefault();
    toggleCtxSub(true);
    return $('#ctxSub button').focus();
  }
  if (
    parent &&
    ((e.key === 'ArrowLeft' && (inSub || document.activeElement === parent)) || (e.key === 'Escape' && inSub))
  ) {
    e.preventDefault();
    toggleCtxSub(false);
    return parent.focus();
  }
  // With the menu itself focused (i = -1), Down goes to the first item and Up to the last.
  const moves: Record<string, number> = {
    ArrowDown: i + 1,
    ArrowUp: (i < 0 ? items.length : i) - 1,
    Home: 0,
    End: items.length - 1,
  };
  if (e.key in moves) {
    e.preventDefault();
    items[(moves[e.key] + items.length) % items.length].focus();
  } else if (e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault();
    closeCtxMenu(true);
  }
});
document.addEventListener('pointerdown', e => {
  if (!ctxMenu.contains(e.target as Node)) closeCtxMenu();
});
addEventListener('resize', () => closeCtxMenu());
// Scrolling closes the menu, but not a scroll that arrives right after it opened: browsers deliver
// scroll events on the next frame, so one from just before (a redraw putting the map's scroll back,
// as a line's menu does when it selects the line, or the end of a swipe) can land after it.
// Scrolling the menu itself (taller than a phone held sideways) keeps it open.
document.addEventListener(
  'scroll',
  e => {
    if (e.target !== ctxMenu && performance.now() - ctxOpenedAt > 400) closeCtxMenu();
  },
  true,
);
