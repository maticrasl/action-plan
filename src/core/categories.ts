/** Goal categories: those in use, in the order of the language, and suggestions for new ones. */
import { db } from './state';
import { locale, t } from '../i18n/index';

export const categories = () =>
  [...new Set(db.goals.map(g => g.category).filter((c): c is string => !!c))].sort((a, b) =>
    a.localeCompare(b, locale()),
  );
export const categorySuggestions = () => [
  ...new Set([
    ...categories(),
    ...t('cat.suggestions')
      .split(',')
      .map(s => s.trim()),
  ]),
];
