/** Choosing the tip of the day: when none is chosen, what the history allows, the order, one a day. */
import type { ISODate } from '../model';
import { addDays } from '../routines/schedule';
import * as L from './tip-limits';
import { daysFrom, firstItemDay, type Tip, type TipHit, type TipInput } from './tip-facts';
import type { Tips } from './tip-history';
import { TIPS_A } from './tips-a';
import { TIPS_B } from './tips-b';
import { TIPS_CD } from './tips-cd';
import { goalProgress } from '../progress';

export const CATALOGUE: Tip[] = [...TIPS_A, ...TIPS_B, ...TIPS_CD];

export interface Chosen {
  tip: Tip;
  hit: TipHit;
  key: string;
}
// What stops tips besides the plan itself.
export interface TipBlocks {
  demo: boolean; // the open plan is a sample
  walkOpen: boolean; // Getting started is on and its first stage is not finished
}

export const keyOf = (tip: Tip, hit: TipHit) => (hit.id ? `${tip.id}:${hit.id}` : tip.id);

// No tip is chosen or shown: a sample plan, an empty plan, Getting started's first stage, the first days.
export function blocked(inp: TipInput, b: TipBlocks): boolean {
  if (b.demo || b.walkOpen) return true;
  const first = firstItemDay(inp.db, inp.visions);
  return !first || daysFrom(first, inp.today) < L.QUIET_START_DAYS;
}

// Whether the history lets this key be the tip of the day.
export function allowed(tip: Tip, key: string, tips: Tips, today: ISODate): boolean {
  const s = tips.shown[key];
  if (!s) return true;
  if (s.closed || (s.snoozed && today < s.snoozed)) return false;
  if (!tip.cooldown || s.n >= L.MAX_SHOWINGS) return false;
  return daysFrom(s.last, today) >= tip.cooldown;
}

// Lowest class first, then the one shown longest ago (never shown first), then the catalogue's order.
function best(catalogue: Tip[], inp: TipInput, tips: Tips, ok: (tip: Tip, key: string) => boolean): Chosen | null {
  const found: Chosen[] = [];
  catalogue.forEach(tip => {
    const hit = tip.hits(inp).find(h => ok(tip, keyOf(tip, h)));
    if (hit) found.push({ tip, hit, key: keyOf(tip, hit) });
  });
  const last = (c: Chosen) => tips.shown[c.key]?.last || '';
  return (
    found.sort((x, y) => x.tip.cls.localeCompare(y.tip.cls) || last(x).localeCompare(last(y)))[0] || null
  );
}
export const choose = (catalogue: Tip[], inp: TipInput, tips: Tips) =>
  best(catalogue, inp, tips, (tip, key) => allowed(tip, key, tips, inp.today));

// A tip the user asked for: any that is true now and was not closed, except those in `skip`
// (the tip of the day, those asked for already). Nothing is recorded.
export const askTip = (catalogue: Tip[], inp: TipInput, tips: Tips, skip: string[]) =>
  best(catalogue, { ...inp, since: tips.since }, tips, (_, key) => !tips.shown[key]?.closed && !skip.includes(key));

// Notes the active goals seen under 40 % (for `halfway`); drops the notes of goals gone or not active.
export function keepSince(inp: TipInput, tips: Tips): Tips {
  const active = new Map(inp.db.goals.filter(g => g.status === 'active').map(g => [g.id, g]));
  const since = { ...tips.since };
  let changed = false;
  Object.keys(since).forEach(k => {
    if (k.startsWith('under40:') && !active.has(k.slice(8))) changed = delete since[k];
  });
  active.forEach((g, id) => {
    if (!since[`under40:${id}`] && goalProgress(g) < L.HALFWAY_FROM) {
      since[`under40:${id}`] = inp.today;
      changed = true;
    }
  });
  return changed ? { ...tips, since } : tips;
}

// The tip of the day again, if what it says is still true and it was not closed or put off.
export function recheck(catalogue: Tip[], inp: TipInput, key: string, tips: Tips): Chosen | null {
  const s = tips.shown[key];
  if (s?.closed || (s?.snoozed && inp.today < s.snoozed)) return null;
  const tip = catalogue.find(x => x.id === key.split(':')[0]);
  // The "first opening of the period" rule is for choosing; later the same day it still holds.
  const hit = tip?.hits({ ...inp, prevDay: undefined }).find(h => keyOf(tip, h) === key);
  return tip && hit ? { tip, hit, key } : null;
}

// On the first render of a day one tip is chosen and recorded; later renders that day show it while
// it holds, and nothing once it does not. The history is returned unchanged when nothing was chosen.
export function tipOfDay(
  catalogue: Tip[],
  inp: TipInput,
  tips: Tips,
  blocks: TipBlocks,
): { tips: Tips; show: Chosen | null } {
  if (tips.off || blocked(inp, blocks)) return { tips, show: null };
  if (tips.day && tips.day >= inp.today) {
    const show =
      tips.day === inp.today && tips.current ? recheck(catalogue, { ...inp, since: tips.since }, tips.current, tips) : null;
    return { tips, show };
  }
  const kept = keepSince(inp, tips);
  const show = choose(catalogue, { ...inp, prevDay: tips.day, since: kept.since }, kept);
  const next: Tips = { ...kept, day: inp.today, current: show?.key ?? null };
  if (show) {
    const s = tips.shown[show.key];
    next.shown = { ...tips.shown, [show.key]: { ...s, n: (s?.n || 0) + 1, last: inp.today } };
  }
  return { tips: next, show };
}

// The first tips a user sees say that tips can be turned off.
export const showsHint = (tips: Tips) =>
  Object.values(tips.shown).reduce((n, s) => n + s.n, 0) <= L.HINT_SHOWINGS;

export const snooze = (tips: Tips, key: string, today: ISODate): Tips => {
  const s = tips.shown[key] || { n: 1, last: today };
  return { ...tips, shown: { ...tips.shown, [key]: { ...s, snoozed: addDays(today, L.SNOOZE_DAYS) } } };
};
export const closeTip = (tips: Tips, key: string, today: ISODate): Tips => {
  const s = tips.shown[key] || { n: 1, last: today };
  return { ...tips, shown: { ...tips.shown, [key]: { ...s, closed: true } } };
};
