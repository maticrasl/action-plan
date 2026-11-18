/** The relationship form: from, to, and the types that fit the two. */
import { KINDS } from '../../core/model';
import { collection, findEntity, possibleTypes, relLabel } from '../../core/relations';
import { $, esc } from '../dom';
import { t } from '../../i18n/index';
import { field, formCtx } from './form';

export function relationForm() {
  const groups = KINDS.map(k => {
    const items = collection(k);
    return items.length ? `<optgroup label="${esc(t('kinds.' + k))}">${items.map(i => `<option value="${i.id}">${esc(i.title)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  return `
    ${field('from', t('f.from'), `<select id="f-from" name="from">${groups}</select>`)}
    ${field('type', t('f.relationship'), '<select id="f-type" name="type"></select>')}
    ${field('to', t('f.to'), `<select id="f-to" name="to">${groups}</select>`)}`;
}

// Only the relationship types that fit the chosen items are offered: those from → to, and under
// a second heading those to → from (picking one of these swaps the two items when saved).
export function fillRelTypes(keep = $('#f-type').value) {
  const from = $('#f-from').value, to = $('#f-to').value;
  const title = id => findEntity(id)?.item.title || '';
  const group = (a, b, types, pre) => types.length
    ? `<optgroup label="${esc(`${title(a)} → ${title(b)}`)}">${types.map(k => `<option value="${pre}${k}">${esc(relLabel(k))}</option>`).join('')}</optgroup>` : '';
  const fwd = possibleTypes(from, to, formCtx.id), rev = possibleTypes(to, from, formCtx.id);
  const box = $('#f-type');
  box.innerHTML = fwd.length || rev.length ? group(from, to, fwd, '') + group(to, from, rev, 'rev:') : `<option value="">${esc(t('rel.nonePossible'))}</option>`;
  if ([...box.options].some(o => o.value === keep)) box.value = keep;
  // Explain an empty list right away rather than on saving.
  const f = box.closest('.field');
  f.classList.toggle('invalid', !box.value);
  f.querySelector('.err').textContent = box.value ? '' : from === to ? t('err.self') : t('rel.noneBetween');
}
