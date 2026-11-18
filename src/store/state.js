/** What is open now: the plan list, the version counter and what the views show. */
// What the views show; each user starts from these (enterUser), then their remembered preferences.
export const freshUi = () => ({
  view: 'dashboard', goalFilter: 'active', category: '', activityGoal: '', mapGoal: '', timelineGoal: '', graphGoal: '',
  mapHidden: new Set(), hideDone: false, hideVisions: false, nextAll: false, tlPx: 8, mapScale: 1, tlDeps: true, planBadges: true, search: '', mapSelected: null, mapRel: null, help: false,
  tlDates: null, // the selected timeline item whose dates can be dragged: its bar was clicked, not just its row
  rtWeek: {}, // the Monday each routine card's week strip shows, when not this week
  grZoom: {}, // how far each graph is zoomed: 1 fits the card
});
export const ui = freshUi();

export let plans = { current: null, list: [] };
export function setPlans(v) { plans = v; }
export const currentPlan = () => plans.list.find(p => p.id === plans.current);

export let plansVersion = 0;   // bumped whenever plans are saved or synced (other plans' goals are cached)
export function setPlansVersion(v) { plansVersion = v; }
