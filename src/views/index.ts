/** The views: the table of them and render(), which draws the open one and keeps its scroll. */
import { renderDashboard } from './dashboard';
import { renderGoals } from './goals';
import { bindDragDrop, renderActivities } from './activities';
import { renderStates } from './states';
import { renderVisions } from './visions';
import { renderGraphs, renderTimeline } from '../legacy/app.js';
import { startDueActivities } from '../core/progress';
import { offerReached } from '../ui/reached';
import { save } from '../store/plans';
import { ui, type ViewName } from '../store/state';
import { categories } from '../core/categories';
import { t, type TextKey } from '../i18n/index';
import { $, viewEl } from '../ui/dom';
import { closeCtxMenu } from '../ui/menu';
import { closeAmountPop } from '../ui/amount-popover';
import { updatePlanBadges } from '../ui/plan-switcher';
import { renderMap } from './map/render';
import { markVisions } from './map/visions';

// Each view: what its Add button adds ('item' opens a menu of kinds) and the HTML it draws.
export interface View {
  add: 'goal' | 'activity' | 'state' | 'vision' | 'item';
  render: () => string;
}

export const VIEWS: Record<ViewName, View> = {
  dashboard: { add: 'goal', render: renderDashboard },
  goals: { add: 'goal', render: renderGoals },
  activities: { add: 'activity', render: renderActivities },
  states: { add: 'state', render: renderStates },
  visions: { add: 'vision', render: renderVisions },
  map: { add: 'item', render: renderMap },
  timeline: { add: 'item', render: renderTimeline },
  graphs: { add: 'state', render: renderGraphs },
};

export function render() {
  // A period ending can reach a goal without any edit.
  if (startDueActivities() + Number(offerReached())) save();
  const v = VIEWS[ui.view];
  if (ui.category && !categories().includes(ui.category)) ui.category = '';
  const title = t(('view.' + ui.view) as TextKey);
  $('#viewTitle').textContent = title;
  document.title = `${title} – ${t('app.name')}`;
  $('#addBtn').innerHTML =
    `<span class="plus" aria-hidden="true">+</span><span class="lbl">${t(('add.' + v.add) as TextKey)}</span>`;
  $('#addBtn').setAttribute('aria-label', t(('add.' + v.add) as TextKey));
  document
    .querySelectorAll<HTMLElement>('.nav-item')
    .forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  $('#navMore').classList.toggle('active', !!$(`.nav-extra[data-view="${ui.view}"]`));
  closeCtxMenu();
  closeAmountPop();
  const old = ui.mapRefocus ? null : $('.map-wrap, .tl-scroll');
  const prevScroll = old && { left: old.scrollLeft, top: old.scrollTop };
  ui.mapRefocus = false;
  viewEl.dataset.view = ui.view;
  // A graph redrawn at the same width stays scrolled where it was.
  const grScroll: Record<string, { left: number; w: number }> = {};
  const graphOf = (p: Element) => p.closest<HTMLElement>('[data-gr]')!.dataset.gr!;
  viewEl
    .querySelectorAll('[data-gr] .gr-plot')
    .forEach(p => (grScroll[graphOf(p)] = { left: p.scrollLeft, w: p.scrollWidth }));
  viewEl.innerHTML = v.render();
  if (ui.view === 'activities') bindDragDrop();
  // Long charts start at their latest bars.
  viewEl.querySelectorAll('.gr-plot.scroll').forEach(p => {
    const was = grScroll[graphOf(p)];
    p.scrollLeft = was && was.w === p.scrollWidth ? was.left : p.scrollWidth;
  });
  // Keep the map / timeline where the user left it; on first show, centre on the goals / today.
  const wrap = $('.map-wrap, .tl-scroll');
  if (wrap) {
    wrap.scrollLeft = prevScroll ? prevScroll.left : Number(wrap.dataset.focusX) - wrap.clientWidth / 2;
    if (prevScroll) wrap.scrollTop = prevScroll.top;
  }
  markVisions();
  rendered.forEach(fn => fn());
  updatePlanBadges();
}
// What runs after each draw, set from above the views (main.ts: help mode's tips).
export const rendered: (() => void)[] = [];
export const onRendered = (fn: () => void) => {
  rendered.push(fn);
};
// Coming back to the app on a later day starts the activities due by then, and may find goals
// that a period's end has brought to their target.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !(startDueActivities() + Number(offerReached()))) return;
  save();
  render();
});
