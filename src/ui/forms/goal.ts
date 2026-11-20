/** The goal form: its SMART sections, how progress is measured, and the live SMART check. */
import { t, type TextKey } from '../../i18n/index';
import { db, visions } from '../../core/state';
import { reaches, relsTo } from '../../core/relations';
import { measuringState, smartCheck, type SmartField } from '../../core/progress';
import { PERIODS, goalPeriod, isCumulative, stateTotal, stateValue } from '../../core/cumulative';
import { $, esc, smartBadge } from '../dom';
import { statusLabels, withUnit } from '../text';
import { fmtNum, isNum, numInput } from '../../core/util';
import { today } from '../../core/dates';
import { categorySuggestions } from '../../core/categories';
import { GOAL_STATUS } from '../../core/model';
import { checklist, linkSection } from './picker';
import { ownVisions } from '../../core/visions';
import {
  area,
  date,
  field,
  formCtx,
  formValues,
  linkedFrom,
  linksOf,
  modal,
  num,
  select,
  text,
  type New,
} from './form';
import type { Goal } from '../../core/model';

export function smartSection(letter: string, body: string) {
  return `<fieldset class="smart-block" data-smart="${letter}"><legend><span class="letter">${letter}</span>${t(('smart.' + letter) as TextKey)}</legend>${body}</fieldset>`;
}

export function goalForm(g: New<Goal>) {
  const parent = linksOf(g, 'subgoal')[0] || '';
  const parents: Record<string, string> = { '': t('f.none') };
  db.goals
    .filter(x => x.id !== g.id && !(g.id && reaches(x.id, g.id, 'subgoal')))
    .forEach(x => (parents[x.id] = x.title));
  const st = g.id ? measuringState(g as Goal) : null;
  // The state the picker shows: the one that measures, else the first linked (one that adds up may have no amounts yet).
  const linked = st || (g.id ? db.states.find(s => relsTo(g.id!, 'measures').some(r => r.from === s.id)) : null);
  const states: Record<string, string> = { '': t('f.measuredByNone') };
  db.states.forEach(s => (states[s.id] = s.title));
  return `
    <div class="smart-summary"><span id="smartLive"></span><span id="smartLiveText"></span></div>
    ${smartSection(
      'S',
      `
      ${field('title', t('f.goal'), text('title', g.title, t('f.goalPh')))}
      ${field('specific', t('f.specific'), area('specific', g.specific, t('f.specificPh')))}`,
    )}
    ${smartSection(
      'M',
      `
      ${field('progress', t('f.progress'), select('progress', { measure: t('f.progressMeasure'), activities: t('f.progressActs'), routines: t('f.progressRoutines') }, g.progress || 'measure'))}
      <p class="hint" id="actsHint">${t('f.progressActsHint')}</p>
      <p class="hint" id="routinesHint">${t('f.progressRoutinesHint')}</p>
      <div id="measureFields">
      ${field('measuredBy', t('f.measuredBy'), select('measuredBy', states, linked?.id || ''), esc(t('f.measuredByHint')))}
      <div class="row2">
        ${field('metric', t('f.metric'), text('metric', g.metric, t('f.metricPh')))}
        ${field('unit', t('f.unit'), text('unit', g.unit, t('f.unitPh')))}
      </div>
      ${field('period', t('cu.counts'), select('period', Object.fromEntries(['total', ...PERIODS].map(k => [k, t(('cu.count.' + k) as TextKey)])), goalPeriod(g as Goal)), ' ')}
      <div class="row3">
        ${field(
          'baseline',
          t('f.baseline'),
          num('baseline', g.baseline ?? '', '0'),
          // A running total counts everything before the goal too; starting from it counts only what comes next.
          isCumulative(st) && goalPeriod(g as Goal) === 'total'
            ? esc(t('cu.baselineHint', { total: withUnit(fmtNum(stateTotal(st)), st.unit || '') }))
            : '',
        )}
        ${field('current', t('f.current'), num('current', g.current ?? '', ''), ' ')}
        ${field('target', t('f.target'), num('target', g.target ?? ''))}
      </div>
      </div>`,
    )}
    ${smartSection(
      'A',
      `
      ${field('obstacle', t('f.obstacle'), area('obstacle', g.obstacle, t('f.obstaclePh')))}
      ${field('ifThen', t('f.ifThen'), area('ifThen', g.ifThen, t('f.ifThenPh')))}
      ${g.achievable?.trim() ? field('achievable', t('f.achievable'), area('achievable', g.achievable, t('f.achievablePh'))) : ''}`,
    )}
    ${smartSection('R', field('relevant', t('f.relevant'), area('relevant', g.relevant, t('f.relevantPh'))))}
    ${smartSection(
      'T',
      `<div class="row2">
        ${field('startDate', t('f.startDate'), date('startDate', g.startDate || today()))}
        ${field('deadline', t('f.deadline'), date('deadline', g.deadline))}
      </div>`,
    )}
    <div class="row3">
      ${field(
        'category',
        t('f.category'),
        `<input type="text" id="f-category" name="category" list="categoryList" value="${esc(g.category ?? g.links?.category ?? '')}" placeholder="${esc(t('f.categoryPh'))}">
        <datalist id="categoryList">${categorySuggestions()
          .map(c => `<option value="${esc(c)}">`)
          .join('')}</datalist>`,
      )}
      ${field('status', t('f.status'), select('status', statusLabels(GOAL_STATUS, 'goal.'), g.status || 'active'))}
      ${field('parent', t('f.parent'), select('parent', parents, parent))}
    </div>
    ${linkSection(
      `${checklist('visions', t('f.goalVisions'), 'vision', visions.list, g.id ? ownVisions(g as Goal) : (g.links?.visions as string[] | undefined) || [])}
    ${checklist('activities', t('f.goalActivities'), 'activity', db.activities, linkedFrom(g, 'contributes'))}
    ${checklist(
      'depends',
      t('f.goalDepends'),
      'goal',
      db.goals.filter(x => x.id !== g.id),
      linksOf(g, 'depends'),
    )}`,
      !!g.id,
    )}`;
}

// The metric fields, or the hint for measuring by activities or routines.
export function updateProgressFields() {
  const by = $<HTMLSelectElement>('#f-progress').value;
  $('#measureFields').hidden = by !== 'measure';
  $('#actsHint').hidden = by !== 'activities';
  $('#routinesHint').hidden = by !== 'routines';
}

// A linked state sets the unit and current value (and the metric's name, if it has none); a state that
// adds up also shows how the goal counts it. `fill` is false when the form opens, so the metric name stays.
export function updateMeasuredBy(fill = true) {
  const s = db.states.find(x => x.id === $<HTMLSelectElement>('#f-measuredBy').value);
  const unit = $<HTMLInputElement>('#f-unit'),
    current = $<HTMLInputElement>('#f-current'),
    metric = $<HTMLInputElement>('#f-metric');
  unit.readOnly = current.readOnly = !!s;
  if (s) {
    unit.value = s.unit || '';
    const v = stateValue(s);
    if (isNum(v)) current.value = String(numInput(v));
    if (fill && !metric.value.trim()) metric.value = s.title;
  }
  current.closest('.field')!.querySelector('.hint')!.textContent = s
    ? t('f.currentFrom', { name: s.title })
    : t('f.currentHint');
  const period = $('#f-period').closest<HTMLElement>('.field')!;
  period.hidden = !isCumulative(s);
  period.querySelector('.hint')!.textContent = s ? t('cu.countsHint', { name: s.title }) : '';
}

// The letters, the line above them, and under each unfinished field a quiet hint (not an error:
// the goal saves without it).
export function updateSmartLive() {
  if (formCtx?.kind !== 'goal') return;
  const { v } = formValues();
  const c = smartCheck(v as unknown as Goal);
  modal
    .querySelectorAll<HTMLElement>('.smart-block')
    .forEach(b => b.classList.toggle('ok', !!c[b.dataset.smart as 'S']));
  modal.querySelectorAll<HTMLElement>('.smart-block .field[data-field]').forEach(f => {
    const msg = c.errs[f.dataset.field as SmartField] || '';
    let hint = f.querySelector<HTMLElement>('.smart-hint');
    if (!hint && !msg) return;
    if (!hint) {
      hint = Object.assign(document.createElement('div'), { className: 'hint smart-hint' });
      f.querySelector('.err')!.before(hint);
    }
    hint.textContent = msg;
    hint.hidden = !msg;
  });
  const okCount = 'SMART'.split('').filter(l => c[l as 'S']).length;
  $('#smartLive').innerHTML = smartBadge(v as unknown as Goal);
  $('#smartLiveText').textContent = okCount === 5 ? t('smart.ok') : t('smart.partial', { n: okCount });
}
