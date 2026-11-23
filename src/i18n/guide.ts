/** The Guide's articles: their shape, the groups, the actions they offer, and the articles of each language. */
import { guideEn } from './guide.en';
import { guideSl } from './guide.sl';

// The groups, in the order the page shows them.
export const GUIDE_GROUPS = ['start', 'stuck', 'how', 'data', 'limits'] as const;
export type GuideGroup = (typeof GUIDE_GROUPS)[number];

// What an article's button does: open a form, a dialog, Settings at a section, or a view.
export const GUIDE_ACTIONS = [
  'add-goal',
  'add-activity',
  'add-routine',
  'add-state',
  'add-vision',
  'templates',
  'export',
  'install',
  'settings',
  'settings-sync',
  'view-dashboard',
  'view-goals',
  'view-activities',
  'view-map',
  'view-timeline',
  'replan',
  'view-graphs',
  'view-today',
  'view-review',
  'pick-focus',
  'ask-tip',
] as const;
export type GuideAction = (typeof GUIDE_ACTIONS)[number];

// Facts a body can depend on: an element with data-only="<fact>" shows only while that fact holds.
export const GUIDE_FACTS = ['syncSetUp', 'noSync', 'multiUser', 'localOnly'] as const;
export type GuideFact = (typeof GUIDE_FACTS)[number];

/* An article. `body` is fixed HTML written by us, never user input, in a small subset:
   <p> <ul> <ol> <li> <strong> <em>, `data-only` on <p> and <ul>, and [[id]] for a link to another
   article (drawn with that article's title). `review` is the weekly review's checklist: each line
   with a link to the place it is about. */
export interface Article<Id extends string = string> {
  id: Id;
  group: GuideGroup;
  title: string;
  body: string;
  action?: { do: GuideAction; label: string };
  related?: readonly Id[];
  review?: readonly { text: string; go: GuideAction; label: string }[];
}

export type ArticleId = (typeof guideEn)[number]['id'];

export const GUIDE: Record<'en' | 'sl', readonly Article<ArticleId>[]> = { en: guideEn, sl: guideSl };

// The "How do I…" article behind each view's help banner.
export const VIEW_ARTICLE: Record<string, ArticleId> = {
  dashboard: 'h-overview',
  goals: 'h-goals',
  activities: 'h-activities',
  visions: 'h-visions',
  map: 'h-map',
  timeline: 'h-timeline',
  graphs: 'h-graphs',
  review: 'h-review',
};
