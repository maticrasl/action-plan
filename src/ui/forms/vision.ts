/** The vision form: its title, the visions above it and the goals that serve it. */
import { db, visions } from '../../core/state';
import { ownVisions, visionAncestors } from '../../core/visions';
import { t } from '../../i18n/index';
import { checklist, linkSection } from './picker';
import type { Vision } from '../../core/model';
import type { New } from './form';
import { area, field, text } from './form';
import { areaSuggestions } from '../../core/categories';
import { esc } from '../dom';

export function visionForm(v: New<Vision>) {
  const parents = v.id ? v.parents! : (v.links?.parents as string[] | undefined) || [];
  // Not itself, nor any vision below it: that would make a loop.
  const options = visions.list.filter(x => x.id !== v.id && !(v.id && visionAncestors(x.id).has(v.id)));
  const goals = v.id
    ? db.goals.filter(g => ownVisions(g).includes(v.id!)).map(g => g.id)
    : (v.links?.goals as string[] | undefined) || [];
  return `
    ${field('title', t('f.vision'), text('title', v.title, t('f.visionPh')))}
    ${field(
      'area',
      t('f.visionArea'),
      `<input type="text" id="f-area" name="area" list="areaList" maxlength="80" value="${esc(v.area ?? v.links?.area ?? '')}" placeholder="${esc(t('f.visionAreaPh'))}">
      <datalist id="areaList">${areaSuggestions()
        .map(c => `<option value="${esc(c)}">`)
        .join('')}</datalist>`,
    )}
    ${field('description', t('f.visionDesc'), area('description', v.description, t('f.visionDescPh')))}
    ${field('avoid', t('f.visionAvoid'), area('avoid', v.avoid, t('f.visionAvoidPh'), 2000))}
    ${linkSection(
      `${checklist('parents', t('f.visionParents'), 'vision', options, parents, t('f.visionParentsHint'))}
      ${checklist('goals', t('f.visionGoals'), 'goal', db.goals, goals)}`,
      !!v.id,
    )}`;
}
