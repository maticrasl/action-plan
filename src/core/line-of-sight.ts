/** Line of sight (feature 05): the visions a step serves, the one its row names, and visions nothing active serves. */
import { findVision, goalVisionIds, isActiveGoal, visionAncestors, type PlanData } from './visions';
import { locale } from '../i18n/index';
import { visions } from './state';
import { DAY_MS } from './days';
import type { Db, Goal, ISODate, Vision } from './model';

// The visions of the goals an activity works toward (directly, or as a routine through the state it
// improves); a sub-activity with none of its own takes its nearest parent's.
export function stepVisions(data: Db, activityId: string): string[] {
  const rels = data.relations,
    seen = new Set<string>();
  for (let id: string | undefined = activityId; id && !seen.has(id);) {
    seen.add(id);
    const states = rels.filter(r => r.from === id && r.type === 'improves').map(r => r.to);
    const goalIds = new Set([
      ...rels.filter(r => r.from === id && r.type === 'contributes').map(r => r.to),
      ...rels.filter(r => r.type === 'measures' && states.includes(r.from)).map(r => r.to),
    ]);
    const out = new Set(data.goals.filter(g => goalIds.has(g.id)).flatMap(g => goalVisionIds(g, data)));
    if (out.size) return [...out];
    id = rels.find(r => r.from === id && r.type === 'subactivity')?.to;
  }
  return [];
}

// The vision a row names: the first by title, leaving out the Purpose; `more` counts the others.
export function shownVision(ids: string[], purposeId?: string | null): { vision: Vision; more: number } | null {
  const list = ids
    .filter(id => id !== purposeId)
    .map(findVision)
    .filter((v): v is Vision => !!v)
    .sort((a, b) => a.title.localeCompare(b.title, locale()));
  return list.length ? { vision: list[0], more: list.length - 1 } : null;
}

// Visions no active goal (in any plan) serves, directly or through a narrower vision, each with the
// most recent goal that served it and was achieved in the last 30 days. Nothing when there are no goals.
export function unservedVisions(all: PlanData[], now: ISODate) {
  const served = new Set<string>(),
    reached = new Map<string, { goal: Goal; date: ISODate }>();
  let goals = 0;
  const reach = (g: Goal, data: Db) => goalVisionIds(g, data).flatMap(id => [id, ...visionAncestors(id)]);
  all.forEach(({ data }) =>
    data.goals.forEach(g => {
      goals++;
      if (isActiveGoal(g)) return reach(g, data).forEach(id => served.add(id));
      const at = g.status === 'achieved' && g.achievedAt;
      if (!at || (Date.parse(now) - Date.parse(at)) / DAY_MS > 30) return;
      reach(g, data).forEach(id => {
        if ((reached.get(id)?.date ?? '') < at)
          reached.set(id, { goal: g, date: at });
      });
    }),
  );
  if (!goals) return [];
  return visions.list
    .filter(v => !served.has(v.id))
    .map(v => ({ vision: v, reached: reached.get(v.id) }));
}
