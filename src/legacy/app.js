/** The app: data model, storage, views, forms and event wiring. */
import { locale, t, tp } from '../i18n/index';
import { clamp, fmtNum, isNum } from '../core/util';
import { fmtDate, fmtDay, fmtRel, fmtSpan, today } from '../core/dates';
import { ACTIVITY_STATUS, REL_TYPES, VISION_RELS, emptyDb } from '../core/model';
import { db, setDb, visions } from '../core/state';
import { canParent, contributingIds, findVision, ownVisions, setGoalVisions, visionAncestors, visionParents, visionRel, visionRelId } from '../core/visions';
import { ancestors, findEntity, kindList, possibleTypes, relLabel, relSignature, relsFrom, relsTo } from '../core/relations';
import { addDays, isDueDay, isFlexible, isRoutine, lastOccurrence, periodOf, periodUnit, routineStart, runsOn } from '../core/routines/schedule';
import { checkedOn } from '../core/routines/checkins';
import { DAY_MS, dayNum, dayStr } from '../core/days';
import { SCALES, calPeriod, deleteEntry, deleteMeasurement, entriesOf, goalPeriod, graphEntries, graphScale, isCumulative, periodTotals, sumOf } from '../core/cumulative';
import { keptDay, periodProgress, routineStreak } from '../core/routines/keeping';
import { activityState, blockers, byActivities, goalActivities, goalProgress, goalScope, goalState, isComplete, ownMetric } from '../core/progress';
import { saveUsers, userStorage, users } from '../store/users';
import { STORAGE_KEY, prefs } from '../store/prefs';
import { freshUi, plans, setPlans, ui } from '../store/state';
import { PLANS_KEY, load, removeEntity, save } from '../store/plans';
import { goalsReaching, purposeState, reachedVisions, saveVisions, setOtherPlansCache } from '../store/visions';
import { drive } from '../sync/drive';
import { syncState } from '../sync/sync';
import { renderSync } from '../ui/sync-ui';
import { $, byDeadline, emptyState, esc, hideDoneToggle, itemCount, linkTag, matchesSearch, neighbourhood, statusLegend, viewEl } from '../ui/dom';
import { categories } from '../core/categories';
import { periodText, scaleText, streakText, totalText, withUnit } from '../ui/text';
import { closeCtxMenu, ctxMenu, showCtxMenu, toggleCtxSub } from '../ui/menu';
import { applyNavCollapsed, setView } from '../ui/nav';
import { closeAmountPop } from '../ui/amount-popover';
import { reachedQueue } from '../ui/reached';
import { hideToast, toast } from '../ui/toast';
import { modal, openForm } from '../ui/forms/form';
import { THEMES, applyTheme, renderSettings, setTheme, settings } from '../ui/settings';
import { renderPlanSwitch, storedHealth } from '../ui/plan-switcher';
import { endTour, isTourRunning } from '../tutorial/tour';
import { GOAL_FILTERS, categoryChips, goalSelect, inCategory, scopeFor, searchBox } from '../views/filters';
import { fmtRange, toggleCheckin } from '../views/routines';
import { openStateValue } from '../views/states';
import { VIEWS, render } from '../views/index';

/* ---------- Relations ---------- */

/* =========================================================
   Views
   ========================================================= */

/* ---------- Goal categories & shared filters ---------- */

/* ---------- Relationship map ---------- */

/* ---------- Map layout: layered graph drawing (Sugiyama method) ----------
   1. Layering   – goals, activities and current states each get their own band, top to bottom.
                   Inside a band, children sit below their parent and prerequisites below whatever
                   depends on them (longest-path layering), so chains read bottom-up toward the goal.
   2. Dummies    – an edge spanning several layers gets a virtual node in each layer it crosses,
                   so it is routed through the gaps between boxes instead of across them.
   3. Ordering   – from a start with linked boxes together, alternating barycenter sweeps plus adjacent
                   swaps minimise edge crossings, those of lines to visions first.
   4. Placement  – every box is pulled toward the median of its neighbours while keeping the order
                   and spacing (weighted isotonic regression), which keeps edges short and straight. */
// On the map, lines are fine and their colours muted toward grey, so they stay quieter than the glass boxes.
export const mapLineColour = color => `color-mix(in srgb, ${color} 72%, var(--ink-3))`;
// LEAD: the straight stretch each line ends with, a little longer than its arrowhead (10). TIP: how far short
// of where it points a line stops; its arrowhead covers the rest, so even a thick line ends inside the head's wide back.
export const MAP = { NW: 172, NH: 56, HG: 18, DG: 8, DW: 10, VG: 62, PAD: 20, HEAD: 34, BAND_GAP: 12, LEAD: 14, TIP: 8, MIN_SCALE: 0.25, MAX_SCALE: 3, VISION_LINE: 6 };

// Map boxes are slabs of milk glass, lit by a broad light (a panel, like a window) to the left of and a little
// above the map. Their side, along the bottom and the right and round the corners, is cut into slivers, each
// shaded by the way it faces the light and how far it is from it; the face shows the light's soft reflection.
// Goals are cut from thicker glass. The face's tint and clarity are in the CSS (--glass-tint, --glass-alpha).
export const GLASS = {
  R: 6, DEPTH: { goal: 6, other: 3.5 }, LIGHT: [-77, -11, 60], EYE: [86, 28, 300], GLOSS: 25,
  // quiet: the side of grey boxes still to do or waiting, as --glass-side-quiet does for cards (by night it matches sideTint).
  day: { sideTint: .26, quiet: .5, deepen: 0, ambient: .97, reflect: .55, spec: .75, faceShade: .03 },
  // By night only the brightness changes (on the dark base more tint would look lighter), and states take more colour.
  night: { sideTint: .38, stateTint: .46, deepen: 0, ambient: .75, reflect: .14, spec: .16, faceShade: .08 },
};
export const glassThickness = n => n.kind === 'goal' ? 'goal' : 'other';
export const glassDepth = n => GLASS.DEPTH[glassThickness(n)];

// What the light does, worked out once: how lit each sliver of the side is, for each thickness,
// and the face's reflection and shading in rings round the reflection's brightest point.
export let glassLight;
export function glassLighting() {
  if (glassLight) return glassLight;
  const { NW, NH } = MAP, { R, LIGHT, EYE, GLOSS } = GLASS;
  const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const toward = (p, q) => unit(p.map((v, i) => v - q[i]));
  // The panel as 7 × 4 × 2 small lights, 180 wide and 80 tall round LIGHT.
  const panel = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 2; k++)
    panel.push([LIGHT[0] + (i / 6 - .5) * 180, LIGHT[1] + (j / 3 - .5) * 80, LIGHT[2] + (k - .5) * 30]);
  const avg = fn => panel.reduce((sum, p) => sum + fn(p), 0) / panel.length;
  // On the face at (x, y): the light's reflection (Blinn-Phong), and how directly the light falls.
  const spec = (x, y) => { const V = toward(EYE, [x, y, 0]); return avg(p => { const L = toward(p, [x, y, 0]); return unit([L[0] + V[0], L[1] + V[1], L[2] + V[2]])[2] ** GLOSS; }); };
  const lit = (x, y) => avg(p => toward(p, [x, y, 0])[2]);
  // Where the reflection is brightest (it can lie off the box): a coarse search, then a fine one round the best.
  let peak = [0, 0], best = -1;
  const search = (x0, x1, y0, y1, step) => { for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) { const v = spec(x, y); if (v > best) { best = v; peak = [x, y]; } } };
  search(-250, 250, -125, 150, 25);
  search(peak[0] - 25, peak[0] + 25, peak[1] - 25, peak[1] + 25, 5);
  const far = Math.max(...[[0, 0], [NW, 0], [0, NH], [NW, NH]].map(([x, y]) => Math.hypot(x - peak[0], y - peak[1])));
  const dir = unit([NW / 2 - peak[0], NH / 2 - peak[1]]), litMax = Math.max(lit(0, 0), lit(0, NH));
  const rings = [...Array(25).keys()].map(k => {
    const x = peak[0] + dir[0] * far * k / 24, y = peak[1] + dir[1] * far * k / 24;
    return { spec: spec(x, y), shade: Math.max(0, 1 - lit(x, y) / litMax) };
  });
  // The visible side: the outline from the top-right corner (facing up and right, -45°) round to the
  // bottom-left one (facing down and left, 135°), in pieces that each face one way. The right side and
  // the bottom are each drawn as one strip, shaded along its length by a gradient through their pieces.
  const pieces = [];
  const arc = (cx, cy, a0, a1, n) => { for (let i = 0; i < n; i++) {
    const pts = [...Array(5).keys()].map(k => { const a = (a0 + (a1 - a0) * (i + k / 4) / n) * Math.PI / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    pieces.push({ pts, a: a0 + (a1 - a0) * (i + .5) / n });
  } };
  const line = (x0, y0, x1, y1, a, n, run) => { for (let i = 0; i < n; i++)
    pieces.push({ pts: [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n], [x0 + (x1 - x0) * (i + 1) / n, y0 + (y1 - y0) * (i + 1) / n]], a, run, t: (i + .5) / n }); };
  arc(NW - R, R, -45, 0, 2); line(NW, R, NW, NH - R, 0, 10, 'r'); arc(NW - R, NH - R, 0, 90, 6); line(NW - R, NH, R, NH, 90, 24, 'b'); arc(R, NH - R, 90, 135, 2);
  const centre = p => Math.hypot(p[0] - NW / 2, p[1] - NH / 2, p[2]);
  const pt = pts => `M${pts.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(' L')} Z`;
  const side = Object.fromEntries(Object.entries(GLASS.DEPTH).map(([kind, d]) => [kind, pieces.map(({ pts, a, run, t }) => {
    const n = [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180), 0], mid = pts[pts.length >> 1], P = [mid[0], mid[1], -d / 2];
    // Facing the light (half-Lambert), fading with distance: 1 is about as lit as the side gets.
    const light = avg(p => { const L = toward(p, P); return Math.max(0, Math.min(1, (.5 + .5 * (n[0] * L[0] + n[1] * L[1])) * (centre(p) / Math.hypot(...p.map((v, i) => v - P[i]))) ** 1.5 * 1.6)); });
    // Glass reflects its surroundings, which are brighter above than below.
    return { path: run ? '' : pt([...pts, ...pts.map(([x, y]) => [x + d, y + d]).reverse()]), light, sky: .5 - .5 * n[1], run, t };
  })]));
  // The two strips, and the line along each that its gradient follows.
  const strips = Object.fromEntries(Object.entries(GLASS.DEPTH).map(([kind, d]) => [kind, {
    r: { path: pt([[NW, R], [NW, NH - R], [NW + d, NH - R + d], [NW + d, R + d]]), along: `x1="0" y1="${R}" x2="0" y2="${NH - R}"` },
    b: { path: pt([[NW - R, NH], [R, NH], [R + d, NH + d], [NW - R + d, NH + d]]), along: `x1="${NW - R}" y1="0" x2="${R}" y2="0"` },
  }]));
  return (glassLight = { peak, far, rings, side, strips });
}

// The soft glow round a selected box, kept outside its face so the see-through glass stays clear, and round a
// selected line. Lines span the map in its own units: a straight line's box has no height for the filter to grow from.
export const lineGlow = (W, H) => `<filter id="line-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
// An arrowhead, its tip TIP past where its line stops, one size whatever the line's width.
export const arrowMarker = (id, color, orient = 'auto-start-reverse') => `<marker id="${id}" viewBox="0 0 10 10" refX="${10 - MAP.TIP}" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="${orient}"><path d="M1,1.5 L10,5 L1,8.5 L3,5 z" style="fill:${mapLineColour(color)}"/></marker>`;
export const glowDefs = (W, H) => `<filter id="node-glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/></feMerge><feComposite in2="SourceGraphic" operator="out"/></filter>`
  + lineGlow(W, H);

// The slab under each box and the light on its face, defined once per colour and thickness used.
export function glassDefs(used) {
  const root = getComputedStyle(document.documentElement), night = root.colorScheme === 'dark', g = GLASS[night ? 'night' : 'day'];
  const rgb = name => { const h = root.getPropertyValue(name).trim(); return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const css = c => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`;
  const { peak, far, rings, side, strips } = glassLighting(), base = rgb('--glass-base');
  const slabs = [...used].map(key => {
    const [tintVar, kind] = key.split('|'), tint = rgb(tintVar);
    // A map box with --activity or --grey glass is an activity still to do, or waiting.
    const tinted = tintVar === '--state' && g.stateTint || /^--(activity|grey)$/.test(tintVar) && g.quiet || g.sideTint;
    // In shade, coloured glass gets deeper in colour rather than grey: less light, more of the tint shows.
    const colour = ({ light, sky }) => {
      const share = Math.min(.95, tinted * (1 - .45 * g.deepen / 1.1 + g.deepen * (1 - light)));
      return css(mix(mix(base, tint, share).map(v => v * (g.ambient + (1 - g.ambient) * light)), [255, 255, 255], g.reflect * sky));
    };
    const id = `glass-${glassKey(key)}`, paint = (d, c) => `<path d="${d}" fill="${c}" stroke="${c}" stroke-width=".35" stroke-linejoin="round"/>`;
    const corners = side[kind].filter(x => !x.run).map(x => paint(x.path, colour(x))).join('');
    const runs = Object.entries(strips[kind]).map(([run, { path, along }]) => {
      const stops = side[kind].filter(x => x.run === run).map(x => `<stop offset="${+x.t.toFixed(3)}" stop-color="${colour(x)}"/>`).join('');
      return `<linearGradient id="${id}-${run}" gradientUnits="userSpaceOnUse" ${along}>${stops}</linearGradient>${paint(path, `url(#${id}-${run})`)}`;
    }).join('');
    return `<g id="${id}">${runs}${corners}</g>`;
  }).join('');
  const ring = (id, color, of) => `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${peak[0]}" cy="${peak[1]}" r="${+far.toFixed(1)}">${rings.map((x, k) => `<stop offset="${+(k / 24).toFixed(3)}" stop-color="${color}" stop-opacity="${+of(x).toFixed(3)}"/>`).join('')}</radialGradient>`;
  return slabs + ring('glass-spec', '#fff', x => g.spec * x.spec) + ring('glass-shade', '#000', x => g.faceShade * x.shade);
}
export const glassKey = key => key.replace('--', '').replace('|', '-');
// The colour a box takes, as in the CSS: its status's, or else its kind's.
export const glassTint = (kind, st) => ({ done: '--ok', doing: '--warn', late: '--bad', blocked: '--grey' })[st] || '--' + kind;

export function layoutMap(items, rels) {
  const { NW, NH, HG, DG, DW, VG, PAD, HEAD, BAND_GAP, LEAD, TIP, VISION_LINE } = MAP;
  const kindOf = {};
  Object.entries(items).forEach(([k, list]) => list.forEach(x => (kindOf[x.id] = k)));

  // 1. Layering (visions: a broader vision above those that serve it)
  const above = {};
  rels.forEach(r => {
    if (kindOf[r.from] !== kindOf[r.to] || kindOf[r.from] === 'state') return;
    if (r.type === 'subgoal' || r.type === 'subactivity' || r.type === 'subvision') (above[r.from] ||= []).push(r.to);
    if (r.type === 'depends') (above[r.to] ||= []).push(r.from);
  });
  const depth = {}, visiting = new Set();
  const depthOf = id => {
    if (depth[id] !== undefined) return depth[id];
    if (visiting.has(id)) return 0; // mixed parent/dependency loop – ignore the back edge
    visiting.add(id);
    const d = Math.max(-1, ...(above[id] || []).map(depthOf)) + 1;
    visiting.delete(id);
    return (depth[id] = d);
  };

  // Goals sit as low as they can, next to the activities: counted up from the bottom of their band.
  const below = {};
  Object.entries(above).forEach(([id, ups]) => ups.forEach(u => (below[u] ||= []).push(id)));
  const height = {};
  const heightOf = id => {
    if (height[id] !== undefined) return height[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const h = Math.max(-1, ...(below[id] || []).map(heightOf)) + 1;
    visiting.delete(id);
    return (height[id] = h);
  };

  const layers = [], bands = [], node = {};
  ['vision', 'goal', 'activity', 'state'].forEach(kind => {
    if (!items[kind]?.length) return;
    const base = layers.length;
    const levelOf = kind === 'goal' ? heightOf : depthOf;
    const maxDepth = Math.max(...items[kind].map(it => levelOf(it.id)));
    for (let i = 0; i <= maxDepth; i++) layers.push({ list: [] });
    items[kind].forEach(it => {
      const n = { id: it.id, kind, layer: base + (kind === 'goal' ? maxDepth - height[it.id] : depth[it.id]), w: NW };
      node[it.id] = n;
      layers[n.layer].list.push(n);
    });
    bands.push({ kind, first: base, last: layers.length - 1 });
  });

  // 2. Dummy nodes for edges that skip layers
  const chains = rels.map(r => {
    const a = node[r.from], b = node[r.to];
    if (a.layer === b.layer) return { r, a, b, same: true };
    const [top, bottom] = a.layer < b.layer ? [a, b] : [b, a];
    const chain = [top];
    for (let l = top.layer + 1; l < bottom.layer; l++) {
      const d = { id: `${r.id}:${l}`, dummy: true, layer: l, w: DW, toVision: top.kind === 'vision' };
      layers[l].list.push(d);
      chain.push(d);
    }
    chain.push(bottom);
    return { r, chain, reversed: top !== a };
  });
  const up = new Map(), down = new Map();
  const link = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);
  chains.forEach(c => c.chain?.forEach((n, i) => {
    if (i) { link(up, n, c.chain[i - 1]); link(down, c.chain[i - 1], n); }
  }));

  // Start with whatever is linked side by side, going through the lines from the top: boxes on their own come last.
  const seen = new Set(), visit = n => {
    if (seen.has(n)) return;
    seen.add(n);
    (down.get(n) || []).forEach(visit);
    (up.get(n) || []).forEach(visit);
  };
  layers.forEach(L => L.list.forEach(visit));
  layers.forEach(L => (L.list = []));
  seen.forEach(n => layers[n.layer].list.push(n));

  // 3. Crossing minimisation
  const reindex = () => layers.forEach(L => L.list.forEach((n, i) => (n.i = i)));
  reindex();
  // How much a line counts when it crosses another: a line to a vision counts most.
  const weight = (a, b) => (a.kind === 'vision' || a.toVision || b.kind === 'vision' || b.toVision ? VISION_LINE : 1);
  const crossings = () => {
    let c = 0;
    for (let l = 0; l < layers.length - 1; l++) {
      const segs = [];
      layers[l].list.forEach(n => (down.get(n) || []).forEach(m => segs.push([n.i, m.i, weight(n, m)])));
      for (let i = 0; i < segs.length; i++)
        for (let j = i + 1; j < segs.length; j++)
          if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) c += segs[i][2] * segs[j][2];
    }
    return c;
  };
  const sortLayer = (L, nbrs) => {
    L.list.forEach(n => {
      const ns = nbrs.get(n);
      n.b = ns?.length ? ns.reduce((s, x) => s + x.i, 0) / ns.length : n.i;
    });
    L.list.sort((a, b) => a.b - b.b || a.i - b.i);
    L.list.forEach((n, i) => (n.i = i));
  };
  let best = crossings(), bestOrder = layers.map(L => [...L.list]);
  for (let it = 0; it < 16 && best > 0; it++) {
    if (it % 2 === 0) for (let l = 1; l < layers.length; l++) sortLayer(layers[l], up);
    else for (let l = layers.length - 2; l >= 0; l--) sortLayer(layers[l], down);
    const c = crossings();
    if (c < best) { best = c; bestOrder = layers.map(L => [...L.list]); }
  }
  layers.forEach((L, l) => (L.list = bestOrder[l]));
  reindex();
  // Swap neighbours while that removes crossings.
  const pairCross = (u, v, nbrs) => {
    let c = 0;
    (nbrs.get(u) || []).forEach(a => (nbrs.get(v) || []).forEach(b => { if (a.i > b.i) c += weight(u, a) * weight(v, b); }));
    return c;
  };
  // The crossings between u's lines and v's when u is left of v.
  const cost = (u, v) => pairCross(u, v, up) + pairCross(u, v, down);
  const swap = (L, i) => { const u = L.list[i], v = L.list[i + 1]; L.list[i] = v; L.list[i + 1] = u; v.i = i; u.i = i + 1; };
  for (let pass = 0, improved = true; improved && pass < 8; pass++) {
    improved = false;
    layers.forEach(L => {
      for (let i = 0; i + 1 < L.list.length; i++) if (cost(L.list[i + 1], L.list[i]) < cost(L.list[i], L.list[i + 1])) { swap(L, i); improved = true; }
    });
  }

  // 4. Horizontal placement
  const sep = (a, b) => a.w / 2 + b.w / 2 + (a.dummy && b.dummy ? DG : HG);
  const offsets = L => L.list.reduce((off, n, i) => (off.push(i ? off[i - 1] + sep(L.list[i - 1], n) : 0), off), []);
  layers.forEach(L => offsets(L).forEach((x, i) => (L.list[i].x = x)));
  const median = xs => {
    const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const place = (L, refs) => {
    const off = offsets(L);
    const blocks = [];
    L.list.forEach((n, i) => {
      const ns = refs.flatMap(m => m.get(n) || []);
      // Dummies weigh more so long edges stay straight; unconnected boxes barely pull at all.
      const want = ns.length ? median(ns.map(x => x.x)) : n.x;
      const w = ns.length ? (n.dummy ? 3 : 1) : 0.2;
      blocks.push({ s: w * (want - off[i]), w, n: 1 });
      while (blocks.length > 1) {
        const [a, b] = blocks.slice(-2);
        if (a.s / a.w <= b.s / b.w) break;
        blocks.splice(-2, 2, { s: a.s + b.s, w: a.w + b.w, n: a.n + b.n });
      }
    });
    let i = 0;
    blocks.forEach(b => { for (let k = 0; k < b.n; k++, i++) L.list[i].x = b.s / b.w + off[i]; });
  };
  for (let it = 0; it < 8; it++) {
    for (let l = 1; l < layers.length; l++) place(layers[l], [up]);
    for (let l = layers.length - 2; l >= 0; l--) place(layers[l], [down]);
  }
  layers.forEach(L => place(L, [up, down]));
  // A long line runs straight down: its slots line up in one column wherever the rows leave room
  // (top to bottom, a new column starts only where they don't). Nothing else moves.
  const room = n => {
    const L = layers[n.layer].list, a = L[n.i - 1], b = L[n.i + 1];
    return [a ? a.x + sep(a, n) : -Infinity, b ? b.x - sep(n, b) : Infinity];
  };
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  for (let it = 0; it < 3; it++) chains.forEach(c => {
    const ds = c.chain?.slice(1, -1);
    if (!ds?.length) return;
    // Best between the line's two ends, so it bends one way only.
    const ends = [c.chain[0].x, c.chain[c.chain.length - 1].x].sort((a, b) => a - b);
    let run = [], lo = -Infinity, hi = Infinity;
    const align = () => {
      if (!run.length) return;
      const x = clamp(clamp(median(run.map(d => d.x)), ...ends), lo, hi);
      run.forEach(d => (d.x = x));
    };
    ds.forEach(d => {
      const [a, b] = room(d);
      if (Math.max(lo, a) > Math.min(hi, b)) { align(); run = []; lo = -Infinity; hi = Infinity; }
      run.push(d); lo = Math.max(lo, a); hi = Math.min(hi, b);
    });
    align();
  });
  const all = layers.flatMap(L => L.list);
  // Close empty vertical strips (e.g. between unrelated clusters) that placement leaves behind.
  const spans = all.map(n => [n.x - n.w / 2, n.x + n.w / 2]).sort((a, b) => a[0] - b[0]);
  const cuts = [];
  spans.reduce((reach, [l, r]) => {
    if (l - reach > HG * 2) cuts.push([reach + HG * 2, l]);
    return Math.max(reach, r);
  }, spans[0][1]);
  all.forEach(n => (n.x -= cuts.filter(([, end]) => n.x >= end).reduce((s, [start, end]) => s + end - start, 0)));
  const minX = Math.min(...all.map(n => n.x - n.w / 2));
  all.forEach(n => (n.x += PAD - minX));
  const W = Math.max(360, ...all.map(n => n.x + n.w / 2 + PAD));

  // Vertical positions
  let y = PAD;
  bands.forEach(b => {
    b.top = y;
    y += HEAD;
    for (let l = b.first; l <= b.last; l++) {
      layers[l].y = y;
      y += NH + (l < b.last ? VG : 0);
    }
    b.bottom = y + 14;
    y = b.bottom + BAND_GAP;
  });
  const H = y - BAND_GAP + PAD;

  // Edge geometry. Attachment points are spread along a box edge, ordered by where the line goes.
  const ports = new Map();
  const port = (n, side, entry) => {
    if (!ports.has(n)) ports.set(n, { top: [], bottom: [] });
    ports.get(n)[side].push(entry);
  };
  chains.forEach(c => {
    if (c.same) return;
    const ch = c.chain;
    c.pts = ch.map(() => null);
    port(ch[0], 'bottom', { c, k: 0, other: ch[1] });
    port(ch[ch.length - 1], 'top', { c, k: ch.length - 1, other: ch[ch.length - 2] });
  });
  ports.forEach((sides, n) => Object.entries(sides).forEach(([side, list]) => {
    list.sort((p, q) => p.other.x - q.other.x);
    // At the bottom, below the box's glass thickness, so an arrowhead there is not hidden under it.
    list.forEach((p, i) => (p.c.pts[p.k] = [n.x - NW / 2 + (NW * (i + 1)) / (list.length + 1), layers[n.layer].y + (side === 'bottom' ? NH + glassDepth(n) : 0)]));
  }));
  chains.forEach(c => {
    if (c.same) {
      // Same layer: straight between neighbours, otherwise an arc above the row.
      const dir = c.b.x > c.a.x ? 1 : -1, cy = layers[c.a.layer].y + NH / 2;
      // A box's right side ends beyond its glass thickness.
      const sx = c.a.x + (dir * NW) / 2 + (dir > 0 ? glassDepth(c.a) : 0), tx = c.b.x - (dir * NW) / 2 + (dir < 0 ? glassDepth(c.b) : 0);
      if (Math.abs(c.a.i - c.b.i) === 1) c.d = `M${sx},${cy} L${tx - dir * TIP},${cy}`;
      else {
        // The arc ends straight, along the way it comes in, so the arrowhead sits in line with it.
        const k = 1 / Math.hypot(50, 60), lx = dir * 50 * k, ly = 60 * k;
        c.d = `M${sx},${cy - 10} C${sx + dir * 50},${cy - 70} ${tx - (dir * 50 + lx * LEAD)},${cy - 70 - ly * LEAD} ${tx - lx * LEAD},${cy - 10 - ly * LEAD} L${tx - lx * TIP},${cy - 10 - ly * TIP}`;
      }
      return;
    }
    // Top to bottom: straight down through each column of slots, a curve in between.
    let pts = [c.pts[0]];
    c.chain.slice(1, -1).forEach((d, i, ds) => {
      if (ds[i - 1]?.x !== d.x) pts.push([d.x, layers[d.layer].y]);
      if (ds[i + 1]?.x !== d.x) pts.push([d.x, layers[d.layer].y + NH]);
    });
    pts.push(c.pts[c.pts.length - 1]);
    c.line = pts;
    if (c.reversed) pts = [...pts].reverse();
    // The last stretch into the arrowhead is straight, so the head sits in line with the line however steep its curve.
    const [ex, ey] = pts[pts.length - 1], py = pts[pts.length - 2][1];
    const back = Math.sign(py - ey), lead = Math.min(LEAD, Math.abs(py - ey) / 2);
    pts = [...pts.slice(0, -1), [ex, ey + back * lead], [ex, ey + back * (lead > TIP ? TIP : lead / 2)]];
    c.d = `M${pts[0][0]},${pts[0][1]}` + pts.slice(1).map((q, i) => {
      const p = pts[i];
      if (p[0] === q[0]) return ` L${q[0]},${q[1]}`;
      const my = (p[1] + q[1]) / 2;
      return ` C${p[0]},${my} ${q[0]},${my} ${q[0]},${q[1]}`;
    }).join('');
  });

  return { node, layers, bands, chains, W, H };
}

// Box text is cut to fit its box, ending in "…": measured on a canvas in the fonts the map's CSS sets,
// with 4 % to spare, as SVG text can come out a little wider than the canvas measures it.
export let fitCtx;
export function fitText(text, font, max) {
  fitCtx ||= document.createElement('canvas').getContext('2d');
  fitCtx.font = font;
  const fits = s => fitCtx.measureText(s).width * 1.04 <= max;
  if (fits(text)) return text;
  let s = text;
  while (s && !fits(s + '…')) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}
// The map can be drawn before the web font is in; it is drawn again then, to fit the font's widths.
document.fonts?.addEventListener('loadingdone', () => { if (ui.view === 'map' && ctxMenu.hidden && !modal.open) render(); });

// A rounded rectangle from x0, y0 to x1, y1 as a path.
export const roundedRect = (x0, y0, x1, y1, r) =>
  `M${x0 + r},${y0} H${x1 - r} A${r},${r} 0 0 1 ${x1},${y0 + r} V${y1 - r} A${r},${r} 0 0 1 ${x1 - r},${y1} H${x0 + r} A${r},${r} 0 0 1 ${x0},${y1 - r} V${y0 + r} A${r},${r} 0 0 1 ${x0 + r},${y0} Z`;

/* ---------- Visions on the map ----------
   Links to visions are not stored relationships: a goal keeps the visions it serves, a vision its
   parents. On the map they are drawn as lines with ids of their own, vl~<from>~<to>. */

// Why two boxes can't be linked through a vision (an i18n key), or null. Two visions: the first serves the second.
export function visionLinkError(a, b) {
  const A = findEntity(a), B = findEntity(b);
  if (!A || !B) return 'err.unknown';
  if (A.kind === 'vision' && B.kind === 'vision') return canParent(a, b);
  const goal = A.kind === 'goal' ? A.item : B.kind === 'goal' ? B.item : null;
  if (!goal) return 'err.visionGoalOnly';
  return ownVisions(goal).includes(A.kind === 'vision' ? a : b) ? 'err.relExists' : null;
}

export function linkVision(a, b) {
  const err = visionLinkError(a, b);
  if (err) return toast(t(err));
  const A = findEntity(a).item, B = findEntity(b).item;
  if (findVision(a) && findVision(b)) { A.parents.push(b); saveVisions(); }
  else { const [goal, vis] = findVision(b) ? [A, B] : [B, A]; setGoalVisions(goal, [...ownVisions(goal), vis.id]); save(); }
  render();
  const [x, y] = findVision(a) && !findVision(b) ? [B, A] : [A, B];
  toast(t('map.visionLinked', { a: x.title, b: y.title }));
}

export function unlinkVision(r) {
  if (r.type === 'subvision') {
    const v = findVision(r.from);
    v.parents = v.parents.filter(p => p !== r.to);
    saveVisions();
  } else {
    const g = db.goals.find(x => x.id === r.from);
    setGoalVisions(g, ownVisions(g).filter(x => x !== r.to));
    save();
  }
  if (ui.mapRel === r.id) ui.mapRel = null;
  render();
  toast(t('map.visionUnlinked'));
}

export const hideVisionsToggle = () => `<button class="chip" data-hide-visions aria-pressed="${ui.hideVisions}">${t('map.hideVisions')}</button>`;

// A vision is not glass but a cloud: the box's shape in silver with soft, blurred edges (gold for the Purpose,
// brighter once some goal serves it). Its line under the title counts the goals serving it, directly or through
// narrower visions, in all plans.
export function visionNode(n, v, { font, textW, face, sel, dim, purpose, reached, y }) {
  const { NW, NH } = MAP, count = goalsReaching(v.id);
  const goals = count ? tp('vis.goals', count) : t('vis.noGoalsShort');
  const sub = purpose ? `${t('vis.purpose')} · ${goals}` : goals;
  const title = fitText(v.title, `500 13px ${font}`, textW), subFit = fitText(sub, `400 11.5px ${font}`, textW);
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
export const visionDefs = (W, H) => `<linearGradient id="vision-sheen" x1="0" y1="0" x2=".35" y2="1"><stop class="vision-sheen-top" offset="0"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>`
  + `<filter id="vision-cloud" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>`
  + `<filter id="vision-haze" x="-40%" y="-110%" width="180%" height="320%"><feGaussianBlur stdDeviation="9"/></filter>`
  + `<filter id="vision-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="12" result="b"/><feComposite in="b" in2="SourceGraphic" operator="out"/></filter>`
  + `<filter id="vision-line-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><feGaussianBlur stdDeviation="8"/></filter>`;

// Items working toward a vision glow in every view. With a Purpose everything turns gold, the logo
// at the top left too, and the first time it is found the user is congratulated (once, on any device).
export function markVisions() {
  const ps = purposeState(), contrib = contributingIds();
  document.documentElement.classList.toggle('purpose', ps.on);
  viewEl.querySelectorAll('.glass[data-ctx-item], .tl-row[data-tl-node]').forEach(el => el.classList.toggle('vglow', contrib.has(el.dataset.ctxItem || el.dataset.tlNode)));
  if (!ps.on || visions.purposeFound || isTourRunning()) return;
  visions.purposeFound = today();
  saveVisions();
  $('#purposeText').textContent = t('purpose.text', { name: ps.root.title });
  if (!$('#purposeDlg').open) $('#purposeDlg').showModal();
}

export function renderMap() {
  if (!itemCount() && !visions.list.length) return emptyState(t('map.emptyTitle'), t('map.emptyText'), 'goal');

  const scope = scopeFor(ui.mapGoal);
  const keep = kind => item => (!scope || scope[kind].has(item.id)) && !(ui.hideDone && (kind === 'goal' ? isComplete('goal', item) : kind === 'activity' && item.status === 'done'));
  const items = {
    goal: db.goals.filter(keep('goal')),
    activity: db.activities.filter(keep('activity')),
    state: db.states.filter(keep('state')),
  };
  // With a goal or category picked, or unrelated visions hidden, only the visions the goals shown serve, and those above them.
  let near = null;
  if (scope || ui.hideVisions) {
    near = new Set();
    items.goal.forEach(g => ownVisions(g).forEach(id => [id, ...visionAncestors(id)].forEach(x => near.add(x))));
  }
  items.vision = visions.list.filter(v => !near || near.has(v.id));
  const visible = new Set([...items.vision, ...items.goal, ...items.activity, ...items.state].map(x => x.id));
  const rels = db.relations.filter(r => REL_TYPES[r.type] && !ui.mapHidden.has(r.type) && visible.has(r.from) && visible.has(r.to));
  if (!ui.mapHidden.has('serves')) items.goal.forEach(g => ownVisions(g).forEach(id => visible.has(id) && rels.push({ id: visionRelId(g.id, id), from: g.id, to: id, type: 'serves' })));
  if (!ui.mapHidden.has('subvision')) items.vision.forEach(v => visionParents(v).forEach(p => visible.has(p) && rels.push({ id: visionRelId(v.id, p), from: v.id, to: p, type: 'subvision' })));
  // What works toward a vision glows, and so do the lines between such items.
  const contrib = contributingIds(), ps = purposeState(), reached = reachedVisions();
  const glows = r => (contrib.has(r.from) || visible.has(r.from) && findVision(r.from)) && (contrib.has(r.to) || !!findVision(r.to)) && r.type !== 'depends';
  const { NW, NH, PAD } = MAP;
  const { node, layers, bands, chains, W, H } = layoutMap(items, rels);

  // Either an item or a relationship line can be selected.
  const relSel = rels.find(r => r.id === ui.mapRel) || null;
  const sel = !relSel && ui.mapSelected && visible.has(ui.mapSelected) ? ui.mapSelected : null;
  const nearSel = relSel ? new Set([relSel.from, relSel.to]) : neighbourhood(sel, rels);

  // Each line sits in a group with a wide invisible twin, so it is easy to hit; a click selects it,
  // a second click (or Enter) edits the relationship and Delete removes it.
  const edges = chains.map(c => {
    const def = REL_TYPES[c.r.type] || VISION_RELS[c.r.type];
    const dim = (sel && !(c.r.from === sel || c.r.to === sel)) || (relSel && c.r.id !== relSel.id) ? 'dim' : '';
    const label = relText(c.r);
    return `<g class="edge-g ${dim} ${c.r.id === relSel?.id ? 'sel' : ''}${glows(c.r) ? ' vglow' : ''}" data-rel-edit="${c.r.id}" tabindex="0" role="button" aria-pressed="${c.r.id === relSel?.id}" aria-label="${esc(t('map.relLabel', { rel: label }))}">
      <path class="edge" d="${c.d}" style="stroke:${mapLineColour(def.color)};stroke-width:${def.width || 1.1}" ${def.dash ? 'stroke-dasharray="4 3"' : ''} marker-end="url(#arrow-${c.r.type})"></path>
      <path class="edge-hit" d="${c.d}"></path><title>${esc(label)}</title></g>`;
  }).join('');

  // A glow round the box when selected, focused or being linked, and the face's light over its fill, all one
  // rounded path (paths, so the box's rect rules don't reach them). Under the face, its glass slab.
  const { R } = GLASS, face = roundedRect(0, 0, NW, NH, R), slabs = new Set();
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font'), textW = NW - 18;
  const nodes = Object.values(node).map(n => {
    const { item } = findEntity(n.id);
    if (n.kind === 'vision') return visionNode(n, item, { font, textW, face, sel, dim: (sel || relSel) && !nearSel.has(n.id), purpose: ps.root?.id === n.id, reached: reached.has(n.id), y: layers[n.layer].y });
    let st = '', sub, full, bar = '', pct = '';
    if (n.kind === 'goal') {
      st = goalState(item);
      sub = st === 'blocked' ? t('acts.waitsFor', { n: blockers(item, 'goal').length }) : item.deadline ? fmtRel(item.deadline, true) : t('map.noDeadline');
      // Progress shows as a green bar along the bottom of the box; the number stays in the tooltip.
      const p = goalProgress(item);
      pct = ` – ${Math.round(p)} %`;
      const y = NH - 8, end = 14 + (NW - 28) * Math.min(p, 100) / 100;
      bar = `<line class="node-track" x1="14" x2="${NW - 14}" y1="${y}" y2="${y}"></line>${p > 0 ? `<line class="node-progress" x1="14" x2="${end.toFixed(1)}" y1="${y}" y2="${y}"></line>` : ''}`;
    } else if (isRoutine(item)) {
      st = activityState(item);
      const streak = routineStreak(item), p = periodProgress(item);
      // Short on the box, in full in its tooltip.
      full = periodText(item, p) + (streak.n ? ', ' + streakText(streak) : '');
      sub = (p.target ? t('map.rt.' + periodUnit(item), { done: p.done, target: p.target }) : periodText(item, p)) + (streak.n ? ', ' + t('map.rt.streak', { n: streak.n }) : '');
    } else if (n.kind === 'activity') {
      st = activityState(item);
      sub = (st === 'blocked' ? t('acts.waitsFor', { n: blockers(item).length }) : t('activity.' + item.status)) + (item.dueDate ? ', ' + fmtRel(item.dueDate) : '');
    } else {
      sub = isNum(item.value) ? `${fmtNum(item.value)} ${item.unit || ''}, ${fmtRel(item.date)}` : fmtRel(item.date, true);
    }
    // Sizes and weights as in the CSS for .node text and .node .sub.
    const title = fitText(item.title, `${n.kind === 'goal' ? 500 : 400} 13px ${font}`, textW);
    const subFit = fitText(sub, `400 11.5px ${font}`, textW);
    const dim = (sel || relSel) && !nearSel.has(n.id) ? 'dim' : '';
    const linking = ui.mapLinkFrom === n.id ? ' link-source' : '';
    const slab = `${glassTint(n.kind, st)}|${glassThickness(n)}`;
    slabs.add(slab);
    return `<g class="node ${n.kind}${st ? ' st-' + st : ''}${linking}${n.id === sel ? ' sel' : ''}${contrib.has(n.id) ? ' vglow' : ''} ${dim}" data-map-node="${n.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc(item.title)}" transform="translate(${n.x - NW / 2},${layers[n.layer].y})">
      <path class="node-lift" d="${face}"></path>
      <use href="#glass-${glassKey(slab)}"></use>
      <rect width="${NW}" height="${NH}" rx="${R}"></rect>
      <path class="glass-shade" d="${face}"></path><path class="glass-spec" d="${face}"></path>
      <text x="12" y="23">${esc(title)}</text>
      <text class="sub" x="12" y="${bar ? 38 : 41}">${esc(subFit)}</text>${bar}
      <title>${esc(item.title)}${pct}${st ? ' – ' + esc(t('nodeState.' + st)) : ''}\n${esc(full || sub)}</title>
    </g>`;
  }).join('');

  // Band labels go over the lines, so a line passing by never cuts through one.
  const bandSvg = bands.map(b => `<rect class="band ${b.kind}" x="6" y="${b.top}" width="${W - 12}" height="${b.bottom - b.top}" rx="14"></rect>`).join('');
  // The glow round what works toward a vision lies under every line and box, so it never dims a neighbour's text;
  // lines glow as softly and widely as boxes.
  const lineGlows = chains.filter(c => glows(c.r)).map(c => `<path class="edge-vglow" data-line-glow="${c.r.id}" d="${c.d}"></path>`).join('');
  const halos = Object.values(node).filter(n => contrib.has(n.id)).map(n => `<path class="node-vglow" data-halo="${n.id}" d="${face}" transform="translate(${n.x - NW / 2},${layers[n.layer].y})"></path>`).join('');
  const bandLabels = bands.map(b => {
    const levels = b.last - b.first + 1;
    return `<text class="col-label ${b.kind}" x="${PAD}" y="${b.top + 22}">${esc(t('kinds.' + b.kind))}${levels > 1 ? ` (${esc(tp('map.levels', levels))})` : ''}</text>`;
  }).join('');

  const markers = Object.entries({ ...REL_TYPES, ...VISION_RELS }).map(([k, d]) => arrowMarker(`arrow-${k}`, d.color)).join('');

  const toggles = Object.entries(REL_TYPES).map(([k, d]) => {
    const count = db.relations.filter(r => r.type === k).length;
    return `<button class="chip rel-toggle" data-rel-toggle="${k}" aria-pressed="${!ui.mapHidden.has(k)}" title="${esc(relSignature(k))}"><i class="${d.dash ? 'dash' : ''}" style="border-color:${mapLineColour(d.color)}"></i>${esc(relLabel(k))}<span class="count">${count}</span></button>`;
  }).join('') + (visions.list.length ? Object.entries(VISION_RELS).map(([k, d]) => {
    const count = k === 'serves' ? db.goals.reduce((n, g) => n + ownVisions(g).length, 0) : visions.list.reduce((n, v) => n + visionParents(v).length, 0);
    return `<button class="chip rel-toggle" data-rel-toggle="${k}" aria-pressed="${!ui.mapHidden.has(k)}" title="${esc(`${kindList(d.from)} → ${kindList(d.to)}`)}"><i style="border-color:${mapLineColour(d.color)}"></i>${esc(relLabel(k))}<span class="count">${count}</span></button>`;
  }).join('') : '');
  const goalNodes = items.goal.length ? items.goal : Object.values(items).flat();
  const focusX = Math.round(goalNodes.reduce((s, x) => s + node[x.id].x, 0) / goalNodes.length * ui.mapScale);
  let relNote = '';
  if (!rels.length) relNote = db.relations.length ? `<div class="empty">${t('map.noneShown')}</div>` : emptyState(t('map.relEmptyTitle'), t('map.relEmptyText'), 'relation');
  const zoomBtn = (dir, label) => `<button type="button" class="icon-btn" data-map-zoom="${dir}" aria-label="${esc(t('map.zoom.' + dir))}" title="${esc(t('map.zoom.' + dir))}">${label}</button>`;

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
export function mapLinkBar(id) {
  return `<div class="link-bar" role="status"><span class="grow">${esc(t('map.linkPick', { name: findEntity(id).item.title }))}</span>
    <button type="button" class="btn small ghost" data-map-link-cancel>${t('btn.cancel')}</button></div>`;
}

export function mapSelection(id) {
  const { kind, item } = findEntity(id);
  return `<div class="row" style="margin-top:12px;cursor:default">
    <span class="tag ${kind}">${t('kind.' + kind)}</span>
    <span class="grow"><strong>${esc(item.title)}</strong></span>
    <button class="btn small" data-open="${id}">${t('btn.edit')}</button>
    <button class="btn small ghost" data-map-clear>${t('btn.deselect')}</button>
  </div>`;
}

// The ▸/▾ button that folds a goal (or the 'rest' group) in the timeline.
export const foldBtn = (key, name, folded, tip = esc(t(folded ? 'tl.expand' : 'tl.collapse', { name }))) => `<button type="button" class="tl-fold" data-tl-fold="${key}" aria-expanded="${!folded}" aria-label="${tip}" title="${tip}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${folded ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'}"/></svg></button>`;

export function toggleTlFold(key) {
  const set = tlCollapsed();
  set.has(key) ? set.delete(key) : set.add(key);
  setTlCollapsed(set);
  render();
  $(`[data-tl-fold="${key}"]`)?.focus();
}
// What can fold: every goal with something under it, and the 'rest' group.
export const tlFoldKeys = () => timelineRows(scopeFor(ui.timelineGoal)).filter(r => r.fold || r.kind === 'group').map(r => r.kind === 'group' ? 'rest' : r.item.id);
// The one button reads Expand all once everything is folded, and Collapse all otherwise.
export function tlAllFolded() {
  const keys = tlFoldKeys(), set = tlCollapsed();
  return keys.length > 0 && keys.every(k => set.has(k));
}
export function foldAllTl(collapse) {
  setTlCollapsed(new Set(collapse ? tlFoldKeys() : []));
  render();
  $('[data-tl-fold-all]')?.focus();
}

export const relText = r => `${findEntity(r.from).item.title} ${relLabel(r.type)} ${findEntity(r.to).item.title}`;

// The selected line, with buttons for touch screens (no Delete key there).
export function mapRelSelection(r) {
  return `<div class="row map-rel-selection" style="margin-top:12px;cursor:default">
    <span class="tag">${t('kind.relation')}</span>
    <span class="grow"><strong>${esc(relText(r))}</strong></span>
    <button class="btn small" data-rel-open="${r.id}">${t('btn.edit')}</button>
    <button class="btn small danger" data-rel-remove="${r.id}">${t('btn.remove')}</button>
    <button class="btn small ghost" data-map-clear>${t('btn.deselect')}</button>
  </div>`;
}

export function removeRelation(id) {
  const vr = visionRel(id);
  if (vr) return unlinkVision(vr);
  db.relations = db.relations.filter(r => r.id !== id);
  if (ui.mapRel === id) ui.mapRel = null;
  save();
  render();
  toast(t('toast.relRemoved'));
}

// Deleting an item from the map asks first, like the form's Delete button.
export function askDeleteItem(id) {
  const ent = findEntity(id);
  if (!ent || !confirm(t('confirm.delete', { name: ent.item.title }))) return;
  removeEntity(ent.kind, id);
  save();
  render();
  toast(t('toast.deleted.' + ent.kind));
}

/* ---------- Timeline (Gantt chart of goals and activities) ---------- */

// ZOOM presets and the MIN–MAX range for free zooming are in pixels per day.
export const TL = { ROW: 40, ZOOM: { week: 30, month: 8, quarter: 2.6 }, MIN: 1.5, MAX: 80 };
export const endOf = (kind, item) => (kind === 'goal' ? item.deadline : item.dueDate);
// A routine that runs a set number of times ends where its start puts it: only the whole bar moves.
export const fixedEnd = item => isRoutine(item) && !!item.repeat.count;
// The grips at the ends of the selected bar reach a little past it, so even a thin bar has room to grab.
export const tlGrip = (edge, left, width) => {
  const inner = Math.min(6, width / 4);
  return `left:${edge === 'start' ? left - 12 : left + width - inner}px;width:${12 + inner}px`;
};

// A routine that falls on set days marks each of them along the bottom of its bar: done, missed, or
// still to come (today too, until it is ticked). One without an end marks them to the timeline's end.
// Narrow days merge into one band of colour.
export function tlRoutineDays(a, from, to, x, px) {
  if (!isRoutine(a) || isFlexible(a)) return '';
  const now = today(), w = px > 4 ? px - 2 : px, out = [], kept = keptDay(a);
  const last = Math.min(to, a.dueDate ? dayNum(a.dueDate) : to);
  for (let n = Math.max(from, dayNum(routineStart(a))); n <= last; n++) {
    const iso = dayStr(n);
    if (!isDueDay(a, iso)) continue;
    // A day made up for on another day counts as done.
    const st = kept(iso) ? 'done' : iso < now ? 'missed' : 'due';
    out.push(`<i class="tl-day ${st}" style="left:${x(n) + (px - w) / 2}px;width:${w}px"></i>`);
  }
  return out.join('');
}

// Rows in plan order: each top-level goal, its activity trees, then its sub-goals (recursively).
// Prerequisites that work toward no goal themselves are listed under the activity that waits for them.
// An activity that serves several goals is listed under each of them (its rows carry `also`: the
// other goals it is under). A goal in `collapsed` keeps its own row but hides what is under it;
// what it hides still counts as placed. Activities under no shown goal come last in their own
// group ('rest', which can be collapsed too).
export function timelineRows(scope, collapsed = new Set()) {
  const rows = [], placedGoals = new Set(), placed = new Set(), under = new Map(); // activity → goals it is listed under
  const visible = (kind, x) => !scope || scope[kind].has(x.id);
  const startKey = x => x.startDate || x.dueDate || x.deadline || '9999';
  const byStart = (a, b) => startKey(a).localeCompare(startKey(b));
  const kids = a => relsTo(a.id, 'subactivity').map(r => db.activities.find(x => x.id === r.from)).filter(Boolean).sort(byStart);
  // An activity's prerequisites that serve no shown goal, each as its whole tree (from its top).
  const goals = db.goals.filter(g => visible('goal', g));
  const owned = new Set(goals.flatMap(g => goalActivities(g).map(a => a.id)));
  const prereqs = a => [...new Set(relsFrom(a.id, 'depends').map(r => ancestors(r.to, 'subactivity').pop() || r.to))]
    .filter(id => !owned.has(id)).map(id => db.activities.find(x => x.id === id)).filter(Boolean).sort(byStart);
  // `rel` is how a row hangs off the row at index `parent` (drawn as a connector in that relation's colour).
  // A hidden activity passes its own place in the tree on to its children; `hidden` walks without adding rows.
  const addActivity = (a, depth, rel, parent, goal, hidden, seen = new Set()) => {
    if (seen.has(a.id)) return;
    seen.add(a.id);
    placed.add(a.id);
    if (goal) under.set(a.id, [...(under.get(a.id) || []), goal]);
    const show = !hidden && visible('activity', a) && !(ui.hideDone && a.status === 'done');
    const here = show ? rows.push({ kind: 'activity', item: a, depth, rel, parent, goal }) - 1 : parent;
    const nest = (c, childRel) => (show ? addActivity(c, depth + 1, childRel, here, goal, hidden, seen) : addActivity(c, depth, rel, parent, goal, hidden, seen));
    kids(a).forEach(c => nest(c, 'subactivity'));
    if (goal) prereqs(a).forEach(p => nest(p, 'depends'));
  };
  const addGoal = (g, depth, rel, parent, hidden) => {
    if (placedGoals.has(g.id)) return;
    placedGoals.add(g.id);
    const contributors = new Set(relsTo(g.id, 'contributes').map(r => r.from));
    const acts = db.activities.filter(a => contributors.has(a.id) && !ancestors(a.id, 'subactivity').some(p => contributors.has(p))).sort(byStart);
    const subs = relsTo(g.id, 'subgoal').map(r => db.goals.find(x => x.id === r.from)).filter(x => x && visible('goal', x)).sort((a, b) => byDeadline(a, b) || byStart(a, b));
    const folded = collapsed.has(g.id);
    // An achieved goal hidden with the done items passes its place on to what is under it, like an activity.
    const skip = !hidden && ui.hideDone && isComplete('goal', g);
    const here = hidden || skip ? parent : rows.push({ kind: 'goal', item: g, depth, rel, parent, fold: acts.length + subs.length > 0, collapsed: folded }) - 1;
    const inner = skip ? depth : depth + 1;
    acts.forEach(a => addActivity(a, inner, skip ? rel : 'contributes', here, g.id, hidden || folded));
    subs.forEach(sg => addGoal(sg, inner, skip ? rel : 'subgoal', here, hidden || folded));
  };
  const goalIds = new Set(goals.map(g => g.id));
  goals.filter(g => !ancestors(g.id, 'subgoal').some(p => goalIds.has(p))).sort((a, b) => byDeadline(a, b) || byStart(a, b)).forEach(g => addGoal(g, 0));

  const rest = db.activities.filter(a => !placed.has(a.id) && visible('activity', a));
  const restIds = new Set(rest.map(a => a.id));
  const group = { kind: 'group', key: 'rest', label: t(scope ? 'tl.related' : 'tl.unlinked'), depth: 0, collapsed: collapsed.has('rest') };
  const before = rows.push(group);
  rest.filter(a => !ancestors(a.id, 'subactivity').some(p => restIds.has(p))).sort(byStart).forEach(a => addActivity(a, 1, undefined, undefined, '', group.collapsed));
  if (rows.length === before && !group.collapsed) rows.pop();
  if (group.collapsed && !rest.length) rows.pop();
  // Each copy of an activity names the other goals it is listed under.
  rows.forEach(r => {
    const goalsOf = r.kind === 'activity' && [...new Set(under.get(r.item.id) || [])];
    if (goalsOf && goalsOf.length > 1) r.also = goalsOf.filter(id => id !== r.goal).map(id => findEntity(id).item.title);
  });
  return rows;
}

// Goals (and the 'rest' group) folded in the timeline: per plan, on this device.
export const tlCollapsed = () => new Set(prefs.get('tlCollapsed.' + plans.current, []));
export const setTlCollapsed = set => prefs.set('tlCollapsed.' + plans.current, [...set]);

export function renderTimeline() {
  if (!db.goals.length && !db.activities.length) return emptyState(t('tl.emptyTitle'), t('tl.emptyText'), 'goal');
  const rows = timelineRows(scopeFor(ui.timelineGoal), tlCollapsed());
  const { ROW } = TL;
  const px = ui.tlPx;
  const todayN = dayNum(today());

  // Date range: everything shown plus today, padded and starting on the 1st of a month.
  const dates = rows.flatMap(r => (r.item ? [r.item.startDate, endOf(r.kind, r.item)] : [])).filter(Boolean).map(dayNum);
  const pad = Math.ceil(160 / px);
  const from = dayNum(dayStr(Math.min(todayN, ...dates) - pad).slice(0, 8) + '01');
  const to = Math.max(todayN, ...dates) + pad;
  const W = (to - from + 1) * px;
  const x = n => (n - from) * px;

  // Scale: months on top; days (week zoom) or Mondays (month zoom) below; grid lines behind the rows.
  const months = [], ticks = [], lines = [];
  for (let n = from; n <= to;) {
    const d = new Date(n * DAY_MS);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS;
    const label = d.toLocaleDateString(locale(), { month: px < 5 ? 'short' : 'long', year: d.getUTCMonth() === 0 || n === from ? 'numeric' : undefined, timeZone: 'UTC' });
    months.push(`<div class="tl-month" style="left:${x(n)}px;width:${(Math.min(next, to + 1) - n) * px}px"><span>${esc(label)}</span></div>`);
    lines.push(`<i class="tl-line major" style="left:${x(n)}px"></i>`);
    n = next;
  }
  for (let n = from; n <= to; n++) {
    const d = new Date(n * DAY_MS), dow = d.getUTCDay(), dom = d.getUTCDate();
    if (px >= 18) {
      ticks.push(`<span class="tl-tick${dow === 0 || dow === 6 ? ' weekend' : ''}" style="left:${x(n)}px;width:${px}px">${dom}</span>`);
      if (dow === 6) lines.push(`<i class="tl-weekend" style="left:${x(n)}px;width:${px * 2}px"></i>`);
    } else if (px >= 4 && dow === 1) {
      ticks.push(`<span class="tl-tick" style="left:${x(n)}px">${dom}</span>`);
      if (dom !== 1) lines.push(`<i class="tl-line" style="left:${x(n)}px"></i>`);
    }
  }

  // A bar or (with dependencies shown) a dependency arrow can be selected, as in the map.
  const relSel = ui.tlDeps && db.relations.find(r => r.id === ui.mapRel && r.type === 'depends' && rows.some(x => x.item?.id === r.from) && rows.some(x => x.item?.id === r.to)) || null;
  const sel = !relSel && ui.mapSelected && rows.some(r => r.item?.id === ui.mapSelected) ? ui.mapSelected : null;
  const near = relSel ? new Set([relSel.from, relSel.to]) : neighbourhood(sel, db.relations);
  // Dates only for the item whose bar was clicked, while it stays selected.
  if (ui.tlDates !== sel) ui.tlDates = null;

  const geo = {};
  const body = rows.map((r, i) => {
    if (r.kind === 'group') return `<div class="tl-row tl-group"><div class="tl-label">${foldBtn('rest', r.label, r.collapsed)}${esc(r.label)}</div><div class="tl-track"></div></div>`;
    const { item, kind, depth } = r;
    const st = kind === 'goal' ? goalState(item) : activityState(item);
    const s = item.startDate, e = endOf(kind, item);
    const dateText = fmtSpan(s, e, true) || t('tl.noDates');
    let bar = `<span class="tl-nodates">${t('tl.noDates')}</span>`;
    if (s || e) {
      const a = dayNum(s || e), b = dayNum(e || s);
      const left = x(a), width = (b - a + 1) * px;
      const overdue = st === 'late' && e && dayNum(e) < todayN;
      const lateHtml = overdue ? `<i class="tl-overdue" style="left:${x(dayNum(e) + 1)}px;width:${(todayN - dayNum(e)) * px}px" title="${esc(t('tl.overdue', { date: fmtRel(e) }))}"></i>` : '';
      const tip = `${item.title}: ${dateText} (${t('nodeState.' + st)})`;
      // The selected item's bar can be dragged to new dates (see "Moving dates in the timeline").
      const drag = item.id === ui.tlDates ? ` tl-drag" data-tl-drag="${item.id}` : '';
      // Every row of an item, so an activity listed under several goals gets its arrows on each copy.
      const spot = s && e ? { start: left, end: left + width } : { start: left + px / 2 - 7, end: left + px / 2 + 7 };
      (geo[item.id] ||= []).push({ ...spot, y: i * ROW + ROW / 2, goal: r.goal });
      if (!s || !e) {
        const cx = left + px / 2;
        bar = `${lateHtml}<i class="tl-milestone glass ${kind} st-${st}${drag}" style="left:${cx}px" title="${esc(tip)}"></i><span class="tl-bar-label" style="left:${Math.max(cx + 14, overdue ? x(todayN + 1) + 6 : 0)}px">${esc(item.title)}</span>`;
      } else {
        const inside = width > item.title.length * 7.2 + 26;
        const pct = kind === 'goal' ? goalProgress(item) : null;
        const grips = drag && !fixedEnd(item) ? ['start', 'end'].map(edge => `<i class="tl-grip" data-tl-drag="${item.id}" data-tl-edge="${edge}" style="${tlGrip(edge, left, width)}"></i>`).join('') : '';
        bar = `${lateHtml}${grips}<div class="tl-bar glass ${kind} st-${st}${drag}" style="left:${left}px;width:${width}px" title="${esc(tip)}">${pct === null ? '' : `<i class="tl-progress" style="width:${pct.toFixed(1)}%"></i>`}${inside ? `<span>${esc(item.title)}</span>` : ''}</div>${inside ? '' : `<span class="tl-bar-label" style="left:${Math.max(left + width, overdue ? x(todayN + 1) : 0) + 8}px">${esc(item.title)}</span>`}`;
      }
    }
    if (s || e) bar += tlRoutineDays(item, from, to, x, px);
    const dim = (sel || relSel) && !near.has(item.id) ? 'dim' : '';
    const also = r.also ? t('tl.alsoUnder', { goals: r.also.join(', ') }) : '';
    const fold = r.fold ? foldBtn(item.id, item.title, r.collapsed) : '';
    return `<div class="tl-row ${kind} ${dim}${item.id === sel ? ' selected' : ''}" data-tl-node="${item.id}" tabindex="0" role="button" aria-haspopup="menu" aria-label="${esc([item.title, dateText, also].filter(Boolean).join(', '))}">
      <div class="tl-label" style="--depth:${depth}">${r.rel && r.parent !== undefined ? `<i class="tl-elbow${REL_TYPES[r.rel].dash ? ' dash' : ''}" style="--rel:${mapLineColour(REL_TYPES[r.rel].color)};--w:${REL_TYPES[r.rel].width || 1.1}px;--up:${i - r.parent - 1}" title="${esc(relLabel(r.rel))}"></i>` : ''}${fold}<span class="tl-dot ${kind} st-${st}"></span><span class="tl-text"><span class="tl-head-line"><span class="tl-title">${esc(item.title)}</span>${also ? `<span class="tl-also" title="${esc(also)}" aria-hidden="true">↻</span>` : ''}</span><span class="tl-dates">${esc(dateText)}</span></span></div>
      <div class="tl-track">${bar}</div>
    </div>`;
  }).join('');

  // Copies of the two ends that an arrow joins: each copy of either end gets one, to the other
  // end's copy under the same goal, or else to its nearest copy.
  const copyPairs = (froms, tos) => {
    const match = (c, list) => list.find(o => o.goal === c.goal) || list.reduce((a, b) => (Math.abs(b.y - c.y) < Math.abs(a.y - c.y) ? b : a));
    const pairs = [...froms.map(d => [match(d, tos), d]), ...tos.map(p => [p, match(p, froms)])];
    return pairs.filter(([p, d], i) => pairs.findIndex(([q, e]) => q === p && e === d) === i);
  };
  // Finish-to-start arrows: from the end of a prerequisite to the start of what depends on it, in straight runs with
  // square corners, drawn like the map's lines: each ends with a straight stretch (LEAD) and stops inside its arrowhead (TIP).
  const { LEAD, TIP } = MAP, depLine = REL_TYPES.depends;
  const deps = !ui.tlDeps ? '' : db.relations.filter(r => r.type === 'depends' && geo[r.from] && geo[r.to]).flatMap(r => copyPairs(geo[r.from], geo[r.to]).map(([p, d]) => {
    const x1 = p.end, y1 = p.y, x2 = d.start, y2 = d.y;
    const path = x2 - LEAD >= x1 + 6
      ? `M${x1},${y1} H${x2 - LEAD} V${y2} H${x2 - TIP}`
      : `M${x1},${y1} h8 V${y2 + (y2 > y1 ? -ROW / 2 : ROW / 2)} H${x2 - LEAD} V${y2} H${x2 - TIP}`;
    const dim = (sel && !(r.from === sel || r.to === sel)) || (relSel && r.id !== relSel.id) ? ' dim' : '';
    // A wide invisible twin makes the thin arrow easy to hit.
    return `<g class="tl-dep-g${dim}${r.id === relSel?.id ? ' sel' : ''}" data-rel-edit="${r.id}" tabindex="0" role="button" aria-pressed="${r.id === relSel?.id}" aria-label="${esc(t('map.relLabel', { rel: relText(r) }))}">
      <path class="tl-dep" d="${path}" style="stroke:${mapLineColour(depLine.color)};stroke-width:${depLine.width || 1.1}" stroke-dasharray="4 3" marker-end="url(#tl-arrow)"></path><path class="tl-dep-hit" d="${path}"></path><title>${esc(relText(r))}</title></g>`;
  })).join('');

  const zoom = Object.entries(TL.ZOOM).map(([z, p]) => `<button class="chip ${Math.abs(px - p) < 0.01 ? 'active' : ''}" data-tl-zoom="${z}">${t('tl.zoom.' + z)}</button>`).join('');
  return `
    ${categoryChips()}
    <div class="toolbar">
      ${goalSelect('timeline', ui.timelineGoal)}
      ${hideDoneToggle()}
      <button class="chip" data-tl-deps aria-pressed="${ui.tlDeps}">${t('tl.deps')}</button>
      ${tlAllFolded() ? `<button class="chip" data-tl-fold-all="expand">${t('tl.expandAll')}</button>` : `<button class="chip" data-tl-fold-all="collapse">${t('tl.collapseAll')}</button>`}
      <div class="chips" role="group" aria-label="${esc(t('tl.zoom'))}">${zoom}</div>
    </div>
    <div class="map-legend tl-legend"><span class="ctl-label">${t('map.status')}</span>${statusLegend()}<span><i class="swatch tl-overdue-swatch"></i>${esc(t('tl.overdueLegend'))}</span></div>
    ${rows.some(r => isRoutine(r.item) && !isFlexible(r.item)) ? `<div class="map-legend tl-legend"><span class="ctl-label">${t('tl.days')}</span>${['done', 'missed', 'due'].map(k => `<span><i class="swatch tl-day ${k}"></i>${esc(t('tl.day.' + k))}</span>`).join('')}</div>` : ''}
    <div class="map-legend tl-legend"><span class="ctl-label">${t('tl.links')}</span>${['contributes', 'subactivity', 'subgoal', ...(ui.tlDeps || rows.some(r => r.rel === 'depends') ? ['depends'] : [])].map(k =>
      `<span><i class="line-key${REL_TYPES[k].dash ? ' dash' : ''}" style="--rel:${mapLineColour(REL_TYPES[k].color)}"></i>${esc(relLabel(k))}</span>`).join('')}</div>
    ${rows.length ? `<div class="tl-scroll" data-focus-x="${Math.round(x(todayN) + 145)}" data-from="${from}" data-to="${to}">
      <div class="tl-inner" style="--tl-w:${W}px">
        <div class="tl-head">
          <div class="tl-corner"></div>
          <div class="tl-scale"><div class="tl-months">${months.join('')}</div><div class="tl-ticks">${ticks.join('')}</div>
            <span class="tl-today-flag" style="left:${x(todayN) + px / 2}px">${t('tl.today')}</span></div>
        </div>
        <div class="tl-body">
          <div class="tl-grid">${lines.join('')}<i class="tl-today" style="left:${x(todayN) + px / 2}px;width:${Math.max(px, 3)}px"></i></div>
          <svg class="tl-deps" width="${W}" height="${rows.length * ROW}">
            <defs>${arrowMarker('tl-arrow', depLine.color, 'auto')}${lineGlow(W, rows.length * ROW)}</defs>${deps}
          </svg>
          ${body}
        </div>
      </div>
    </div>` : `<div class="empty">${t('tl.noneShown')}</div>`}
    ${relSel ? mapRelSelection(relSel) : sel ? mapSelection(sel) + (geo[sel] ? `<p class="meta" style="margin-top:8px">${t(sel !== ui.tlDates ? 'tl.datesHint' : fixedEnd(findEntity(sel).item) ? 'tl.dragHintMove' : 'tl.dragHint')}</p>` : '') : `<p class="meta" style="margin-top:10px">${t('tl.hint')}</p>`}`;
}

/* ---------- Graphs (measurement history of each current state) ----------
   One line chart per current state: its measurements over time, a target line for every goal it
   measures (running to the goal's deadline), and the change since the first measurement. */

export const GR = { H: 210, L: 48, R: 14, T: 14, B: 26, MIN_W: 280, MAX_W: 960 };
export const grCharts = {}; // state id → points and scales, for the hover layer

// About `count` clean steps (1, 2 or 5 × 10ⁿ) covering lo–hi.
// `whole`: counts, so no step smaller than 1.
export function niceTicks(lo, hi, count = 4, whole = false) {
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
  const raw = whole ? Math.max((hi - lo) / count, 1) : (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw);
  const ticks = [];
  for (let v = Math.floor(lo / step) * step; ; v += step) {
    ticks.push(Number(v.toFixed(10)));
    if (v >= hi - step * 1e-9) break;
  }
  return ticks;
}

export function stateSeries(s) {
  return (s.history || []).filter(h => h.date && isNum(h.value))
    .map(h => ({ day: dayNum(h.date), date: h.date, value: Number(h.value) }))
    .sort((a, b) => a.day - b.day);
}

export function removeMeasurement(id, iso) {
  const s = db.states.find(x => x.id === id);
  const h = s?.history?.find(x => x.date === iso);
  if (!h || !confirm(t('confirm.deleteMeasurement', { value: withUnit(fmtNum(h.value), s.unit || ''), date: fmtDate(iso) }))) return;
  deleteMeasurement(s, iso);
  save();
  render();
  toast(t('toast.measurementDeleted'));
  // Keep the table open where it was.
  const card = $(`[data-gr="${id}"]`);
  if (card) { card.querySelector('.gr-table').open = true; card.querySelector('.gr-table summary').focus(); }
  else $(`[data-open="${id}"]`)?.focus();
}

// Change from the first to the latest measurement; `good` is null when no goal says which way is better.
export function stateChange(s, points, targets) {
  if (points.length < 2) return null;
  const first = points[0], last = points[points.length - 1];
  const delta = last.value - first.value;
  const pct = first.value ? delta / Math.abs(first.value) * 100 : null;
  const aim = targets.length ? Math.sign(targets[0].value - first.value) : 0;
  return { first, delta, pct, good: aim && delta ? Math.sign(delta) === aim : null };
}

export function signed(n) {
  let sign = '±';
  if (n > 0) sign = '+';
  else if (n < 0) sign = '−';
  return sign + fmtNum(Math.abs(n));
}

export function changeTag(s, change) {
  if (!change) return `<span class="tag">${t('gr.oneMeasurement')}</span>`;
  const { delta, pct, good, first } = change;
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '→';
  const cls = good === null ? '' : good ? 'ok' : 'bad';
  const text = withUnit(signed(delta), esc(s.unit || '')) + (pct === null ? '' : ` (${signed(Math.round(pct * 10) / 10)} %)`);
  return `<span class="tag gr-delta ${cls}"><span aria-hidden="true">${arrow}</span> ${text}</span>
    <span class="meta">${t('gr.since', { date: fmtRel(first.date) })}</span>`;
}

export function graphCard(s, width) {
  const points = stateSeries(s);
  const targets = relsFrom(s.id, 'measures').map(r => db.goals.find(g => g.id === r.to))
    .filter(g => g && !byActivities(g) && isNum(g.target))
    .map(g => ({ goal: g, value: Number(g.target), end: g.deadline ? dayNum(g.deadline) : null }));
  const change = stateChange(s, points, targets);
  const unit = s.unit || '';
  const last = points[points.length - 1];

  // Scales: time from the first measurement to the latest of today / last measurement / deadlines.
  const x0 = points[0].day;
  // Half a day past the latest, so today's column and the last dot are not cut in half at the edge.
  let x1 = Math.max(last.day + 0.5, dayNum(today()) + 0.5, ...targets.map(tg => tg.end || 0));
  if (x1 - x0 < 14) x1 = x0 + 14;
  const { W, zoom } = zoomedWidth(s.id, width, width, x1 - x0);
  const ticks = niceTicks(Math.min(...points.map(p => p.value), ...targets.map(tg => tg.value)), Math.max(...points.map(p => p.value), ...targets.map(tg => tg.value)));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const px = d => GR.L + (d - x0) / (x1 - x0) * (W - GR.L - GR.R);
  const py = v => GR.T + (1 - (v - y0) / (y1 - y0)) * (GR.H - GR.T - GR.B);
  grCharts[s.id] = { s, points, targets, change, px, py, unit, zoom };

  const grid = gridLines(ticks, py, W);
  const todayN = dayNum(today());
  const xAxis = dateAxis(px, x0, x1, W > width, true);
  const todayMark = todayCol(px, todayN - 0.5, x0, x1, W);
  const todayLine = todayMark?.svg || '';

  const targetLines = targets.map(tg => {
    const xe = px(tg.end && tg.end > x0 ? tg.end : x1);
    return `<line class="gr-target" x1="${GR.L}" x2="${xe}" y1="${py(tg.value)}" y2="${py(tg.value)}"/>
      ${tg.end && tg.end > x0 ? `<circle class="gr-target-end" cx="${xe}" cy="${py(tg.value)}" r="4"/>` : ''}`;
  }).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.day).toFixed(1)},${py(p.value).toFixed(1)}`).join(' ');
  const area = areaFill(s.id, `${path} L${px(last.day).toFixed(1)},${py(y0)} L${px(x0).toFixed(1)},${py(y0)} Z`);
  const dots = points.map(p => grDot(px(p.day), py(p.value), p === last)).join('');

  // Direct labels: each target at the start of its line, the latest value next to its dot – in the first
  // spot (above, below, right, left) that stays inside the plot and clear of the target labels.
  const textW = s => s.length * 7;
  const tLabels = targets.map(tg => {
    const ty = py(tg.value) + (py(tg.value) - GR.T < 16 ? 14 : -6);
    const text = t('gr.targetLabel', { value: withUnit(fmtNum(tg.value), unit) }) + (targets.length > 1 ? ` (${tg.goal.title})` : '');
    return { text, x: GR.L + 6, y: ty, box: [GR.L + 6, ty - 12, GR.L + 6 + textW(text), ty + 2] };
  });
  const targetLabels = tLabels.map(l => `<text class="gr-label muted" x="${l.x}" y="${l.y}">${esc(l.text)}</text>`).join('');
  const lx = px(last.day), ly = py(last.value);
  const vText = withUnit(fmtNum(last.value), unit), vw = textW(vText);
  const spots = [
    { x: lx, y: ly - 10, anchor: 'middle', box: [lx - vw / 2, ly - 22, lx + vw / 2, ly - 8] },
    { x: lx, y: ly + 20, anchor: 'middle', box: [lx - vw / 2, ly + 8, lx + vw / 2, ly + 22] },
    { x: lx + 9, y: ly + 4, anchor: 'start', box: [lx + 9, ly - 8, lx + 9 + vw, ly + 6] },
    { x: lx - 9, y: ly + 4, anchor: 'end', box: [lx - 9 - vw, ly - 8, lx - 9, ly + 6] },
  ];
  const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const inside = b => b[0] >= GR.L && b[2] <= W - GR.R && b[1] >= 0 && b[3] <= GR.H - GR.B;
  // Hard obstacles: target labels and the measurement line itself (sampled every few pixels).
  // The faint today line is avoided too when there is another free spot.
  const hard = tLabels.map(l => l.box);
  points.slice(1).forEach((p, i) => {
    const a = points[i], ax = px(a.day), ay = py(a.value), bx = px(p.day), by = py(p.value);
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
    for (let k = 0; k <= steps; k++) { const x = ax + (bx - ax) * k / steps, y = ay + (by - ay) * k / steps; hard.push([x - 1, y - 1, x + 1, y + 1]); }
  });
  const todayBox = todayMark ? [todayMark.box] : [];
  const free = (s, obstacles) => inside(s.box) && !obstacles.some(o => overlaps(s.box, o));
  const spot = spots.find(s => free(s, [...hard, ...todayBox])) || spots.find(s => free(s, hard)) || spots[0];
  const valueLabel = `<text class="gr-label" x="${spot.x}" y="${spot.y}" text-anchor="${spot.anchor}">${esc(vText)}</text>`;

  const legend = targets.length ? `<div class="gr-legend">
      <span><i class="key key-measure"></i>${t('gr.measurements')}</span>
      <span><i class="key key-target"></i>${esc(targets.length > 1 ? t('gr.targets') : t('gr.targetOf', { goal: targets[0].goal.title }))}</span>
    </div>` : '';

  // Newest first, each with a button to delete it.
  const rowsHtml = points.slice().reverse().map(p => {
    const del = t('gr.delete', { date: fmtDate(p.date) });
    return `<tr><td>${fmtRel(p.date, true)}</td><td>${esc(withUnit(fmtNum(p.value), unit))}</td><td>${p === points[0] ? '—' : esc(withUnit(signed(p.value - points[0].value), unit))}</td><td class="gr-del"><button type="button" class="btn small ghost" data-del-measure="${s.id}" data-date="${p.date}" title="${esc(del)}" aria-label="${esc(del)}">×</button></td></tr>`;
  }).join('');

  return `<article class="card glass gr-card" data-gr="${s.id}" data-ctx-item="${s.id}">
    <div class="card-head"><h3>${esc(s.title)}</h3><button class="btn small ghost" data-open="${s.id}">${t('btn.edit')}</button></div>
    <div class="gr-stats"><strong class="gr-value">${esc(withUnit(fmtNum(last.value), unit))}</strong>${changeTag(s, change)}</div>
    ${legend}
    <div class="gr-plot${W > width ? ' scroll' : ''}" tabindex="0" role="img" aria-label="${esc(t('gr.aria', { name: s.title }))}">
      <svg width="${W}" height="${GR.H}" viewBox="0 0 ${W} ${GR.H}" aria-hidden="true">
        ${grid}${todayLine}${area}${targetLines}<path class="gr-line" d="${path}"/>${dots}${targetLabels}${valueLabel}${xAxis}
        <line class="gr-cross" y1="${GR.T}" y2="${GR.H - GR.B}" hidden/>
        <circle class="gr-focus" r="6" hidden/>
      </svg>${W > width ? yAxisPinned(ticks, py) : ''}
      <div class="gr-tip" hidden></div>
    </div>
    <details class="gr-table"><summary>${t('gr.table')}</summary>
      <table><thead><tr><th>${t('gr.col.date')}</th><th>${t('gr.col.value')}</th><th>${t('gr.col.change')}</th><th><span class="sr-only">${t('gr.col.delete')}</span></th></tr></thead><tbody>${rowsHtml}</tbody></table>
    </details>
  </article>`;
}

// A routine's graph adds up its check-ins like a state's amounts, but on its own period's scale it
// shows what each period asks for.
export const graphFor = (item, width) => (isRoutine(item) && graphScale(item) === periodUnit(item) ? routineGraphCard(item, width)
  : !isRoutine(item) && !isCumulative(item) ? graphCard(item, width)
  : graphScale(item) === 'total' ? totalGraphCard(item, width) : periodGraphCard(item, width));
export let grDrawW = 0; // the width graphs were last drawn to fit

// Zoomed in, a graph is drawn wider and scrolls sideways; zoomed out, it is never narrower than the card,
// nor stretched past the timeline's closest zoom. `base` is its width unzoomed; `zoom` the range allowed.
export function zoomedWidth(id, base, width, days) {
  const zoom = [Math.min(width / base, 1), Math.max((GR.L + GR.R + days * TL.MAX) / base, 1)];
  return { W: Math.round(base * clamp(ui.grZoom[id] || 1, ...zoom)), zoom };
}

// Today is a faint column as wide as the day (never thinner than 3 px), a line down its middle, behind the data. `from` is where the day
// starts on the axis: a bar's day starts at its number, a measurement sits in the middle of its day.
export function todayCol(px, from, x0, x1, W, over = false) {
  if (from + 1 <= x0 || from >= x1) return null;
  // Over bars, the day keeps the bars' thin gap, so on a period's first or last day it stays inside the bar.
  const gap = over ? 1 : 0;
  const a = clamp(px(from), GR.L, W - GR.R) + gap, b = clamp(px(from + 1), GR.L, W - GR.R) - gap;
  const w = Math.max(b - a, 3), x = (a + b - w) / 2;
  return { svg: `<rect class="gr-today${over ? ' over' : ''}" x="${x}" y="${GR.T}" width="${w}" height="${GR.H - GR.T - GR.B}"/>
    <line class="gr-today-line" x1="${x + w / 2}" x2="${x + w / 2}" y1="${GR.T}" y2="${GR.H - GR.B}"/>`, box: [x, GR.T, x + w, GR.H - GR.B] };
}

// The value grid, its bottom line a little stronger, with the values beside it.
export const gridLines = (ticks, py, W) => ticks.map((v, i) => `<line class="gr-grid${i ? '' : ' base'}" x1="${GR.L}" x2="${W - GR.R}" y1="${py(v)}" y2="${py(v)}"/>`).join('') + yLabels(ticks, py);
// A point's dot on a line; the latest is larger.
export const grDot = (x, y, last) => `<circle class="gr-dot${last ? ' last' : ''}" cx="${x}" cy="${y}" r="${last ? 5 : 3.5}"/>`;
export const yLabels = (ticks, py) => ticks.map(v => `<text class="gr-axis" x="${GR.L - 8}" y="${py(v) + 4}" text-anchor="end">${esc(fmtNum(v))}</text>`).join('');
// A graph wider than the card scrolls under its values, which stay at the left like the timeline's labels.
export const yAxisPinned = (ticks, py) => `<svg class="gr-yaxis" width="${GR.L}" height="${GR.H}" style="margin-top:-${GR.H}px" aria-hidden="true">${yLabels(ticks, py)}</svg>`;

// Dates under a graph: where it starts and ends, and today when there is room. One wider than the card
// (zoomed in, or a long history of bars) also marks days, Mondays, months, quarters or years, about
// every 110 px – the first of these steps that leaves that much room.
export function dateAxis(px, x0, x1, wide, withToday) {
  const todayN = dayNum(today()), perDay = (px(x1) - px(x0)) / (x1 - x0);
  const ticks = [[x0, 'start', fmtDate(dayStr(x0))], [x1, 'end', fmtDate(dayStr(x1))]];
  const room = n => ticks.every(([m]) => Math.abs(px(m) - px(n)) > 80);
  if (withToday && todayN > x0 && todayN < x1 && room(todayN)) ticks.push([todayN, 'middle', fmtDate(today())]);
  if (wide) {
    const steps = [[1, () => true], [7, d => d.getUTCDay() === 1], [30, d => d.getUTCDate() === 1],
      [91, d => d.getUTCDate() === 1 && d.getUTCMonth() % 3 === 0], [365, d => d.getUTCDate() === 1 && d.getUTCMonth() === 0]];
    const [days, starts] = steps.find(([n]) => n * perDay >= 110) || steps.at(-1);
    const opts = days < 30 ? { day: 'numeric', month: 'short' } : days < 365 ? { month: 'short', year: 'numeric' } : { year: 'numeric' };
    for (let n = Math.ceil(x0); n < x1; n++) {
      if (starts(new Date(n * DAY_MS)) && room(n)) ticks.push([n, 'middle', fmtDay(dayStr(n), opts)]);
    }
  }
  return ticks.map(([n, anchor, text]) => `<text class="gr-axis" x="${px(n)}" y="${GR.H - 6}" text-anchor="${anchor}">${esc(text)}</text>`).join('');
}

// States with measurements or amounts, and routines with check-ins, have a graph.
export const hasGraph = item => (isRoutine(item) ? Object.values(item.checkins || {}).includes(1)
  : isCumulative(item) ? entriesOf(item).length > 0 : stateSeries(item).length > 0);

export function renderGraphs() {
  const routines = db.activities.filter(hasGraph);
  if (!db.states.length && !routines.length) return emptyState(t('states.emptyTitle'), t('states.emptyText'), 'state');
  const scope = scopeFor(ui.graphGoal);
  const list = db.states.filter(s => !scope || scope.state.has(s.id)).filter(matchesSearch);
  const withData = list.filter(hasGraph);
  const without = list.filter(s => !hasGraph(s));
  const kept = routines.filter(a => !scope || scope.activity.has(a.id)).filter(matchesSearch);
  // Cards take the full width of the view; charts are drawn at that pixel width so text stays crisp.
  const viewStyle = getComputedStyle(viewEl);
  const width = clamp(viewEl.clientWidth - parseFloat(viewStyle.paddingLeft) - parseFloat(viewStyle.paddingRight) - 38, GR.MIN_W, GR.MAX_W);
  Object.keys(grCharts).forEach(k => delete grCharts[k]);
  grDrawW = width;
  const cards = [...withData, ...kept].map(item => graphFor(item, width));
  return `${categoryChips()}
    <div class="toolbar">${goalSelect('graphs', ui.graphGoal)}${searchBox()}</div>
    ${cards.length ? `<div class="gr-list">${cards.join('')}</div>` : `<div class="empty">${t('gr.none')}</div>`}
    ${without.length ? `<p class="meta gr-without">${t('gr.without')} ${without.map(s => linkTag(s.id)).join(' ')}</p>` : ''}`;
}

/* ---------- Graphs of amounts that add up, and of routines ----------
   A state that adds up per period gets a bar for each period (the one under way lighter), one that
   adds up in total a step line of its running total; a routine gets a bar of check-ins for each of
   its periods, against what the period asks for. They share the line graph's hover layer: each
   point has its `day` (where the crosshair snaps) and its own tooltip rows (`tip`). */

// A soft wash under a line, fading to the bottom of the plot.
export const areaFill = (id, d) => `<defs><linearGradient id="gr-fill-${id}" x1="0" y1="0" x2="0" y2="1"><stop class="gr-fill-stop" offset="0"/><stop class="gr-fill-stop" offset="1" style="stop-opacity: 0"/></linearGradient></defs>
  <path class="gr-area" d="${d}" fill="url(#gr-fill-${id})"/>`;

export const GR_SLOT = 12; // the narrowest a period's bar gets; longer histories scroll sideways
// A bar's left edge and width in a period running from day `a` to day `b`: it fills the period, with
// a thin gap between neighbours, so the bars sit side by side.
export function barBox(px, a, b) {
  const slot = px(b) - px(a), w = Math.max(slot - 2, 1);
  return { x: px(a) + (slot - w) / 2, w };
}

// "Week of 20 Oct", "October 2026", "2026", "20 Oct 2026", or a range for longer periods.
export function periodLabel(unit, from, to) {
  if (calPeriod(unit, from).to !== to) return fmtRange(from, to);
  if (unit === 'week') return t('cu.weekOf', { date: fmtDay(from, { day: 'numeric', month: 'short' }) });
  if (unit === 'month') return fmtDay(from, { month: 'long', year: 'numeric' });
  if (unit === 'year') return from.slice(0, 4);
  return fmtDate(from);
}

// Goals a state measures with a target, for target lines. On a state that adds up, only those
// counting it as the graph shows it: a weekly target on monthly bars would mislead.
export const stateTargets = (s, scale) => relsFrom(s.id, 'measures').map(r => db.goals.find(g => g.id === r.to))
  .filter(g => g && ownMetric(g) && isNum(g.target) && (!scale || goalPeriod(g) === scale))
  .map(g => ({ goal: g, value: Number(g.target), end: g.deadline ? dayNum(g.deadline) : null }));

// The plot shared by bar and step graphs: grid, date axis, today, target lines and labels, and the
// hover layer. `marks` draws the data with the scales; `bars` widens a long history so it scrolls.
export function plotSvg(id, { points, targets = [], unit, from, to, bars = 0, marks, tip, aria, ys = [], whole = false }, width) {
  const todayN = dayNum(today());
  // Bars end with the period under way: weeks to a far deadline would only squeeze them.
  let x0 = from, x1 = bars ? to : Math.max(to, ...targets.map(tg => tg.end || 0));
  if (x1 - x0 < 14) x1 = x0 + 14;
  const base = bars ? Math.max(width, GR.L + GR.R + Math.ceil((x1 - x0) / ((to - from) / bars) * GR_SLOT)) : width;
  const { W, zoom } = zoomedWidth(id, base, width, x1 - x0);
  const values = [0, ...points.map(p => p.value), ...targets.map(tg => tg.value), ...ys];
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4, whole);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const px = d => GR.L + (d - x0) / (x1 - x0) * (W - GR.L - GR.R);
  const py = v => GR.T + (1 - (v - y0) / (y1 - y0)) * (GR.H - GR.T - GR.B);
  grCharts[id] = { points, targets, px, py, unit, tip, zoom };
  const grid = gridLines(ticks, py, W);
  const xAxis = dateAxis(px, x0, x1, W > width, !bars);
  // Over the bars, so today shows inside the period under way; behind a line.
  const todayLine = todayCol(px, bars ? todayN : todayN - 0.5, x0, x1, W, bars)?.svg || '';
  const targetLines = targets.map(tg => {
    const xe = px(tg.end && tg.end > x0 && tg.end < x1 ? tg.end : x1);
    const ty = py(tg.value) + (py(tg.value) - GR.T < 16 ? 14 : -6);
    const text = t('gr.targetLabel', { value: withUnit(fmtNum(tg.value), unit) }) + (targets.length > 1 ? ` (${tg.goal.title})` : '');
    return `<line class="gr-target" x1="${GR.L}" x2="${xe}" y1="${py(tg.value)}" y2="${py(tg.value)}"/>
      ${tg.end && tg.end > x0 && tg.end <= x1 ? `<circle class="gr-target-end" cx="${xe}" cy="${py(tg.value)}" r="4"/>` : ''}
      <text class="gr-label muted" x="${GR.L + 6}" y="${ty}">${esc(text)}</text>`;
  }).join('');
  return `<div class="gr-plot${W > width ? ' scroll' : ''}" tabindex="0" role="img" aria-label="${esc(aria)}">
      <svg width="${W}" height="${GR.H}" viewBox="0 0 ${W} ${GR.H}" aria-hidden="true">
        ${grid}${bars ? '' : todayLine}${marks(px, py)}${bars ? todayLine : ''}${targetLines}${xAxis}
        <line class="gr-cross" y1="${GR.T}" y2="${GR.H - GR.B}" hidden/>
        <circle class="gr-focus" r="6" hidden/>
      </svg>${W > width ? yAxisPinned(ticks, py) : ''}
      <div class="gr-tip" hidden></div>
    </div>`;
}

export const grLegend = items => `<div class="gr-legend">${items.map(([cls, text]) => `<span><i class="key ${cls}"></i>${esc(text)}</span>`).join('')}</div>`;
export const targetKey = targets => ['key-target', targets.length > 1 ? t('gr.targets') : t('gr.targetOf', { goal: targets[0].goal.title })];

export function grCardHtml(item, stats, legend, plot, table, scales = '') {
  return `<article class="card glass gr-card" data-gr="${item.id}" data-ctx-item="${item.id}">
    <div class="card-head"><h3>${esc(item.title)}</h3><button class="btn small ghost" data-open="${item.id}">${t('btn.edit')}</button></div>
    <div class="gr-stats">${stats}</div>
    ${scales}
    ${legend}
    ${plot}
    <details class="gr-table"><summary>${t('gr.table')}</summary>${table}</details>
  </article>`;
}

// Sums per day, week, month or year, or the running total, for a state that adds up or a routine.
export const scaleSwitch = s => `<div class="chips gr-scale" role="group" aria-label="${esc(t(isRoutine(s) ? 'cu.scaleLabelRoutine' : 'cu.scaleLabel'))}">${SCALES.map(k =>
  `<button class="chip ${k === graphScale(s) ? 'active' : ''}" data-gr-scale="${k}" data-state="${s.id}" aria-pressed="${k === graphScale(s)}">${t('cu.scale.' + k)}</button>`).join('')}</div>`;

export const entryDel = (s, e) => {
  const del = t('cu.deleteEntry', { value: withUnit(fmtNum(e.amount), s.unit || ''), date: fmtDate(e.date) });
  return `<td class="gr-del"><button type="button" class="btn small ghost" data-del-entry="${s.id}" data-entry="${e.id}" title="${esc(del)}" aria-label="${esc(del)}">×</button></td>`;
};

// A bar for each period; the change tag compares the last complete period with the one before.
// A routine's bars count its check-ins.
export function periodGraphCard(s, width) {
  const rt = isRoutine(s), unit = s.unit || '', now = today(), scale = graphScale(s), periods = periodTotals(s, scale), targets = rt ? [] : stateTargets(s, scale);
  const amount = n => (rt ? tp('rt.checkins', n) : withUnit(fmtNum(n), unit));
  const points = periods.map(p => {
    const a = dayNum(p.from), b = dayNum(p.to) + 1;
    return { ...p, value: p.total, day: (a + b) / 2, a, b, now: p.from <= now && p.to >= now };
  });
  const tip = p => [['gr-tip-value', amount(p.value)], ['gr-tip-date', periodLabel(scale, p.from, p.to)],
    ...(rt ? [] : [['gr-tip-row', tp('cu.entries', p.entries.length)]]),
    ...targets.map(tg => ['gr-tip-row', t('gr.tipTarget', { goal: tg.goal.title, value: withUnit(fmtNum(tg.value), unit) })])];
  const plot = plotSvg(s.id, {
    points, targets, unit, tip, from: points[0].a, to: points.at(-1).b, bars: points.length, whole: rt,
    aria: t(rt ? 'cu.routineAria' : 'cu.aria', { name: s.title }),
    marks: (px, py) => points.map(p => {
      const { x, w } = barBox(px, p.a, p.b), y = py(Math.max(0, p.value)), h = Math.abs(py(p.value) - py(0));
      return `<rect class="gr-bar${p.now ? ' now' : ''}" x="${x}" y="${p.value < 0 ? py(0) : y}" width="${w}" height="${h}" rx="2"/>`;
    }).join(''),
  }, width);
  // The last complete period against the one before it.
  const done = points.filter(p => p.to < now);
  const last = done.at(-1), prev = done.at(-2);
  let change = '';
  if (last && prev) {
    const delta = Number((last.value - prev.value).toFixed(9));
    const aim = targets.length ? Math.sign(targets[0].value - prev.value) : 0;
    const cls = !aim || !delta ? '' : Math.sign(delta) === aim ? 'ok' : 'bad';
    change = `<span class="tag gr-delta ${cls}"><span aria-hidden="true">${delta > 0 ? '▲' : delta < 0 ? '▼' : '→'}</span> ${esc(withUnit(signed(delta), unit))}</span>
      <span class="meta">${esc(t('cu.vsPrev.' + scale, { period: periodLabel(scale, last.from, last.to) }))}</span>`;
  }
  const legend = grLegend([['key-bar', t(rt ? 'cu.legendRoutine' : 'cu.legend.' + scale)], ...(targets.length ? [targetKey(targets)] : [])]);
  // A routine's check-ins are ticked on the routine, so its table lists only the periods.
  const rows = points.slice().reverse().map(p => rt ? `<tr><td>${esc(periodLabel(scale, p.from, p.to))}</td><td>${esc(amount(p.value))}</td></tr>`
    : `<tr class="gr-period"><td>${esc(periodLabel(scale, p.from, p.to))}</td><td><strong>${esc(amount(p.value))}</strong></td><td></td></tr>
    ${p.entries.slice().reverse().map(e => `<tr class="gr-entry"><td>${fmtRel(e.date, true)}</td><td>${esc(withUnit(fmtNum(e.amount), unit))}</td>${entryDel(s, e)}</tr>`).join('')}`).join('');
  const table = rt ? `<table><thead><tr><th>${t('cu.col.period')}</th><th>${t('cu.col.checkins')}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<table><thead><tr><th>${t('cu.col.period')}</th><th>${t('cu.col.amount')}</th><th><span class="sr-only">${t('gr.col.delete')}</span></th></tr></thead><tbody>${rows}</tbody></table>`;
  const value = rt ? t('cu.now.' + scale, { value: amount(points.find(p => p.now)?.value || 0) }) : scaleText(s, scale);
  return grCardHtml(s, `<strong class="gr-value">${esc(value)}</strong>${change}`, legend, plot, table, scaleSwitch(s));
}

// A step line of the running total; the tag shows what was added in the last 30 days.
export function totalGraphCard(s, width) {
  const rt = isRoutine(s), unit = s.unit || '', targets = rt ? [] : stateTargets(s, 'total'), entries = graphEntries(s).slice().sort((a, b) => a.date.localeCompare(b.date));
  const amount = n => (rt ? tp('rt.checkins', n) : withUnit(fmtNum(n), unit));
  const byDay = {};
  entries.forEach(e => (byDay[e.date] = (byDay[e.date] || 0) + Number(e.amount)));
  let sum = 0;
  const points = Object.keys(byDay).sort().map(date => ({ date, day: dayNum(date), added: Number(byDay[date].toFixed(9)), value: (sum = Number((sum + byDay[date]).toFixed(9))) }));
  const todayN = dayNum(today()), end = Math.max(points.at(-1).day, todayN);
  const tip = p => [['gr-tip-value', amount(p.value)], ['gr-tip-date', fmtRel(p.date, true)],
    ...(rt ? [] : [['gr-tip-row', t('cu.tipAdded', { value: withUnit(signed(p.added), unit) })]]),
    ...targets.map(tg => ['gr-tip-row', t('gr.tipTarget', { goal: tg.goal.title, value: withUnit(fmtNum(tg.value), unit) })])];
  const plot = plotSvg(s.id, {
    points, targets, unit, tip, from: points[0].day, to: end + 0.5, whole: rt, aria: t(rt ? 'cu.routineAria' : 'cu.aria', { name: s.title }),
    marks: (px, py) => {
      const path = points.map((p, i) => (i ? `H${px(p.day).toFixed(1)}V${py(p.value).toFixed(1)}` : `M${px(p.day).toFixed(1)},${py(p.value).toFixed(1)}`)).join('') + `H${px(end).toFixed(1)}`;
      const area = areaFill(s.id, `${path}V${py(0).toFixed(1)}H${px(points[0].day).toFixed(1)}Z`);
      return `${area}<path class="gr-line" d="${path}"/>${points.map((p, i) => grDot(px(p.day), py(p.value), i === points.length - 1)).join('')}`;
    },
  }, width);
  const recent = sumOf(entries.filter(e => e.date > dayStr(todayN - 30) && e.date <= today()));
  const total = rt ? t('cu.inTotal', { value: amount(entries.length) }) : totalText(s);
  const stats = `<strong class="gr-value">${esc(total)}</strong><span class="tag gr-delta ${recent > 0 ? 'ok' : ''}">${esc(withUnit(signed(recent), unit))}</span><span class="meta">${t('cu.last30')}</span>`;
  const legend = grLegend([['key-measure', t('cu.legend.total')], ...(targets.length ? [targetKey(targets)] : [])]);
  let running = sumOf(entries);
  // A routine's table lists the days it was done, with the count so far.
  const rows = entries.slice().reverse().map(e => {
    const row = rt ? `<tr><td>${fmtRel(e.date, true)}</td><td>${esc(fmtNum(running))}</td></tr>`
      : `<tr><td>${fmtRel(e.date, true)}</td><td>${esc(withUnit(fmtNum(e.amount), unit))}</td><td>${esc(withUnit(fmtNum(running), unit))}</td>${entryDel(s, e)}</tr>`;
    running = Number((running - Number(e.amount)).toFixed(9));
    return row;
  }).join('');
  const table = rt ? `<table><thead><tr><th>${t('gr.col.date')}</th><th>${t('cu.col.total')}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<table><thead><tr><th>${t('gr.col.date')}</th><th>${t('cu.col.amount')}</th><th>${t('cu.col.total')}</th><th><span class="sr-only">${t('gr.col.delete')}</span></th></tr></thead><tbody>${rows}</tbody></table>`;
  return grCardHtml(s, stats, legend, plot, table, scaleSwitch(s));
}

// Check-ins in each of a routine's periods, against what the period asks for (met: filled in).
export function routineGraphCard(a, width) {
  const now = today(), end = a.dueDate && a.dueDate < now ? a.dueDate : now;
  const ticked = Object.keys(a.checkins || {}).filter(d => a.checkins[d] === 1).sort();
  const first = ticked[0] < routineStart(a) ? ticked[0] : routineStart(a);
  const points = [];
  for (let p = periodOf(a, first); p.from <= end && points.length < 2000; p = periodOf(a, addDays(p.to, 1))) {
    const pr = periodProgress(a, p.from), x0 = dayNum(p.from), x1 = dayNum(p.to) + 1;
    points.push({ ...p, value: pr.done, target: pr.target, met: pr.met, day: (x0 + x1) / 2, a: x0, b: x1, now: p.from <= now && p.to >= now });
  }
  const unit = periodUnit(a);
  const tip = p => [['gr-tip-value', t('cu.ofTarget', { done: p.value, target: p.target })], ['gr-tip-date', periodLabel(unit, p.from, p.to)]];
  const plot = plotSvg(a.id, {
    points, unit: '', tip, ys: points.map(p => p.target), whole: true,
    from: points[0].a, to: points.at(-1).b, bars: points.length, aria: t('cu.routineAria', { name: a.title }),
    marks: (px, py) => points.map(p => {
      const { x, w } = barBox(px, p.a, p.b);
      return `<rect class="gr-bar${p.met ? ' met' : ''}${p.now ? ' now' : ''}" x="${x}" y="${py(p.value)}" width="${w}" height="${py(0) - py(p.value)}" rx="2"/>
        ${p.target ? `<line class="gr-goal" x1="${x}" x2="${x + w}" y1="${py(p.target)}" y2="${py(p.target)}"/>` : ''}`;
    }).join(''),
  }, width);
  const streak = routineStreak(a);
  const stats = `<strong class="gr-value">${esc(periodText(a))}</strong>${streak.n ? `<span class="tag ok">${esc(streakText(streak))}</span>` : ''}`;
  const legend = grLegend([['key-bar', t('cu.legendRoutine')], ['key-goal', t('cu.legendAsks')]]);
  const rows = points.slice().reverse().map(p => `<tr><td>${esc(periodLabel(unit, p.from, p.to))}</td><td>${esc(t('cu.ofTarget', { done: p.value, target: p.target }))}</td><td>${p.met ? '✓' : ''}</td></tr>`).join('');
  const table = `<table><thead><tr><th>${t('cu.col.period')}</th><th>${t('cu.col.checkins')}</th><th>${t('cu.col.met')}</th></tr></thead><tbody>${rows}</tbody></table>`;
  return grCardHtml(a, stats, legend, plot, table, scaleSwitch(a));
}

// Hover / touch / keyboard: a crosshair snaps to the nearest measurement and a tooltip lists its values.
export function showGraphPoint(plot, i) {
  const c = grCharts[plot.closest('[data-gr]').dataset.gr];
  const p = c.points[clamp(i, 0, c.points.length - 1)];
  plot.dataset.i = c.points.indexOf(p);
  const cx = c.px(p.day), cy = c.py(p.value);
  const cross = plot.querySelector('.gr-cross'), focus = plot.querySelector('.gr-focus'), tip = plot.querySelector('.gr-tip');
  cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.hidden = false;
  focus.setAttribute('cx', cx); focus.setAttribute('cy', cy); focus.hidden = false;
  // Built with textContent: titles and units are user text.
  tip.replaceChildren();
  const row = (cls, text) => { const el = document.createElement('div'); el.className = cls; el.textContent = text; tip.append(el); };
  if (c.tip) c.tip(p).forEach(([cls, text]) => row(cls, text));
  else {
    row('gr-tip-value', withUnit(fmtNum(p.value), c.unit));
    row('gr-tip-date', fmtRel(p.date, true));
    if (p !== c.points[0]) row('gr-tip-row', t('gr.tipChange', { value: withUnit(signed(p.value - c.points[0].value), c.unit) }));
    c.targets.forEach(tg => row('gr-tip-row', t('gr.tipTarget', { goal: tg.goal.title, value: withUnit(fmtNum(tg.value), c.unit) })));
  }
  tip.hidden = false;
  // The chart's own width: a long one scrolls inside the plot.
  const w = Number(plot.querySelector('svg').getAttribute('width'));
  tip.style.left = `${clamp(cx + 12, 0, w - tip.offsetWidth)}px`;
  tip.style.top = `${clamp(cy - tip.offsetHeight - 10, 0, GR.H - tip.offsetHeight)}px`;
  if (cx + 12 + tip.offsetWidth > w) tip.style.left = `${Math.max(0, cx - 12 - tip.offsetWidth)}px`;
  // Keys can move to a bar scrolled out of sight.
  if (cx < plot.scrollLeft + GR.L || cx > plot.scrollLeft + plot.clientWidth - GR.R) plot.scrollLeft = cx - plot.clientWidth / 2;
}

export function hideGraphPoint(plot) {
  plot.querySelectorAll('.gr-cross, .gr-focus, .gr-tip').forEach(el => (el.hidden = true));
  delete plot.dataset.i;
}

export function nearestPoint(plot, clientX) {
  const c = grCharts[plot.closest('[data-gr]').dataset.gr];
  const x = clientX - plot.querySelector('svg').getBoundingClientRect().left;
  let best = 0;
  c.points.forEach((p, i) => { if (Math.abs(c.px(p.day) - x) < Math.abs(c.px(c.points[best].day) - x)) best = i; });
  return best;
}

['pointermove', 'pointerdown'].forEach(type => viewEl.addEventListener(type, e => {
  const plot = e.target.closest('.gr-plot');
  if (plot) showGraphPoint(plot, nearestPoint(plot, e.clientX));
}));
viewEl.addEventListener('pointerout', e => {
  const plot = e.target.closest('.gr-plot');
  if (plot && !plot.contains(e.relatedTarget) && document.activeElement !== plot) hideGraphPoint(plot);
});
viewEl.addEventListener('focusin', e => {
  if (e.target.matches('.gr-plot')) showGraphPoint(e.target, grCharts[e.target.closest('[data-gr]').dataset.gr].points.length - 1);
});
viewEl.addEventListener('focusout', e => { if (e.target.matches('.gr-plot')) hideGraphPoint(e.target); });
viewEl.addEventListener('keydown', e => {
  const plot = e.target.closest?.('.gr-plot');
  if (!plot) return;
  const n = grCharts[plot.closest('[data-gr]').dataset.gr].points.length;
  const i = Number(plot.dataset.i ?? n - 1);
  const factor = { '+': 1.25, '=': 1.25, '-': 0.8 }[e.key];
  if (factor && !e.ctrlKey && !e.metaKey) {
    // Around the point the crosshair is on.
    e.preventDefault();
    const c = grCharts[plot.closest('[data-gr]').dataset.gr];
    zoomGraph(plot, factor, plot.querySelector('svg').getBoundingClientRect().left + c.px(c.points[clamp(i, 0, n - 1)].day));
    return showGraphPoint(plot, i);
  }
  const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  showGraphPoint(plot, next);
});
// Charts are drawn at the view's pixel width, so redraw them when it changes.
export let grResize = null;
addEventListener('resize', () => {
  clearTimeout(grResize);
  grResize = setTimeout(() => { if (ui.view === 'graphs' && !modal.open) render(); }, 150);
});

/* =========================================================
   Events
   ========================================================= */

// The graph of a state that adds up, or of a routine, shows another scale; it is kept on the item.
export function setGraphScale(id, scale) {
  const s = db.states.find(x => x.id === id) || db.activities.find(x => x.id === id && isRoutine(x));
  if (!s || !SCALES.includes(scale)) return;
  s.scale = scale;
  save();
  render();
  $(`[data-gr="${id}"] [data-gr-scale="${scale}"]`)?.focus();
}

export function removeEntry(id, entryId) {
  const s = db.states.find(x => x.id === id);
  const e = s?.entries?.find(x => x.id === entryId);
  if (!e || !confirm(t('confirm.deleteMeasurement', { value: withUnit(fmtNum(e.amount), s.unit || ''), date: fmtDate(e.date) }))) return;
  deleteEntry(s, entryId);
  save();
  render();
  toast(t('toast.measurementDeleted'));
  // Keep the table (or the form's list) open where it was.
  const card = $(`[data-gr="${id}"]`);
  if (card) { card.querySelector('.gr-table').open = true; card.querySelector('.gr-table summary').focus(); }
}

// On the map and the timeline (where links are drawn between kinds), what to add: under the Add button, or at x, y
// for a right-click on the map's empty space.
export function openAddMenu(x, y, byKey) {
  Object.assign(ctxMenu.dataset, { id: '', rel: '', add: '1' });
  ctxMenu.setAttribute('aria-label', t('add.item'));
  showCtxMenu('', '', '', ['goal', 'activity', 'state', ...(ui.view === 'map' ? ['vision'] : [])].map(k => ({ act: 'new:' + k, label: t('add.' + k) })), x, y, byKey);
}

/* ---------- Map context menu: right-click, long-press, or the context-menu key ---------- */

// Map boxes and timeline rows both act as item "nodes".
export const NODE_SEL = '[data-map-node],[data-tl-node]';
// The menu also opens on the cards and rows of the other views (on a chart, only on its heading).
export const MENU_SEL = `${NODE_SEL},[data-ctx-item]`;
export const nodeId = el => el?.dataset.mapNode || el?.dataset.tlNode || el?.dataset.ctxItem;
export const LONG_PRESS_MS = 500;

export function ctxOptions(kind, item) {
  const opt = (act, label, extra = {}) => ({ act, label, ...extra });
  if (kind === 'vision') return [
    opt('edit', t('btn.edit')), ...(ui.view === 'map' ? [opt('highlight', t('ctx.highlight'))] : []), '-', opt('add:vision:parents', t('ctx.addSubvision')),
    '-', ...SHOW_IN.vision.filter(v => v !== ui.view).map(v => opt('show:' + v, t('ctx.showInView', { view: t('nav.' + v) }), { icon: v })),
    ...(ui.view === 'map' ? [opt('link', t('ctx.link'))] : []), '-', opt('delete', t('btn.delete'), { danger: true }),
  ];
  // Highlighting links and showing one goal only mean something where links are drawn.
  const options = [opt('edit', t('btn.edit')), ...(selectsInView() ? [opt('highlight', t('ctx.highlight'))] : [])];
  if (kind === 'goal') {
    options.push(
      ...(selectsInView() ? [opt('focus', t('ctx.focus'))] : []),
      '-',
      item.status === 'achieved' ? opt('status:active', t('ctx.reactivate')) : opt('status:achieved', t('ctx.markAchieved')),
      '-',
      opt('add:goal:subgoal', t('ctx.addSubgoal')),
      opt('add:activity:contributes', t('ctx.addActivityGoal')),
    );
  } else if (isRoutine(item)) {
    if (runsOn(item, today())) options.push('-', opt('checkin', t('rt.doneTodayShort'), { checked: checkedOn(item, today()) }));
  } else if (kind === 'activity') {
    options.push(
      '-',
      ...ACTIVITY_STATUS.map(s => opt('status:' + s, t('activity.' + s), { checked: item.status === s })),
      '-',
      opt('add:activity:subactivity', t('ctx.addSubactivity')),
    );
  } else {
    options.push('-', opt('value', t(isCumulative(item) ? 'ctx.addAmount' : 'ctx.addValue')), opt('add:activity:improves', t('ctx.addActivityState')));
  }
  // "Show in…" opens in place onto the other views, each with its name and icon from the navigation
  // (the full name is the accessible name and tooltip); with only one, it is offered directly.
  const views = SHOW_IN[kind].filter(v => v !== ui.view && (v !== 'graphs' || hasGraph(item)));
  const showOpt = v => opt('show:' + v, t('nav.' + v), { icon: v, name: t('ctx.showInView', { view: t('nav.' + v) }) });
  if (views.length > 1) options.push('-', { label: t('ctx.showIn'), sub: views.map(showOpt) });
  else if (views.length) options.push('-', opt('show:' + views[0], t('ctx.showInView', { view: t('nav.' + views[0]) }), { icon: views[0] }));
  options.push(opt('link', t('ctx.link')), '-', opt('delete', t('btn.delete'), { danger: true }));
  return options;
}

// The views each kind of item appears in (graphs: only states with measurements or amounts, and
// routines with check-ins).
export const SHOW_IN = { vision: ['visions', 'map'], goal: ['goals', 'map', 'timeline'], activity: ['activities', 'map', 'timeline', 'graphs'], state: ['states', 'map', 'graphs'] };

// Switches to another view with the item selected there (map, timeline) or its card brought into
// view, first changing the filters there that would hide it (setView clears the search).
export function showIn(view, id) {
  const { kind, item } = findEntity(id);
  revealIn(view, kind, item);
  prefs.set('category', ui.category);
  if (view === 'map' || view === 'timeline') Object.assign(ui, { mapSelected: id, mapRel: null });
  setView(view);
  const el = view === 'map' ? $(`[data-map-node="${id}"]`)
    : view === 'timeline' ? $(`[data-tl-node="${id}"]`)
    : view === 'graphs' ? $(`[data-gr="${id}"]`) : $(`.card[data-open="${id}"]`);
  if (!el) return;
  // In the timeline, the bar (or milestone) rather than the start of the row.
  (el.querySelector('.tl-bar, .tl-milestone') || el).scrollIntoView({ block: 'center', inline: 'center' });
  if (el.tabIndex >= 0) return el.focus({ preventScroll: true });
  el.classList.add('flash');
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
}

// Changes only the filters that hide the item in a view: the goal status shown (to all), the done
// items hidden (shown again), the goal picked (to all), the category (to one the item belongs to –
// a goal's own, then those of the goals it is linked to – or else to all) and, in the timeline,
// the folded goals it is under.
export function revealIn(view, kind, item) {
  // On the map every vision shows once no goal or category is picked and none are hidden.
  if (kind === 'vision') {
    if (view === 'map') { Object.assign(ui, { mapGoal: '', category: '' }); if (ui.hideVisions) { ui.hideVisions = false; prefs.set('hideVisions', false); } }
    return;
  }
  if (view === 'goals') {
    if (ui.goalFilter !== 'all' && item.status !== ui.goalFilter) ui.goalFilter = 'all';
    if (!inCategory(item)) ui.category = item.category || '';
    return;
  }
  const field = GOAL_FILTERS[view === 'activities' ? 'activity' : view];
  if (!field) return;
  const done = kind === 'goal' || view === 'activities' ? isComplete(kind, item) : item.status === 'done';
  if (ui.hideDone && view !== 'graphs' && kind !== 'state' && done) { ui.hideDone = false; prefs.set('hideDone', false); }
  const shows = () => { const s = scopeFor(ui[field]); return !s || s[kind].has(item.id); };
  if (!shows()) ui[field] = '';
  if (!shows()) {
    const own = kind === 'goal' ? [item.category] : relsFrom(item.id).map(r => findEntity(r.to)?.item.category);
    const holds = c => db.goals.some(g => g.category === c && goalScope(g.id)[kind].has(item.id));
    ui.category = [...own, ...categories()].find(c => c && holds(c)) || '';
  }
  if (view !== 'timeline') return;
  // Unfold only what hides it: every fold is kept that still leaves it shown.
  const scope = scopeFor(ui.timelineGoal), folded = tlCollapsed();
  const shown = set => timelineRows(scope, set).some(r => r.item?.id === item.id);
  if (!shown(folded) && shown(new Set())) setTlCollapsed([...folded].reduce((keep, k) => (shown(new Set([...keep, k])) ? keep.add(k) : keep), new Set()));
}

export function openCtxMenu(id, x, y, byKey = false) {
  const ent = findEntity(id);
  if (!ent) return;
  Object.assign(ctxMenu.dataset, { id, rel: '', add: '' });
  ctxMenu.setAttribute('aria-label', t('ctx.label', { name: ent.item.title }));
  showCtxMenu(ent.kind, t('kind.' + ent.kind), ent.item.title, ctxOptions(ent.kind, ent.item), x, y, byKey);
}

// A relationship line's menu (long-press, right-click or the menu key): it selects the line and
// offers what the selection row below offers.
export function openRelMenu(relId, x, y, byKey = false) {
  const r = db.relations.find(x => x.id === relId) || visionRel(relId);
  if (!r) return;
  Object.assign(ui, { mapRel: relId, mapSelected: null });
  render();
  Object.assign(ctxMenu.dataset, { id: '', rel: relId, add: '' });
  ctxMenu.setAttribute('aria-label', t('map.relLabel', { rel: relText(r) }));
  showCtxMenu('', t('kind.relation'), relText(r), [
    { act: 'rel-edit', label: t('btn.edit') }, { act: 'rel-remove', label: t('btn.remove'), danger: true }, { act: 'rel-deselect', label: t('btn.deselect') },
  ], x, y, byKey);
}

// The menu of a relationship line, or else of an item.
export const openMenuAt = (line, node, x, y) => (line ? openRelMenu(line.dataset.relEdit, x, y) : openCtxMenu(nodeId(node), x, y));

export function runRelAction(act, relId) {
  closeCtxMenu();
  if (act === 'rel-edit') return openForm('relation', relId);
  if (act === 'rel-remove') return removeRelation(relId);
  ui.mapRel = null;
  render();
}

export function runCtxAction(act, id) {
  const ent = findEntity(id);
  closeCtxMenu();
  if (!ent) return;
  const { kind, item } = ent;
  const [verb, arg, type] = act.split(':');
  if (verb === 'edit') return openForm(kind, id);
  if (verb === 'checkin') return toggleCheckin(id, today());
  // The popup opens by what the menu was opened on: a card, a box on the map, or a graph's heading (not the tall graph).
  if (verb === 'value') { const at = $(`[data-ctx-item="${id}"], [data-map-node="${id}"]`); return openStateValue(id, at?.querySelector(':scope.gr-card > .card-head') || at || viewEl); }
  if (verb === 'highlight') { ui.mapSelected = id; return render(); }
  if (verb === 'show') return showIn(arg, id);
  if (verb === 'focus') {
    Object.assign(ui, { [ui.view === 'timeline' ? 'timelineGoal' : 'mapGoal']: id, mapRefocus: true });
    if (!inCategory(item)) ui.category = '';
    return render();
  }
  if (verb === 'add') return openForm(arg, null, { [type]: [id], category: kind === 'goal' ? item.category : '' });
  if (verb === 'link') return ui.view === 'map' ? startMapLink(id) : openForm('relation', null, { from: id });
  if (verb === 'status') {
    item.status = arg;
    save();
    render();
    const waits = kind === 'activity' && arg === 'done' ? blockers(item) : [];
    return toast(waits.length ? t('acts.notDone', { name: waits[0].title }) : t('ctx.statusSet', { s: t(`${kind}.${arg}`) }));
  }
  if (verb === 'delete' && confirm(t('confirm.delete', { name: item.title }))) {
    removeEntity(kind, id);
    Object.values(GOAL_FILTERS).forEach(k => { if (ui[k] === id) ui[k] = ''; });
    save();
    render();
    toast(t('toast.deleted.' + kind));
  }
}

viewEl.addEventListener('contextmenu', e => {
  // Phones may report a still finger of a pinch as a long-press.
  if (tlDrag?.touch || pinch) return e.preventDefault();
  const node = e.target.closest(MENU_SEL), line = e.target.closest('[data-rel-edit]');
  if (!node && !line) {
    // The map's empty space offers what the Add button does.
    if (ui.view === 'map' && e.target.closest('.map-wrap')) { e.preventDefault(); openAddMenu(e.clientX, e.clientY, false); }
    return;
  }
  e.preventDefault();
  openMenuAt(line, node, e.clientX, e.clientY);
});

// Long-press for touch screens (iOS Safari never fires contextmenu).
export let press = null;
viewEl.addEventListener('pointerdown', e => {
  const node = e.target.closest(MENU_SEL), line = e.target.closest('[data-rel-edit]');
  if ((!node && !line) || e.pointerType === 'mouse' || e.target.closest('[data-tl-drag]')) return;
  // A second finger (a pinch starting) must not leave the first one's wait running.
  if (press) clearTimeout(press.timer);
  const p = { x: e.clientX, y: e.clientY, fired: false };
  p.timer = setTimeout(() => { p.fired = true; openMenuAt(line, node, p.x, p.y + 12); }, LONG_PRESS_MS);
  press = p;
});
viewEl.addEventListener('pointermove', e => {
  if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; }
});
['pointerup', 'pointercancel'].forEach(type => viewEl.addEventListener(type, () => press && clearTimeout(press.timer)));
// The click that ends a long-press must not also toggle highlighting or hit a menu item. Phones often
// send no click at all when the finger lifts, so a new touch ends the wait; otherwise the first tap on
// the menu would be swallowed instead.
document.addEventListener('click', e => {
  if (press?.fired) { e.stopPropagation(); e.preventDefault(); }
  press = null;
}, true);
document.addEventListener('pointerdown', () => { if (press?.fired) press = null; }, true);

/* ---------- Zoom: ctrl + scroll, pinch, trackpad gestures ---------- */
// The map scales as a whole; the timeline and the graphs only stretch their time axis. All keep the point
// under the pointer (or between the fingers) in place.

export function zoomMap(scale, cx, cy) {
  const wrap = $('.map-wrap'), svg = wrap?.querySelector('svg');
  const s0 = ui.mapScale, s = clamp(scale, MAP.MIN_SCALE, MAP.MAX_SCALE);
  if (!svg || s === s0) return;
  const before = svg.getBoundingClientRect();
  const u = (cx - before.left) / s0, v = (cy - before.top) / s0;
  const [, , width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
  svg.setAttribute('width', width * s);
  svg.setAttribute('height', height * s);
  const after = svg.getBoundingClientRect();
  wrap.scrollLeft += after.left + u * s - cx;
  wrap.scrollTop += after.top + v * s - cy;
  ui.mapScale = s;
  prefs.set('mapScale', s);
  $('.zoom-pct').textContent = `${Math.round(s * 100)} %`;
}

export function zoomTimeline(factor, cx) {
  const p0 = ui.tlPx, p = clamp(p0 * factor, TL.MIN, TL.MAX);
  if (!$('.tl-scale') || p === p0) return;
  // Anchor on the day under the pointer, but never on the sticky label column.
  const at = () => ({ left: $('.tl-scale').getBoundingClientRect().left, from: Number($('.tl-scroll').dataset.from) });
  const x = Math.max(cx, $('.tl-corner').getBoundingClientRect().right);
  const b = at(), day = (x - b.left) / p0 + b.from;
  ui.tlPx = p;
  prefs.set('tlPx', p);
  render();
  const a = at();
  $('.tl-scroll').scrollLeft += a.left + (day - a.from) * p - x;
}

// Only that graph is redrawn, into the same element, so a pinch that started on it keeps going.
export function zoomGraph(plot, factor, cx) {
  const id = plot.closest('[data-gr]')?.dataset.gr, c = grCharts[id], item = id && findEntity(id)?.item;
  if (!c || !item) return;
  const z0 = clamp(ui.grZoom[id] || 1, ...c.zoom), z = clamp(z0 * factor, ...c.zoom);
  if (z === z0) return;
  const svg = plot.querySelector('svg'), w0 = Number(svg.getAttribute('width'));
  const u = (cx - svg.getBoundingClientRect().left - GR.L) / (w0 - GR.L - GR.R);
  ui.grZoom[id] = z;
  const fresh = document.createElement('div');
  fresh.innerHTML = graphFor(item, grDrawW);
  const next = fresh.querySelector('.gr-plot');
  plot.className = next.className;
  plot.replaceChildren(...next.childNodes);
  const now = plot.querySelector('svg'), w = Number(now.getAttribute('width'));
  plot.scrollLeft += now.getBoundingClientRect().left + GR.L + u * (w - GR.L - GR.R) - cx;
}

// Coalesce bursts of wheel / touch events into one zoom per frame.
export let zoomQueue = null;
export function queueZoom(wrap, factor, cx, cy) {
  if (zoomQueue) return Object.assign(zoomQueue, { factor: zoomQueue.factor * factor, cx, cy });
  zoomQueue = { wrap, factor, cx, cy };
  requestAnimationFrame(() => {
    const z = zoomQueue;
    zoomQueue = null;
    if (z.wrap.classList.contains('map-wrap')) zoomMap(ui.mapScale * z.factor, z.cx, z.cy);
    else if (z.wrap.classList.contains('gr-plot')) zoomGraph(z.wrap, z.factor, z.cx);
    else zoomTimeline(z.factor, z.cx);
  });
}
export const ZOOM_SEL = '.map-wrap, .tl-scroll, .gr-plot';

// Ctrl + wheel; trackpad pinch in Chrome, Edge and Firefox also arrives as ctrl + wheel.
viewEl.addEventListener('wheel', e => {
  const wrap = e.ctrlKey && e.target.closest(ZOOM_SEL);
  if (!wrap) return;
  e.preventDefault();
  const dy = e.deltaY * ([1, 16, 400][e.deltaMode] ?? 1); // deltaMode: pixels, lines or pages
  queueZoom(wrap, Math.exp(-clamp(dy, -100, 100) * 0.0025), e.clientX, e.clientY);
}, { passive: false });

// Two-finger pinch on touch screens. Touch events keep going to the element each finger started on,
// even after re-rendering the timeline detaches it, so the handlers are attached to those elements.
export let pinch = null;
export const touchGap = ([a, b]) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
export function pinchMove(e) {
  if (!pinch || e.touches.length !== 2) return;
  if (e.cancelable) e.preventDefault();
  const gap = touchGap(e.touches), [a, b] = e.touches;
  queueZoom(pinch.wrap, gap / pinch.gap, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
  pinch.gap = gap;
}
export function pinchEnd(e) {
  if (!pinch || e.touches.length >= 2) return;
  pinch.targets.forEach(el => {
    el.removeEventListener('touchmove', pinchMove);
    ['touchend', 'touchcancel'].forEach(type => el.removeEventListener(type, pinchEnd));
  });
  pinch = null;
}
viewEl.addEventListener('touchstart', e => {
  const wrap = e.touches.length === 2 && e.target.closest(ZOOM_SEL);
  if (!wrap) return;
  pinch = { wrap, gap: touchGap(e.touches), targets: new Set([...e.touches].map(x => x.target)) };
  pinch.targets.forEach(el => {
    el.addEventListener('touchmove', pinchMove, { passive: false });
    ['touchend', 'touchcancel'].forEach(type => el.addEventListener(type, pinchEnd));
  });
  if (press) { clearTimeout(press.timer); press = null; }
  // Nor does a pinch pick up the selected timeline bar.
  if (tlDrag && !tlDrag.moved) endTlDrag(false);
}, { passive: true });

// One-finger zoom on touch screens: tap, then touch again and drag – down zooms in, up zooms out,
// around the point first tapped. A second tap that doesn't move stays a double-tap (which edits).
export const TAP_ZOOM = { GAP_MS: 300, NEAR: 30, START: 8, RATE: 0.01 };
export let lastTap = null, tapZoom = null;
export function tapZoomMove(e) {
  if (!tapZoom || e.touches.length !== 1) return;
  // From the first move on, so the drag never starts scrolling the view instead.
  if (e.cancelable) e.preventDefault();
  const y = e.touches[0].clientY;
  if (!tapZoom.moved) {
    if (Math.abs(y - tapZoom.y0) < TAP_ZOOM.START) return;
    tapZoom.moved = true;
    if (press) { clearTimeout(press.timer); press = null; }
    if (tlDrag && !tlDrag.moved) endTlDrag(false);
  }
  queueZoom(tapZoom.wrap, Math.exp((y - tapZoom.y) * TAP_ZOOM.RATE), tapZoom.x, tapZoom.y0);
  tapZoom.y = y;
}
export function tapZoomEnd() {
  const z = tapZoom;
  if (!z) return;
  z.target.removeEventListener('touchmove', tapZoomMove);
  ['touchend', 'touchcancel'].forEach(type => z.target.removeEventListener(type, tapZoomEnd));
  // Keep it until the click the lifted finger may produce has been swallowed (see below).
  setTimeout(() => { if (tapZoom === z) tapZoom = null; });
}
export let touchDown = null; // where and when the current one-finger touch began
viewEl.addEventListener('touchstart', e => {
  const t = e.touches.length === 1 && e.touches[0], prev = lastTap;
  touchDown = t && { x: t.clientX, y: t.clientY, t: e.timeStamp };
  lastTap = null;
  const wrap = t && e.target.closest(ZOOM_SEL);
  if (!wrap || !prev || e.timeStamp - prev.t > TAP_ZOOM.GAP_MS || Math.hypot(t.clientX - prev.x, t.clientY - prev.y) > TAP_ZOOM.NEAR) return;
  tapZoom = { wrap, target: e.target, x: prev.x, y0: t.clientY, y: t.clientY, moved: false };
  e.target.addEventListener('touchmove', tapZoomMove, { passive: false });
  ['touchend', 'touchcancel'].forEach(type => e.target.addEventListener(type, tapZoomEnd));
}, { passive: true });
// A tap: one finger, down and up quickly, without moving. Only a tap can start a tap-and-drag.
viewEl.addEventListener('touchend', e => {
  const t = e.changedTouches[0], down = touchDown;
  touchDown = null;
  const tap = down && t && !e.touches.length && !tapZoom && e.timeStamp - down.t < TAP_ZOOM.GAP_MS && Math.hypot(t.clientX - down.x, t.clientY - down.y) < TAP_ZOOM.START;
  lastTap = tap ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
});

// Click and drag with the mouse pans the map, the timeline and a zoomed graph (touch screens pan natively).
export let pan = null;
viewEl.addEventListener('pointerdown', e => {
  const wrap = e.pointerType === 'mouse' && e.button === 0 && !e.target.closest('[data-map-node],[data-tl-drag]') && e.target.closest(ZOOM_SEL);
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  if (e.clientX - r.left - wrap.clientLeft >= wrap.clientWidth || e.clientY - r.top - wrap.clientTop >= wrap.clientHeight) return; // scrollbar
  pan = { wrap, id: e.pointerId, x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!pan || e.pointerId !== pan.id) return;
  const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
  if (!pan.moved) {
    if (Math.hypot(dx, dy) < 5) return;
    // Capture only once dragging starts, so a plain click still reaches the box under the pointer.
    pan.moved = true;
    pan.wrap.setPointerCapture(e.pointerId);
    pan.wrap.classList.add('panning');
    getSelection().removeAllRanges();
  }
  pan.wrap.scrollLeft = pan.left - dx;
  pan.wrap.scrollTop = pan.top - dy;
});
['pointerup', 'pointercancel'].forEach(type => document.addEventListener(type, e => {
  if (!pan || e.pointerId !== pan.id) return;
  pan.wrap.classList.remove('panning');
  // Keep the drag until the click it may produce has been swallowed below.
  setTimeout(() => { pan = null; });
}));
// The click that ends a drag (panning, or linking two boxes) must not select a box.
document.addEventListener('click', e => {
  if (pan?.moved || linkDrag?.moved || tapZoom?.moved) { e.stopPropagation(); e.preventDefault(); }
}, true);

/* ---------- Linking two map boxes ----------
   With a mouse, drag from one box to another; releasing anywhere but another box drops the link.
   On touch screens (where dragging scrolls), choose "Link to…" in a box's long-press menu, then tap
   the other box. Either way the relationship form opens with only the types that fit the two items. */

export function startMapLink(id) {
  ui.mapLinkFrom = id;
  ui.mapSelected = null;
  render();
}

// Whether any relationship fits two items, in either direction.
export const canLink = (a, b) => (findVision(a) || findVision(b) ? !visionLinkError(a, b) : possibleTypes(a, b).length > 0 || possibleTypes(b, a).length > 0);
export const LINK_MARKS = ['link-source', 'link-target', 'link-bad'];

export function linkItems(from, to) {
  if (findVision(from) || findVision(to)) return linkVision(from, to);
  if (!canLink(from, to))
    return toast(t('map.linkNone', { a: findEntity(from).item.title, b: findEntity(to).item.title }));
  openForm('relation', null, { from, to });
}

export let linkDrag = null; // { from, id, x, y, moved, line, target }
// A point on the screen in the map's own coordinates.
export function mapPoint(svg, x, y) {
  const p = svg.createSVGPoint();
  Object.assign(p, { x, y });
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
viewEl.addEventListener('pointerdown', e => {
  const node = e.pointerType === 'mouse' && e.button === 0 && e.target.closest('[data-map-node]');
  if (node) linkDrag = { from: node.dataset.mapNode, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!linkDrag || e.pointerId !== linkDrag.id) return;
  const svg = $('.map-wrap svg'), src = $(`[data-map-node="${linkDrag.from}"]`);
  if (!svg || !src) return endLinkDrag();
  if (!linkDrag.moved) {
    if (Math.hypot(e.clientX - linkDrag.x, e.clientY - linkDrag.y) < 5) return;
    linkDrag.moved = true;
    const r = src.getBoundingClientRect(), c = mapPoint(svg, r.left + r.width / 2, r.top + r.height / 2);
    svg.insertAdjacentHTML('beforeend', `<line class="link-line" x1="${c.x}" y1="${c.y}" x2="${c.x}" y2="${c.y}"></line>`);
    linkDrag.line = svg.lastElementChild;
    src.classList.add('link-source');
    $('.map-wrap').classList.add('linking');
    getSelection().removeAllRanges();
  }
  const p = mapPoint(svg, e.clientX, e.clientY);
  linkDrag.line.setAttribute('x2', p.x);
  linkDrag.line.setAttribute('y2', p.y);
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-map-node]');
  const to = over && over !== src ? over.dataset.mapNode : null;
  if (to === linkDrag.target) return;
  svg.querySelector('.link-target, .link-bad')?.classList.remove(...LINK_MARKS.slice(1));
  linkDrag.target = to;
  if (to) over.classList.add(canLink(linkDrag.from, to) ? 'link-target' : 'link-bad');
});
// Clears the drag's line and marks; the drag itself is kept until the click it may produce has been swallowed.
export function endLinkDrag() {
  const done = linkDrag;
  if (!done) return {};
  done.ended = true;
  done.line?.remove();
  document.querySelectorAll(LINK_MARKS.map(c => '.' + c).join()).forEach(n => n.classList.remove(...LINK_MARKS));
  $('.map-wrap')?.classList.remove('linking');
  setTimeout(() => { if (linkDrag === done) linkDrag = null; });
  return done;
}
document.addEventListener('pointerup', e => {
  if (!linkDrag || e.pointerId !== linkDrag.id || linkDrag.ended) return;
  const { moved, from } = endLinkDrag();
  if (!moved) return;
  const to = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-map-node]')?.dataset.mapNode;
  if (to && to !== from) linkItems(from, to);
});
document.addEventListener('pointercancel', e => { if (linkDrag && e.pointerId === linkDrag.id) endLinkDrag(); });
// Escape drops a link being dragged or picked.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || modal.open || !ctxMenu.hidden) return;
  if (linkDrag?.moved && !linkDrag.ended) endLinkDrag();
  else if (tlDrag) endTlDrag(false);
  else if (ui.mapLinkFrom) { ui.mapLinkFrom = null; render(); }
  else if (selectsInView() && (ui.mapSelected || ui.mapRel) && !document.querySelector('dialog[open]')) { ui.mapSelected = ui.mapRel = null; render(); }
});

/* ---------- Moving dates in the timeline ----------
   The selected item's bar can be dragged along the time axis: from its middle it moves both dates,
   from one of its grips only that date. With a mouse the drag starts once the pointer moves; on touch
   screens (where dragging scrolls) after a long-press, and a long-press let go without moving still
   opens the menu. The bar follows whole days as it goes; the dates are saved when it is let go, and
   Esc puts it back. */

export let tlDrag = null; // { id, kind, edge, s0, e0, lo, hi, x, y, pointerId, touch, armed, moved, days, timer }
export let tlDragClick = false; // the click that ends a drag must not toggle the selection

// The dates the drag has reached: each end keeps at least the length the item's form asks for.
export function tlDragDates(d, days = d.days) {
  const min = d.kind === 'goal' ? 1 : 0;
  let s = d.s0, e = d.e0;
  if (d.edge === 'start') s = dayStr(Math.min(dayNum(d.s0) + days, dayNum(d.e0) - min));
  else if (d.edge === 'end') e = dayStr(Math.max(dayNum(d.e0) + days, dayNum(d.s0) + min));
  else { s = s && addDays(s, days); e = e && addDays(e, days); }
  const item = findEntity(d.id)?.item;
  if (item && fixedEnd(item)) e = lastOccurrence({ ...item, startDate: s }, item.repeat.count) || e;
  return { s, e };
}

// Redraws the dragged item's bar (in every row it is listed in) without redrawing the timeline.
export function previewTlDrag(d) {
  const scroll = $('.tl-scroll');
  if (!scroll) return;
  const { s, e } = tlDragDates(d), px = ui.tlPx, from = Number(scroll.dataset.from);
  const a = dayNum(s || e), b = dayNum(e || s), left = (a - from) * px, width = (b - a + 1) * px;
  document.querySelectorAll(`[data-tl-node="${d.id}"]`).forEach(row => {
    row.querySelector('.tl-overdue')?.remove();
    const bar = row.querySelector('.tl-bar'), dot = row.querySelector('.tl-milestone'), label = row.querySelector('.tl-bar-label');
    if (bar) Object.assign(bar.style, { left: `${left}px`, width: `${width}px` });
    if (dot) dot.style.left = `${left + px / 2}px`;
    if (label) label.style.left = `${bar ? left + width + 8 : left + px / 2 + 14}px`;
    row.querySelectorAll('[data-tl-edge]').forEach(g => { g.style.cssText = tlGrip(g.dataset.tlEdge, left, width); });
    row.querySelector('.tl-dates').textContent = fmtSpan(s, e, true);
  });
  showTlDragTip(d, s, e);
}

// A label above the dragged bar with the date (or dates) it would get, over the end that moves.
// On touch screens it stays clear of the finger.
export function showTlDragTip(d, s, e) {
  const mark = $(`[data-tl-node="${d.id}"] :is(.tl-bar, .tl-milestone)`);
  if (!mark) return;
  let tip = $('.tl-drag-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tl-drag-tip';
    tip.setAttribute('role', 'status');
    document.body.append(tip);
  }
  const endKey = d.kind === 'goal' ? 'f.deadline' : 'f.dueDate';
  tip.textContent = d.edge ? `${t(d.edge === 'start' ? 'f.startDate' : endKey)}: ${fmtRel(d.edge === 'start' ? s : e)}` : fmtSpan(s, e, true);
  const r = mark.getBoundingClientRect(), w = tip.offsetWidth;
  const x = d.edge === 'start' ? r.left : d.edge === 'end' ? r.right : r.left + r.width / 2;
  const top = Math.min(r.top, d.touch ? d.cy - 40 : r.top) - 8;
  tip.style.left = `${clamp(x - w / 2, 8, innerWidth - w - 8)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

export function startTlDrag(d) {
  d.moved = true;
  $('.tl-scroll')?.classList.add('tl-dragging', d.edge ? 'tl-resizing' : 'tl-moving');
  getSelection().removeAllRanges();
}

// Saves the new dates (or, with `keep` false, puts the bar back) and redraws the timeline.
export function endTlDrag(keep) {
  const d = tlDrag;
  if (!d) return;
  clearTimeout(d.timer);
  tlDrag = null;
  tlDragClick = d.moved || d.armed;
  $('.tl-scroll')?.classList.remove('tl-dragging', 'tl-resizing', 'tl-moving');
  $('.tl-drag-tip')?.remove();
  d.target?.removeEventListener('touchmove', tlDragTouchMove);
  const ent = findEntity(d.id);
  if (!keep || !d.days || !ent) return d.moved && render();
  const { s, e } = tlDragDates(d);
  if (d.s0) ent.item.startDate = s;
  if (d.e0 || fixedEnd(ent.item)) ent.item[ent.kind === 'goal' ? 'deadline' : 'dueDate'] = e;
  save();
  render();
  toast(t('tl.datesMoved', { name: ent.item.title, dates: fmtSpan(s, e, true) }));
}

// Once a long-press has picked the bar up, moving the finger drags it instead of scrolling.
export function tlDragTouchMove(e) {
  if (tlDrag?.armed && e.cancelable) e.preventDefault();
}

viewEl.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-tl-drag]'), ent = el && findEntity(el.dataset.tlDrag);
  if (!ent || (e.pointerType === 'mouse' && e.button !== 0) || tlDrag) return;
  const { kind, item } = ent, edge = el.dataset.tlEdge || '';
  const s0 = item.startDate || '', e0 = endOf(kind, item) || '';
  // How far the drag may go: to the ends of the timeline as drawn.
  const scroll = $('.tl-scroll'), from = Number(scroll.dataset.from), to = Number(scroll.dataset.to);
  const ends = (edge === 'start' ? [s0] : edge === 'end' ? [e0] : [s0, e0]).filter(Boolean).map(dayNum);
  const d = tlDrag = { id: item.id, kind, edge, s0, e0, lo: from - Math.min(...ends), hi: to - Math.max(...ends),
    x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch: e.pointerType !== 'mouse', armed: false, moved: false, days: 0 };
  if (!d.touch) return;
  // Touch events keep going to the element the finger started on, even after a redraw detaches it.
  d.target = e.target;
  d.target.addEventListener('touchmove', tlDragTouchMove, { passive: false });
  d.timer = setTimeout(() => {
    d.armed = true;
    $('.tl-scroll')?.classList.add('tl-dragging');
    navigator.vibrate?.(15);
  }, LONG_PRESS_MS);
});
document.addEventListener('pointermove', e => {
  const d = tlDrag;
  if (!d || e.pointerId !== d.pointerId) return;
  const dx = e.clientX - d.x;
  d.cy = e.clientY;
  if (!d.moved) {
    const far = Math.hypot(dx, e.clientY - d.y);
    // A finger that moves before the long-press is up scrolls the timeline as usual.
    if (d.touch && !d.armed) return far > 10 && endTlDrag(false);
    if (far < 4) return;
    startTlDrag(d);
    if (!d.days) previewTlDrag(d);
  }
  const days = clamp(Math.round(dx / ui.tlPx), d.lo, d.hi);
  if (days === d.days) return;
  d.days = days;
  previewTlDrag(d);
});
document.addEventListener('pointerup', e => {
  const d = tlDrag;
  if (!d || e.pointerId !== d.pointerId) return;
  // A long-press let go where it started opens the menu, as it does elsewhere.
  if (d.armed && !d.moved) {
    endTlDrag(false);
    return openCtxMenu(d.id, d.x, d.y + 12);
  }
  endTlDrag(true);
});
document.addEventListener('pointercancel', e => { if (tlDrag && e.pointerId === tlDrag.pointerId) endTlDrag(false); });
document.addEventListener('click', e => {
  if (tlDragClick) { e.stopPropagation(); e.preventDefault(); }
  tlDragClick = false;
}, true);
document.addEventListener('pointerdown', () => { tlDragClick = false; }, true);

// Safari: trackpad pinch on macOS arrives as gesture events; on iOS they duplicate the touches above.
export let gesture = null;
export function gestureChange(e) {
  e.preventDefault();
  if (!pinch) queueZoom(gesture.wrap, e.scale / gesture.scale, e.clientX, e.clientY);
  gesture.scale = e.scale;
}
export function gestureEnd() {
  gesture.target.removeEventListener('gesturechange', gestureChange);
  gesture.target.removeEventListener('gestureend', gestureEnd);
  gesture = null;
}
viewEl.addEventListener('gesturestart', e => {
  const wrap = e.target.closest?.(ZOOM_SEL);
  if (!wrap) return;
  e.preventDefault();
  gesture = { wrap, target: e.target, scale: 1 };
  e.target.addEventListener('gesturechange', gestureChange);
  e.target.addEventListener('gestureend', gestureEnd);
});

viewEl.addEventListener('keydown', e => {
  const line = e.target.closest?.('[data-rel-edit]'), menuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
  if (line && menuKey) {
    e.preventDefault();
    const box = line.getBoundingClientRect();
    return openRelMenu(line.dataset.relEdit, box.left + box.width / 2, box.top + box.height / 2, true);
  }
  if (line && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    return openForm('relation', line.dataset.relEdit);
  }
  const node = e.target.closest?.(NODE_SEL);
  // A fold button inside a timeline row handles its own keys.
  if (!node || e.target.closest('[data-tl-fold]')) return;
  if (menuKey) {
    e.preventDefault();
    const r = node.getBoundingClientRect();
    openCtxMenu(nodeId(node), r.left + 16, r.bottom + 4, true);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const id = nodeId(node), ent = findEntity(id);
    if (ui.mapSelected === id && ent) return openForm(ent.kind, id);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
});

viewEl.addEventListener('dblclick', e => {
  const id = nodeId(e.target.closest(NODE_SEL));
  const ent = id && findEntity(id);
  if (ent && !modal.open) openForm(ent.kind, id);
});

// In the map and the timeline, with nothing being typed and no dialog or menu open: Delete (or
// Backspace, the Mac's delete key) removes the selected or focused line at once, or asks before
// deleting the selected or focused item; Enter or Space opens what is selected.
export const selectsInView = () => ui.view === 'map' || ui.view === 'timeline';
export const relShown = id => !!id && !!$(`[data-rel-edit="${id}"]`);
export const itemShown = id => !!id && !!$(`[data-map-node="${id}"],[data-tl-node="${id}"]`);
document.addEventListener('keydown', e => {
  if (!selectsInView() || document.querySelector('dialog[open]') || !ctxMenu.hidden) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const edgeEl = e.target.closest?.('[data-rel-edit]'), nodeEl = e.target.closest?.(NODE_SEL);
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const relId = edgeEl?.dataset.relEdit || (!nodeEl && relShown(ui.mapRel) ? ui.mapRel : '');
    const id = !relId && (nodeId(nodeEl) || (itemShown(ui.mapSelected) ? ui.mapSelected : ''));
    if (!relId && !id) return;
    e.preventDefault();
    return relId ? removeRelation(relId) : askDeleteItem(id);
  }
  if ((e.key === 'Enter' || e.key === ' ') && !edgeEl && !nodeEl && !e.target.closest?.('button, a, [tabindex]')) {
    const ent = itemShown(ui.mapSelected) && findEntity(ui.mapSelected);
    if (relShown(ui.mapRel)) openForm('relation', ui.mapRel);
    else if (ent) openForm(ent.kind, ui.mapSelected);
    else return;
    e.preventDefault();
  }
});

ctxMenu.addEventListener('click', e => {
  if (e.target.closest('[data-ctx-sub]')) return toggleCtxSub($('#ctxSub').hidden);
  const b = e.target.closest('[data-ctx]');
  if (b && ctxMenu.dataset.add) { closeCtxMenu(); openForm(b.dataset.ctx.slice(4)); }
  else if (b && ctxMenu.dataset.rel) runRelAction(b.dataset.ctx, ctxMenu.dataset.rel);
  else if (b) runCtxAction(b.dataset.ctx, ctxMenu.dataset.id);
});

/* ---------- Boot ---------- */

// Loads the current user's plans, visions and preferences and shows them; true on their first visit.
export function bootUser() {
  // First visit = nothing stored yet; load() creates the first plan, so check before it.
  let firstVisit = false;
  try { firstVisit = !userStorage.getItem(PLANS_KEY) && !userStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  setTheme(THEMES.includes(prefs.get('theme')) ? prefs.get('theme') : 'system');
  applyTheme();
  load();
  renderPlanSwitch();
  if (VIEWS[prefs.get('view')]) ui.view = prefs.get('view');
  ui.mapHidden = new Set([].concat(prefs.get('mapHidden', [])).filter(k => REL_TYPES[k] || VISION_RELS[k]));
  ui.hideDone = prefs.get('hideDone', false) === true;
  ui.hideVisions = prefs.get('hideVisions', false) === true;
  ui.nextAll = prefs.get('nextAll', false) === true;
  ui.tlDeps = prefs.get('tlDeps', true) !== false;
  ui.planBadges = prefs.get('planBadges', true) !== false;
  ui.tlPx = clamp(Number(prefs.get('tlPx', TL.ZOOM[prefs.get('tlZoom')] || TL.ZOOM.month)) || TL.ZOOM.month, TL.MIN, TL.MAX);
  ui.mapScale = clamp(Number(prefs.get('mapScale', 1)) || 1, MAP.MIN_SCALE, MAP.MAX_SCALE);
  ui.category = typeof prefs.get('category') === 'string' ? prefs.get('category') : '';
  ui.help = prefs.get('help', false) === true;
  ui.navCollapsed = prefs.get('navCollapsed', false) === true;
  applyNavCollapsed();
  $('#helpBtn').setAttribute('aria-pressed', ui.help);
  render();
  return firstVisit;
}

// Another user takes over this device: nothing of the one before stays in memory, on screen or
// in a sync on its way (syncNow stops itself). Returns true on that user's first visit.
export function enterUser(id) {
  if (isTourRunning()) endTour(false);
  closeCtxMenu();
  closeAmountPop();
  reachedQueue.length = 0; // "goal reached" popups still waiting were the other user's
  hideToast(); // an undo in it would act on the other user's plan
  document.querySelectorAll('dialog[open]').forEach(d => { if (d !== settings) d.close(); });
  clearTimeout(syncState.timer);
  Object.assign(syncState, { status: 'idle', again: false, timer: null });
  drive.token = null;
  users.current = id;
  saveUsers();
  Object.keys(ui).forEach(k => delete ui[k]);
  Object.assign(ui, freshUi());
  storedHealth.clear();
  setOtherPlansCache({ key: '', list: [] });
  setPlans({ current: null, list: [] });
  setDb(emptyDb());
  const firstVisit = bootUser();
  renderSettings();
  renderSync();
  return firstVisit;
}
