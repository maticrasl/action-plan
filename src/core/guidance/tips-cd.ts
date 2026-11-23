/** Tips, classes C and D: it is going well, and things the app can do (see docs/guidance/03-tips.md). */
import type { Db, ISODate } from '../model';
import { goalProgress } from '../progress';
import { addDays, isDueDay, isFlexible, isRoutine, periodOf, routineStart, runsOn, type Routine } from '../routines/schedule';
import { periodProgress } from '../routines/keeping';
import { checkedOn, isList, isListRoutine } from '../routines/checkins';
import { isCumulative } from '../cumulative';
import { relsFrom } from '../relations';
import { isNum } from '../util';
import * as L from './tip-limits';
import { activeGoals, daysFrom, firstItemDay, runningRoutines, type Tip, type TipHit, type TipInput } from './tip-facts';

const named = (x: { id: string; title: string }): TipHit => ({ id: x.id, vars: { name: x.title } });
// Named, but keyed to the tip alone: a discovery tip shows once, whichever item it named.
const about = (x: { id: string; title: string }): TipHit => ({ vars: { name: x.title }, target: x.id });
const once = (yes: unknown): TipHit[] => (yes ? [{}] : []);

const itemCount = (db: Db) => db.goals.length + db.activities.length + db.states.length;
const age = ({ db, visions, today }: TipInput) => {
  const first = firstItemDay(db, visions);
  return first ? daysFrom(first, today) : -1;
};
const daily = (a: Routine) => a.repeat?.unit === 'day' && (a.repeat.every ?? 1) === 1;

// Weeks or months met in a row: this one if it is met already, then back from the last one.
function metInARow(a: Routine, today: ISODate): number {
  const start = routineStart(a);
  let p = periodOf(a, today);
  if (!periodProgress(a, p.from).met) p = periodOf(a, addDays(p.from, -1));
  let n = 0;
  for (let i = 0; p.from >= start && i < 100 && periodProgress(a, p.from).met; i++) {
    n++;
    p = periodOf(a, addDays(p.from, -1));
  }
  return n;
}

// A set day not ticked in the last days.
function missedLately(a: Routine, today: ISODate): boolean {
  for (let d = addDays(today, -1), i = 0; i < L.MAKE_UP_DAYS; d = addDays(d, -1), i++)
    if (runsOn(a, d) && isDueDay(a, d) && !checkedOn(a, d)) return true;
  return false;
}

const onlyGrows = (values: number[]) => values.length >= L.ADDS_UP_VALUES && values.every((v, i) => !i || v > values[i - 1]);

const CLASS_C: Tip[] = [
  {
    id: 'routine-holds',
    cls: 'C',
    view: 'activities',
    cooldown: 0,
    hits: ({ db, today }) =>
      runningRoutines(db, today)
        .filter(a => isFlexible(a) && metInARow(a, today) >= L.HOLDS_PERIODS)
        .map(named),
  },
  {
    id: 'halfway',
    cls: 'C',
    view: 'goals',
    cooldown: 0,
    hits: ({ db, since = {} }) =>
      activeGoals(db)
        .filter(g => since[`under40:${g.id}`] && goalProgress(g) > L.HALFWAY)
        .map(named),
  },
  {
    id: 'achieved',
    cls: 'C',
    view: 'goals',
    cooldown: 0,
    guide: 'reached',
    action: 'editItem',
    action2: 'closingNote', // shown while the goal has no closing note (feature 15)
    hits: ({ db, today }) =>
      db.goals
        .filter(g => g.status === 'achieved' && g.statusSince && daysFrom(g.statusSince, today) <= L.ACHIEVED_DAYS)
        .sort((x, y) => y.statusSince!.localeCompare(x.statusSince!))
        .map(named),
  },
  {
    id: 'first-month',
    cls: 'C',
    view: 'dashboard',
    cooldown: 0,
    hits: inp => {
      const opened = (inp.seen?.days || []).filter(d => d <= inp.today && daysFrom(d, inp.today) < L.FIRST_MONTH_DAYS);
      return once(age(inp) >= L.FIRST_MONTH_DAYS && new Set(opened).size >= L.FIRST_MONTH_OPENED);
    },
  },
];

// Each needs some days since the first item, so they never crowd the start.
const CLASS_D: Tip[] = (
  [
    {
      id: 'try-map',
      view: 'dashboard',
      guide: 'h-map',
      action: 'map',
      hits: ({ db, seen }) => once(itemCount(db) >= L.TRY_MAP_ITEMS && !seen?.views?.map),
    },
    {
      id: 'try-today',
      view: 'dashboard',
      guide: 'h-today',
      action: 'today',
      hits: ({ activePlans, seen }) => once((activePlans || 0) >= 2 && !seen?.views?.today),
    },
    {
      id: 'try-timeline',
      view: 'activities',
      guide: 'h-timeline',
      action: 'timeline',
      hits: ({ db, seen }) => {
        const dated = db.goals.filter(g => g.deadline || g.startDate).length + db.activities.filter(a => a.dueDate || a.startDate).length;
        return once(dated >= L.TRY_TIMELINE_ITEMS && !seen?.views?.timeline);
      },
    },
    {
      id: 'make-up',
      view: 'activities',
      guide: 'h-routines',
      action: 'editItem',
      hits: ({ db, today }) =>
        runningRoutines(db, today)
          .filter(a => !isFlexible(a) && !a.repeat?.makeUp && !daily(a) && missedLately(a, today))
          .slice(0, 1)
          .map(about),
    },
    {
      id: 'adds-up',
      view: 'graphs',
      guide: 'h-states',
      action: 'editItem',
      hits: ({ db }) => {
        const improved = new Set(db.activities.filter(isRoutine).flatMap(r => relsFrom(r.id, 'improves').map(x => x.to)));
        return db.states
          .filter(s => improved.has(s.id) && !isCumulative(s))
          .filter(s =>
            onlyGrows(
              [...(s.history || [])]
                .sort((x, y) => x.date.localeCompare(y.date))
                .map(h => h.value)
                .filter(isNum)
                .map(Number),
            ),
          )
          .slice(0, 1)
          .map(about);
      },
    },
    {
      id: 'use-list',
      view: 'activities',
      guide: 'h-activities',
      action: 'editItem',
      hits: ({ db }) =>
        db.activities
          .filter(a => !isRoutine(a) && !isList(a) && a.status !== 'done')
          .filter(a => {
            const d = a.description || '';
            return d.split('\n').filter(l => l.trim()).length >= L.USE_LIST_PARTS || d.split(',').length > L.USE_LIST_PARTS;
          })
          .slice(0, 1)
          .map(about),
    },
    {
      id: 'routine-list',
      view: 'activities',
      guide: 'h-routines',
      action: 'addRoutineList',
      hits: ({ db, today }) => {
        const n = runningRoutines(db, today).filter(a => !isListRoutine(a) && daily(a)).length;
        return once(n >= L.ROUTINE_LIST);
      },
    },
    {
      id: 'templates',
      view: 'goals',
      guide: 'first-steps',
      action: 'templates',
      hits: ({ db, seen }) => once(db.goals.length === 1 && !db.activities.length && !seen?.templates),
    },
    {
      id: 'backup',
      view: 'dashboard',
      guide: 'p-backup',
      action: 'backup',
      hits: inp =>
        once(
          inp.device &&
            !inp.device.synced &&
            !inp.seen?.exported &&
            itemCount(inp.db) >= L.BACKUP_ITEMS &&
            age(inp) >= L.BACKUP_DAYS,
        ),
    },
    {
      id: 'install',
      view: 'dashboard',
      guide: 'h-install',
      action: 'install',
      hits: ({ device, seen }) =>
        once(device?.canInstall && !device.installed && new Set(seen?.days || []).size >= L.INSTALL_DAYS),
    },
    {
      id: 'menu',
      view: 'dashboard',
      guide: 'h-shortcuts',
      hits: ({ db, seen }) => once(itemCount(db) >= L.MENU_ITEMS && !seen?.menu),
    },
    {
      id: 'ctrl-enter',
      view: 'dashboard',
      guide: 'h-shortcuts',
      hits: ({ db, device }) => once(device?.fine && itemCount(db) >= L.MENU_ITEMS),
    },
    {
      id: 'share',
      view: 'dashboard',
      guide: 'h-plans',
      action: 'share',
      hits: inp => once(inp.db.goals.some(g => g.status === 'achieved') && age(inp) >= L.SHARE_DAYS),
    },
  ] as Omit<Tip, 'cls' | 'cooldown'>[]
).map(tip => ({
  ...tip,
  cls: 'D',
  cooldown: 0,
  hits: (inp: TipInput) => (age(inp) >= L.DISCOVER_AFTER ? tip.hits(inp) : []),
}));

export const TIPS_CD: Tip[] = [...CLASS_C, ...CLASS_D];
