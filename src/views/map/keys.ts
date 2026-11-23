/** Keys on map and timeline items and lines (menu key, Enter, Delete), double-click, and the item menu's clicks. */
import { ui } from '../../store/state';
import { $, viewEl } from '../../ui/dom';
import { NODE_SEL, nodeId, openCtxMenu, openRelMenu, runCtxAction, runRelAction } from './menu';
import { modal, openForm, type FormKind } from '../../ui/forms/form';
import { findEntity } from '../../core/relations';
import { closeCtxMenu, ctxMenu, toggleCtxSub } from '../../ui/menu';
import { askDeleteItem, removeRelation } from './render';

// In the map and the timeline, with nothing being typed and no dialog or menu open: Delete (or
// Backspace, the Mac's delete key) removes the selected or focused line at once, or asks before
// deleting the selected or focused item; Enter or Space opens what is selected.
export const selectsInView = () => ui.view === 'map' || ui.view === 'timeline';
export const relShown = (id: string | null | undefined) => !!id && !!$(`[data-rel-edit="${id}"]`);
export const itemShown = (id: string | null | undefined) =>
  !!id && !!$(`[data-map-node="${id}"],[data-tl-node="${id}"]`);

export function listenMenuKeys() {
  viewEl.addEventListener('keydown', e => {
    const line = (e.target as Element).closest?.<HTMLElement>('[data-rel-edit]'),
      menuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
    if (line && menuKey) {
      e.preventDefault();
      const box = line.getBoundingClientRect();
      return openRelMenu(line.dataset.relEdit!, box.left + box.width / 2, box.top + box.height / 2, true);
    }
    if (line && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      return openForm('relation', line.dataset.relEdit!);
    }
    const node = (e.target as Element).closest?.<HTMLElement>(NODE_SEL);
    // A fold button inside a timeline row handles its own keys.
    if (!node || (e.target as Element).closest('[data-tl-fold]')) return;
    if (menuKey) {
      e.preventDefault();
      const r = node.getBoundingClientRect();
      openCtxMenu(nodeId(node)!, r.left + 16, r.bottom + 4, true);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const id = nodeId(node),
        ent = findEntity(id!);
      if (ui.mapSelected === id && ent) return openForm(ent.kind, id);
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });

  viewEl.addEventListener('dblclick', e => {
    const id = nodeId((e.target as Element).closest<HTMLElement>(NODE_SEL));
    const ent = id && findEntity(id);
    if (ent && !modal.open) openForm(ent.kind, id!);
  });

  document.addEventListener('keydown', e => {
    if (!selectsInView() || document.querySelector('dialog[open]') || !ctxMenu.hidden) return;
    if ((e.target as Element).closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const edgeEl = (e.target as Element).closest?.<HTMLElement>('[data-rel-edit]'),
      nodeEl = (e.target as Element).closest?.<HTMLElement>(NODE_SEL);
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const relId = edgeEl?.dataset.relEdit || (!nodeEl && relShown(ui.mapRel) ? ui.mapRel : '');
      const id = !relId && (nodeId(nodeEl) || (itemShown(ui.mapSelected) ? ui.mapSelected : ''));
      if (!relId && !id) return;
      e.preventDefault();
      return relId ? removeRelation(relId) : askDeleteItem(id as string);
    }
    if (
      (e.key === 'Enter' || e.key === ' ') &&
      !edgeEl &&
      !nodeEl &&
      !(e.target as Element).closest?.('button, a, [tabindex]')
    ) {
      const ent = itemShown(ui.mapSelected) && findEntity(ui.mapSelected!);
      if (relShown(ui.mapRel)) openForm('relation', ui.mapRel);
      else if (ent) openForm(ent.kind, ui.mapSelected);
      else return;
      e.preventDefault();
    }
  });

  ctxMenu.addEventListener('click', e => {
    if ((e.target as Element).closest('[data-ctx-sub]')) return toggleCtxSub($('#ctxSub').hidden as boolean);
    const b = (e.target as Element).closest<HTMLElement>('[data-ctx]');
    if (b && ctxMenu.dataset.add) {
      closeCtxMenu();
      openForm(b.dataset.ctx!.slice(4) as FormKind);
    } else if (b && ctxMenu.dataset.rel) runRelAction(b.dataset.ctx!, ctxMenu.dataset.rel);
    else if (b) runCtxAction(b.dataset.ctx!, ctxMenu.dataset.id!, ctxMenu.dataset.plan);
  });
}
