/** Relationships in the open plan: finding items, walking links, and which new links are allowed. */
import { ACYCLIC, KINDS, PARENT_REL, REL_TYPES, VISION_RELS } from './model';
import { t } from '../i18n/index';
import { db } from './state';
import { findVision } from './visions';
import { uid } from './util';
import { isRoutine } from './routines/schedule';

export const relLabel = type => (REL_TYPES[type] || VISION_RELS[type] ? t('rel.' + type) : type);

export function collection(kind) {
  return { goal: db.goals, state: db.states, activity: db.activities }[kind];
}
export function findEntity(id) {
  for (const kind of KINDS) {
    const item = collection(kind).find(x => x.id === id);
    if (item) return { kind, item };
  }
  const vision = findVision(id);
  return vision ? { kind: 'vision', item: vision } : null;
}

export const relsFrom = (id, type) => db.relations.filter(r => r.from === id && (!type || r.type === type));
export const relsTo = (id, type) => db.relations.filter(r => r.to === id && (!type || r.type === type));

// True if `target` is reachable from `start` following edges of `type`.
export function reaches(start, target, type, seen = new Set()) {
  if (start === target) return true;
  if (seen.has(start)) return false;
  seen.add(start);
  return relsFrom(start, type).some(r => reaches(r.to, target, type, seen));
}

// Parent chain (nearest first) following a parent relation such as 'subactivity'.
export function ancestors(id, type) {
  const out = [];
  for (let r = relsFrom(id, type)[0]; r && !out.includes(r.to); r = relsFrom(r.to, type)[0]) out.push(r.to);
  return out;
}
export function descendants(id, type) {
  const out = [];
  const queue = [id];
  while (queue.length) {
    relsTo(queue.shift(), type).forEach(r => {
      if (!out.includes(r.from)) { out.push(r.from); queue.push(r.from); }
    });
  }
  return out;
}

export const kindList = kinds => kinds.map(k => t('kindLower.' + k)).join(' / ');
// Human-readable allowed direction, e.g. "activity → activity, goal → goal".
export function relSignature(type) {
  const d = REL_TYPES[type];
  return d.from.map(f => `${kindList([f])} → ${kindList(d.to === 'same' ? [f] : d.to)}`).join(', ');
}

export function canRelate(from, to, type) {
  const def = REL_TYPES[type];
  const a = findEntity(from), b = findEntity(to);
  if (!def || !a || !b) return t('err.unknown');
  if (from === to) return t('err.self');
  if (!def.from.includes(a.kind)) return t('err.relFrom', { rel: relLabel(type), kind: kindList(def.from) });
  if (def.to === 'same' && b.kind !== a.kind) return t('err.relTo', { rel: relLabel(type), kind: kindList([a.kind]) });
  if (Array.isArray(def.to) && !def.to.includes(b.kind)) return t('err.relTo', { rel: relLabel(type), kind: kindList(def.to) });
  if (type === 'depends' && isRoutine(b.item)) return t('err.dependsRoutine');
  if (db.relations.some(r => r.from === from && r.to === to && r.type === type)) return t('err.relExists');
  if (Object.values(PARENT_REL).includes(type) && relsFrom(from, type).length) return t('err.oneParent');
  if (ACYCLIC.has(type) && reaches(to, from, type)) return t('err.cycle');
  const parentRel = PARENT_REL[a.kind];
  if (parentRel && (type === 'depends' || type === parentRel)) {
    if (dependsInLine(from, to, type, a.kind)) return t('err.lineDep');
    if (wouldSelfBlock(from, to, type, a.kind)) return t('err.selfBlock');
  }
  return null;
}

// True if the link would leave an item depending on its own parent or sub-item, in either direction:
// directly for a new dependency, or through the new parent line for a new sub-activity or sub-goal.
export function dependsInLine(from, to, type, kind) {
  const parentRel = PARENT_REL[kind];
  if (type === 'depends') return [...ancestors(from, parentRel), ...descendants(from, parentRel)].includes(to);
  const below = new Set([from, ...descendants(from, parentRel)]), above = new Set([to, ...ancestors(to, parentRel)]);
  return db.relations.some(r => r.type === 'depends'
    && ((below.has(r.from) && above.has(r.to)) || (above.has(r.from) && below.has(r.to))));
}

// Items `id` waits for: its own prerequisites plus those of every parent above it (see blockers).
export const effectiveDeps = (id, kind) => [id, ...ancestors(id, PARENT_REL[kind])].flatMap(x => relsFrom(x, 'depends')).map(r => r.to);

// True if adding the link would make an item wait for itself, e.g. a parent depending on its
// own sub-activity: the sub-activity inherits that prerequisite, so both stay blocked for good.
export function wouldSelfBlock(from, to, type, kind) {
  const rel = { id: '', from, to, type };
  db.relations.push(rel);
  try {
    const waitsForSelf = id => {
      const seen = new Set(), queue = effectiveDeps(id, kind);
      while (queue.length) {
        const x = queue.shift();
        if (x === id) return true;
        if (!seen.has(x)) { seen.add(x); queue.push(...effectiveDeps(x, kind)); }
      }
      return false;
    };
    return [from, ...descendants(from, PARENT_REL[kind])].some(waitsForSelf);
  } finally { db.relations.splice(db.relations.indexOf(rel), 1); }
}

export function addRelation(from, to, type) {
  const err = canRelate(from, to, type);
  if (err) return err;
  db.relations.push({ id: uid(), from, to, type });
  return null;
}

// Relationship types that can link `from` → `to`; an edited relationship (`ignoreId`) does not count against itself.
export function possibleTypes(from, to, ignoreId) {
  const all = db.relations;
  db.relations = all.filter(r => r.id !== ignoreId);
  try { return Object.keys(REL_TYPES).filter(k => !canRelate(from, to, k)); } finally { db.relations = all; }
}
