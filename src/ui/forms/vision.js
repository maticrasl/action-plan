/** The vision form: its title, the visions above it and the goals that serve it. */
import { db, visions } from '../../core/state';
import { ownVisions, visionAncestors } from '../../core/visions';
import { t } from '../../i18n/index';
import { checklist } from './picker';
import { area, field, text } from './form';

export function visionForm(v) {
  const parents = v.id ? v.parents : v.links?.parents || [];
  // Not itself, nor any vision below it: that would make a loop.
  const options = visions.list.filter(x => x.id !== v.id && !(v.id && visionAncestors(x.id).has(v.id)));
  const goals = v.id ? db.goals.filter(g => ownVisions(g).includes(v.id)).map(g => g.id) : v.links?.goals || [];
  return `
    ${field('title', t('f.vision'), text('title', v.title, t('f.visionPh')))}
    ${field('description', t('f.visionDesc'), area('description', v.description, t('f.visionDescPh')))}
    ${checklist('parents', t('f.visionParents'), 'vision', options, parents, t('f.visionParentsHint'))}
    ${checklist('goals', t('f.visionGoals'), 'goal', db.goals, goals)}`;
}
