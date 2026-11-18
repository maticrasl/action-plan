/** Linking two map boxes by dragging from one to the other, or picking it from the menu. */
import { ui } from '../../store/state';
import { requestRender as render } from '../../ui/render';
import { findVision } from '../../core/visions';
import { findEntity, possibleTypes } from '../../core/relations';
import { toast } from '../../ui/toast';
import { t } from '../../i18n/index';
import { modal, openForm } from '../../ui/forms/form';
import { $, viewEl } from '../../ui/dom';
import { ctxMenu } from '../../ui/menu';
import { linkVision, visionLinkError } from './visions';
import { endTlDrag, tlDrag } from '../timeline/drag';
import { selectsInView } from './keys';

/* ---------- Linking two map boxes ----------
   With a mouse, drag from one box to another; releasing anywhere but another box drops the link.
   On touch screens (where dragging scrolls), choose "Link to…" in a box's long-press menu, then tap
   the other box. Either way the relationship form opens with only the types that fit the two items. */

export function startMapLink(id: string) {
  ui.mapLinkFrom = id;
  ui.mapSelected = null;
  render();
}

// Whether any relationship fits two items, in either direction.
export const canLink = (a: string, b: string) =>
  findVision(a) || findVision(b)
    ? !visionLinkError(a, b)
    : possibleTypes(a, b).length > 0 || possibleTypes(b, a).length > 0;
export const LINK_MARKS = ['link-source', 'link-target', 'link-bad'];

export function linkItems(from: string, to: string) {
  if (findVision(from) || findVision(to)) return linkVision(from, to);
  if (!canLink(from, to))
    return toast(t('map.linkNone', { a: findEntity(from)!.item.title, b: findEntity(to)!.item.title }));
  openForm('relation', null, { from, to });
}

// A mouse drag from a box: where it started, whether it has moved, its line and the box it is over.
interface LinkDrag {
  from: string;
  id: number;
  x: number;
  y: number;
  moved: boolean;
  line?: Element | null;
  target?: string | null;
  ended?: boolean;
}
export let linkDrag: LinkDrag | null = null;
// A point on the screen in the map's own coordinates.
export function mapPoint(svg: SVGSVGElement, x: number, y: number) {
  const p = svg.createSVGPoint();
  Object.assign(p, { x, y });
  return p.matrixTransform(svg.getScreenCTM()!.inverse());
}

// Clears the drag's line and marks; the drag itself is kept until the click it may produce has been swallowed.
export function endLinkDrag(): Partial<LinkDrag> {
  const done = linkDrag;
  if (!done) return {};
  done.ended = true;
  done.line?.remove();
  document.querySelectorAll(LINK_MARKS.map(c => '.' + c).join()).forEach(n => n.classList.remove(...LINK_MARKS));
  $('.map-wrap')?.classList.remove('linking');
  setTimeout(() => {
    if (linkDrag === done) linkDrag = null;
  });
  return done;
}

export function listenLink() {
  viewEl.addEventListener('pointerdown', e => {
    const node =
      e.pointerType === 'mouse' && e.button === 0 && (e.target as Element).closest<HTMLElement>('[data-map-node]');
    if (node) linkDrag = { from: node.dataset.mapNode!, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  document.addEventListener('pointermove', e => {
    if (!linkDrag || e.pointerId !== linkDrag.id) return;
    const svg = $<SVGSVGElement>('.map-wrap svg'),
      src = $<SVGElement>(`[data-map-node="${linkDrag.from}"]`);
    if (!svg || !src) return endLinkDrag();
    if (!linkDrag.moved) {
      if (Math.hypot(e.clientX - linkDrag.x, e.clientY - linkDrag.y) < 5) return;
      linkDrag.moved = true;
      const r = src.getBoundingClientRect(),
        c = mapPoint(svg, r.left + r.width / 2, r.top + r.height / 2);
      svg.insertAdjacentHTML(
        'beforeend',
        `<line class="link-line" x1="${c.x}" y1="${c.y}" x2="${c.x}" y2="${c.y}"></line>`,
      );
      linkDrag.line = svg.lastElementChild;
      src.classList.add('link-source');
      $('.map-wrap').classList.add('linking');
      getSelection()!.removeAllRanges();
    }
    const p = mapPoint(svg, e.clientX, e.clientY);
    linkDrag.line!.setAttribute('x2', String(p.x));
    linkDrag.line!.setAttribute('y2', String(p.y));
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGElement>('[data-map-node]');
    const to = over && over !== src ? over.dataset.mapNode : null;
    if (to === linkDrag.target) return;
    svg.querySelector('.link-target, .link-bad')?.classList.remove(...LINK_MARKS.slice(1));
    linkDrag.target = to;
    if (to) over!.classList.add(canLink(linkDrag.from, to) ? 'link-target' : 'link-bad');
  });

  document.addEventListener('pointerup', e => {
    if (!linkDrag || e.pointerId !== linkDrag.id || linkDrag.ended) return;
    const { moved, from } = endLinkDrag();
    if (!moved) return;
    const to = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGElement>('[data-map-node]')?.dataset.mapNode;
    if (to && to !== from) linkItems(from!, to);
  });
  document.addEventListener('pointercancel', e => {
    if (linkDrag && e.pointerId === linkDrag.id) endLinkDrag();
  });
  // Escape drops a link being dragged or picked.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || modal.open || !ctxMenu.hidden) return;
    if (linkDrag?.moved && !linkDrag.ended) endLinkDrag();
    else if (tlDrag) endTlDrag(false);
    else if (ui.mapLinkFrom) {
      ui.mapLinkFrom = null;
      render();
    } else if (selectsInView() && (ui.mapSelected || ui.mapRel) && !document.querySelector('dialog[open]')) {
      ui.mapSelected = ui.mapRel = null;
      render();
    }
  });
}
