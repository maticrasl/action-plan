/** Moving late steps in one action: which steps are late, where each would go, and writing it. */
import type { Activity, Db, ISODate } from './model';
import { isRoutine } from './routines/schedule';
import { dayNum, dayStr } from './days';

export interface StepMove {
  id: string;
  start?: ISODate; // only when the start date moves
  due: ISODate;
}
// A goal that a moved step would now end after: `was` its deadline, `deadline` the one it would get.
export interface GoalMove {
  id: string;
  was: ISODate;
  deadline: ISODate;
  by: string[];
}
export interface MovePlan {
  days: number;
  moves: StepMove[];
  later: StepMove[];
  goals: GoalMove[];
}

const open = (a: Activity): a is Activity & { dueDate: ISODate } => !isRoutine(a) && a.status !== 'done' && !!a.dueDate;
const shift = (iso: ISODate, days: number) => dayStr(dayNum(iso) + days);
const byDue = (a: Activity, b: Activity) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0);

// One-time activities and lists, not done, due before today; earliest first.
export const lateSteps = (data: Db, today: ISODate) =>
  data.activities.filter(a => open(a) && a.dueDate < today).sort(byDue);

// Where the chosen steps (and, with `withLater`, the not-done steps due on or after the earliest
// chosen one) would go; changes nothing. Null when `to` is before today or nothing can move.
export function planMove(
  data: Db,
  o: { ids: string[]; to: ISODate; withLater: boolean; today: ISODate },
): MovePlan | null {
  if (o.to < o.today) return null;
  const chosen = new Set(o.ids);
  const steps = data.activities.filter(a => open(a) && chosen.has(a.id)).sort(byDue);
  if (!steps.length) return null;
  const anchor = steps[0].dueDate!;
  const days = Math.max(1, dayNum(o.to) - dayNum(anchor));
  const late = new Set(lateSteps(data, o.today).map(a => a.id));
  // An unticked late step stays where it is, also with withLater.
  const later = o.withLater
    ? data.activities.filter(a => open(a) && !chosen.has(a.id) && !late.has(a.id) && a.dueDate >= anchor).sort(byDue)
    : [];
  // In progress keeps its start; To do keeps its length.
  const to = (a: Activity): StepMove => ({
    id: a.id,
    ...(a.status === 'todo' && a.startDate ? { start: shift(a.startDate, days) } : {}),
    due: shift(a.dueDate!, days),
  });
  const moves = steps.map(to),
    laterMoves = later.map(to);
  const due = new Map([...moves, ...laterMoves].map(m => [m.id, m.due]));
  const goals = data.goals
    .filter(g => g.status !== 'achieved' && g.deadline)
    .map(g => ({
      id: g.id,
      was: g.deadline!,
      deadline: shift(g.deadline!, days),
      by: data.relations
        .filter(r => r.type === 'contributes' && r.to === g.id && (due.get(r.from) ?? '') > g.deadline!)
        .map(r => r.from)
        .sort((x, y) => (due.get(x)! < due.get(y)! ? -1 : 1)),
    }))
    .filter(g => g.by.length);
  return { days, moves, later: laterMoves, goals };
}

// Writes the plan's dates; the goals' deadlines only when `moveGoals`.
export function applyMove(data: Db, plan: MovePlan, moveGoals: boolean) {
  for (const m of [...plan.moves, ...plan.later]) {
    const a = data.activities.find(x => x.id === m.id);
    if (!a) continue;
    a.dueDate = m.due;
    if (m.start) a.startDate = m.start;
  }
  if (moveGoals)
    for (const gm of plan.goals) {
      const g = data.goals.find(x => x.id === gm.id);
      if (g) g.deadline = gm.deadline;
    }
}
