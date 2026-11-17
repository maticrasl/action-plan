/** Ready-made plan templates: the list by area, and turning one into a plan. */
import { lang, t } from '../../i18n/index';
import { uid } from '../util';
import { addDays } from '../routines/schedule';
import { today } from '../dates';
import { emptyDb } from '../model';
import { TPL_LANGS } from '../../legacy/templates.js';

// A template's text in the active language: a pair [English, Slovene], or a plain string such as 'km'.
export const tplText = v => (Array.isArray(v) ? v[TPL_LANGS.indexOf(lang)] ?? v[0] : v);

// Plan data from a template: dates counted from today, nothing done yet, no measurements.
export function templateData(tpl) {
  const ids = {};
  const id = k => (ids[k] ??= uid());
  const day = n => addDays(today(), n);
  const texts = (x, fields) => Object.fromEntries(fields.filter(f => x[f] !== undefined).map(f => [f, tplText(x[f])]));
  const category = t('tpl.area.' + tpl.area);
  const data = emptyDb();
  const rel = (from, type, to) => data.relations.push({ id: uid(), from: id(from), to: id(to), type });
  for (const g of tpl.goals) {
    const measure = g.progress ? { progress: g.progress } : { baseline: String(g.baseline), current: '', target: String(g.target) };
    data.goals.push({ id: id(g.k), category, ...texts(g, ['title', 'specific', 'metric', 'unit', 'achievable', 'relevant']),
      ...measure, ...(g.period && { period: g.period }), startDate: day(g.start || 0), deadline: day(g.end), status: 'active' });
    if (g.sub) rel(g.k, 'subgoal', g.sub);
    (g.deps || []).forEach(x => rel(g.k, 'depends', x));
  }
  for (const s of tpl.states) {
    data.states.push({ id: id(s.k), ...texts(s, ['title', 'description', 'unit']), value: '', date: '', history: [], ...(s.cumulative && { cumulative: true, scale: s.scale || 'total', entries: [] }) });
    (s.measures || []).forEach(x => rel(s.k, 'measures', x));
  }
  for (const a of tpl.activities) {
    data.activities.push({ id: id(a.k), ...texts(a, ['title', 'description']), status: 'todo', startDate: day(a.start),
      ...(a.end !== undefined && { dueDate: day(a.end) }), ...(a.repeat && { repeat: { ...a.repeat } }),
      ...(a.list && { list: a.list.map(x => ({ id: uid(), text: tplText(x), done: false })) }) });
    if (a.parent) rel(a.k, 'subactivity', a.parent);
    (a.goals || []).forEach(x => rel(a.k, 'contributes', x));
    (a.improves || []).forEach(x => rel(a.k, 'improves', x));
    (a.deps || []).forEach(x => rel(a.k, 'depends', x));
  }
  return data;
}
