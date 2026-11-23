/** The goal form's keep-goal parts (feature 07): the kind choice, the range fields, and a keep goal drafted from a reached one. */
import { t } from '../../i18n/index';
import { db } from '../../core/state';
import { goalPeriod, isCumulative } from '../../core/cumulative';
import { goalRoutines, lowerBetter, measuringState } from '../../core/progress';
import { ownVisions } from '../../core/visions';
import { relsTo } from '../../core/relations';
import { today } from '../../core/dates';
import { fmtNum, isNum } from '../../core/util';
import { withUnit } from '../text';
import { $ } from '../dom';
import { checklist } from './picker';
import { field, num, select, type FormVals, type New } from './form';
import type { Goal } from '../../core/model';

// The choice above "Progress from".
export const kindField = (g: New<Goal>) =>
  field(
    'goalKind',
    t('f.goalKind'),
    select('goalKind', { reach: t('f.kindReach'), keep: t('f.kindKeep') }, g.keep ? 'keep' : 'reach'),
  );

// At least and At most, in place of start, current and target.
export const keepFields = (g: New<Goal>) => `<div class="row2" id="keepFields">
  ${field('keepMin', t('f.keepMin'), num('keepMin', g.keep?.min ?? ''))}
  ${field('keepMax', t('f.keepMax'), num('keepMax', g.keep?.max ?? ''))}
</div>`;

// The routines of the reached goal, to carry on into the keep goal; none ticked.
export const keepRoutines = (g: New<Goal>) => {
  const from = db.goals.find(x => x.id === g.links?.keepFrom);
  const list = from ? goalRoutines(from) : [];
  return list.length ? checklist('keepRoutines', t('f.keepRoutines'), 'activity', list, []) : '';
};

// The form's answers as a goal: a keep goal carries its range and is always measured.
export function formGoal(v: FormVals): Goal {
  const g = { ...v } as unknown as Goal;
  if (v.goalKind !== 'keep') return g;
  g.keep = {};
  if (isNum(v.keepMin)) g.keep.min = Number(v.keepMin);
  if (isNum(v.keepMax)) g.keep.max = Number(v.keepMax);
  g.progress = 'measure';
  return g;
}

// A keep goal's range errors sit under At least, where its fields are.
export const keepErrs = <E extends Partial<Record<string, string>>>(g: Goal, errs: E): E =>
  g.keep && errs.target ? { ...errs, keepMin: errs.target, target: undefined } : errs;

// A running total cannot be kept in a range: refused when the linked state adds up and the goal counts it in total.
export function keepTotalErr(g: Goal, v: FormVals): string | undefined {
  const s = db.states.find(x => x.id === v.measuredBy);
  return g.keep && isCumulative(s) && (v.period || 'total') === 'total' ? t('err.keepTotal') : undefined;
}

// Shows the fields of the chosen kind; the hidden ones keep their values until Save.
export function updateKindFields(): boolean {
  const keep = $<HTMLSelectElement>('#f-goalKind').value === 'keep';
  $('[data-field="progress"]').hidden = keep;
  $('#reachFields').hidden = keep;
  $('#keepFields').hidden = !keep;
  const deadline = $('[data-field="deadline"]');
  deadline.querySelector('label')!.textContent = t(keep ? 'f.until' : 'f.deadline');
  deadline.querySelector<HTMLElement>('.hint')!.hidden = !keep;
  return keep;
}

// A new keep goal filled in from a reached one: the same measurement, the old target as its limit.
export function keepDraft(fromId: string): New<Goal> {
  const from = db.goals.find(x => x.id === fromId);
  if (!from) return {};
  const st = measuringState(from) || db.states.find(s => relsTo(from.id, 'measures').some(r => r.from === s.id));
  const target = Number(from.target);
  const unit = st?.unit || from.unit || '';
  return {
    title: t('keep.titleFrom', { metric: from.metric || st?.title || '', value: withUnit(fmtNum(target), unit) }),
    metric: from.metric,
    unit: from.unit,
    category: from.category,
    period: goalPeriod(from) === 'total' ? undefined : from.period,
    keep: lowerBetter(from) ? { max: target } : { min: target },
    startDate: today(),
    links: { keepFrom: from.id, visions: ownVisions(from), measures: st?.id },
  };
}
