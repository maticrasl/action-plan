/** Ready-made plan templates: the list by area, and turning one into a plan. */
import { lang, t, type Lang, type TextKey } from '../../i18n/index';
import { uid } from '../util';
import { addDays } from '../routines/schedule';
import { today } from '../dates';
import {
  emptyDb,
  type Activity,
  type Db,
  type Goal,
  type Period,
  type RelType,
  type Repeat,
  type Scale,
  type State,
} from '../model';
import { HEALTH } from './health';
import { MONEY } from './money';
import { LEARNING } from './learning';
import { CAREER } from './career';
import { HOME } from './home';
import { WELLBEING } from './wellbeing';
import { FAITH } from './faith';

/* =========================================================
   Plan templates
   ---------------------------------------------------------
   Ready-made plans to start from (Settings → Start from a template).
   Each template is data only; templateData() below turns one into a plan.
   - Text is a pair [English, Slovene] (TPL_LANGS); a unit may also be a plain
     string such as 'km' or '€'.
   - Dates are days from the day the template is used: `start` and `end`.
   - Items are named by `k`; links point to those names:
     goal `sub` (its parent goal) and `deps` (goals it waits for);
     state `measures` (goals); activity `goals` (contributes to), `improves`
     (states), `parent` (its parent activity) and `deps` (activities it waits for).
   - `repeat` makes an activity a routine (see the routine notes in app.js); `repeat.makeUp` lets
     another day of the period make up a missed set day. Nothing may depend on a routine.
   - `list` gives an activity checklist items (text pairs); a routine's items are ticked each day.
   - Goals without `progress` are measured from `baseline` to `target`; a goal measured by a state
     that adds up (`cumulative`, its graph's `scale`) counts it per `period` or in total.
   ========================================================= */

export type TplText = string | [en: string, sl: string];
export type Area = 'health' | 'money' | 'learning' | 'career' | 'home' | 'wellbeing' | 'faith';
// `start` and `end` are days from the day the template is used; the other strings name items by `k`.
export interface TplGoal {
  k: string;
  title: TplText;
  specific?: TplText;
  metric?: TplText;
  unit?: TplText;
  achievable?: TplText;
  relevant?: TplText;
  progress?: 'activities' | 'routines';
  baseline?: number;
  target?: number;
  period?: Period;
  start?: number;
  end: number;
  sub?: string;
  deps?: string[];
}
export interface TplState {
  k: string;
  title: TplText;
  description?: TplText;
  unit?: TplText;
  cumulative?: boolean;
  scale?: Scale;
  measures?: string[];
}
export interface TplActivity {
  k: string;
  title: TplText;
  description?: TplText;
  start: number;
  end?: number;
  repeat?: Repeat;
  list?: TplText[];
  parent?: string;
  goals?: string[];
  improves?: string[];
  deps?: string[];
}
export interface Template {
  id: string;
  area: Area;
  level: 'starter' | 'ambitious';
  name: TplText;
  about: TplText;
  goals: TplGoal[];
  states: TplState[];
  activities: TplActivity[];
}

export const TPL_LANGS: Lang[] = ['en', 'sl'];
export const TPL_AREAS: Area[] = ['health', 'money', 'learning', 'career', 'home', 'wellbeing', 'faith'];

export const TEMPLATES: Template[] = [...HEALTH, ...MONEY, ...LEARNING, ...CAREER, ...HOME, ...WELLBEING, ...FAITH];

// A template's text in the active language: a pair [English, Slovene], or a plain string such as 'km'.
export const tplText = (v: TplText): string => (Array.isArray(v) ? (v[TPL_LANGS.indexOf(lang)] ?? v[0]) : v);

// Plan data from a template: dates counted from today, nothing done yet, no measurements.
export function templateData(tpl: Template): Db {
  const ids: Record<string, string> = {};
  const id = (k: string) => (ids[k] ??= uid());
  const day = (n: number) => addDays(today(), n);
  // The fields the template has, in the active language (title is always there).
  const texts = <T, K extends keyof T & string>(x: T, fields: K[]) =>
    Object.fromEntries(fields.filter(f => x[f] !== undefined).map(f => [f, tplText(x[f] as TplText)])) as Partial<
      Record<K, string>
    >;
  const category = t(('tpl.area.' + tpl.area) as TextKey);
  const data = emptyDb();
  const rel = (from: string, type: RelType, to: string) =>
    data.relations.push({ id: uid(), from: id(from), to: id(to), type });
  for (const g of tpl.goals) {
    const measure = g.progress
      ? { progress: g.progress }
      : { baseline: String(g.baseline), current: '', target: String(g.target) };
    data.goals.push({
      id: id(g.k),
      category,
      ...texts(g, ['title', 'specific', 'metric', 'unit', 'achievable', 'relevant']),
      ...measure,
      ...(g.period && { period: g.period }),
      startDate: day(g.start || 0),
      deadline: day(g.end),
      status: 'active',
    } as Goal);
    if (g.sub) rel(g.k, 'subgoal', g.sub);
    (g.deps || []).forEach(x => rel(g.k, 'depends', x));
  }
  for (const s of tpl.states) {
    data.states.push({
      id: id(s.k),
      ...texts(s, ['title', 'description', 'unit']),
      value: '',
      date: '',
      history: [],
      ...(s.cumulative && { cumulative: true, scale: s.scale || 'total', entries: [] }),
    } as State);
    (s.measures || []).forEach(x => rel(s.k, 'measures', x));
  }
  for (const a of tpl.activities) {
    data.activities.push({
      id: id(a.k),
      ...texts(a, ['title', 'description']),
      status: 'todo',
      startDate: day(a.start),
      ...(a.end !== undefined && { dueDate: day(a.end) }),
      ...(a.repeat && { repeat: { ...a.repeat } }),
      ...(a.list && { list: a.list.map(x => ({ id: uid(), text: tplText(x), done: false })) }),
    } as Activity);
    if (a.parent) rel(a.k, 'subactivity', a.parent);
    (a.goals || []).forEach(x => rel(a.k, 'contributes', x));
    (a.improves || []).forEach(x => rel(a.k, 'improves', x));
    (a.deps || []).forEach(x => rel(a.k, 'depends', x));
  }
  return data;
}
