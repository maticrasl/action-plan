/** A current state's card parts on Graphs: +, description, goal tags; a card without data. */
import type { State } from '../../core/model';
import type { Routine } from '../../core/routines/schedule';
import { isRoutine } from '../../core/routines/schedule';
import { isCumulative } from '../../core/cumulative';
import { relsFrom } from '../../core/relations';
import { esc, linkTag, noteTag } from '../../ui/dom';
import { t } from '../../i18n/index';

// + asks for a new value, or an amount for a state that adds up.
export function plusButton(item: State | Routine) {
  if (isRoutine(item)) return '';
  const add = esc(t(isCumulative(item) ? 'cu.addTo' : 'sv.title', { name: item.title }));
  return `<button type="button" class="icon-btn cu-add gr-add" data-add-amount="${item.id}" title="${add}" aria-label="${add}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
}

// Title and + (Edit is in the card's menu).
export const cardHead = (item: State | Routine) =>
  `<div class="card-head"><h3>${esc(item.title)}</h3>${plusButton(item)}</div>`;

// Description and the goals it measures.
export function stateInfo(item: State | Routine) {
  if (isRoutine(item)) return '';
  const s = item;
  const goals = relsFrom(s.id, 'measures')
    .map(r => linkTag(r.to))
    .join('');
  return `${s.description ? `<p class="desc">${esc(s.description)}</p>` : ''}
    ${goals || s.notes?.length ? `<div class="links">${goals}${noteTag(s)}</div>` : ''}`;
}

// A state with nothing measured yet: its card without a plot.
export const noDataCard = (s: State) =>
  `<article class="card glass gr-card gr-empty" data-gr="${s.id}" data-ctx-item="${s.id}">${cardHead(s)}${stateInfo(s)}</article>`;
