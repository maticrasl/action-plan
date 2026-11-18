/** The timeline's rows: goals and their activities in plan order, and folding them (per plan, on this device). */
import type { Activity, Goal, ISODate, RelType } from '../../core/model';
import { render } from '../index';
import { $, byDeadline } from '../../ui/dom';
import { scopeFor } from '../filters';
import { plans, ui } from '../../store/state';
import { type Scope, goalActivities, isComplete } from '../../core/progress';
import { ancestors, findEntity, relsFrom, relsTo } from '../../core/relations';
import { db } from '../../core/state';
import { t } from '../../i18n/index';
import { prefs } from '../../store/prefs';

// A row of the timeline: a goal or an activity, or the group of activities under no shown goal.
// `rel` is how it hangs off the row at index `parent`; `goal`, the goal an activity is listed under.
export interface TlItemRow {
  kind: 'goal' | 'activity';
  item: Goal | Activity;
  depth: number;
  rel?: RelType;
  parent?: number;
  goal?: string;
  fold?: boolean;
  collapsed?: boolean;
  also?: string[];
}
export interface TlGroupRow {
  kind: 'group';
  key: 'rest';
  label: string;
  depth: number;
  collapsed: boolean;
  item?: undefined;
  rel?: undefined;
  fold?: undefined;
}
export type TimelineRow = TlItemRow | TlGroupRow;

export type Dated = { startDate?: ISODate; dueDate?: ISODate; deadline?: ISODate };

export function toggleTlFold(key: string) {
  const set = tlCollapsed();
  set.has(key) ? set.delete(key) : set.add(key);
  setTlCollapsed(set);
  render();
  $(`[data-tl-fold="${key}"]`)?.focus();
}
// What can fold: every goal with something under it, and the 'rest' group.
export const tlFoldKeys = () =>
  timelineRows(scopeFor(ui.timelineGoal))
    .filter(r => r.fold || r.kind === 'group')
    .map(r => (r.kind === 'group' ? 'rest' : r.item.id));
// The one button reads Expand all once everything is folded, and Collapse all otherwise.
export function tlAllFolded() {
  const keys = tlFoldKeys(),
    set = tlCollapsed();
  return keys.length > 0 && keys.every(k => set.has(k));
}
export function foldAllTl(collapse: boolean) {
  setTlCollapsed(new Set(collapse ? tlFoldKeys() : []));
  render();
  $('[data-tl-fold-all]')?.focus();
}

// Rows in plan order: each top-level goal, its activity trees, then its sub-goals (recursively).
// Prerequisites that work toward no goal themselves are listed under the activity that waits for them.
// An activity that serves several goals is listed under each of them (its rows carry `also`: the
// other goals it is under). A goal in `collapsed` keeps its own row but hides what is under it;
// what it hides still counts as placed. Activities under no shown goal come last in their own
// group ('rest', which can be collapsed too).
export function timelineRows(scope: Scope | null, collapsed = new Set<string>()) {
  const rows: TimelineRow[] = [],
    placedGoals = new Set<string>(),
    placed = new Set<string>(),
    under = new Map<string, string[]>(); // activity → goals it is listed under
  const visible = (kind: keyof Scope, x: { id: string }) => !scope || scope[kind].has(x.id);
  const startKey = (x: Dated) => x.startDate || x.dueDate || x.deadline || '9999';
  const byStart = (a: Dated, b: Dated) => startKey(a).localeCompare(startKey(b));
  const kids = (a: Activity) =>
    (
      relsTo(a.id, 'subactivity')
        .map(r => db.activities.find(x => x.id === r.from))
        .filter(Boolean) as Activity[]
    ).sort(byStart);
  // An activity's prerequisites that serve no shown goal, each as its whole tree (from its top).
  const goals = db.goals.filter(g => visible('goal', g));
  const owned = new Set(goals.flatMap(g => goalActivities(g).map(a => a.id)));
  const prereqs = (a: Activity) =>
    (
      [...new Set(relsFrom(a.id, 'depends').map(r => ancestors(r.to, 'subactivity').pop() || r.to))]
        .filter(id => !owned.has(id))
        .map(id => db.activities.find(x => x.id === id))
        .filter(Boolean) as Activity[]
    ).sort(byStart);
  // `rel` is how a row hangs off the row at index `parent` (drawn as a connector in that relation's colour).
  // A hidden activity passes its own place in the tree on to its children; `hidden` walks without adding rows.
  const addActivity = (
    a: Activity,
    depth: number,
    rel: RelType | undefined,
    parent: number | undefined,
    goal: string,
    hidden: boolean,
    seen = new Set<string>(),
  ): void => {
    if (seen.has(a.id)) return;
    seen.add(a.id);
    placed.add(a.id);
    if (goal) under.set(a.id, [...(under.get(a.id) || []), goal]);
    const show = !hidden && visible('activity', a) && !(ui.hideDone && a.status === 'done');
    const here = show ? rows.push({ kind: 'activity', item: a, depth, rel, parent, goal }) - 1 : parent;
    const nest = (c: Activity, childRel: RelType) =>
      show
        ? addActivity(c, depth + 1, childRel, here, goal, hidden, seen)
        : addActivity(c, depth, rel, parent, goal, hidden, seen);
    kids(a).forEach(c => nest(c, 'subactivity'));
    if (goal) prereqs(a).forEach(p => nest(p, 'depends'));
  };
  const addGoal = (g: Goal, depth: number, rel?: RelType, parent?: number, hidden?: boolean): void => {
    if (placedGoals.has(g.id)) return;
    placedGoals.add(g.id);
    const contributors = new Set(relsTo(g.id, 'contributes').map(r => r.from));
    const acts = db.activities
      .filter(a => contributors.has(a.id) && !ancestors(a.id, 'subactivity').some(p => contributors.has(p)))
      .sort(byStart);
    const subs = (
      relsTo(g.id, 'subgoal')
        .map(r => db.goals.find(x => x.id === r.from))
        .filter(x => x && visible('goal', x)) as Goal[]
    ).sort((a, b) => byDeadline(a, b) || byStart(a, b));
    const folded = collapsed.has(g.id);
    // An achieved goal hidden with the done items passes its place on to what is under it, like an activity.
    const skip = !hidden && ui.hideDone && isComplete('goal', g);
    const here =
      hidden || skip
        ? parent
        : rows.push({
            kind: 'goal',
            item: g,
            depth,
            rel,
            parent,
            fold: acts.length + subs.length > 0,
            collapsed: folded,
          }) - 1;
    const inner = skip ? depth : depth + 1;
    acts.forEach(a => addActivity(a, inner, skip ? rel : 'contributes', here, g.id, hidden || folded));
    subs.forEach(sg => addGoal(sg, inner, skip ? rel : 'subgoal', here, hidden || folded));
  };
  const goalIds = new Set(goals.map(g => g.id));
  goals
    .filter(g => !ancestors(g.id, 'subgoal').some(p => goalIds.has(p)))
    .sort((a, b) => byDeadline(a, b) || byStart(a, b))
    .forEach(g => addGoal(g, 0));

  const rest = db.activities.filter(a => !placed.has(a.id) && visible('activity', a));
  const restIds = new Set(rest.map(a => a.id));
  const group: TlGroupRow = {
    kind: 'group',
    key: 'rest',
    label: t(scope ? 'tl.related' : 'tl.unlinked'),
    depth: 0,
    collapsed: collapsed.has('rest'),
  };
  const before = rows.push(group);
  rest
    .filter(a => !ancestors(a.id, 'subactivity').some(p => restIds.has(p)))
    .sort(byStart)
    .forEach(a => addActivity(a, 1, undefined, undefined, '', group.collapsed));
  if (rows.length === before && !group.collapsed) rows.pop();
  if (group.collapsed && !rest.length) rows.pop();
  // Each copy of an activity names the other goals it is listed under.
  rows.forEach(r => {
    const goalsOf = r.kind === 'activity' && [...new Set(under.get(r.item.id) || [])];
    if (goalsOf && goalsOf.length > 1)
      (r as TlItemRow).also = goalsOf.filter(id => id !== (r as TlItemRow).goal).map(id => findEntity(id)!.item.title);
  });
  return rows;
}

// Goals (and the 'rest' group) folded in the timeline: per plan, on this device.
export const tlCollapsed = () => new Set(prefs.get<string[]>('tlCollapsed.' + plans.current, []));
export const setTlCollapsed = (set: Set<string>) => prefs.set('tlCollapsed.' + plans.current, [...set]);
