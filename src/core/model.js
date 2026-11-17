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
export const KINDS = ['goal', 'state', 'activity'];

// `from` lists the allowed source kinds; `to: 'same'` means the target must be the same kind as the source.
export const REL_TYPES = {
  contributes: { from: ['activity'],         to: ['goal'],     color: 'var(--contrib)' },
  subgoal:     { from: ['goal'],             to: ['goal'],     color: 'var(--goal)', width: 1.6 },
  subactivity: { from: ['activity'],         to: ['activity'], color: 'var(--activity)', width: 1.6 },
  depends:     { from: ['activity', 'goal'], to: 'same',       color: 'var(--bad)', dash: true },
  measures:    { from: ['state'],            to: ['goal'],     color: 'var(--rel-state)' },
  improves:    { from: ['activity'],         to: ['state'],    color: 'var(--rel-state)', dash: true },
};
export const ACYCLIC = new Set(['depends', 'subgoal', 'subactivity']);
// Links to visions, drawn on the map but kept on the goal (`visions`) and the vision (`parents`), not as relationships.
export const VISION_RELS = {
  serves:    { from: ['goal'],   to: ['vision'], color: 'var(--vision-ink)' },
  subvision: { from: ['vision'], to: ['vision'], color: 'var(--vision-ink)', width: 1.6 },
};
export const PARENT_REL = { goal: 'subgoal', activity: 'subactivity' };

export const ACTIVITY_STATUS = ['todo', 'doing', 'done'];
export const GOAL_STATUS = ['active', 'achieved', 'paused'];
// Visual state used to color goals and activities on the map.
export const NODE_STATES = ['todo', 'doing', 'late', 'blocked', 'done'];

export function emptyDb() {
  return { goals: [], states: [], activities: [], relations: [], deleted: {} };
}
