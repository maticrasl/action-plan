/** Line of sight on screen (feature 05): the vision tag on rows and goal cards, and the vision in a tick's toast. */
import { db } from '../core/state';
import { shownVision, stepVisions } from '../core/line-of-sight';
import { t } from '../i18n/index';
import { esc } from './dom';
import type { Activity, Vision } from '../core/model';

// A vision as a small tag; tapping it shows the vision's card in the Visions view.
export const visionTag = (v: Vision, more = 0) =>
  `<button type="button" class="tag vision los" data-show-vision="${esc(v.id)}" title="${esc(v.title)}"><span class="los-t">◇ ${esc(v.title)}</span>${more ? ` +${more}` : ''}</button>`;

// The found Purpose's id while Today or the Overview draws its rows (set once per draw), else null.
export let rowPurpose: string | null = null;
export function setRowPurpose(id: string | null) {
  rowPurpose = id;
}

// The tag a step's row ends with: its vision, unless that is only the Purpose; nothing without one.
export function stepTag(a: Activity, purposeId = rowPurpose) {
  const s = shownVision(stepVisions(db, a.id), purposeId);
  return s ? visionTag(s.vision, s.more) : '';
}

// "Done · for …" after a tick of a step that serves a vision; '' when it serves none. Cut to stay one line.
export function visionToast(a: Activity) {
  const s = shownVision(stepVisions(db, a.id));
  if (!s) return '';
  const title = s.vision.title.length > 30 ? `${s.vision.title.slice(0, 29).trimEnd()}…` : s.vision.title;
  return t('los.done', { vision: title });
}
