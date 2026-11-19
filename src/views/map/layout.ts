/** Map layout: where each box and line goes (layers, order, placement); geometry only. */
import type { ItemKind, RelType, VisionRel } from '../../core/model';
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

// LEAD: the straight stretch each line ends with, a little longer than its arrowhead (10). TIP: how far short
// of where it points a line stops; its arrowhead covers the rest, so even a thick line ends inside the head's wide back.
export const MAP = {
  NW: 172,
  NH: 56,
  HG: 18,
  DG: 8,
  DW: 10,
  VG: 62,
  PAD: 20,
  HEAD: 34,
  BAND_GAP: 12,
  LEAD: 14,
  TIP: 8,
  MIN_SCALE: 0.25,
  MAX_SCALE: 3,
  VISION_LINE: 6,
};

// Map boxes are slabs of milk glass, lit by a broad light (a panel, like a window) to the left of and a little
// above the map. Their side, along the bottom and the right and round the corners, is cut into slivers, each
// shaded by the way it faces the light and how far it is from it; the face shows the light's soft reflection.
// Goals are cut from thicker glass. The face's tint and clarity are in the CSS (--glass-tint, --glass-alpha).
export const GLASS = {
  R: 6,
  DEPTH: { goal: 6, other: 3.5 },
  LIGHT: [-77, -11, 60],
  EYE: [86, 28, 300],
  GLOSS: 25,
  // quiet: the side of grey boxes still to do or waiting, as --glass-side-quiet does for cards (by night it matches sideTint).
  day: { sideTint: 0.5, quiet: 0.6, deepen: 0, ambient: 0.97, reflect: 0.3, spec: 0.75, faceShade: 0.03 },
  // By night only the brightness changes (on the dark base more tint would look lighter), and states take more colour.
  night: { sideTint: 0.38, stateTint: 0.46, deepen: 0, ambient: 0.75, reflect: 0.14, spec: 0.16, faceShade: 0.08 },
};
export const glassThickness = (n: { kind?: string }) => (n.kind === 'goal' ? 'goal' : 'other');
export const glassDepth = (n: { kind?: string }) => GLASS.DEPTH[glassThickness(n)];

// What the layout takes: the boxes of each kind, and the lines between them (relationships and links to visions).
export type MapItems = Partial<Record<ItemKind, { id: string }[]>>;
export interface MapLink {
  id: string;
  from: string;
  to: string;
  type: RelType | VisionRel;
}
export type Point = [number, number];
// A box, or a dummy: one layer's slot of a line that spans several. i, b and x are set as the layout goes.
export interface MapNode {
  id: string;
  kind?: ItemKind;
  layer: number;
  w: number;
  dummy?: boolean;
  toVision?: boolean;
  i: number;
  b: number;
  x: number;
}
export interface Layer {
  list: MapNode[];
  y: number;
}
export interface Band {
  kind: ItemKind;
  first: number;
  last: number;
  top: number;
  bottom: number;
}
// A line: between neighbours in one layer (same, a and b), or down through the layers (chain, pts and line).
// d is its SVG path.
export interface MapChain {
  r: MapLink;
  a?: MapNode;
  b?: MapNode;
  same?: boolean;
  chain?: MapNode[];
  reversed?: boolean;
  pts?: (Point | null)[];
  line?: Point[];
  d?: string;
}
interface Port {
  c: MapChain;
  k: number;
  other: MapNode;
}

export function layoutMap(items: MapItems, rels: MapLink[]) {
  const { NW, NH, HG, DG, DW, VG, PAD, HEAD, BAND_GAP, LEAD, TIP, VISION_LINE } = MAP;
  const kindOf: Record<string, string> = {};
  Object.entries(items).forEach(([k, list]) => list.forEach(x => (kindOf[x.id] = k)));

  // 1. Layering (visions: a broader vision above those that serve it)
  const above: Record<string, string[]> = {};
  rels.forEach(r => {
    if (kindOf[r.from] !== kindOf[r.to] || kindOf[r.from] === 'state') return;
    if (r.type === 'subgoal' || r.type === 'subactivity' || r.type === 'subvision') (above[r.from] ||= []).push(r.to);
    if (r.type === 'depends') (above[r.to] ||= []).push(r.from);
  });
  const depth: Record<string, number> = {},
    visiting = new Set<string>();
  const depthOf = (id: string): number => {
    if (depth[id] !== undefined) return depth[id];
    if (visiting.has(id)) return 0; // mixed parent/dependency loop – ignore the back edge
    visiting.add(id);
    const d = Math.max(-1, ...(above[id] || []).map(depthOf)) + 1;
    visiting.delete(id);
    return (depth[id] = d);
  };

  // Goals sit as low as they can, next to the activities: counted up from the bottom of their band.
  const below: Record<string, string[]> = {};
  Object.entries(above).forEach(([id, ups]) => ups.forEach(u => (below[u] ||= []).push(id)));
  const height: Record<string, number> = {};
  const heightOf = (id: string): number => {
    if (height[id] !== undefined) return height[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const h = Math.max(-1, ...(below[id] || []).map(heightOf)) + 1;
    visiting.delete(id);
    return (height[id] = h);
  };

  const layers: Layer[] = [],
    bands: Band[] = [],
    node: Record<string, MapNode> = {};
  (['vision', 'goal', 'activity', 'state'] as const).forEach(kind => {
    if (!items[kind]?.length) return;
    const base = layers.length;
    const levelOf = kind === 'goal' ? heightOf : depthOf;
    const maxDepth = Math.max(...items[kind].map(it => levelOf(it.id)));
    for (let i = 0; i <= maxDepth; i++) layers.push({ list: [] as MapNode[] } as Layer);
    items[kind].forEach(it => {
      const n = {
        id: it.id,
        kind,
        layer: base + (kind === 'goal' ? maxDepth - height[it.id] : depth[it.id]),
        w: NW,
      } as MapNode;
      node[it.id] = n;
      layers[n.layer].list.push(n);
    });
    bands.push({ kind, first: base, last: layers.length - 1 } as Band);
  });

  // 2. Dummy nodes for edges that skip layers
  const chains = rels.map((r): MapChain => {
    const a = node[r.from],
      b = node[r.to];
    if (a.layer === b.layer) return { r, a, b, same: true };
    const [top, bottom] = a.layer < b.layer ? [a, b] : [b, a];
    const chain = [top];
    for (let l = top.layer + 1; l < bottom.layer; l++) {
      const d = { id: `${r.id}:${l}`, dummy: true, layer: l, w: DW, toVision: top.kind === 'vision' } as MapNode;
      layers[l].list.push(d);
      chain.push(d);
    }
    chain.push(bottom);
    return { r, chain, reversed: top !== a };
  });
  type Links = Map<MapNode, MapNode[]>;
  const up: Links = new Map(),
    down: Links = new Map();
  const link = (m: Links, k: MapNode, v: MapNode) => (m.get(k) || m.set(k, []).get(k)!).push(v);
  chains.forEach(c =>
    c.chain?.forEach((n, i) => {
      if (i) {
        link(up, n, c.chain![i - 1]);
        link(down, c.chain![i - 1], n);
      }
    }),
  );

  // Start with whatever is linked side by side, going through the lines from the top: boxes on their own come last.
  const seen = new Set<MapNode>(),
    visit = (n: MapNode) => {
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
  const weight = (a: MapNode, b: MapNode) =>
    a.kind === 'vision' || a.toVision || b.kind === 'vision' || b.toVision ? VISION_LINE : 1;
  const crossings = () => {
    let c = 0;
    for (let l = 0; l < layers.length - 1; l++) {
      const segs: [number, number, number][] = [];
      layers[l].list.forEach(n => (down.get(n) || []).forEach(m => segs.push([n.i, m.i, weight(n, m)])));
      for (let i = 0; i < segs.length; i++)
        for (let j = i + 1; j < segs.length; j++)
          if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) c += segs[i][2] * segs[j][2];
    }
    return c;
  };
  const sortLayer = (L: Layer, nbrs: Links) => {
    L.list.forEach(n => {
      const ns = nbrs.get(n);
      n.b = ns?.length ? ns.reduce((s, x) => s + x.i, 0) / ns.length : n.i;
    });
    L.list.sort((a, b) => a.b - b.b || a.i - b.i);
    L.list.forEach((n, i) => (n.i = i));
  };
  let best = crossings(),
    bestOrder = layers.map(L => [...L.list]);
  for (let it = 0; it < 16 && best > 0; it++) {
    if (it % 2 === 0) for (let l = 1; l < layers.length; l++) sortLayer(layers[l], up);
    else for (let l = layers.length - 2; l >= 0; l--) sortLayer(layers[l], down);
    const c = crossings();
    if (c < best) {
      best = c;
      bestOrder = layers.map(L => [...L.list]);
    }
  }
  layers.forEach((L, l) => (L.list = bestOrder[l]));
  reindex();
  // Swap neighbours while that removes crossings.
  const pairCross = (u: MapNode, v: MapNode, nbrs: Links) => {
    let c = 0;
    (nbrs.get(u) || []).forEach(a =>
      (nbrs.get(v) || []).forEach(b => {
        if (a.i > b.i) c += weight(u, a) * weight(v, b);
      }),
    );
    return c;
  };
  // The crossings between u's lines and v's when u is left of v.
  const cost = (u: MapNode, v: MapNode) => pairCross(u, v, up) + pairCross(u, v, down);
  const swap = (L: Layer, i: number) => {
    const u = L.list[i],
      v = L.list[i + 1];
    L.list[i] = v;
    L.list[i + 1] = u;
    v.i = i;
    u.i = i + 1;
  };
  for (let pass = 0, improved = true; improved && pass < 8; pass++) {
    improved = false;
    layers.forEach(L => {
      for (let i = 0; i + 1 < L.list.length; i++)
        if (cost(L.list[i + 1], L.list[i]) < cost(L.list[i], L.list[i + 1])) {
          swap(L, i);
          improved = true;
        }
    });
  }

  // 4. Horizontal placement
  const sep = (a: MapNode, b: MapNode) => a.w / 2 + b.w / 2 + (a.dummy && b.dummy ? DG : HG);
  const offsets = (L: Layer) =>
    L.list.reduce<number[]>((off, n, i) => (off.push(i ? off[i - 1] + sep(L.list[i - 1], n) : 0), off), []);
  layers.forEach(L => offsets(L).forEach((x, i) => (L.list[i].x = x)));
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b),
      m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const place = (L: Layer, refs: Links[]) => {
    const off = offsets(L);
    const blocks: { s: number; w: number; n: number }[] = [];
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
    blocks.forEach(b => {
      for (let k = 0; k < b.n; k++, i++) L.list[i].x = b.s / b.w + off[i];
    });
  };
  for (let it = 0; it < 8; it++) {
    for (let l = 1; l < layers.length; l++) place(layers[l], [up]);
    for (let l = layers.length - 2; l >= 0; l--) place(layers[l], [down]);
  }
  layers.forEach(L => place(L, [up, down]));
  // A long line runs straight down: its slots line up in one column wherever the rows leave room
  // (top to bottom, a new column starts only where they don't). Nothing else moves.
  const room = (n: MapNode) => {
    const L = layers[n.layer].list,
      a = L[n.i - 1],
      b = L[n.i + 1];
    return [a ? a.x + sep(a, n) : -Infinity, b ? b.x - sep(n, b) : Infinity];
  };
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  for (let it = 0; it < 3; it++)
    chains.forEach(c => {
      const ds = c.chain?.slice(1, -1);
      if (!ds?.length) return;
      // Best between the line's two ends, so it bends one way only.
      const ends = [c.chain![0].x, c.chain![c.chain!.length - 1].x].sort((a, b) => a - b) as Point;
      let run: MapNode[] = [],
        lo = -Infinity,
        hi = Infinity;
      const align = () => {
        if (!run.length) return;
        const x = clamp(clamp(median(run.map(d => d.x)), ...ends), lo, hi);
        run.forEach(d => (d.x = x));
      };
      ds.forEach(d => {
        const [a, b] = room(d);
        if (Math.max(lo, a) > Math.min(hi, b)) {
          align();
          run = [];
          lo = -Infinity;
          hi = Infinity;
        }
        run.push(d);
        lo = Math.max(lo, a);
        hi = Math.min(hi, b);
      });
      align();
    });
  const all = layers.flatMap(L => L.list);
  // Close empty vertical strips (e.g. between unrelated clusters) that placement leaves behind.
  const spans = all.map((n): Point => [n.x - n.w / 2, n.x + n.w / 2]).sort((a, b) => a[0] - b[0]);
  const cuts: Point[] = [];
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
  const ports = new Map<MapNode, { top: Port[]; bottom: Port[] }>();
  const port = (n: MapNode, side: 'top' | 'bottom', entry: Port) => {
    if (!ports.has(n)) ports.set(n, { top: [], bottom: [] });
    ports.get(n)![side].push(entry);
  };
  chains.forEach(c => {
    if (c.same) return;
    const ch = c.chain!;
    c.pts = ch.map(() => null);
    port(ch[0], 'bottom', { c, k: 0, other: ch[1] });
    port(ch[ch.length - 1], 'top', { c, k: ch.length - 1, other: ch[ch.length - 2] });
  });
  ports.forEach((sides, n) =>
    Object.entries(sides).forEach(([side, list]) => {
      list.sort((p, q) => p.other.x - q.other.x);
      // At the bottom, below the box's glass thickness, so an arrowhead there is not hidden under it.
      list.forEach(
        (p, i) =>
          (p.c.pts![p.k] = [
            n.x - NW / 2 + (NW * (i + 1)) / (list.length + 1),
            layers[n.layer].y + (side === 'bottom' ? NH + glassDepth(n) : 0),
          ]),
      );
    }),
  );
  chains.forEach(c => {
    if (c.same) {
      // Same layer: straight between neighbours, otherwise an arc above the row.
      const dir = c.b!.x > c.a!.x ? 1 : -1,
        cy = layers[c.a!.layer].y + NH / 2;
      // A box's right side ends beyond its glass thickness.
      const sx = c.a!.x + (dir * NW) / 2 + (dir > 0 ? glassDepth(c.a!) : 0),
        tx = c.b!.x - (dir * NW) / 2 + (dir < 0 ? glassDepth(c.b!) : 0);
      if (Math.abs(c.a!.i - c.b!.i) === 1) c.d = `M${sx},${cy} L${tx - dir * TIP},${cy}`;
      else {
        // The arc ends straight, along the way it comes in, so the arrowhead sits in line with it.
        const k = 1 / Math.hypot(50, 60),
          lx = dir * 50 * k,
          ly = 60 * k;
        c.d = `M${sx},${cy - 10} C${sx + dir * 50},${cy - 70} ${tx - (dir * 50 + lx * LEAD)},${cy - 70 - ly * LEAD} ${tx - lx * LEAD},${cy - 10 - ly * LEAD} L${tx - lx * TIP},${cy - 10 - ly * TIP}`;
      }
      return;
    }
    // Top to bottom: straight down through each column of slots, a curve in between.
    let pts = [c.pts![0]] as Point[];
    c.chain!.slice(1, -1).forEach((d, i, ds) => {
      if (ds[i - 1]?.x !== d.x) pts.push([d.x, layers[d.layer].y]);
      if (ds[i + 1]?.x !== d.x) pts.push([d.x, layers[d.layer].y + NH]);
    });
    pts.push(c.pts![c.pts!.length - 1]!);
    c.line = pts;
    if (c.reversed) pts = [...pts].reverse();
    // The last stretch into the arrowhead is straight, so the head sits in line with the line however steep its curve.
    const [ex, ey] = pts[pts.length - 1],
      py = pts[pts.length - 2][1];
    const back = Math.sign(py - ey),
      lead = Math.min(LEAD, Math.abs(py - ey) / 2);
    pts = [...pts.slice(0, -1), [ex, ey + back * lead], [ex, ey + back * (lead > TIP ? TIP : lead / 2)]];
    c.d =
      `M${pts[0][0]},${pts[0][1]}` +
      pts
        .slice(1)
        .map((q, i) => {
          const p = pts[i];
          if (p[0] === q[0]) return ` L${q[0]},${q[1]}`;
          const my = (p[1] + q[1]) / 2;
          return ` C${p[0]},${my} ${q[0]},${my} ${q[0]},${q[1]}`;
        })
        .join('');
  });

  return { node, layers, bands, chains, W, H };
}
