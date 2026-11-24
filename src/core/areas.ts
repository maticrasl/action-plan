/** Life areas (feature 03): a goal's areas, effort per area in the last 30 days, the sentences above them, and renaming one. */
import { findVision, goalVisionIds } from './visions';
import { treeActivities } from './progress';
import { addDays, isRoutine } from './routines/schedule';
import { doneDay, achievedDay } from './done-log';
import { isoDate } from './dates';
import { visions } from './state';
import { asOpen, type PlanSource } from './today';
import { locale } from '../i18n/index';
import type { Db, Goal, ISODate, Vision } from './model';

export const areaKey = (s: string | undefined) => (s || '').trim().toLowerCase();
const clean = (s: string | undefined) => (s || '').trim();

// The areas of the visions it serves (with those of the goals it is part of), else its own category.
export function goalAreas(g: Goal, data: Db): string[] {
  const out = new Map<string, string>();
  goalVisionIds(g, data).forEach(id => {
    const a = clean(findVision(id)?.area);
    if (a && !out.has(areaKey(a))) out.set(areaKey(a), a);
  });
  if (!out.size && clean(g.category)) out.set(areaKey(g.category), clean(g.category));
  return [...out.values()];
}

export interface AreaBlock {
  name: string; // '' for "No area"
  visions: Vision[];
  goals: number; // active goals
  effort: number; // steps, list items and routine days that reached it
  share: number; // per cent of all effort
}
export interface AreaReport {
  blocks: AreaBlock[];
  none: AreaBlock | null;
  total: number;
}

// Areas of every plan in `all` (visions are global); see docs/specs/2026-11-23-life-areas.md for the counting.
// `from`: the first day counted (the last 30 days unless given; the yearly review gives its year).
export function areaReport(all: PlanSource[], now: ISODate, from: ISODate = addDays(now, -29)): AreaReport {
  const byKey = new Map<string, AreaBlock & { weight: number }>();
  const get = (name: string) => {
    const k = areaKey(name);
    if (!byKey.has(k)) byKey.set(k, { name, visions: [], goals: 0, effort: 0, share: 0, weight: 0 });
    return byKey.get(k)!;
  };
  visions.list.forEach(v => get(clean(v.area)).visions.push(v));
  for (const { data } of all)
    asOpen(data, () => {
      // Each event (an activity's done day, an item, a routine day): its largest weight per area.
      const events = new Map<string, Map<string, { name: string; w: number }>>();
      const add = (ev: string, day: ISODate | undefined, until: ISODate | undefined, areas: string[]) => {
        if (!day || day < from || day > now || (until && day > until)) return;
        const m = events.get(ev) || new Map();
        events.set(ev, m);
        const names = areas.length ? areas : [''];
        names.forEach(name => {
          const k = areaKey(name);
          m.set(k, { name: m.get(k)?.name ?? name, w: Math.max(m.get(k)?.w ?? 0, 1 / names.length) });
        });
      };
      data.goals.forEach(g => {
        const areas = goalAreas(g, data);
        if (!g.status || g.status === 'active') (areas.length ? areas : ['']).forEach(a => get(a).goals++);
        if (g.status === 'paused') return;
        const until = achievedDay(g);
        treeActivities(g).forEach(a => {
          if (isRoutine(a))
            Object.entries(a.checkins || {}).forEach(([d, v]) => v === 1 && add(`${a.id}|${d}`, d, until, areas));
          else if (a.list?.length)
            a.list.forEach(
              i => i.done && add(`${a.id}|${i.id}`, i.doneAt || (i.at && isoDate(new Date(i.at))), until, areas),
            );
          else add(a.id, doneDay(a), until, areas);
        });
      });
      events.forEach(m =>
        m.forEach(({ name, w }) => {
          const b = get(name);
          b.effort++;
          b.weight += w;
        }),
      );
    });
  const list = [...byKey.values()].filter(b => b.visions.length || b.goals || b.effort);
  const total = list.reduce((s, b) => s + b.weight, 0);
  const out = list.map(({ weight, ...b }) => ({ ...b, share: total ? (weight / total) * 100 : 0 }));
  return {
    blocks: out.filter(b => b.name).sort((a, b) => b.share - a.share || a.name.localeCompare(b.name, locale())),
    none: out.find(b => !b.name) || null,
    total: list.reduce((s, b) => s + b.effort, 0),
  };
}

export type AreaSentence =
  { key: 'most'; area: string } | { key: 'unserved'; area: string; more: number } | { key: 'quiet' };

// At most two, in this order: where most effort went, an area with a vision and no active goal, nothing ticked.
export function areaSentences(r: AreaReport): AreaSentence[] {
  const out: AreaSentence[] = [],
    top = r.blocks[0];
  if (top && top.share > 50 && r.blocks.filter(b => b.visions.length).length >= 2)
    out.push({ key: 'most', area: top.name });
  const bare = r.blocks
    .filter(b => b.visions.length && !b.goals)
    .sort((a, b) => a.name.localeCompare(b.name, locale()));
  if (bare.length) out.push({ key: 'unserved', area: bare[0].name, more: bare.length - 1 });
  const active = r.blocks.some(b => b.goals) || !!r.none?.goals;
  if (!r.total && active) out.push({ key: 'quiet' });
  return out.slice(0, 2);
}

// The suggested areas no vision and no goal uses, leaving out those hidden on this device.
export function emptyAreas(suggestions: string[], r: AreaReport, hidden: string[]): string[] {
  const used = new Set([...r.blocks.map(b => areaKey(b.name)), ...hidden.map(areaKey)]);
  return suggestions.filter(s => s.trim() && !used.has(areaKey(s)));
}

// Renaming an area: the visions' areas and the goal categories with the same name. Returns how many changed.
export function renameVisions(list: Vision[], from: string, to: string): number {
  const hit = list.filter(v => v.area && areaKey(v.area) === areaKey(from));
  hit.forEach(v => (v.area = to.trim()));
  return hit.length;
}
export function renameGoals(data: Db, from: string, to: string): number {
  const hit = data.goals.filter(g => g.category && areaKey(g.category) === areaKey(from));
  hit.forEach(g => (g.category = to.trim()));
  return hit.length;
}
