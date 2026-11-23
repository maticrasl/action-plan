/** Relationships in the open plan: finding items, walking links, and which new links are allowed. */
import {
  ACYCLIC,
  KINDS,
  PARENT_REL,
  REL_TYPES,
  VISION_RELS,
  type Activity,
  type Goal,
  type ItemKind,
  type Kind,
  type Relation,
  type RelSpec,
  type RelType,
  type State,
  type Vision,
  type VisionRel,
} from './model';
import { t, type TextKey } from '../i18n/index';
import { db } from './state';
import { findVision } from './visions';
import { uid } from './util';
import { isRoutine } from './routines/schedule';

export type PlanItem = Goal | State | Activity;
// An item found by id, with its kind.
export type Entity =
  | { kind: 'goal'; item: Goal }
  | { kind: 'state'; item: State }
  | { kind: 'activity'; item: Activity }
  | { kind: 'vision'; item: Vision };
// The kinds that have parents (sub-goals, sub-activities).
export type ParentKind = keyof typeof PARENT_REL;

export const relLabel = (type: string): string =>
  REL_TYPES[type as RelType] || VISION_RELS[type as VisionRel] ? t(('rel.' + type) as TextKey) : type;

export function collection(kind: Kind): Goal[] | State[] | Activity[] {
  return { goal: db.goals, state: db.states, activity: db.activities }[kind];
}
export function findEntity(id: string): Entity | null {
  for (const kind of KINDS) {
    const item = collection(kind).find(x => x.id === id);
    if (item) return { kind, item } as Entity;
  }
  const vision = findVision(id);
  return vision ? { kind: 'vision', item: vision } : null;
}

export const relsFrom = (id: string, type?: RelType): Relation[] =>
  db.relations.filter(r => r.from === id && (!type || r.type === type));
export const relsTo = (id: string, type?: RelType): Relation[] =>
  db.relations.filter(r => r.to === id && (!type || r.type === type));

// True if `target` is reachable from `start` following edges of `type`.
export function reaches(start: string, target: string, type: RelType, seen = new Set<string>()): boolean {
  if (start === target) return true;
  if (seen.has(start)) return false;
  seen.add(start);
  return relsFrom(start, type).some(r => reaches(r.to, target, type, seen));
}

// Parent chain (nearest first) following a parent relation such as 'subactivity'.
export function ancestors(id: string, type: RelType): string[] {
  const out: string[] = [];
  for (let r = relsFrom(id, type)[0]; r && !out.includes(r.to); r = relsFrom(r.to, type)[0]) out.push(r.to);
  return out;
}
export function descendants(id: string, type: RelType): string[] {
  const out: string[] = [];
  const queue = [id];
  while (queue.length) {
    relsTo(queue.shift()!, type).forEach(r => {
      if (!out.includes(r.from)) {
        out.push(r.from);
        queue.push(r.from);
      }
    });
  }
  return out;
}

export const kindList = (kinds: readonly ItemKind[]): string =>
  kinds.map(k => t(('kindLower.' + k) as TextKey)).join(' / ');
// Human-readable allowed direction, e.g. "activity → activity, goal → goal".
export function relSignature(type: RelType): string {
  const d: RelSpec = REL_TYPES[type];
  return d.from.map(f => `${kindList([f])} → ${kindList(d.to === 'same' ? [f] : d.to)}`).join(', ');
}

// Why `from` cannot link to `to` with `type` (a message), or null if it can.
export function canRelate(from: string, to: string, type: RelType): string | null {
  const def: RelSpec | undefined = REL_TYPES[type];
  const a = findEntity(from),
    b = findEntity(to);
  if (!def || !a || !b) return t('err.unknown');
  if (from === to) return t('err.self');
  if (!def.from.includes(a.kind)) return t('err.relFrom', { rel: relLabel(type), kind: kindList(def.from) });
  if (def.to === 'same' && b.kind !== a.kind) return t('err.relTo', { rel: relLabel(type), kind: kindList([a.kind]) });
  if (Array.isArray(def.to) && !def.to.includes(b.kind))
    return t('err.relTo', { rel: relLabel(type), kind: kindList(def.to) });
  if (type === 'depends' && isRoutine(b.item)) return t('err.dependsRoutine');
  if (db.relations.some(r => r.from === from && r.to === to && r.type === type)) return t('err.relExists');
  if ((Object.values(PARENT_REL) as RelType[]).includes(type) && relsFrom(from, type).length) return t('err.oneParent');
  if (ACYCLIC.has(type) && reaches(to, from, type)) return t('err.cycle');
  const parentRel: RelType | undefined = PARENT_REL[a.kind as ParentKind];
  if (parentRel && (type === 'depends' || type === parentRel)) {
    if (dependsInLine(from, to, type, a.kind as ParentKind)) return t('err.lineDep');
    if (wouldSelfBlock(from, to, type, a.kind as ParentKind)) return t('err.selfBlock');
  }
  return null;
}

// True if the link would leave an item depending on its own parent or sub-item, in either direction:
// directly for a new dependency, or through the new parent line for a new sub-activity or sub-goal.
export function dependsInLine(from: string, to: string, type: RelType, kind: ParentKind): boolean {
  const parentRel = PARENT_REL[kind];
  if (type === 'depends') return [...ancestors(from, parentRel), ...descendants(from, parentRel)].includes(to);
  const below = new Set([from, ...descendants(from, parentRel)]),
    above = new Set([to, ...ancestors(to, parentRel)]);
  return db.relations.some(
    r => r.type === 'depends' && ((below.has(r.from) && above.has(r.to)) || (above.has(r.from) && below.has(r.to))),
  );
}

// Items `id` waits for: its own prerequisites plus those of every parent above it (see blockers).
export const effectiveDeps = (id: string, kind: ParentKind): string[] =>
  [id, ...ancestors(id, PARENT_REL[kind])].flatMap(x => relsFrom(x, 'depends')).map(r => r.to);

// True if adding the link would make an item wait for itself, e.g. a parent depending on its
// own sub-activity: the sub-activity inherits that prerequisite, so both stay blocked for good.
export function wouldSelfBlock(from: string, to: string, type: RelType, kind: ParentKind): boolean {
  const rel: Relation = { id: '', from, to, type };
  db.relations.push(rel);
  try {
    const waitsForSelf = (id: string) => {
      const seen = new Set<string>(),
        queue = effectiveDeps(id, kind);
      while (queue.length) {
        const x = queue.shift()!;
        if (x === id) return true;
        if (!seen.has(x)) {
          seen.add(x);
          queue.push(...effectiveDeps(x, kind));
        }
      }
      return false;
    };
    return [from, ...descendants(from, PARENT_REL[kind])].some(waitsForSelf);
  } finally {
    db.relations.splice(db.relations.indexOf(rel), 1);
  }
}

export function addRelation(from: string, to: string, type: RelType): string | null {
  const err = canRelate(from, to, type);
  if (err) return err;
  db.relations.push({ id: uid(), from, to, type });
  return null;
}

// Relationship types that can link `from` → `to`; an edited relationship (`ignoreId`) does not count against itself.
export function possibleTypes(from: string, to: string, ignoreId?: string): RelType[] {
  const all = db.relations;
  db.relations = all.filter(r => r.id !== ignoreId);
  try {
    return (Object.keys(REL_TYPES) as RelType[]).filter(k => !canRelate(from, to, k));
  } finally {
    db.relations = all;
  }
}

// The selected item's whole chain: what leads to it and what it leads to, directly or through others, and the
// lines along it. A dependency points at what must come first, so it is walked the other way.
export function chainOf(sel: string | null, rels: { id: string; from: string; to: string; type: string }[]) {
  const nodes = new Set<string>(),
    links = new Set<string>();
  if (!sel) return { nodes, links };
  const flow = rels.map(r => (r.type === 'depends' ? { id: r.id, from: r.to, to: r.from } : r));
  const walk = (start: string, up: boolean) => {
    const seen = new Set([start]),
      todo = [start];
    while (todo.length) {
      const id = todo.pop()!;
      for (const r of flow) {
        const [here, next] = up ? [r.to, r.from] : [r.from, r.to];
        if (here !== id) continue;
        links.add(r.id);
        if (seen.has(next)) continue;
        seen.add(next);
        todo.push(next);
      }
    }
    seen.forEach(n => nodes.add(n));
  };
  walk(sel, true);
  walk(sel, false);
  return { nodes, links };
}
