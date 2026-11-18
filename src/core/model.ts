/** The data model: kinds, relationship types, statuses, and the shape of a plan. */
/* =========================================================
   Data model
   ---------------------------------------------------------
   goals      – SMART goals
   states     – snapshots of "where I am now" (optionally numeric)
   activities – concrete actions with status and due date
   relations  – typed links between any two of the above
   ========================================================= */

// Labels for kinds, relation types and statuses live in i18n.js (kind.*, rel.*, activity.*, goal.*).
export const KINDS = ['goal', 'state', 'activity'] as const;
export type Kind = (typeof KINDS)[number];
// Visions are global (not in a plan), but are drawn and linked like the kinds above.
export type ItemKind = Kind | 'vision';

// How a link between two kinds is drawn on the map; `width` and `dash` change the line.
export interface RelSpec {
  from: ItemKind[];
  to: ItemKind[] | 'same';
  color: string;
  width?: number;
  dash?: boolean;
}

// `from` lists the allowed source kinds; `to: 'same'` means the target must be the same kind as the source.
export const REL_TYPES = {
  contributes: { from: ['activity'], to: ['goal'], color: 'var(--contrib)' },
  subgoal: { from: ['goal'], to: ['goal'], color: 'var(--goal)', width: 1.6 },
  subactivity: { from: ['activity'], to: ['activity'], color: 'var(--activity)', width: 1.6 },
  depends: { from: ['activity', 'goal'], to: 'same', color: 'var(--bad)', dash: true },
  measures: { from: ['state'], to: ['goal'], color: 'var(--rel-state)' },
  improves: { from: ['activity'], to: ['state'], color: 'var(--rel-state)', dash: true },
} satisfies Record<string, RelSpec>;
export type RelType = keyof typeof REL_TYPES;
export const ACYCLIC = new Set<RelType>(['depends', 'subgoal', 'subactivity']);
// Links to visions, drawn on the map but kept on the goal (`visions`) and the vision (`parents`), not as relationships.
export const VISION_RELS = {
  serves: { from: ['goal'], to: ['vision'], color: 'var(--vision-ink)' },
  subvision: { from: ['vision'], to: ['vision'], color: 'var(--vision-ink)', width: 1.6 },
} satisfies Record<string, RelSpec>;
export type VisionRel = keyof typeof VISION_RELS;
export const PARENT_REL = { goal: 'subgoal', activity: 'subactivity' } satisfies Partial<Record<Kind, RelType>>;

export const ACTIVITY_STATUS = ['todo', 'doing', 'done'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUS)[number];
export const GOAL_STATUS = ['active', 'achieved', 'paused'] as const;
export type GoalStatus = (typeof GOAL_STATUS)[number];
// Visual state used to color goals and activities on the map.
export const NODE_STATES = ['todo', 'doing', 'late', 'blocked', 'done'] as const;
export type NodeState = (typeof NODE_STATES)[number];

/* ---------- Stored shapes ----------
   What normalize() keeps and the forms, sync and routines write. Every plan in tests/fixtures
   (rich.storage.json above all) must fit these types: model.test.ts checks it. Numbers the user
   types are kept as strings with a decimal dot ('' for none). */

export type ISODate = string; // a calendar day, yyyy-mm-dd ('' for none in a few fields)
export type ISOTime = string; // a moment, from Date.toISOString()
// Ids of deleted items, or other set-like maps, with the time or 1 as the value.
export type IdSet<V = 1> = Record<string, V>;

// Every item carries an id; sync stamps `updatedAt` on what changed.
export interface Item {
  id: string;
  updatedAt?: ISOTime;
}

// The calendar periods sums are counted by; 'total' counts everything.
export type Period = 'day' | 'week' | 'month' | 'year';
export type Scale = Period | 'total';

export interface Goal extends Item {
  title: string;
  status: GoalStatus;
  category?: string;
  specific?: string;
  metric?: string;
  unit?: string;
  baseline?: string;
  current?: string;
  target?: string;
  // The old answer to "Why is this realistic?"; new goals ask for the obstacle and the plan for it.
  achievable?: string;
  obstacle?: string;
  ifThen?: string;
  relevant?: string;
  startDate?: ISODate;
  deadline?: ISODate;
  // Progress by its activities or routines instead of the metric; 'measure' (older plans) is the metric.
  progress?: 'activities' | 'routines' | 'measure';
  // How a state that adds up counts toward it.
  period?: Scale;
  visions?: string[];
  // When the "target reached" offer was made (cleared when the target is no longer reached).
  offeredAt?: ISODate;
  createdAt?: ISODate;
}

// One measurement of a state.
export interface Measurement {
  date: ISODate;
  value: string;
}
// An amount added to a state that adds up; `routine` is the routine whose tick it belongs to.
export interface Entry {
  id: string;
  date: ISODate;
  amount: string;
  routine?: string;
}

export interface State extends Item {
  title: string;
  description: string;
  unit?: string; // states made from a template without one have none
  // The latest measurement (or, adding up, the total), kept for older readers.
  value: string;
  date?: ISODate;
  history: Measurement[];
  // Measurement dates deleted, so sync does not bring them back.
  dropped?: IdSet;
  cumulative?: boolean;
  entries?: Entry[];
  droppedEntries?: IdSet;
  scale?: Scale;
}

/* A routine's recurrence (see app.js, "Routines"). Older routines store { times, per } or { days }
   without `every` and `unit`, and 'weekday' or 'last' for `on`. */
export interface Repeat {
  every?: number;
  unit?: Period;
  days?: number[]; // weekdays, Monday = 0
  times?: number;
  per?: 'week' | 'month';
  on?: 'day' | 'lastDay' | 'nth' | 'weekday' | 'last';
  day?: number;
  nth?: number; // 1 to 5, or -1 for the last
  weekday?: number;
  count?: number;
  makeUp?: boolean;
}

// An item of a list activity; `at` is when it was last ticked or renamed. A list routine's items
// are ticked per day (listDays), and items made from a template have no `done` yet.
export interface ListItem {
  id: string;
  text: string;
  done?: boolean;
  at?: ISOTime;
}

export interface Activity extends Item {
  title: string;
  description?: string; // activities made from a template without one have none
  status: ActivityStatus;
  startDate?: ISODate;
  dueDate?: ISODate;
  // The start date it was moved to "doing" on by itself.
  autoStarted?: ISODate;
  repeat?: Repeat;
  checkins?: IdSet<0 | 1>; // by date: done, or unticked
  list?: ListItem[];
  listDays?: Record<ISODate, IdSet<0 | 1>>; // a list routine's items ticked per day
  droppedItems?: IdSet;
  scale?: Scale; // a routine's graph
  createdAt?: ISODate;
}

export interface Relation extends Item {
  from: string;
  to: string;
  type: RelType;
}

// One plan, as stored under actionplan.plan.<id>.
export interface Db {
  goals: Goal[];
  states: State[];
  activities: Activity[];
  relations: Relation[];
  deleted: IdSet<ISOTime>;
}

// The plan index (actionplan.plans).
export interface Plan extends Item {
  name: string;
}
export interface PlanList {
  current: string | null;
  list: Plan[];
  deleted?: IdSet<ISOTime>;
}

// Visions, global to a user (actionplan.visions).
export interface Vision extends Item {
  title: string;
  description?: string;
  parents: string[];
  createdAt?: ISODate;
}
export interface VisionList {
  list: Vision[];
  deleted: IdSet<ISOTime>;
  purposeFound?: ISODate; // the day a Purpose was first found (it is celebrated once)
}

// The people on one device (actionplan.users). `ns` is the key prefix after 'actionplan.': '' for
// the first user, `u.<id>.` for later ones. A user without an account is a guest.
export interface User {
  id: string;
  ns: string;
  name: string;
  account: { id: string; email: string } | null;
}
export interface UserList {
  current: string;
  list: User[];
}

export function emptyDb(): Db {
  return { goals: [], states: [], activities: [], relations: [], deleted: {} };
}

// The collections of a plan that sync item by item, and what is in them.
export type Coll = 'goals' | 'states' | 'activities' | 'relations';

export const SYNC_COLLS: Coll[] = ['goals', 'states', 'activities', 'relations'];
