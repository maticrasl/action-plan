/** Link lists in forms: the chosen items as tags, and a search box over the items to add. */
import { byDeadline, esc } from '../dom';
import { categories } from '../../core/categories';
import { t } from '../../i18n/index';
import { findEntity } from '../../core/relations';
import type { ISODate } from '../../core/model';

// What a link list offers: goals (with their category and deadline), activities, states or visions.
export interface Pickable {
  id: string;
  title: string;
  category?: string;
  deadline?: ISODate;
}

// A link list: the chosen items are shown as removable tags; the search box below them opens
// a list of the other items (goals grouped by category) that typing filters and a click adds.
export function checklist(name: string, label: string, kind: string, items: Pickable[], selected: string[], hint = '') {
  if (!items.length) return '';
  if (kind === 'goal') items = [...items].sort(byDeadline);
  const opt = (i: Pickable) =>
    `<button type="button" class="pick-opt" role="option" data-pick="${i.id}" data-pick-title="${esc(fold(i.title))}" ${selected.includes(i.id) ? 'data-picked' : ''}>${esc(i.title)}</button>`;
  const options =
    kind === 'goal' && items.some(i => i.category)
      ? [...categories(), '']
          .map((c): [string, Pickable[]] => [c, items.filter(i => (i.category || '') === c)])
          .filter(([, list]) => list.length)
          .map(
            ([c, list]) =>
              `<div class="pick-group" role="group" aria-label="${esc(c || t('cat.none'))}"><div class="pick-head" aria-hidden="true">${esc(c || t('cat.none'))}</div>${list.map(opt).join('')}</div>`,
          )
          .join('')
      : items.map(opt).join('');
  const chips = items
    .filter(i => selected.includes(i.id))
    .map(i => pickedTag(name, kind, i))
    .join('');
  return `<div class="field picker" data-picker="${kind}" data-name="${name}"><span class="label">${label}</span>
    <div class="picked">${chips}<span class="hint pick-none">${t('pick.none')}</span></div>
    <input type="search" class="picker-search" placeholder="${esc(t('pick.add'))}" aria-label="${esc(t('pick.search', { name: label }))}" autocomplete="off" role="combobox" aria-expanded="false" aria-haspopup="listbox">
    <div class="pick-list" role="listbox" aria-label="${esc(label)}" hidden>${options}<div class="pick-empty"></div></div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

// A form's relationships in a section that folds: folded for a new item (a simpler form), unless a link is preset.
export function linkSection(inner: string, editing: boolean) {
  if (!inner.trim()) return '';
  const open = editing || inner.includes('data-picked-id') || /<option value="[^"]+" selected/.test(inner);
  return `<details class="link-sec"${open ? ' open' : ''}><summary>${t('f.linksSection')}</summary>${inner}</details>`;
}

// A chosen item: its hidden input carries the link when the form is saved.
export const pickedTag = (name: string, kind: string, item: Pickable) =>
  `<span class="tag ${kind}" data-picked-id="${item.id}"><input type="hidden" name="${name}" value="${item.id}">${esc(item.title)}<button type="button" data-unpick="${item.id}" title="${esc(t('pick.remove', { name: item.title }))}" aria-label="${esc(t('pick.remove', { name: item.title }))}">×</button></span>`;

// Lower case without accents, so "zivljenje" finds "Življenje".
export const fold = (s: unknown) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Shows the items that match the search and are not chosen yet, and empty groups not at all.
export function filterPicker(picker: HTMLElement) {
  const q = fold(picker.querySelector<HTMLInputElement>('.picker-search')!.value.trim());
  const opts = [...picker.querySelectorAll<HTMLElement>('.pick-opt')];
  opts.forEach(o => (o.hidden = o.hasAttribute('data-picked') || (!!q && !o.dataset.pickTitle!.includes(q))));
  picker
    .querySelectorAll<HTMLElement>('.pick-group')
    .forEach(g => (g.hidden = !g.querySelector('.pick-opt:not([hidden])')));
  const empty = picker.querySelector<HTMLElement>('.pick-empty')!;
  empty.hidden = opts.some(o => !o.hidden);
  empty.textContent = opts.every(o => o.hasAttribute('data-picked')) ? t('pick.allChosen') : t('pick.noMatch');
}

export function showPickList(picker: HTMLElement, open: boolean) {
  const list = picker.querySelector<HTMLElement>('.pick-list')!;
  if (open) filterPicker(picker);
  list.hidden = !open;
  picker.querySelector('.picker-search')!.setAttribute('aria-expanded', String(open));
}

export function pickItem(opt: HTMLElement) {
  const picker = opt.closest<HTMLElement>('[data-picker]')!;
  const { item } = findEntity(opt.dataset.pick!)!;
  opt.setAttribute('data-picked', '');
  picker
    .querySelector('.pick-none')!
    .insertAdjacentHTML('beforebegin', pickedTag(picker.dataset.name!, picker.dataset.picker!, item));
  filterPicker(picker);
}

export function unpickItem(picker: HTMLElement, id: string) {
  picker.querySelector(`[data-picked-id="${id}"]`)!.remove();
  picker.querySelector(`.pick-opt[data-pick="${id}"]`)!.removeAttribute('data-picked');
  filterPicker(picker);
}
