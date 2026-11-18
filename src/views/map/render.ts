/** The map view: glass boxes, lines and their selection, text fitted to the boxes. */
import { GLASS, MAP, glassThickness, layoutMap } from './layout';
import { ui } from '../../store/state';
import { ctxMenu } from '../../ui/menu';
import { modal } from '../../ui/forms/form';
import { render } from '../index';
import { emptyState, esc, hideDoneToggle, itemCount, neighbourhood, statusLegend } from '../../ui/dom';
import { db, visions } from '../../core/state';
import { t, tp } from '../../i18n/index';
import { categoryChips, goalSelect, scopeFor } from '../filters';
import { activityState, blockers, goalProgress, goalState, isComplete } from '../../core/progress';
import {
  contributingIds,
  findVision,
  ownVisions,
  visionAncestors,
  visionParents,
  visionRel,
  visionRelId,
} from '../../core/visions';
import { REL_TYPES, VISION_RELS } from '../../core/model';
import { purposeState, reachedVisions } from '../../store/visions';
import { findEntity, kindList, relLabel, relSignature } from '../../core/relations';
import { fmtRel } from '../../core/dates';
import { isRoutine, periodUnit } from '../../core/routines/schedule';
import { periodProgress, routineStreak } from '../../core/routines/keeping';
import { periodText, streakText } from '../../ui/text';
import { fmtNum, isNum } from '../../core/util';
import { removeEntity, save } from '../../store/plans';
import { toast } from '../../ui/toast';
import { hideVisionsToggle, unlinkVision, visionDefs, visionNode } from './visions';
import type { Activity, Goal, Kind, RelSpec, RelType, State, Vision, VisionRel } from '../../core/model';
import type { TextKey } from '../../i18n/index';
import type { MapLink } from './layout';
import { glassDefs, glassKey, glassTint } from './glass';

// On the map, lines are fine and their colours muted toward grey, so they stay quieter than the glass boxes.
export const mapLineColour = (color: string) => `color-mix(in srgb, ${color} 72%, var(--ink-3))`;

// The soft glow round a selected box, kept outside its face so the see-through glass stays clear, and round a
// selected line. Lines span the map in its own units: a straight line's box has no height for the filter to grow from.
export const lineGlow = (W: number, H: number) =>
  `<filter id="line-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
// An arrowhead, its tip TIP past where its line stops, one size whatever the line's width.
export const arrowMarker = (id: string, color: string, orient = 'auto-start-reverse') =>
  `<marker id="${id}" viewBox="0 0 10 10" refX="${10 - MAP.TIP}" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="${orient}"><path d="M1,1.5 L10,5 L1,8.5 L3,5 z" style="fill:${mapLineColour(color)}"/></marker>`;
export const glowDefs = (W: number, H: number) =>
  `<filter id="node-glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/></feMerge><feComposite in2="SourceGraphic" operator="out"/></filter>` +
  lineGlow(W, H);

// Box text is cut to fit its box, ending in "…": measured on a canvas in the fonts the map's CSS sets,
// with 4 % to spare, as SVG text can come out a little wider than the canvas measures it.
export let fitCtx: CanvasRenderingContext2D;
export function fitText(text: string, font: string, max: number) {
  fitCtx ||= document.createElement('canvas').getContext('2d')!;
  fitCtx.font = font;
  const fits = (s: string) => fitCtx.measureText(s).width * 1.04 <= max;
  if (fits(text)) return text;
  let s = text;
  while (s && !fits(s + '…')) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

// A rounded rectangle from x0, y0 to x1, y1 as a path.
export const roundedRect = (x0: number, y0: number, x1: number, y1: number, r: number) =>
  `M${x0 + r},${y0} H${x1 - r} A${r},${r} 0 0 1 ${x1},${y0 + r} V${y1 - r} A${r},${r} 0 0 1 ${x1 - r},${y1} H${x0 + r} A${r},${r} 0 0 1 ${x0},${y1 - r} V${y0 + r} A${r},${r} 0 0 1 ${x0 + r},${y0} Z`;

export function renderMap() {
  if (!itemCount() && !visions.list.length) return emptyState(t('map.emptyTitle'), t('map.emptyText'), 'goal');

  const scope = scopeFor(ui.mapGoal);
  const keep = (kind: Kind) => (item: Goal | Activity | State) =>
    (!scope || scope[kind].has(item.id)) &&
    !(
      ui.hideDone &&
      (kind === 'goal' ? isComplete('goal', item as Goal) : kind === 'activity' && (item as Activity).status === 'done')
    );
  const items = {
    goal: db.goals.filter(keep('goal')),
    activity: db.activities.filter(keep('activity')),
    state: db.states.filter(keep('state')),
  } as { goal: Goal[]; activity: Activity[]; state: State[]; vision: Vision[] };
  // With a goal or category picked, or unrelated visions hidden, only the visions the goals shown serve, and those above them.
  let near: Set<string> | null = null;
  if (scope || ui.hideVisions) {
    near = new Set();
    items.goal.forEach(g => ownVisions(g).forEach(id => [id, ...visionAncestors(id)].forEach(x => near!.add(x))));
  }
  items.vision = visions.list.filter(v => !near || near.has(v.id));
  const visible = new Set([...items.vision, ...items.goal, ...items.activity, ...items.state].map(x => x.id));
  const rels: MapLink[] = db.relations.filter(
    r => REL_TYPES[r.type] && !ui.mapHidden.has(r.type) && visible.has(r.from) && visible.has(r.to),
  );
  if (!ui.mapHidden.has('serves'))
    items.goal.forEach(g =>
      ownVisions(g).forEach(
        id => visible.has(id) && rels.push({ id: visionRelId(g.id, id), from: g.id, to: id, type: 'serves' }),
      ),
    );
  if (!ui.mapHidden.has('subvision'))
    items.vision.forEach(v =>
      visionParents(v).forEach(
        p => visible.has(p) && rels.push({ id: visionRelId(v.id, p), from: v.id, to: p, type: 'subvision' }),
      ),
    );
  // What works toward a vision glows, and so do the lines between such items.
  const contrib = contributingIds(),
    ps = purposeState(),
    reached = reachedVisions();
  const glows = (r: MapLink) =>
    (contrib.has(r.from) || (visible.has(r.from) && findVision(r.from))) &&
    (contrib.has(r.to) || !!findVision(r.to)) &&
    r.type !== 'depends';
  const { NW, NH, PAD } = MAP;
  const { node, layers, bands, chains, W, H } = layoutMap(items, rels);

  // Either an item or a relationship line can be selected.
  const relSel = rels.find(r => r.id === ui.mapRel) || null;
  const sel = !relSel && ui.mapSelected && visible.has(ui.mapSelected) ? ui.mapSelected : null;
  const nearSel = relSel ? new Set([relSel.from, relSel.to]) : neighbourhood(sel, rels);

  // Each line sits in a group with a wide invisible twin, so it is easy to hit; a click selects it,
  // a second click (or Enter) edits the relationship and Delete removes it.
  const edges = chains
    .map(c => {
      const def: RelSpec = REL_TYPES[c.r.type as RelType] || VISION_RELS[c.r.type as VisionRel];
      const dim = (sel && !(c.r.from === sel || c.r.to === sel)) || (relSel && c.r.id !== relSel.id) ? 'dim' : '';
      const label = relText(c.r);
      return `<g class="edge-g ${dim} ${c.r.id === relSel?.id ? 'sel' : ''}${glows(c.r) ? ' vglow' : ''}" data-rel-edit="${c.r.id}" tabindex="0" role="button" aria-pressed="${c.r.id === relSel?.id}" aria-label="${esc(t('map.relLabel', { rel: label }))}">
      <path class="edge" d="${c.d}" style="stroke:${mapLineColour(def.color)};stroke-width:${def.width || 1.1}" ${def.dash ? 'stroke-dasharray="4 3"' : ''} marker-end="url(#arrow-${c.r.type})"></path>
      <path class="edge-hit" d="${c.d}"></path><title>${esc(label)}</title></g>`;
    })
    .join('');

  // A glow round the box when selected, focused or being linked, and the face's light over its fill, all one
  // rounded path (paths, so the box's rect rules don't reach them). Under the face, its glass slab.
  const { R } = GLASS,
    face = roundedRect(0, 0, NW, NH, R),
    slabs = new Set<string>();
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font'),
    textW = NW - 18;
  const nodes = Object.values(node)
    .map(n => {
      const { item } = findEntity(n.id)!;
      if (n.kind === 'vision')
        return visionNode(n, item as Vision, {
          font,
          textW,
          face,
          sel,
          dim: (sel || relSel) && !nearSel.has(n.id),
          purpose: ps.root?.id === n.id,
          reached: reached.has(n.id),
          y: layers[n.layer].y,
        });
      let st = '',
        sub: string,
        full: string | undefined,
        bar = '',
        pct = '';
      if (n.kind === 'goal') {
        st = goalState(item as Goal);
        sub =
          st === 'blocked'
            ? t('acts.waitsFor', { n: blockers(item as Goal, 'goal').length })
            : (item as Goal).deadline
              ? fmtRel((item as Goal).deadline!, true)
              : t('map.noDeadline');
        // Progress shows as a green bar along the bottom of the box; the number stays in the tooltip.
        const p = goalProgress(item as Goal);
        pct = ` – ${Math.round(p)} %`;
        const y = NH - 8,
          end = 14 + ((NW - 28) * Math.min(p, 100)) / 100;
        bar = `<line class="node-track" x1="14" x2="${NW - 14}" y1="${y}" y2="${y}"></line>${p > 0 ? `<line class="node-progress" x1="14" x2="${end.toFixed(1)}" y1="${y}" y2="${y}"></line>` : ''}`;
      } else if (isRoutine(item)) {
        st = activityState(item);
        const streak = routineStreak(item),
          p = periodProgress(item);
        // Short on the box, in full in its tooltip.
        full = periodText(item, p) + (streak.n ? ', ' + streakText(streak) : '');
        sub =
          (p.target
            ? t(('map.rt.' + periodUnit(item)) as TextKey, { done: p.done, target: p.target })
            : periodText(item, p)) + (streak.n ? ', ' + t('map.rt.streak', { n: streak.n }) : '');
      } else if (n.kind === 'activity') {
        st = activityState(item as Activity);
        sub =
          (st === 'blocked'
            ? t('acts.waitsFor', { n: blockers(item as Activity).length })
            : t(('activity.' + (item as Activity).status) as TextKey)) +
          ((item as Activity).dueDate ? ', ' + fmtRel((item as Activity).dueDate!) : '');
      } else {
        sub = isNum((item as State).value)
          ? `${fmtNum((item as State).value!)} ${(item as State).unit || ''}, ${fmtRel((item as State).date!)}`
          : fmtRel((item as State).date!, true);
      }
      // Sizes and weights as in the CSS for .node text and .node .sub.
      const title = fitText(item.title, `${n.kind === 'goal' ? 500 : 400} 13px ${font}`, textW);
      const subFit = fitText(sub, `400 11.5px ${font}`, textW);
      const dim = (sel || relSel) && !nearSel.has(n.id) ? 'dim' : '';
      const linking = ui.mapLinkFrom === n.id ? ' link-source' : '';
      const slab = `${glassTint(n.kind!, st)}|${glassThickness(n)}`;
      slabs.add(slab);
      return `<g class="node ${n.kind}${st ? ' st-' + st : ''}${linking}${n.id === sel ? ' sel' : ''}${contrib.has(n.id) ? ' vglow' : ''} ${dim}" data-map-node="${n.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc(item.title)}" transform="translate(${n.x - NW / 2},${layers[n.layer].y})">
      <path class="node-lift" d="${face}"></path>
      <use href="#glass-${glassKey(slab)}"></use>
      <rect width="${NW}" height="${NH}" rx="${R}"></rect>
      <path class="glass-shade" d="${face}"></path><path class="glass-spec" d="${face}"></path>
      <text x="12" y="23">${esc(title)}</text>
      <text class="sub" x="12" y="${bar ? 38 : 41}">${esc(subFit)}</text>${bar}
      <title>${esc(item.title)}${pct}${st ? ' – ' + esc(t(('nodeState.' + st) as TextKey)) : ''}\n${esc(full || sub)}</title>
    </g>`;
    })
    .join('');

  // Band labels go over the lines, so a line passing by never cuts through one.
  const bandSvg = bands
    .map(
      b =>
        `<rect class="band ${b.kind}" x="6" y="${b.top}" width="${W - 12}" height="${b.bottom - b.top}" rx="14"></rect>`,
    )
    .join('');
  // The glow round what works toward a vision lies under every line and box, so it never dims a neighbour's text;
  // lines glow as softly and widely as boxes.
  const lineGlows = chains
    .filter(c => glows(c.r))
    .map(c => `<path class="edge-vglow" data-line-glow="${c.r.id}" d="${c.d}"></path>`)
    .join('');
  const halos = Object.values(node)
    .filter(n => contrib.has(n.id))
    .map(
      n =>
        `<path class="node-vglow" data-halo="${n.id}" d="${face}" transform="translate(${n.x - NW / 2},${layers[n.layer].y})"></path>`,
    )
    .join('');
  const bandLabels = bands
    .map(b => {
      const levels = b.last - b.first + 1;
      return `<text class="col-label ${b.kind}" x="${PAD}" y="${b.top + 22}">${esc(t(('kinds.' + b.kind) as TextKey))}${levels > 1 ? ` (${esc(tp('map.levels', levels))})` : ''}</text>`;
    })
    .join('');

  const markers = Object.entries({ ...REL_TYPES, ...VISION_RELS })
    .map(([k, d]) => arrowMarker(`arrow-${k}`, d.color))
    .join('');

  const toggles =
    Object.entries(REL_TYPES as Record<RelType, RelSpec>)
      .map(([k, d]) => {
        const count = db.relations.filter(r => r.type === k).length;
        return `<button class="chip rel-toggle" data-rel-toggle="${k}" aria-pressed="${!ui.mapHidden.has(k as RelType)}" title="${esc(relSignature(k as RelType))}"><i class="${d.dash ? 'dash' : ''}" style="border-color:${mapLineColour(d.color)}"></i>${esc(relLabel(k))}<span class="count">${count}</span></button>`;
      })
      .join('') +
    (visions.list.length
      ? Object.entries(VISION_RELS)
          .map(([k, d]) => {
            const count =
              k === 'serves'
                ? db.goals.reduce((n, g) => n + ownVisions(g).length, 0)
                : visions.list.reduce((n, v) => n + visionParents(v).length, 0);
            return `<button class="chip rel-toggle" data-rel-toggle="${k}" aria-pressed="${!ui.mapHidden.has(k as VisionRel)}" title="${esc(`${kindList(d.from)} → ${kindList(d.to)}`)}"><i style="border-color:${mapLineColour(d.color)}"></i>${esc(relLabel(k))}<span class="count">${count}</span></button>`;
          })
          .join('')
      : '');
  const goalNodes = items.goal.length ? items.goal : Object.values(items).flat();
  const focusX = Math.round((goalNodes.reduce((s, x) => s + node[x.id].x, 0) / goalNodes.length) * ui.mapScale);
  let relNote = '';
  if (!rels.length)
    relNote = db.relations.length
      ? `<div class="empty">${t('map.noneShown')}</div>`
      : emptyState(t('map.relEmptyTitle'), t('map.relEmptyText'), 'relation');
  const zoomBtn = (dir: string, label: string) =>
    `<button type="button" class="icon-btn" data-map-zoom="${dir}" aria-label="${esc(t(('map.zoom.' + dir) as TextKey))}" title="${esc(t(('map.zoom.' + dir) as TextKey))}">${label}</button>`;

  return `
    ${categoryChips()}
    <div class="toolbar">${goalSelect('map', ui.mapGoal)}${hideDoneToggle()}${visions.list.length ? hideVisionsToggle() : ''}</div>
    <div class="map-controls">
      <div class="chips" role="group" aria-label="${esc(t('map.toggles'))}"><span class="ctl-label">${t('map.show')}</span>${toggles}</div>
      <div class="map-legend"><span class="ctl-label">${t('map.status')}</span>${statusLegend()}
        <div class="zoom-ctl" role="group" aria-label="${esc(t('map.zoom'))}">${zoomBtn('out', '−')}${zoomBtn('reset', `<span class="zoom-pct">${Math.round(ui.mapScale * 100)} %</span>`)}${zoomBtn('in', '+')}</div>
      </div>
    </div>
    <div class="map-wrap" data-focus-x="${focusX}"><svg viewBox="0 0 ${W} ${H}" width="${W * ui.mapScale}" height="${H * ui.mapScale}" role="img" aria-label="${esc(t('map.aria'))}">
      <defs>${markers}${glassDefs(slabs)}${glowDefs(W, H)}${visions.list.length ? visionDefs(W, H) : ''}</defs>${bandSvg}${lineGlows ? `<g class="vglow-lines">${lineGlows}</g>` : ''}${halos ? `<g class="vglow-halos">${halos}</g>` : ''}${edges}${bandLabels}${nodes}
    </svg></div>
    ${ui.mapLinkFrom && visible.has(ui.mapLinkFrom) ? mapLinkBar(ui.mapLinkFrom) : ''}
    ${relSel ? mapRelSelection(relSel) : sel ? mapSelection(sel) : `<p class="meta" style="margin-top:10px">${t('map.hint')}</p>`}
    ${relNote}
  `;
}

// Shown while linking by tapping: the next box tapped becomes the other end.
export function mapLinkBar(id: string) {
  return `<div class="link-bar" role="status"><span class="grow">${esc(t('map.linkPick', { name: findEntity(id)!.item.title }))}</span>
    <button type="button" class="btn small ghost" data-map-link-cancel>${t('btn.cancel')}</button></div>`;
}

export function mapSelection(id: string) {
  const { kind, item } = findEntity(id)!;
  return `<div class="row" style="margin-top:12px;cursor:default">
    <span class="tag ${kind}">${t(('kind.' + kind) as TextKey)}</span>
    <span class="grow"><strong>${esc(item.title)}</strong></span>
    <button class="btn small" data-open="${id}">${t('btn.edit')}</button>
    <button class="btn small ghost" data-map-clear>${t('btn.deselect')}</button>
  </div>`;
}

export const relText = (r: MapLink) =>
  `${findEntity(r.from)!.item.title} ${relLabel(r.type)} ${findEntity(r.to)!.item.title}`;

// The selected line, with buttons for touch screens (no Delete key there).
export function mapRelSelection(r: MapLink) {
  return `<div class="row map-rel-selection" style="margin-top:12px;cursor:default">
    <span class="tag">${t('kind.relation')}</span>
    <span class="grow"><strong>${esc(relText(r))}</strong></span>
    <button class="btn small" data-rel-open="${r.id}">${t('btn.edit')}</button>
    <button class="btn small danger" data-rel-remove="${r.id}">${t('btn.remove')}</button>
    <button class="btn small ghost" data-map-clear>${t('btn.deselect')}</button>
  </div>`;
}

export function removeRelation(id: string) {
  const vr = visionRel(id);
  if (vr) return unlinkVision(vr);
  db.relations = db.relations.filter(r => r.id !== id);
  if (ui.mapRel === id) ui.mapRel = null;
  save();
  render();
  toast(t('toast.relRemoved'));
}

// Deleting an item from the map asks first, like the form's Delete button.
export function askDeleteItem(id: string) {
  const ent = findEntity(id);
  if (!ent || !confirm(t('confirm.delete', { name: ent.item.title }))) return;
  removeEntity(ent.kind, id);
  save();
  render();
  toast(t(('toast.deleted.' + ent.kind) as TextKey));
}

export function listenFonts() {
  // The map can be drawn before the web font is in; it is drawn again then, to fit the font's widths.
  document.fonts?.addEventListener('loadingdone', () => {
    if (ui.view === 'map' && ctxMenu.hidden && !modal.open) render();
  });
}
