/** Find your visions (feature 01): the exercises as data, the next step from the answers, what a run adds, and area ratings. */
import { areaKey } from './areas';
import type { Session } from './journal';
import type { ISODate, Vision } from './model';

/* Rules: docs/features/01-guided-discovery.md and docs/specs/2026-11-23-guided-discovery.md.
   A run is a journal session; `answers` is read only through answersOf, as a newer version or
   another device may have written anything there. */

export const EXERCISES = ['good-day', 'what-for', 'areas'] as const;
export type ExerciseId = (typeof EXERCISES)[number];
export const isExercise = (x: string): x is ExerciseId => (EXERCISES as readonly string[]).includes(x);

export const TEXT_MAX = 4000;
export const LADDER_MAX = 5; // answers on the "What for?" ladder
export const LOW_RATING = 5; // rated this or lower: asked what one point better looks like
export const SENTENCES = 3; // good-day step 5

export type Line = { text: string; area: string };
export interface DiscAnswers {
  step?: string; // where to continue
  s1?: string;
  s2?: string;
  s3?: string;
  s4?: string;
  s5?: Line[];
  goal?: { plan: string; id: string; title: string };
  ladder?: string[];
  vision?: Line; // the what-for ending's title and area
  serves?: boolean;
  ratings?: Record<string, number>;
  better?: Record<string, string>;
  pick?: string;
  extra?: string[]; // areas added for this run
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown) => (typeof x === 'string' ? x.slice(0, TEXT_MAX) : undefined);
const strs = (x: unknown) =>
  Array.isArray(x) ? x.filter(s => typeof s === 'string').map(s => s.slice(0, TEXT_MAX)) : undefined;
const line = (x: unknown): Line | undefined =>
  isObj(x) && typeof x.text === 'string'
    ? { text: x.text.slice(0, TEXT_MAX), area: str(x.area)?.slice(0, 80) ?? '' }
    : undefined;
function record<T>(x: unknown, ok: (v: unknown) => v is T): Record<string, T> | undefined {
  if (!isObj(x)) return undefined;
  return Object.fromEntries(Object.entries(x).filter(([, v]) => ok(v))) as Record<string, T>;
}
const rating = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 10;
const text = (v: unknown): v is string => typeof v === 'string';

// The answers of a stored run, each in its own shape or left out.
export function answersOf(raw: unknown): DiscAnswers {
  const a = isObj(raw) ? raw : {};
  const g = a.goal;
  const out: DiscAnswers = {
    step: str(a.step),
    s1: str(a.s1),
    s2: str(a.s2),
    s3: str(a.s3),
    s4: str(a.s4),
    s5: Array.isArray(a.s5) ? a.s5.map(line).filter((l): l is Line => !!l) : undefined,
    goal:
      isObj(g) && typeof g.plan === 'string' && typeof g.id === 'string' && typeof g.title === 'string'
        ? { plan: g.plan, id: g.id, title: g.title }
        : undefined,
    ladder: strs(a.ladder),
    vision: line(a.vision),
    serves: typeof a.serves === 'boolean' ? a.serves : undefined,
    ratings: record(a.ratings, rating),
    better: record(a.better, text),
    pick: str(a.pick),
    extra: strs(a.extra),
  };
  (Object.keys(out) as (keyof DiscAnswers)[]).forEach(k => out[k] === undefined && delete out[k]);
  return out;
}

// Anything typed, rated or chosen (where the run stands does not count).
export function hasAnswers(a: DiscAnswers): boolean {
  const any = (v: unknown): boolean =>
    typeof v === 'string'
      ? !!v.trim()
      : typeof v === 'number'
        ? true
        : Array.isArray(v)
          ? v.some(any)
          : isObj(v) && Object.values(v).some(any);
  return Object.entries(a).some(([k, v]) => k !== 'step' && k !== 'serves' && any(v));
}

/* ---------- Steps ---------- */

// Rated LOW_RATING or lower, lowest first, at most three.
export const lowAreas = (a: DiscAnswers) =>
  Object.entries(a.ratings ?? {})
    .filter(([, v]) => v <= LOW_RATING)
    .sort((x, y) => x[1] - y[1])
    .slice(0, 3)
    .map(([k]) => k);
export const ratedAreas = (a: DiscAnswers) => Object.keys(a.ratings ?? {});

const rung = (at: string | undefined) => (at && /^l\d$/.test(at) ? Number(at[1]) : -1);

// The steps of a run as far as they are known; `at` is the step shown (the ladder grows with it).
export function stepsOf(ex: ExerciseId, a: DiscAnswers, at?: string): string[] {
  if (ex === 'good-day') return ['s1', 's2', 's3', 's4', 's5'];
  if (ex === 'areas') return ['rate', ...(lowAreas(a).length ? ['better'] : []), 'pick'];
  const n = Math.min(LADDER_MAX, Math.max(2, rung(at) + 1));
  return ['goal', ...Array.from({ length: n }, (_, i) => `l${i}`)];
}

// Next from `at`: the step after it, or 'end'. `again` is "Ask again" on the ladder; Next there is
// "That's it", which keeps only the answers up to this one.
export function nextStep(
  ex: ExerciseId,
  a: DiscAnswers,
  at: string,
  again = false,
): { to: string; answers: DiscAnswers } {
  const i = rung(at);
  if (ex === 'what-for' && i >= 1) {
    if (again && i + 1 < LADDER_MAX) return { to: `l${i + 1}`, answers: a };
    return { to: 'end', answers: { ...a, ladder: (a.ladder ?? []).slice(0, i + 1) } };
  }
  if (ex === 'areas' && at === 'rate' && !ratedAreas(a).length) return { to: 'end', answers: a };
  const steps = stepsOf(ex, a, at);
  return { to: steps[steps.indexOf(at) + 1] ?? 'end', answers: a };
}

export function prevStep(ex: ExerciseId, a: DiscAnswers, at: string): string | null {
  const steps = stepsOf(ex, a, at);
  const i = at === 'end' ? steps.length : steps.indexOf(at);
  return i > 0 ? steps[i - 1] : null;
}

/* ---------- What a run adds ---------- */

export interface ToMake {
  title: string;
  area?: string;
  description?: string;
  avoid?: string;
  existing?: Vision; // a vision with this title already: link to it, add none
}

const findTitle = (list: Vision[], title: string) =>
  list.find(v => v.title.trim().toLowerCase() === title.toLowerCase());
const filled = (...xs: (string | undefined)[]) =>
  xs
    .map(x => (x || '').trim())
    .filter(Boolean)
    .join('\n\n');

export function toMake(ex: ExerciseId, a: DiscAnswers, list: Vision[]): ToMake[] {
  const lines =
    ex === 'good-day'
      ? (a.s5 ?? []).filter(l => l.text.trim())
      : ex === 'what-for'
        ? [a.vision ?? { text: lastRung(a), area: '' }].filter(l => l.text.trim())
        : [];
  return lines.map(l => {
    const m: ToMake = { title: l.text.trim() };
    if (l.area.trim()) m.area = l.area.trim();
    if (lines.length === 1 && ex === 'good-day') {
      const d = filled(a.s1, a.s2),
        avoid = filled(a.s4);
      if (d) m.description = d;
      if (avoid) m.avoid = avoid;
    }
    const old = findTitle(list, m.title);
    if (old) m.existing = old;
    return m;
  });
}
export const lastRung = (a: DiscAnswers) =>
  [...(a.ladder ?? [])]
    .reverse()
    .find(x => x.trim())
    ?.trim() ?? '';

/* ---------- Areas ---------- */

// The areas to rate: those in use, the suggestions, those added for this run; once each, none hidden.
export function rateList(inUse: string[], suggestions: string[], hidden: string[], extra: string[] = []): string[] {
  const seen = new Set(hidden.map(areaKey)),
    out: string[] = [];
  [...inUse, ...suggestions, ...extra].forEach(x => {
    const name = x.trim();
    if (name && !seen.has(areaKey(name))) {
      seen.add(areaKey(name));
      out.push(name);
    }
  });
  return out;
}

// Each area's latest rating, by area key, from the runs of `areas`.
export function latestRatings(sessions: Session[]): Map<string, { value: number; date: ISODate }> {
  const out = new Map<string, { value: number; date: ISODate }>();
  sessions
    .filter(s => s.exercise === 'areas')
    .sort((x, y) => (y.date + (y.updatedAt ?? '')).localeCompare(x.date + (x.updatedAt ?? '')))
    .forEach(s =>
      Object.entries(answersOf(s.answers).ratings ?? {}).forEach(([area, value]) => {
        if (!out.has(areaKey(area))) out.set(areaKey(area), { value, date: s.date });
      }),
    );
  return out;
}
