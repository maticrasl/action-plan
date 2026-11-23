/** The range of a keep goal (feature 07) as a shaded band behind a state's graph. */
import { goalPeriod } from '../../core/cumulative';
import { inRange, isKeep } from '../../core/keep';
import type { Goal, Keep, Scale, State } from '../../core/model';
import { relsFrom } from '../../core/relations';
import { db } from '../../core/state';
import { t } from '../../i18n/index';
import { esc } from '../../ui/dom';
import { GR, type Axis } from './states';

type KeepGoal = Goal & { keep: Keep };

// Keep goals a state measures. On a state that adds up, only those counting it as the graph shows it.
export const stateBands = (s: State, scale?: Scale): KeepGoal[] =>
  relsFrom(s.id, 'measures')
    .map(r => db.goals.find(g => g.id === r.to))
    .filter((g): g is KeepGoal => isKeep(g) && (!scale || goalPeriod(g) === scale));

// The limits, so the value axis reaches them.
export const bandYs = (bands: KeepGoal[]): number[] =>
  bands.flatMap(g => [g.keep.min, g.keep.max]).filter((v): v is number => v !== undefined);

// Whether a value is outside any of the ranges: drawn in the warning colour.
export const outOfBand = (bands: KeepGoal[], v: number): boolean => bands.some(g => !inRange(g.keep, v));

// One rect per range across the plot, open above or below when a limit is missing, with its legend.
export const bandSvg = (bands: KeepGoal[], py: Axis, W: number) =>
  bands
    .map(g => {
      const top = g.keep.max !== undefined ? py(g.keep.max) : GR.T,
        bottom = g.keep.min !== undefined ? py(g.keep.min) : GR.H - GR.B;
      return `<rect class="gr-band" x="${GR.L}" y="${top}" width="${W - GR.L - GR.R}" height="${Math.max(0, bottom - top)}"/>
      <text class="gr-label muted" x="${GR.L + 6}" y="${top + 14}">${esc(t('keep.legend', { goal: g.title }))}</text>`;
    })
    .join('');
