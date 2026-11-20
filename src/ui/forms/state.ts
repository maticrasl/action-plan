/** The current state form: measured or adding up, with its measurements or amounts. */
import { relsFrom } from '../../core/relations';
import { fmtNum, isNum } from '../../core/util';
import { entriesOf, isCumulative } from '../../core/cumulative';
import { t } from '../../i18n/index';
import { totalText, withUnit } from '../text';
import { fmtDate, fmtRel, today } from '../../core/dates';
import { $, esc } from '../dom';
import { checklist, linkSection } from './picker';
import { db } from '../../core/state';
import { area, date, field, formCtx, linksOf, num, select, text, type New } from './form';
import type { Entry, State } from '../../core/model';

export function stateForm(s: New<State>) {
  const linked = s.id ? relsFrom(s.id, 'measures').map(r => r.to) : linksOf(s, 'measures');
  const history = (s.history || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  // The value field records a new measurement, so it starts empty and dated today.
  const latest =
    isNum(s.value) && !isCumulative(s as State)
      ? t('f.valueHint', { value: withUnit(fmtNum(s.value!), s.unit || ''), date: fmtRel(s.date) || '—' })
      : '';
  const addsUp = { '': t('cu.opt.no'), yes: t('cu.opt.yes') };
  return `
    ${field('title', t('f.title'), text('title', s.title, t('f.statePh')))}
    ${field('description', t('f.stateDesc'), area('description', s.description, t('f.stateDescPh')))}
    <div class="row2">
      ${field('addsUp', t('cu.addsUp'), select('addsUp', addsUp, isCumulative(s as State) ? 'yes' : ''), `<span id="addsUpHint"></span>`)}
      ${field('unit', t('f.unit'), text('unit', s.unit, t('f.unitPh')))}
    </div>
    <div class="row2">
      ${field('value', t('f.value'), num('value', '', t('f.optional')), `<span id="valueHint" data-plain="${esc(latest)}"></span>`)}
      ${field('date', t('f.asOf'), date('date', today()))}
    </div>
    ${linkSection(checklist('goals', t('f.describesGoals'), 'goal', db.goals, linked, t('f.describesHint')), !!s.id)}
    ${history.length > 1 ? `<div class="field" id="historyList"><span class="label">${t('f.history')}</span><div class="history">${history.map(h => `<div><span>${fmtRel(h.date, true)}</span><strong>${fmtNum(h.value)} ${esc(s.unit || '')}</strong></div>`).join('')}</div></div>` : ''}
    ${isCumulative(s as State) && entriesOf(s as State).length ? entryList(s as State) : ''}
    ${s.id ? `<div class="field csv-links"><button type="button" class="btn small ghost" data-csv-import="${esc(s.id)}">${esc(t('csv.import'))}</button><button type="button" class="btn small ghost" data-csv-export="${esc(s.id)}">${esc(t('csv.export'))}</button></div>` : ''}`;
}

// A cumulative state's entries, newest day first; × marks one to delete when the form is saved.
export function entryList(s: State) {
  const days: Record<string, Entry[]> = {};
  entriesOf(s).forEach(e => (days[e.date] ||= []).push(e));
  const rows = Object.keys(days)
    .sort()
    .reverse()
    .map(
      d =>
        `<div class="entry-day"><span>${fmtRel(d, true)}</span><span class="entry-amounts">${days[d]
          .map(e => {
            const del = esc(t('cu.deleteEntry', { value: withUnit(fmtNum(e.amount), s.unit || ''), date: fmtDate(d) }));
            return `<span class="entry" data-entry="${e.id}"><strong>${esc(withUnit(fmtNum(e.amount), s.unit || ''))}</strong><button type="button" class="entry-del" data-drop-entry="${e.id}" aria-pressed="false" title="${del}" aria-label="${del}">×</button></span>`;
          })
          .join('')}</span></div>`,
    )
    .join('');
  return `<div class="field" id="entryList"><span class="label">${t('cu.entryList')}</span><div class="history entries">${rows}</div><div class="hint">${t('cu.entryListHint')}</div></div>`;
}

// The labels and hints that follow "Adds up": a new amount or a new measurement, and what switching
// between the two does to what is there.
export function updateStateFields() {
  const sel = $<HTMLSelectElement>('#f-addsUp');
  if (!sel || formCtx?.kind !== 'state') return;
  const s = formCtx.id ? db.states.find(x => x.id === formCtx!.id) : null;
  const addsUp = sel.value,
    was = isCumulative(s) ? 'yes' : '';
  const unit = $<HTMLInputElement>('#f-unit').value.trim();
  $('[data-field="value"] label').textContent = t(addsUp ? 'cu.addAmount' : 'f.value');
  const hint = $('#valueHint');
  hint.textContent = !addsUp
    ? hint.dataset.plain!
    : s && isCumulative(s) && entriesOf(s).length
      ? t('cu.valueHint', { total: totalText({ ...s, unit }) })
      : t('cu.valueHintNew');
  const has = s && (isCumulative(s) ? entriesOf(s).length : (s.history || []).length);
  $('#addsUpHint').textContent = !has || !addsUp === !was ? '' : t(addsUp ? 'cu.toCumulative' : 'cu.toPlain');
  $('#historyList')?.toggleAttribute('hidden', !!addsUp);
  $('#entryList')?.toggleAttribute('hidden', !addsUp);
}
