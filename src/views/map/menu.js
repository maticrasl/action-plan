/** The item menu on the map and timeline (right-click, long-press, keys), and their keys and double-click. */
import { t } from '../../i18n/index';
import { ui } from '../../store/state';
import { isRoutine, runsOn } from '../../core/routines/schedule';
import { today } from '../../core/dates';
import { checkedOn } from '../../core/routines/checkins';
import { ACTIVITY_STATUS } from '../../core/model';
import { isCumulative } from '../../core/cumulative';
import { hasGraph, openAddMenu, setTlCollapsed, timelineRows, tlCollapsed } from '../../legacy/app.js';
import { findEntity, relsFrom } from '../../core/relations';
import { prefs } from '../../store/prefs';
import { setView } from '../../ui/nav';
import { $, viewEl } from '../../ui/dom';
import { GOAL_FILTERS, inCategory, scopeFor } from '../filters';
import { blockers, goalScope, isComplete } from '../../core/progress';
import { db } from '../../core/state';
import { categories } from '../../core/categories';
import { closeCtxMenu, ctxMenu, showCtxMenu, toggleCtxSub } from '../../ui/menu';
import { visionRel } from '../../core/visions';
import { render } from '../index';
import { modal, openForm } from '../../ui/forms/form';
import { toggleCheckin } from '../routines';
import { openStateValue } from '../states';
import { startMapLink } from './link';
import { removeEntity, save } from '../../store/plans';
import { toast } from '../../ui/toast';
import { pinch } from './zoom';
import { askDeleteItem, relText, removeRelation } from './render';
import { tlDrag } from '../timeline/drag';

/* ---------- Map context menu: right-click, long-press, or the context-menu key ---------- */

// Map boxes and timeline rows both act as item "nodes".
export const NODE_SEL = '[data-map-node],[data-tl-node]';
// The menu also opens on the cards and rows of the other views (on a chart, only on its heading).
export const MENU_SEL = `${NODE_SEL},[data-ctx-item]`;
export const nodeId = el => el?.dataset.mapNode || el?.dataset.tlNode || el?.dataset.ctxItem;
export const LONG_PRESS_MS = 500;

export function ctxOptions(kind, item) {
  const opt = (act, label, extra = {}) => ({ act, label, ...extra });
  if (kind === 'vision') return [
    opt('edit', t('btn.edit')), ...(ui.view === 'map' ? [opt('highlight', t('ctx.highlight'))] : []), '-', opt('add:vision:parents', t('ctx.addSubvision')),
    '-', ...SHOW_IN.vision.filter(v => v !== ui.view).map(v => opt('show:' + v, t('ctx.showInView', { view: t('nav.' + v) }), { icon: v })),
    ...(ui.view === 'map' ? [opt('link', t('ctx.link'))] : []), '-', opt('delete', t('btn.delete'), { danger: true }),
  ];
  // Highlighting links and showing one goal only mean something where links are drawn.
  const options = [opt('edit', t('btn.edit')), ...(selectsInView() ? [opt('highlight', t('ctx.highlight'))] : [])];
  if (kind === 'goal') {
    options.push(
      ...(selectsInView() ? [opt('focus', t('ctx.focus'))] : []),
      '-',
      item.status === 'achieved' ? opt('status:active', t('ctx.reactivate')) : opt('status:achieved', t('ctx.markAchieved')),
      '-',
      opt('add:goal:subgoal', t('ctx.addSubgoal')),
      opt('add:activity:contributes', t('ctx.addActivityGoal')),
    );
  } else if (isRoutine(item)) {
    if (runsOn(item, today())) options.push('-', opt('checkin', t('rt.doneTodayShort'), { checked: checkedOn(item, today()) }));
  } else if (kind === 'activity') {
    options.push(
      '-',
      ...ACTIVITY_STATUS.map(s => opt('status:' + s, t('activity.' + s), { checked: item.status === s })),
      '-',
      opt('add:activity:subactivity', t('ctx.addSubactivity')),
    );
  } else {
    options.push('-', opt('value', t(isCumulative(item) ? 'ctx.addAmount' : 'ctx.addValue')), opt('add:activity:improves', t('ctx.addActivityState')));
  }
  // "Show in…" opens in place onto the other views, each with its name and icon from the navigation
  // (the full name is the accessible name and tooltip); with only one, it is offered directly.
  const views = SHOW_IN[kind].filter(v => v !== ui.view && (v !== 'graphs' || hasGraph(item)));
  const showOpt = v => opt('show:' + v, t('nav.' + v), { icon: v, name: t('ctx.showInView', { view: t('nav.' + v) }) });
  if (views.length > 1) options.push('-', { label: t('ctx.showIn'), sub: views.map(showOpt) });
  else if (views.length) options.push('-', opt('show:' + views[0], t('ctx.showInView', { view: t('nav.' + views[0]) }), { icon: views[0] }));
  options.push(opt('link', t('ctx.link')), '-', opt('delete', t('btn.delete'), { danger: true }));
  return options;
}

// The views each kind of item appears in (graphs: only states with measurements or amounts, and
// routines with check-ins).
export const SHOW_IN = { vision: ['visions', 'map'], goal: ['goals', 'map', 'timeline'], activity: ['activities', 'map', 'timeline', 'graphs'], state: ['states', 'map', 'graphs'] };

// Switches to another view with the item selected there (map, timeline) or its card brought into
// view, first changing the filters there that would hide it (setView clears the search).
export function showIn(view, id) {
  const { kind, item } = findEntity(id);
  revealIn(view, kind, item);
  prefs.set('category', ui.category);
  if (view === 'map' || view === 'timeline') Object.assign(ui, { mapSelected: id, mapRel: null });
  setView(view);
  const el = view === 'map' ? $(`[data-map-node="${id}"]`)
    : view === 'timeline' ? $(`[data-tl-node="${id}"]`)
    : view === 'graphs' ? $(`[data-gr="${id}"]`) : $(`.card[data-open="${id}"]`);
  if (!el) return;
  // In the timeline, the bar (or milestone) rather than the start of the row.
  (el.querySelector('.tl-bar, .tl-milestone') || el).scrollIntoView({ block: 'center', inline: 'center' });
  if (el.tabIndex >= 0) return el.focus({ preventScroll: true });
  el.classList.add('flash');
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
}

// Changes only the filters that hide the item in a view: the goal status shown (to all), the done
// items hidden (shown again), the goal picked (to all), the category (to one the item belongs to –
// a goal's own, then those of the goals it is linked to – or else to all) and, in the timeline,
// the folded goals it is under.
export function revealIn(view, kind, item) {
  // On the map every vision shows once no goal or category is picked and none are hidden.
  if (kind === 'vision') {
    if (view === 'map') { Object.assign(ui, { mapGoal: '', category: '' }); if (ui.hideVisions) { ui.hideVisions = false; prefs.set('hideVisions', false); } }
    return;
  }
  if (view === 'goals') {
    if (ui.goalFilter !== 'all' && item.status !== ui.goalFilter) ui.goalFilter = 'all';
    if (!inCategory(item)) ui.category = item.category || '';
    return;
  }
  const field = GOAL_FILTERS[view === 'activities' ? 'activity' : view];
  if (!field) return;
  const done = kind === 'goal' || view === 'activities' ? isComplete(kind, item) : item.status === 'done';
  if (ui.hideDone && view !== 'graphs' && kind !== 'state' && done) { ui.hideDone = false; prefs.set('hideDone', false); }
  const shows = () => { const s = scopeFor(ui[field]); return !s || s[kind].has(item.id); };
  if (!shows()) ui[field] = '';
  if (!shows()) {
    const own = kind === 'goal' ? [item.category] : relsFrom(item.id).map(r => findEntity(r.to)?.item.category);
    const holds = c => db.goals.some(g => g.category === c && goalScope(g.id)[kind].has(item.id));
    ui.category = [...own, ...categories()].find(c => c && holds(c)) || '';
  }
  if (view !== 'timeline') return;
  // Unfold only what hides it: every fold is kept that still leaves it shown.
  const scope = scopeFor(ui.timelineGoal), folded = tlCollapsed();
  const shown = set => timelineRows(scope, set).some(r => r.item?.id === item.id);
  if (!shown(folded) && shown(new Set())) setTlCollapsed([...folded].reduce((keep, k) => (shown(new Set([...keep, k])) ? keep.add(k) : keep), new Set()));
}

export function openCtxMenu(id, x, y, byKey = false) {
  const ent = findEntity(id);
  if (!ent) return;
  Object.assign(ctxMenu.dataset, { id, rel: '', add: '' });
  ctxMenu.setAttribute('aria-label', t('ctx.label', { name: ent.item.title }));
  showCtxMenu(ent.kind, t('kind.' + ent.kind), ent.item.title, ctxOptions(ent.kind, ent.item), x, y, byKey);
}

// A relationship line's menu (long-press, right-click or the menu key): it selects the line and
// offers what the selection row below offers.
export function openRelMenu(relId, x, y, byKey = false) {
  const r = db.relations.find(x => x.id === relId) || visionRel(relId);
  if (!r) return;
  Object.assign(ui, { mapRel: relId, mapSelected: null });
  render();
  Object.assign(ctxMenu.dataset, { id: '', rel: relId, add: '' });
  ctxMenu.setAttribute('aria-label', t('map.relLabel', { rel: relText(r) }));
  showCtxMenu('', t('kind.relation'), relText(r), [
    { act: 'rel-edit', label: t('btn.edit') }, { act: 'rel-remove', label: t('btn.remove'), danger: true }, { act: 'rel-deselect', label: t('btn.deselect') },
  ], x, y, byKey);
}

// The menu of a relationship line, or else of an item.
export const openMenuAt = (line, node, x, y) => (line ? openRelMenu(line.dataset.relEdit, x, y) : openCtxMenu(nodeId(node), x, y));

export function runRelAction(act, relId) {
  closeCtxMenu();
  if (act === 'rel-edit') return openForm('relation', relId);
  if (act === 'rel-remove') return removeRelation(relId);
  ui.mapRel = null;
  render();
}

export function runCtxAction(act, id) {
  const ent = findEntity(id);
  closeCtxMenu();
  if (!ent) return;
  const { kind, item } = ent;
  const [verb, arg, type] = act.split(':');
  if (verb === 'edit') return openForm(kind, id);
  if (verb === 'checkin') return toggleCheckin(id, today());
  // The popup opens by what the menu was opened on: a card, a box on the map, or a graph's heading (not the tall graph).
  if (verb === 'value') { const at = $(`[data-ctx-item="${id}"], [data-map-node="${id}"]`); return openStateValue(id, at?.querySelector(':scope.gr-card > .card-head') || at || viewEl); }
  if (verb === 'highlight') { ui.mapSelected = id; return render(); }
  if (verb === 'show') return showIn(arg, id);
  if (verb === 'focus') {
    Object.assign(ui, { [ui.view === 'timeline' ? 'timelineGoal' : 'mapGoal']: id, mapRefocus: true });
    if (!inCategory(item)) ui.category = '';
    return render();
  }
  if (verb === 'add') return openForm(arg, null, { [type]: [id], category: kind === 'goal' ? item.category : '' });
  if (verb === 'link') return ui.view === 'map' ? startMapLink(id) : openForm('relation', null, { from: id });
  if (verb === 'status') {
    item.status = arg;
    save();
    render();
    const waits = kind === 'activity' && arg === 'done' ? blockers(item) : [];
    return toast(waits.length ? t('acts.notDone', { name: waits[0].title }) : t('ctx.statusSet', { s: t(`${kind}.${arg}`) }));
  }
  if (verb === 'delete' && confirm(t('confirm.delete', { name: item.title }))) {
    removeEntity(kind, id);
    Object.values(GOAL_FILTERS).forEach(k => { if (ui[k] === id) ui[k] = ''; });
    save();
    render();
    toast(t('toast.deleted.' + kind));
  }
}

// Long-press for touch screens (iOS Safari never fires contextmenu).
export let press = null;
export function setPress(v) { press = v; }

// In the map and the timeline, with nothing being typed and no dialog or menu open: Delete (or
// Backspace, the Mac's delete key) removes the selected or focused line at once, or asks before
// deleting the selected or focused item; Enter or Space opens what is selected.
export const selectsInView = () => ui.view === 'map' || ui.view === 'timeline';
export const relShown = id => !!id && !!$(`[data-rel-edit="${id}"]`);
export const itemShown = id => !!id && !!$(`[data-map-node="${id}"],[data-tl-node="${id}"]`);

export function listenMenu() {
viewEl.addEventListener('contextmenu', e => {
  // Phones may report a still finger of a pinch as a long-press.
  if (tlDrag?.touch || pinch) return e.preventDefault();
  const node = e.target.closest(MENU_SEL), line = e.target.closest('[data-rel-edit]');
  if (!node && !line) {
    // The map's empty space offers what the Add button does.
    if (ui.view === 'map' && e.target.closest('.map-wrap')) { e.preventDefault(); openAddMenu(e.clientX, e.clientY, false); }
    return;
  }
  e.preventDefault();
  openMenuAt(line, node, e.clientX, e.clientY);
});

viewEl.addEventListener('pointerdown', e => {
  const node = e.target.closest(MENU_SEL), line = e.target.closest('[data-rel-edit]');
  if ((!node && !line) || e.pointerType === 'mouse' || e.target.closest('[data-tl-drag]')) return;
  // A second finger (a pinch starting) must not leave the first one's wait running.
  if (press) clearTimeout(press.timer);
  const p = { x: e.clientX, y: e.clientY, fired: false };
  p.timer = setTimeout(() => { p.fired = true; openMenuAt(line, node, p.x, p.y + 12); }, LONG_PRESS_MS);
  press = p;
});
viewEl.addEventListener('pointermove', e => {
  if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; }
});
['pointerup', 'pointercancel'].forEach(type => viewEl.addEventListener(type, () => press && clearTimeout(press.timer)));
// The click that ends a long-press must not also toggle highlighting or hit a menu item. Phones often
// send no click at all when the finger lifts, so a new touch ends the wait; otherwise the first tap on
// the menu would be swallowed instead.
document.addEventListener('click', e => {
  if (press?.fired) { e.stopPropagation(); e.preventDefault(); }
  press = null;
}, true);
document.addEventListener('pointerdown', () => { if (press?.fired) press = null; }, true);
}

export function listenMenuKeys() {
viewEl.addEventListener('keydown', e => {
  const line = e.target.closest?.('[data-rel-edit]'), menuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
  if (line && menuKey) {
    e.preventDefault();
    const box = line.getBoundingClientRect();
    return openRelMenu(line.dataset.relEdit, box.left + box.width / 2, box.top + box.height / 2, true);
  }
  if (line && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    return openForm('relation', line.dataset.relEdit);
  }
  const node = e.target.closest?.(NODE_SEL);
  // A fold button inside a timeline row handles its own keys.
  if (!node || e.target.closest('[data-tl-fold]')) return;
  if (menuKey) {
    e.preventDefault();
    const r = node.getBoundingClientRect();
    openCtxMenu(nodeId(node), r.left + 16, r.bottom + 4, true);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const id = nodeId(node), ent = findEntity(id);
    if (ui.mapSelected === id && ent) return openForm(ent.kind, id);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
});

viewEl.addEventListener('dblclick', e => {
  const id = nodeId(e.target.closest(NODE_SEL));
  const ent = id && findEntity(id);
  if (ent && !modal.open) openForm(ent.kind, id);
});

document.addEventListener('keydown', e => {
  if (!selectsInView() || document.querySelector('dialog[open]') || !ctxMenu.hidden) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const edgeEl = e.target.closest?.('[data-rel-edit]'), nodeEl = e.target.closest?.(NODE_SEL);
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const relId = edgeEl?.dataset.relEdit || (!nodeEl && relShown(ui.mapRel) ? ui.mapRel : '');
    const id = !relId && (nodeId(nodeEl) || (itemShown(ui.mapSelected) ? ui.mapSelected : ''));
    if (!relId && !id) return;
    e.preventDefault();
    return relId ? removeRelation(relId) : askDeleteItem(id);
  }
  if ((e.key === 'Enter' || e.key === ' ') && !edgeEl && !nodeEl && !e.target.closest?.('button, a, [tabindex]')) {
    const ent = itemShown(ui.mapSelected) && findEntity(ui.mapSelected);
    if (relShown(ui.mapRel)) openForm('relation', ui.mapRel);
    else if (ent) openForm(ent.kind, ui.mapSelected);
    else return;
    e.preventDefault();
  }
});

ctxMenu.addEventListener('click', e => {
  if (e.target.closest('[data-ctx-sub]')) return toggleCtxSub($('#ctxSub').hidden);
  const b = e.target.closest('[data-ctx]');
  if (b && ctxMenu.dataset.add) { closeCtxMenu(); openForm(b.dataset.ctx.slice(4)); }
  else if (b && ctxMenu.dataset.rel) runRelAction(b.dataset.ctx, ctxMenu.dataset.rel);
  else if (b) runCtxAction(b.dataset.ctx, ctxMenu.dataset.id);
});
}
