/** What is open now: the plan list, the version counter and what the views show. */
import type { GoalStatus, ISODate, PlanList } from '../core/model';

// The views, by the names in the navigation, views/index.ts's VIEWS and the stored `view` preference.
export type ViewName =
  | 'dashboard'
  | 'goals'
  | 'activities'
  | 'states'
  | 'visions'
  | 'map'
  | 'timeline'
  | 'graphs'
  | 'review'
  | 'guide';

// Ids are of items, relations or visions; a goal filter of '' means all goals. The last three
// fields are set later, not by freshUi.
export interface Ui {
  view: ViewName;
  goalFilter: 'all' | GoalStatus; // the goals view's status chips
  category: string; // the goal category chosen in the chips ('' for all)
  activityGoal: string; // these four: each view's goal picker, a goal id or '' (GOAL_FILTERS)
  mapGoal: string;
  timelineGoal: string;
  graphGoal: string;
  hideDone: boolean;
  hideVisions: boolean;
  nextAll: boolean; // the overview's "Show all": also the activities in progress that are not due
  tlPx: number; // the timeline's pixels per day
  mapScale: number;
  planBadges: boolean;
  search: string;
  mapSelected: string | null;
  mapRel: string | null;
  help: boolean;
  tlDates: string | null;
  rtWeek: Record<string, ISODate>;
  grZoom: Record<string, number>;
  mapRefocus?: boolean; // the next render centres the map or timeline instead of keeping its scroll
  mapLinkFrom?: string | null; // the map box a link is being drawn from, by tapping
  navCollapsed?: boolean;
}

// What the views show; each user starts from these (enterUser), then their remembered preferences.
export const freshUi = (): Ui => ({
  view: 'dashboard',
  goalFilter: 'active',
  category: '',
  activityGoal: '',
  mapGoal: '',
  timelineGoal: '',
  graphGoal: '',
  hideDone: false,
  hideVisions: false,
  nextAll: false,
  tlPx: 8,
  mapScale: 1,
  planBadges: true,
  search: '',
  mapSelected: null,
  mapRel: null,
  help: false,
  tlDates: null, // the selected timeline item whose dates can be dragged: its bar was clicked, not just its row
  rtWeek: {}, // the Monday each routine card's week strip shows, when not this week
  grZoom: {}, // how far each graph is zoomed: 1 fits the card
});
export const ui = freshUi();

export let plans: PlanList = { current: null, list: [] };
export function setPlans(v: PlanList) {
  plans = v;
}
export const currentPlan = () => plans.list.find(p => p.id === plans.current);

export let plansVersion = 0; // bumped whenever plans are saved or synced (other plans' goals are cached)
export function setPlansVersion(v: number) {
  plansVersion = v;
}
