/** The current states view: the state cards (ui/state-value.ts asks for a new value or amount). */
import { db } from '../core/state';
import { emptyState, esc, linkTag, matchesSearch } from '../ui/dom';
import { t, tp } from '../i18n/index';
import { entriesOf, isCumulative, stateDate, stateScale } from '../core/cumulative';
import { searchBox } from './filters';
import { relsFrom, relsTo } from '../core/relations';
import { scaleText, totalText } from '../ui/text';
import { fmtNum, isNum } from '../core/util';
import { fmtRel } from '../core/dates';

export function renderStates() {
  if (!db.states.length) return emptyState(t('states.emptyTitle'), t('states.emptyText'), 'state');
  const list = db.states.filter(matchesSearch).sort((a, b) => (stateDate(b) || '').localeCompare(stateDate(a) || ''));
  return `<div class="toolbar">${searchBox()}</div>
    <div class="grid">${list
      .map(s => {
        const goals = relsFrom(s.id, 'measures')
          .map(r => linkTag(r.to))
          .join('');
        const improvers = relsTo(s.id, 'improves').length;
        const add = esc(t('cu.addTo', { name: s.title }));
        // A state that adds up shows its total and takes a new amount right here.
        const head = isCumulative(s)
          ? `<span class="cu-head">${stateScale(s) !== 'total' ? `<span class="tag cu-now">${esc(scaleText(s, stateScale(s)))}</span>` : ''}<span class="tag state cu-total">${esc(totalText(s))}</span><button type="button" class="icon-btn cu-add" data-add-amount="${s.id}" title="${add}" aria-label="${add}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></span>`
          : isNum(s.value)
            ? `<span class="tag state">${fmtNum(s.value)}${s.unit ? ' ' + esc(s.unit) : ''}</span>`
            : '';
        const count = isCumulative(s)
          ? entriesOf(s).length
            ? tp('cu.entries', entriesOf(s).length)
            : ''
          : (s.history?.length || 0) > 1
            ? tp('states.measurements', s.history.length)
            : '';
        const when = isCumulative(s)
          ? stateDate(s)
            ? t('cu.lastEntry', { date: fmtRel(stateDate(s)) })
            : t('cu.noEntries')
          : t('states.asOf', { date: fmtRel(s.date) || '—' });
        return `<article class="card glass state" data-open="${s.id}" data-ctx-item="${s.id}">
        <div class="card-head"><h3>${esc(s.title)}</h3>${head}</div>
        ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ''}
        <div class="meta"><span>${when}</span>${improvers ? `<span>${tp('states.improvers', improvers)}</span>` : ''}${count ? `<span>${count}</span>` : ''}</div>
        ${goals ? `<div class="links">${goals}</div>` : ''}
      </article>`;
      })
      .join('')}</div>`;
}
