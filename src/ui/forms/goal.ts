/** The goal form: its SMART sections, how progress is measured, and the live SMART check. */
import { t, type TextKey } from '../../i18n/index';
import { db, visions } from '../../core/state';
import { reaches, relsTo } from '../../core/relations';
import { measuringState, smartCheck } from '../../core/progress';
import { PERIODS, goalPeriod, isCumulative, stateTotal } from '../../core/cumulative';
import { $, esc, smartBadge } from '../dom';
import { statusLabels, withUnit } from '../text';
import { fmtNum } from '../../core/util';
import { today } from '../../core/dates';
import { categorySuggestions } from '../../core/categories';
import { GOAL_STATUS } from '../../core/model';
import { checklist } from './picker';
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
  // A state that adds up but has no amounts yet does not measure anything, but the goal can already
  // pick how it will count it.
  const cu = isCumulative(st)
    ? st
    : !st && g.id
      ? relsTo(g.id, 'measures')
          .map(r => db.states.find(s => s.id === r.from))
          .find(isCumulative)
      : null;
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
      <div class="row2">
        ${field('metric', t('f.metric'), text('metric', g.metric, t('f.metricPh')))}
        ${field('unit', t('f.unit'), text('unit', g.unit, t('f.unitPh')))}
      </div>
      ${cu ? field('period', t('cu.counts'), select('period', Object.fromEntries(['total', ...PERIODS].map(k => [k, t(('cu.count.' + k) as TextKey)])), goalPeriod(g as Goal)), esc(t('cu.countsHint', { name: cu.title }))) : ''}
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
        ${field('current', t('f.current'), num('current', g.current ?? '', ''), st ? esc(t('f.currentFrom', { name: st.title })) : t('f.currentHint'))}
        ${field('target', t('f.target'), num('target', g.target ?? ''))}
      </div>
      </div>`,
    )}
    ${smartSection('A', field('achievable', t('f.achievable'), area('achievable', g.achievable, t('f.achievablePh'))))}
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
    ${checklist('visions', t('f.goalVisions'), 'vision', visions.list, g.id ? ownVisions(g as Goal) : (g.links?.visions as string[] | undefined) || [])}
    ${checklist('activities', t('f.goalActivities'), 'activity', db.activities, linkedFrom(g, 'contributes'))}
    ${checklist(
      'depends',
      t('f.goalDepends'),
      'goal',
      db.goals.filter(x => x.id !== g.id),
      linksOf(g, 'depends'),
    )}`;
}

// The metric fields, or the hint for measuring by activities or routines.
export function updateProgressFields() {
  const by = $<HTMLSelectElement>('#f-progress').value;
  $('#measureFields').hidden = by !== 'measure';
  $('#actsHint').hidden = by !== 'activities';
  $('#routinesHint').hidden = by !== 'routines';
}

export function updateSmartLive() {
  if (formCtx?.kind !== 'goal') return;
  const { v } = formValues();
  const c = smartCheck(v as unknown as Goal);
  modal
    .querySelectorAll<HTMLElement>('.smart-block')
    .forEach(b => b.classList.toggle('ok', !!c[b.dataset.smart as 'S']));
  const okCount = 'SMART'.split('').filter(l => c[l as 'S']).length;
  $('#smartLive').innerHTML = smartBadge(v as unknown as Goal);
  $('#smartLiveText').textContent = okCount === 5 ? t('smart.ok') : t('smart.partial', { n: okCount });
}
