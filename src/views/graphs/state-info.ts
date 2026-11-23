/** A current state's card parts on Graphs: +, description, dates and counts, goal tags; a card without data. */
import type { State } from '../../core/model';
import type { Routine } from '../../core/routines/schedule';
import { isRoutine } from '../../core/routines/schedule';
import { entriesOf, isCumulative, stateDate } from '../../core/cumulative';
import { relsFrom, relsTo } from '../../core/relations';
import { fmtRel } from '../../core/dates';
import { esc, linkTag } from '../../ui/dom';
import { t, tp } from '../../i18n/index';

// + asks for a new value, or an amount for a state that adds up.
export function plusButton(item: State | Routine) {
  if (isRoutine(item)) return '';
  const add = esc(t(isCumulative(item) ? 'cu.addTo' : 'sv.title', { name: item.title }));
  return `<button type="button" class="icon-btn cu-add gr-add" data-add-amount="${item.id}" title="${add}" aria-label="${add}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
}

// Title and + (Edit is in the card's menu).
export const cardHead = (item: State | Routine) =>
  `<div class="card-head"><h3>${esc(item.title)}</h3>${plusButton(item)}</div>`;

// Description, when it was last measured, what improves it and how much data it has, and the goals it measures.
export function stateInfo(item: State | Routine) {
  if (isRoutine(item)) return '';
  const s = item;
  const improvers = relsTo(s.id, 'improves').length;
  const n = isCumulative(s) ? entriesOf(s).length : s.history?.length || 0;
  const count = n ? tp(isCumulative(s) ? 'cu.entries' : 'states.measurements', n) : '';
  const when = isCumulative(s)
    ? stateDate(s)
      ? t('cu.lastEntry', { date: fmtRel(stateDate(s)) })
      : t('cu.noEntries')
    : t('states.asOf', { date: fmtRel(s.date) || '—' });
  const goals = relsFrom(s.id, 'measures')
    .map(r => linkTag(r.to))
    .join('');
  return `${s.description ? `<p class="desc">${esc(s.description)}</p>` : ''}
    <div class="meta"><span>${when}</span>${improvers ? `<span>${tp('states.improvers', improvers)}</span>` : ''}${count ? `<span>${count}</span>` : ''}</div>
    ${goals ? `<div class="links">${goals}</div>` : ''}`;
}

// A state with nothing measured yet: its card without a plot.
export const noDataCard = (s: State) =>
  `<article class="card glass gr-card gr-empty" data-gr="${s.id}" data-ctx-item="${s.id}">${cardHead(s)}${stateInfo(s)}</article>`;
