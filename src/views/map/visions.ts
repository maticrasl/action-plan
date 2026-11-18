/** Visions on the map: linking goals and visions, the vision cloud, the glow and the Purpose. */
import { findEntity } from '../../core/relations';
import { canParent, contributingIds, findVision, ownVisions, setGoalVisions } from '../../core/visions';
import { toast } from '../../ui/toast';
import { t, tp } from '../../i18n/index';
import { goalsReaching, purposeState, saveVisions } from '../../store/visions';
import { save } from '../../store/plans';
import { requestRender as render } from '../../ui/render';
import { db, visions } from '../../core/state';
import { ui } from '../../store/state';
import { GLASS, MAP } from './layout';
import { $, esc, fitText, viewEl } from '../../ui/dom';
import { today } from '../../core/dates';
import type { Goal, Vision } from '../../core/model';
import type { TextKey } from '../../i18n/index';
import type { MapLink, MapNode } from './layout';

/* ---------- Visions on the map ----------
   Links to visions are not stored relationships: a goal keeps the visions it serves, a vision its
   parents. On the map they are drawn as lines with ids of their own, vl~<from>~<to>. */

// Why two boxes can't be linked through a vision (an i18n key), or null. Two visions: the first serves the second.
export function visionLinkError(a: string, b: string): TextKey | null {
  const A = findEntity(a),
    B = findEntity(b);
  if (!A || !B) return 'err.unknown';
  if (A.kind === 'vision' && B.kind === 'vision') return canParent(a, b);
  const goal = A.kind === 'goal' ? A.item : B.kind === 'goal' ? B.item : null;
  if (!goal) return 'err.visionGoalOnly';
  return ownVisions(goal).includes(A.kind === 'vision' ? a : b) ? 'err.relExists' : null;
}

export function linkVision(a: string, b: string) {
  const err = visionLinkError(a, b);
  if (err) return toast(t(err));
  const A = findEntity(a)!.item,
    B = findEntity(b)!.item;
  if (findVision(a) && findVision(b)) {
    (A as Vision).parents.push(b);
    saveVisions();
  } else {
    const [goal, vis] = findVision(b) ? [A, B] : [B, A];
    setGoalVisions(goal as Goal, [...ownVisions(goal as Goal), vis.id]);
    save();
  }
  render();
  const [x, y] = findVision(a) && !findVision(b) ? [B, A] : [A, B];
  toast(t('map.visionLinked', { a: x.title, b: y.title }));
}

export function unlinkVision(r: MapLink) {
  if (r.type === 'subvision') {
    const v = findVision(r.from)!;
    v.parents = v.parents.filter(p => p !== r.to);
    saveVisions();
  } else {
    const g = db.goals.find(x => x.id === r.from)!;
    setGoalVisions(
      g,
      ownVisions(g).filter(x => x !== r.to),
    );
    save();
  }
  if (ui.mapRel === r.id) ui.mapRel = null;
  render();
  toast(t('map.visionUnlinked'));
}

export const hideVisionsToggle = () =>
  `<button class="chip" data-hide-visions aria-pressed="${ui.hideVisions}">${t('map.hideVisions')}</button>`;

// A vision is not glass but a cloud: the box's shape in silver with soft, blurred edges (gold for the Purpose,
// brighter once some goal serves it). Its line under the title counts the goals serving it, directly or through
// narrower visions, in all plans.
// dim: whether something else is selected (the box then fades).
export interface VisionNodeOpts {
  font: string;
  textW: number;
  face: string;
  sel: string | null;
  dim: unknown;
  purpose: boolean;
  reached: boolean;
  y: number;
}
export function visionNode(
  n: MapNode,
  v: Vision,
  { font, textW, face, sel, dim, purpose, reached, y }: VisionNodeOpts,
) {
  const { NW, NH } = MAP,
    count = goalsReaching(v.id);
  const goals = count ? tp('vis.goals', count) : t('vis.noGoalsShort');
  const sub = purpose ? `${t('vis.purpose')} · ${goals}` : goals;
  const title = fitText(v.title, `500 13px ${font}`, textW),
    subFit = fitText(sub, `400 11.5px ${font}`, textW);
  return `<g class="node vision${reached ? ' reached' : ''}${purpose ? ' purpose' : ''}${ui.mapLinkFrom === v.id ? ' link-source' : ''}${v.id === sel ? ' sel' : ''}${dim ? ' dim' : ''}" data-map-node="${v.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc(v.title)}" transform="translate(${n.x - NW / 2},${y})">
      <path class="node-lift" d="${face}"></path>
      <rect class="cloud-haze" width="${NW}" height="${NH}" rx="${GLASS.R}" filter="url(#vision-haze)"></rect>
      <rect class="cloud" width="${NW}" height="${NH}" rx="${GLASS.R}" filter="url(#vision-cloud)"></rect>
      <rect class="cloud-sheen" width="${NW}" height="${NH}" rx="${GLASS.R}" filter="url(#vision-cloud)"></rect>
      <text x="12" y="23">${esc(title)}</text>
      <text class="sub" x="12" y="41">${esc(subFit)}</text>
      <title>${esc(v.title)}${v.description ? '\n' + esc(v.description) : ''}\n${esc(sub)}</title>
    </g>`;
}

// The cloud's soft edge and haze, and the faint wide glow round whatever works toward a vision
// (wider and fainter than the glow round a selected box).
export const visionDefs = (W: number, H: number) =>
  `<linearGradient id="vision-sheen" x1="0" y1="0" x2=".35" y2="1"><stop class="vision-sheen-top" offset="0"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
  `<filter id="vision-cloud" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>` +
  `<filter id="vision-haze" x="-40%" y="-110%" width="180%" height="320%"><feGaussianBlur stdDeviation="9"/></filter>` +
  `<filter id="vision-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="12" result="b"/><feComposite in="b" in2="SourceGraphic" operator="out"/></filter>` +
  `<filter id="vision-line-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="8"/></filter>`;

// Whether the tour is on, set from main.ts (the tutorial sits above the views): it holds back the congratulations.
export let tourRunning = () => false;
export function setTourRunning(v: () => boolean) {
  tourRunning = v;
}
// Items working toward a vision glow in every view. With a Purpose everything turns gold, the logo
// at the top left too, and the first time it is found the user is congratulated (once, on any device).
export function markVisions() {
  const ps = purposeState(),
    contrib = contributingIds();
  document.documentElement.classList.toggle('purpose', ps.on);
  viewEl
    .querySelectorAll<HTMLElement>('.glass[data-ctx-item], .tl-row[data-tl-node]')
    .forEach(el => el.classList.toggle('vglow', contrib.has((el.dataset.ctxItem || el.dataset.tlNode)!)));
  if (!ps.on || visions.purposeFound || tourRunning()) return;
  visions.purposeFound = today();
  saveVisions();
  $('#purposeText').textContent = t('purpose.text', { name: ps.root!.title });
  if (!$<HTMLDialogElement>('#purposeDlg').open) $<HTMLDialogElement>('#purposeDlg').showModal();
}
