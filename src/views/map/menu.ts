/** The item menu on the map and timeline: what it offers, opening it (right-click, long-press) and what it does. */
import { t } from '../../i18n/index';
import { ui } from '../../store/state';
import { isRoutine, runsOn } from '../../core/routines/schedule';
import { today } from '../../core/dates';
import { checkedOn } from '../../core/routines/checkins';
import { ACTIVITY_STATUS } from '../../core/model';
import { isCumulative } from '../../core/cumulative';
import { findEntity, relsFrom } from '../../core/relations';
import { prefs } from '../../store/prefs';
import { setView } from '../../ui/nav';
import { $, viewEl } from '../../ui/dom';
import { GOAL_FILTERS, inCategory, scopeFor } from '../filters';
import { blockers, goalScope, isComplete } from '../../core/progress';
import { db } from '../../core/state';
import { categories } from '../../core/categories';
import { closeCtxMenu, ctxMenu, showCtxMenu } from '../../ui/menu';
import { visionRel } from '../../core/visions';
import { requestRender as render } from '../../ui/render';
import { openForm } from '../../ui/forms/form';
import { toggleCheckin } from '../routines';
import { startMapLink } from './link';
import { removeEntity, save } from '../../store/plans';
import { toast } from '../../ui/toast';
import { pinch } from './zoom';
import { relText, removeRelation } from './render';
import { tlDrag } from '../timeline/drag';
import type { Activity, Goal, ItemKind, State, Vision } from '../../core/model';
import type { ParentKind, PlanItem } from '../../core/relations';
import type { TextKey } from '../../i18n/index';
import type { ViewName } from '../../store/state';
import type { MenuOption } from '../../ui/menu';
import type { FormKind } from '../../ui/forms/form';
import type { GoalFilterTarget } from '../filters';
import { selectsInView } from './keys';
import { setTlCollapsed, timelineRows, tlCollapsed } from '../timeline/rows';
import { openStateValue } from '../../ui/state-value';
import { hasGraph } from '../../core/series';

/* ---------- Map context menu: right-click, long-press, or the context-menu key ---------- */

// Map boxes and timeline rows both act as item "nodes".
export const NODE_SEL = '[data-map-node],[data-tl-node]';
// The menu also opens on the cards and rows of the other views (on a chart, only on its heading).
export const MENU_SEL = `${NODE_SEL},[data-ctx-item]`;
export const nodeId = (el: HTMLElement | SVGElement | null | undefined): string | undefined =>
  el?.dataset.mapNode || el?.dataset.tlNode || el?.dataset.ctxItem;
export const LONG_PRESS_MS = 500;

export function ctxOptions(kind: ItemKind, item: PlanItem | Vision): (MenuOption | '-')[] {
  const opt = (act: string, label: string, extra: Partial<MenuOption> = {}): MenuOption => ({ act, label, ...extra });
  if (kind === 'vision')
    return [
      opt('edit', t('btn.edit')),
      ...(ui.view === 'map' ? [opt('highlight', t('ctx.highlight'))] : []),
      '-',
      opt('add:vision:parents', t('ctx.addSubvision')),
      '-',
      ...SHOW_IN.vision
        .filter(v => v !== ui.view)
        .map(v => opt('show:' + v, t('ctx.showInView', { view: t(('nav.' + v) as TextKey) }), { icon: v })),
      ...(ui.view === 'map' ? [opt('link', t('ctx.link'))] : []),
      '-',
      opt('delete', t('btn.delete'), { danger: true }),
    ];
  // Highlighting links and showing one goal only mean something where links are drawn.
  const options: (MenuOption | '-')[] = [
    opt('edit', t('btn.edit')),
    ...(selectsInView() ? [opt('highlight', t('ctx.highlight'))] : []),
  ];
  if (kind === 'goal') {
    options.push(
      ...(selectsInView() ? [opt('focus', t('ctx.focus'))] : []),
      '-',
      (item as Goal).status === 'achieved'
        ? opt('status:active', t('ctx.reactivate'))
        : opt('status:achieved', t('ctx.markAchieved')),
      '-',
      opt('add:goal:subgoal', t('ctx.addSubgoal')),
      opt('add:activity:contributes', t('ctx.addActivityGoal')),
    );
  } else if (isRoutine(item)) {
    if (runsOn(item, today()))
      options.push('-', opt('checkin', t('rt.doneTodayShort'), { checked: checkedOn(item, today()) }));
  } else if (kind === 'activity') {
    options.push(
      '-',
      ...ACTIVITY_STATUS.map(s =>
        opt('status:' + s, t(('activity.' + s) as TextKey), { checked: (item as Activity).status === s }),
      ),
      '-',
      opt('add:activity:subactivity', t('ctx.addSubactivity')),
    );
  } else {
    options.push(
      '-',
      opt('value', t(isCumulative(item as State) ? 'ctx.addAmount' : 'ctx.addValue')),
      opt('add:activity:improves', t('ctx.addActivityState')),
    );
  }
  // "Show in…" opens in place onto the other views, each with its name and icon from the navigation
  // (the full name is the accessible name and tooltip); with only one, it is offered directly.
  const views = SHOW_IN[kind].filter(v => v !== ui.view && (v !== 'graphs' || hasGraph(item as State | Activity)));
  const showOpt = (v: ViewName) =>
    opt('show:' + v, t(('nav.' + v) as TextKey), {
      icon: v,
      name: t('ctx.showInView', { view: t(('nav.' + v) as TextKey) }),
    });
  if (views.length > 1) options.push('-', { label: t('ctx.showIn'), sub: views.map(showOpt) });
  else if (views.length)
    options.push(
      '-',
      opt('show:' + views[0], t('ctx.showInView', { view: t(('nav.' + views[0]) as TextKey) }), { icon: views[0] }),
    );
  options.push(opt('link', t('ctx.link')), '-', opt('delete', t('btn.delete'), { danger: true }));
  return options;
}

// The views each kind of item appears in (graphs: only states with measurements or amounts, and
// routines with check-ins).
export const SHOW_IN: Record<ItemKind, ViewName[]> = {
  vision: ['visions', 'map'],
  goal: ['goals', 'map', 'timeline'],
  activity: ['activities', 'map', 'timeline', 'graphs'],
  state: ['states', 'map', 'graphs'],
};

// Switches to another view with the item selected there (map, timeline) or its card brought into
// view, first changing the filters there that would hide it (setView clears the search).
export function showIn(view: ViewName, id: string) {
  const { kind, item } = findEntity(id)!;
  revealIn(view, kind, item);
  prefs.set('category', ui.category);
  if (view === 'map' || view === 'timeline') Object.assign(ui, { mapSelected: id, mapRel: null });
  setView(view);
  const el =
    view === 'map'
      ? $(`[data-map-node="${id}"]`)
      : view === 'timeline'
        ? $(`[data-tl-node="${id}"]`)
        : view === 'graphs'
          ? $(`[data-gr="${id}"]`)
          : $(`.card[data-open="${id}"]`);
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
export function revealIn(view: ViewName, kind: ItemKind, item: PlanItem | Vision) {
  // On the map every vision shows once no goal or category is picked and none are hidden.
  if (kind === 'vision') {
    if (view === 'map') {
      Object.assign(ui, { mapGoal: '', category: '' });
      if (ui.hideVisions) {
        ui.hideVisions = false;
        prefs.set('hideVisions', false);
      }
    }
    return;
  }
  if (view === 'goals') {
    if (ui.goalFilter !== 'all' && (item as Goal).status !== ui.goalFilter) ui.goalFilter = 'all';
    if (!inCategory(item as Goal)) ui.category = (item as Goal).category || '';
    return;
  }
  const field = GOAL_FILTERS[(view === 'activities' ? 'activity' : view) as GoalFilterTarget];
  if (!field) return;
  const done =
    kind === 'goal' || view === 'activities'
      ? isComplete(kind as ParentKind, item as Goal | Activity)
      : (item as Activity).status === 'done';
  if (ui.hideDone && view !== 'graphs' && kind !== 'state' && done) {
    ui.hideDone = false;
    prefs.set('hideDone', false);
  }
  const shows = () => {
    const s = scopeFor(ui[field]);
    return !s || s[kind].has(item.id);
  };
  if (!shows()) ui[field] = '';
  if (!shows()) {
    const own =
      kind === 'goal'
        ? [(item as Goal).category]
        : relsFrom(item.id).map(r => (findEntity(r.to)?.item as Goal | undefined)?.category);
    const holds = (c: string) => db.goals.some(g => g.category === c && goalScope(g.id)[kind].has(item.id));
    ui.category = [...own, ...categories()].find(c => c && holds(c)) || '';
  }
  if (view !== 'timeline') return;
  // Unfold only what hides it: every fold is kept that still leaves it shown.
  const scope = scopeFor(ui.timelineGoal),
    folded = tlCollapsed();
  const shown = (set: Set<string>) => timelineRows(scope, set).some(r => r.item?.id === item.id);
  if (!shown(folded) && shown(new Set()))
    setTlCollapsed(
      [...folded].reduce((keep, k) => (shown(new Set([...keep, k])) ? keep.add(k) : keep), new Set<string>()),
    );
}

export function openCtxMenu(id: string, x: number, y: number, byKey = false) {
  const ent = findEntity(id);
  if (!ent) return;
  Object.assign(ctxMenu.dataset, { id, rel: '', add: '' });
  ctxMenu.setAttribute('aria-label', t('ctx.label', { name: ent.item.title }));
  showCtxMenu(
    ent.kind,
    t(('kind.' + ent.kind) as TextKey),
    ent.item.title,
    ctxOptions(ent.kind, ent.item),
    x,
    y,
    byKey,
  );
}

// A relationship line's menu (long-press, right-click or the menu key): it selects the line and
// offers what the selection row below offers.
export function openRelMenu(relId: string, x: number, y: number, byKey = false) {
  const r = db.relations.find(x => x.id === relId) || visionRel(relId);
  if (!r) return;
  Object.assign(ui, { mapRel: relId, mapSelected: null });
  render();
  Object.assign(ctxMenu.dataset, { id: '', rel: relId, add: '' });
  ctxMenu.setAttribute('aria-label', t('map.relLabel', { rel: relText(r) }));
  showCtxMenu(
    '',
    t('kind.relation'),
    relText(r),
    [
      { act: 'rel-edit', label: t('btn.edit') },
      { act: 'rel-remove', label: t('btn.remove'), danger: true },
      { act: 'rel-deselect', label: t('btn.deselect') },
    ],
    x,
    y,
    byKey,
  );
}

// The menu of a relationship line, or else of an item.
export const openMenuAt = (line: HTMLElement | null, node: HTMLElement | null, x: number, y: number) =>
  line ? openRelMenu(line.dataset.relEdit!, x, y) : openCtxMenu(nodeId(node)!, x, y);

export function runRelAction(act: string, relId: string) {
  closeCtxMenu();
  if (act === 'rel-edit') return openForm('relation', relId);
  if (act === 'rel-remove') return removeRelation(relId);
  ui.mapRel = null;
  render();
}

export function runCtxAction(act: string, id: string) {
  const ent = findEntity(id);
  closeCtxMenu();
  if (!ent) return;
  const { kind, item } = ent;
  const [verb, arg, type] = act.split(':');
  if (verb === 'edit') return openForm(kind, id);
  if (verb === 'checkin') return toggleCheckin(id, today());
  // The popup opens by what the menu was opened on: a card, a box on the map, or a graph's heading (not the tall graph).
  if (verb === 'value') {
    const at = $(`[data-ctx-item="${id}"], [data-map-node="${id}"]`);
    return openStateValue(id, at?.querySelector(':scope.gr-card > .card-head') || at || viewEl);
  }
  if (verb === 'highlight') {
    ui.mapSelected = id;
    return render();
  }
  if (verb === 'show') return showIn(arg as ViewName, id);
  if (verb === 'focus') {
    Object.assign(ui, { [ui.view === 'timeline' ? 'timelineGoal' : 'mapGoal']: id, mapRefocus: true });
    if (!inCategory(item as Goal)) ui.category = '';
    return render();
  }
  if (verb === 'add')
    return openForm(arg as FormKind, null, { [type]: [id], category: kind === 'goal' ? (item as Goal).category : '' });
  if (verb === 'link') return ui.view === 'map' ? startMapLink(id) : openForm('relation', null, { from: id });
  if (verb === 'status') {
    (item as { status: string }).status = arg;
    save();
    render();
    const waits = kind === 'activity' && arg === 'done' ? blockers(item as Activity) : [];
    return toast(
      waits.length
        ? t('acts.notDone', { name: waits[0].title })
        : t('ctx.statusSet', { s: t(`${kind}.${arg}` as TextKey) }),
    );
  }
  if (verb === 'delete' && confirm(t('confirm.delete', { name: item.title }))) {
    removeEntity(kind, id);
    Object.values(GOAL_FILTERS).forEach(k => {
      if (ui[k] === id) ui[k] = '';
    });
    save();
    render();
    toast(t(('toast.deleted.' + kind) as TextKey));
  }
}

// Long-press for touch screens (iOS Safari never fires contextmenu).
interface Press {
  x: number;
  y: number;
  fired: boolean;
  timer?: ReturnType<typeof setTimeout>;
}
export let press: Press | null = null;
export function setPress(v: Press | null) {
  press = v;
}

export function listenMenu() {
  viewEl.addEventListener('contextmenu', e => {
    // Phones may report a still finger of a pinch as a long-press.
    if (tlDrag?.touch || pinch) return e.preventDefault();
    const node = (e.target as Element).closest<HTMLElement>(MENU_SEL),
      line = (e.target as Element).closest<HTMLElement>('[data-rel-edit]');
    if (!node && !line) {
      // The map's empty space offers what the Add button does.
      if (ui.view === 'map' && (e.target as Element).closest('.map-wrap')) {
        e.preventDefault();
        openAddMenu(e.clientX, e.clientY, false);
      }
      return;
    }
    e.preventDefault();
    openMenuAt(line, node, e.clientX, e.clientY);
  });

  viewEl.addEventListener('pointerdown', e => {
    const node = (e.target as Element).closest<HTMLElement>(MENU_SEL),
      line = (e.target as Element).closest<HTMLElement>('[data-rel-edit]');
    if ((!node && !line) || e.pointerType === 'mouse' || (e.target as Element).closest('[data-tl-drag]')) return;
    // A second finger (a pinch starting) must not leave the first one's wait running.
    if (press) clearTimeout(press.timer);
    const p: Press = { x: e.clientX, y: e.clientY, fired: false };
    p.timer = setTimeout(() => {
      p.fired = true;
      openMenuAt(line, node, p.x, p.y + 12);
    }, LONG_PRESS_MS);
    press = p;
  });
  viewEl.addEventListener('pointermove', e => {
    if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) {
      clearTimeout(press.timer);
      press = null;
    }
  });
  (['pointerup', 'pointercancel'] as const).forEach(type =>
    viewEl.addEventListener(type, () => press && clearTimeout(press.timer)),
  );
  // The click that ends a long-press must not also toggle highlighting or hit a menu item. Phones often
  // send no click at all when the finger lifts, so a new touch ends the wait; otherwise the first tap on
  // the menu would be swallowed instead.
  document.addEventListener(
    'click',
    e => {
      if (press?.fired) {
        e.stopPropagation();
        e.preventDefault();
      }
      press = null;
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    () => {
      if (press?.fired) press = null;
    },
    true,
  );
}

// On the map and the timeline (where links are drawn between kinds), what to add: under the Add button, or at x, y
// for a right-click on the map's empty space.
export function openAddMenu(x: number, y: number, byKey: boolean) {
  Object.assign(ctxMenu.dataset, { id: '', rel: '', add: '1' });
  ctxMenu.setAttribute('aria-label', t('add.item'));
  showCtxMenu(
    '',
    '',
    '',
    [...(ui.view === 'map' ? ['vision'] : []), 'goal', 'activity', 'state'].map(k => ({
      act: 'new:' + k,
      label: t(('add.' + k) as TextKey),
    })),
    x,
    y,
    byKey,
  );
}
