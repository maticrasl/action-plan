/** The views' click, input and change listeners on #view and the Add button, in one dispatcher each. */
import { db } from '../core/state';
import { ACTIVITY_STATUS, type RelType, type VisionRel } from '../core/model';
import { blockers } from '../core/progress';
import { toast } from '../ui/toast';
import { t } from '../i18n/index';
import { save } from '../store/plans';
import { $, itemCount, viewEl } from '../ui/dom';
import { ui, type Ui } from '../store/state';
import { openForm, type FormKind } from '../ui/forms/form';
import { ctxMenu } from '../ui/menu';
import { prefs } from '../store/prefs';
import { shiftRoutineWeek, tickListItem, toggleCheckin } from './routines';
import { findEntity } from '../core/relations';
import { loadSample } from '../ui/sample';
import { openTemplates } from '../ui/templates-dialog';
import { setToggle } from '../ui/settings';
import { GOAL_FILTERS, type GoalFilterTarget } from './filters';
import { VIEWS, render } from './index';
import { linkItems } from './map/link';
import { zoomMap } from './map/zoom';
import { nodeId, openAddMenu } from './map/menu';
import { removeRelation } from './map/render';
import { TL } from './timeline/render';
import { removeMeasurement } from './graphs/states';
import { removeEntry, setGraphScale } from './graphs/sums';
import { foldAllTl, toggleTlFold } from './timeline/rows';
import { openStateAmount, openStateValue } from '../ui/state-value';

export let lastNodeClick: { id: string | null; t: number } = { id: null, t: 0 };
export function setLastNodeClick(v: typeof lastNodeClick) {
  lastNodeClick = v;
}

export function cycleStatus(id: string) {
  const a = db.activities.find(x => x.id === id);
  if (!a) return;
  const next = ACTIVITY_STATUS[(ACTIVITY_STATUS.indexOf(a.status) + 1) % ACTIVITY_STATUS.length];
  const waits = blockers(a);
  if (next === 'done' && waits.length) toast(t('acts.notDone', { name: waits[0].title }));
  a.status = next;
  save();
  render();
}

$('#addBtn').addEventListener('click', e => {
  const kind = VIEWS[ui.view].add;
  if (kind !== 'item') return openForm(kind);
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  openAddMenu(r.right, r.bottom + 6, e.detail === 0);
  // Lined up with the button's right edge; above it when the button floats at the bottom (phones).
  const m = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(8, Math.min(r.right - m.width, innerWidth - m.width - 8))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(r.top > innerHeight / 2 ? r.top - m.height - 6 : r.bottom + 6, innerHeight - m.height - 8))}px`;
});

viewEl.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>(
    '[data-tl-fold],[data-tl-fold-all],[data-rel-open],[data-rel-remove],[data-rt-week],[data-checkin],[data-li-tick],[data-add-amount],[data-del-measure],[data-del-entry],[data-gr-scale],[data-cycle],[data-open],[data-new],[data-sample],[data-templates],[data-goal-filter],[data-rel-edit],[data-map-node],[data-tl-node],[data-map-clear],[data-rel-toggle],[data-hide-done],[data-hide-visions],[data-category],[data-tl-zoom],[data-tl-deps],[data-map-zoom],[data-next-more]',
  );
  // While linking by tapping, a box finishes the link and anything else (but zooming) cancels it.
  if (ui.mapLinkFrom && !(e.target as HTMLElement).closest('[data-map-zoom]')) {
    const from = ui.mapLinkFrom,
      to = el?.dataset.mapNode;
    e.stopPropagation();
    ui.mapLinkFrom = null;
    render();
    if (to && to !== from) linkItems(from, to);
    return;
  }
  if (!el) {
    // Clicking empty space in the map clears what is selected there.
    if ((e.target as HTMLElement).closest('.map-wrap, .tl-scroll') && (ui.mapSelected || ui.mapRel)) {
      ui.mapSelected = ui.mapRel = null;
      render();
    }
    return;
  }
  e.stopPropagation();
  if (el.dataset.tlFold) return toggleTlFold(el.dataset.tlFold);
  if (el.dataset.tlFoldAll) return foldAllTl(el.dataset.tlFoldAll === 'collapse');
  if (el.dataset.relOpen) return openForm('relation', el.dataset.relOpen);
  if (el.dataset.relRemove) return removeRelation(el.dataset.relRemove);
  if (el.hasAttribute('data-next-more')) {
    ui.nextAll = !ui.nextAll;
    prefs.set('nextAll', ui.nextAll);
    render();
    // Keep the page where it is; the button moves to the end of the list.
    return $('[data-next-more]')?.focus({ preventScroll: true });
  }
  if (el.dataset.rtWeek)
    return (el as HTMLButtonElement).disabled || shiftRoutineWeek(el.dataset.rtWeek, Number(el.dataset.dir));
  if (el.dataset.checkin) return toggleCheckin(el.dataset.checkin, el.dataset.date!, el);
  if (el.dataset.liTick) return tickListItem(el.dataset.liTick, el.dataset.li!, el.dataset.date);
  if (el.dataset.addAmount) return openStateAmount(el.dataset.addAmount, el);
  if (el.dataset.delMeasure) return removeMeasurement(el.dataset.delMeasure, el.dataset.date!);
  if (el.dataset.delEntry) return removeEntry(el.dataset.delEntry, el.dataset.entry!);
  if (el.dataset.grScale) return setGraphScale(el.dataset.state!, el.dataset.grScale);
  if (el.dataset.cycle) return cycleStatus(el.dataset.cycle);
  if (el.dataset.open) {
    const ent = findEntity(el.dataset.open);
    if (ent?.kind === 'state' && el.matches('.card')) return openStateValue(ent.item.id, el);
    return ent && openForm(ent.kind, ent.item.id);
  }
  if (el.dataset.new)
    return el.dataset.new === 'relation' && itemCount() < 2
      ? toast(t('err.needTwo'))
      : openForm(el.dataset.new as FormKind);
  if (el.hasAttribute('data-sample')) return loadSample();
  if (el.hasAttribute('data-templates')) return openTemplates();
  if (el.dataset.goalFilter) {
    ui.goalFilter = el.dataset.goalFilter as Ui['goalFilter'];
    return render();
  }
  if (el.dataset.relEdit) {
    if (ui.mapRel === el.dataset.relEdit) return openForm('relation', el.dataset.relEdit);
    Object.assign(ui, { mapRel: el.dataset.relEdit, mapSelected: null });
    return render();
  }
  if (el.dataset.category !== undefined) {
    ui.category = ui.category === el.dataset.category ? '' : el.dataset.category;
    prefs.set('category', ui.category);
    return render();
  }
  if (el.dataset.tlZoom) {
    ui.tlPx = TL.ZOOM[el.dataset.tlZoom as keyof typeof TL.ZOOM];
    prefs.set('tlPx', ui.tlPx);
    ui.mapRefocus = true;
    return render();
  }
  if (el.dataset.mapZoom) {
    const wrap = $('.map-wrap'),
      r = wrap.getBoundingClientRect();
    const scale = { in: ui.mapScale * 1.25, out: ui.mapScale / 1.25, reset: 1 }[
      el.dataset.mapZoom as 'in' | 'out' | 'reset'
    ];
    return zoomMap(scale, r.left + wrap.clientWidth / 2, r.top + wrap.clientHeight / 2);
  }
  if (el.hasAttribute('data-tl-deps')) return setToggle('tlDeps', !ui.tlDeps);
  const node = nodeId(el);
  if (node) {
    // A second click on the same item soon after opens it. The map is redrawn between the clicks, so the
    // browser's own dblclick may not arrive; keyboard clicks (detail 0) never count.
    const now = performance.now(),
      double = e.detail > 0 && lastNodeClick.id === node && now - lastNodeClick.t < 450;
    lastNodeClick = e.detail > 0 && !double ? { id: node, t: now } : { id: null, t: 0 };
    ui.mapRel = null;
    // In the timeline, clicking the bar itself (the part that changes) also lets its dates be dragged.
    const dates = !!(e.target as HTMLElement).closest('.tl-bar, .tl-milestone, .tl-grip');
    if (double) {
      ui.mapSelected = node;
      render();
      const ent = findEntity(node);
      return ent && openForm(ent.kind, node);
    }
    // A second click on the same part deselects; the other part switches between the two.
    const same = ui.mapSelected === node && (ui.tlDates === node) === dates;
    ui.mapSelected = same ? null : node;
    ui.tlDates = !same && dates ? node : null;
    return render();
  }
  if (el.hasAttribute('data-map-clear')) {
    ui.mapSelected = ui.mapRel = null;
    return render();
  }
  if (el.dataset.relToggle) {
    const type = el.dataset.relToggle as RelType | VisionRel;
    if (ui.mapHidden.has(type)) ui.mapHidden.delete(type);
    else ui.mapHidden.add(type);
    prefs.set('mapHidden', [...ui.mapHidden]);
    return render();
  }
  if (el.hasAttribute('data-hide-done')) return setToggle('hideDone', !ui.hideDone);
  if (el.hasAttribute('data-hide-visions')) return setToggle('hideVisions', !ui.hideVisions);
});

viewEl.addEventListener('input', e => {
  if ((e.target as HTMLInputElement).matches('[data-search]')) {
    ui.search = (e.target as HTMLInputElement).value;
    const pos = (e.target as HTMLInputElement).selectionStart;
    render();
    const box = $<HTMLInputElement>('[data-search]');
    box.focus();
    box.setSelectionRange(pos, pos);
  }
});
viewEl.addEventListener('change', e => {
  const sel = e.target as HTMLSelectElement;
  if (sel.matches('[data-goal-select]')) {
    ui[GOAL_FILTERS[sel.dataset.goalSelect as GoalFilterTarget]] = sel.value;
    ui.mapRefocus = true;
    render();
  }
});
