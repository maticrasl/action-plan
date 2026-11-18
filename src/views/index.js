/** The views: the table of them and render(), which draws the open one and keeps its scroll. */
import { renderDashboard } from './dashboard';
import { renderGoals } from './goals';
import { bindDragDrop, renderActivities } from './activities';
import { renderStates } from './states';
import { renderVisions } from './visions';
import { markVisions, renderGraphs, renderMap, renderTimeline } from '../legacy/app.js';
import { startDueActivities } from '../core/progress';
import { offerReached } from '../ui/reached';
import { save } from '../store/plans';
import { ui } from '../store/state';
import { categories } from '../core/categories';
import { t } from '../i18n/index';
import { $, viewEl } from '../ui/dom';
import { closeCtxMenu } from '../ui/menu';
import { closeAmountPop } from '../ui/amount-popover';
import { updatePlanBadges } from '../ui/plan-switcher';

export const VIEWS = {
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
  if (startDueActivities() + offerReached()) save();
  const v = VIEWS[ui.view];
  if (ui.category && !categories().includes(ui.category)) ui.category = '';
  const title = t('view.' + ui.view);
  $('#viewTitle').textContent = title;
  document.title = `${title} – ${t('app.name')}`;
  $('#addBtn').innerHTML = `<span class="plus" aria-hidden="true">+</span><span class="lbl">${t('add.' + v.add)}</span>`;
  $('#addBtn').setAttribute('aria-label', t('add.' + v.add));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  $('#navMore').classList.toggle('active', !!$(`.nav-extra[data-view="${ui.view}"]`));
  closeCtxMenu();
  closeAmountPop();
  const old = ui.mapRefocus ? null : $('.map-wrap, .tl-scroll');
  const prevScroll = old && { left: old.scrollLeft, top: old.scrollTop };
  ui.mapRefocus = false;
  viewEl.dataset.view = ui.view;
  // A graph redrawn at the same width stays scrolled where it was.
  const grScroll = {};
  viewEl.querySelectorAll('[data-gr] .gr-plot').forEach(p => (grScroll[p.closest('[data-gr]').dataset.gr] = { left: p.scrollLeft, w: p.scrollWidth }));
  viewEl.innerHTML = v.render();
  if (ui.view === 'activities') bindDragDrop();
  // Long charts start at their latest bars.
  viewEl.querySelectorAll('.gr-plot.scroll').forEach(p => {
    const was = grScroll[p.closest('[data-gr]').dataset.gr];
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
export const rendered = [];
export const onRendered = fn => { rendered.push(fn); };
// Coming back to the app on a later day starts the activities due by then, and may find goals
// that a period's end has brought to their target.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !(startDueActivities() + offerReached())) return;
  save();
  render();
});
