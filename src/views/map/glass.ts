/** The glass of map boxes: the light worked out once, and each colour and thickness as SVG defs. */
import { GLASS, MAP } from './layout';

// What the light does, worked out once: how lit each sliver of the side is, for each thickness,
// and the face's reflection and shading in rings round the reflection's brightest point.
// One sliver of a box's side: its outline (none for a strip's pieces), how lit it is, how much sky it reflects,
// and for a strip ('r' or 'b') where along it the piece lies.
interface Sliver {
  path: string;
  light: number;
  sky: number;
  run?: string;
  t?: number;
}
interface GlassLight {
  peak: number[];
  far: number;
  rings: { spec: number; shade: number }[];
  side: Record<string, Sliver[]>;
  strips: Record<string, Record<string, { path: string; along: string }>>;
}
export let glassLight: GlassLight | undefined;
export function glassLighting() {
  if (glassLight) return glassLight;
  const { NW, NH } = MAP,
    { R, LIGHT, EYE, GLOSS } = GLASS;
  const unit = (v: number[]) => {
    const l = Math.hypot(...v);
    return v.map(x => x / l);
  };
  const toward = (p: number[], q: number[]) => unit(p.map((v, i) => v - q[i]));
  // The panel as 7 × 4 × 2 small lights, 180 wide and 80 tall round LIGHT.
  const panel: number[][] = [];
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 2; k++)
        panel.push([LIGHT[0] + (i / 6 - 0.5) * 180, LIGHT[1] + (j / 3 - 0.5) * 80, LIGHT[2] + (k - 0.5) * 30]);
  const avg = (fn: (p: number[]) => number) => panel.reduce((sum, p) => sum + fn(p), 0) / panel.length;
  // On the face at (x, y): the light's reflection (Blinn-Phong), and how directly the light falls.
  const spec = (x: number, y: number) => {
    const V = toward(EYE, [x, y, 0]);
    return avg(p => {
      const L = toward(p, [x, y, 0]);
      return unit([L[0] + V[0], L[1] + V[1], L[2] + V[2]])[2] ** GLOSS;
    });
  };
  const lit = (x: number, y: number) => avg(p => toward(p, [x, y, 0])[2]);
  // Where the reflection is brightest (it can lie off the box): a coarse search, then a fine one round the best.
  let peak = [0, 0],
    best = -1;
  const search = (x0: number, x1: number, y0: number, y1: number, step: number) => {
    for (let x = x0; x <= x1; x += step)
      for (let y = y0; y <= y1; y += step) {
        const v = spec(x, y);
        if (v > best) {
          best = v;
          peak = [x, y];
        }
      }
  };
  search(-250, 250, -125, 150, 25);
  search(peak[0] - 25, peak[0] + 25, peak[1] - 25, peak[1] + 25, 5);
  const far = Math.max(
    ...[
      [0, 0],
      [NW, 0],
      [0, NH],
      [NW, NH],
    ].map(([x, y]) => Math.hypot(x - peak[0], y - peak[1])),
  );
  const dir = unit([NW / 2 - peak[0], NH / 2 - peak[1]]),
    litMax = Math.max(lit(0, 0), lit(0, NH));
  const rings = [...Array(25).keys()].map(k => {
    const x = peak[0] + (dir[0] * far * k) / 24,
      y = peak[1] + (dir[1] * far * k) / 24;
    return { spec: spec(x, y), shade: Math.max(0, 1 - lit(x, y) / litMax) };
  });
  // The visible side: the outline from the top-right corner (facing up and right, -45°) round to the
  // bottom-left one (facing down and left, 135°), in pieces that each face one way. The right side and
  // the bottom are each drawn as one strip, shaded along its length by a gradient through their pieces.
  const pieces: { pts: number[][]; a: number; run?: string; t?: number }[] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const pts = [...Array(5).keys()].map(k => {
        const a = ((a0 + ((a1 - a0) * (i + k / 4)) / n) * Math.PI) / 180;
        return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
      });
      pieces.push({ pts, a: a0 + ((a1 - a0) * (i + 0.5)) / n });
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, a: number, n: number, run: string) => {
    for (let i = 0; i < n; i++)
      pieces.push({
        pts: [
          [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n],
          [x0 + ((x1 - x0) * (i + 1)) / n, y0 + ((y1 - y0) * (i + 1)) / n],
        ],
        a,
        run,
        t: (i + 0.5) / n,
      });
  };
  arc(NW - R, R, -45, 0, 2);
  line(NW, R, NW, NH - R, 0, 10, 'r');
  arc(NW - R, NH - R, 0, 90, 6);
  line(NW - R, NH, R, NH, 90, 24, 'b');
  arc(R, NH - R, 90, 135, 2);
  const centre = (p: number[]) => Math.hypot(p[0] - NW / 2, p[1] - NH / 2, p[2]);
  const pt = (pts: number[][]) => `M${pts.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(' L')} Z`;
  const side = Object.fromEntries(
    Object.entries(GLASS.DEPTH).map(([kind, d]) => [
      kind,
      pieces.map(({ pts, a, run, t }) => {
        const n = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), 0],
          mid = pts[pts.length >> 1],
          P = [mid[0], mid[1], -d / 2];
        // Facing the light (half-Lambert), fading with distance: 1 is about as lit as the side gets.
        const light = avg(p => {
          const L = toward(p, P);
          return Math.max(
            0,
            Math.min(
              1,
              (0.5 + 0.5 * (n[0] * L[0] + n[1] * L[1])) *
                (centre(p) / Math.hypot(...p.map((v, i) => v - P[i]))) ** 1.5 *
                1.6,
            ),
          );
        });
        // Glass reflects its surroundings, which are brighter above than below.
        return {
          path: run ? '' : pt([...pts, ...pts.map(([x, y]) => [x + d, y + d]).reverse()]),
          light,
          sky: 0.5 - 0.5 * n[1],
          run,
          t,
        };
      }),
    ]),
  );
  // The two strips, and the line along each that its gradient follows.
  const strips = Object.fromEntries(
    Object.entries(GLASS.DEPTH).map(([kind, d]) => [
      kind,
      {
        r: {
          path: pt([
            [NW, R],
            [NW, NH - R],
            [NW + d, NH - R + d],
            [NW + d, R + d],
          ]),
          along: `x1="0" y1="${R}" x2="0" y2="${NH - R}"`,
        },
        b: {
          path: pt([
            [NW - R, NH],
            [R, NH],
            [R + d, NH + d],
            [NW - R + d, NH + d],
          ]),
          along: `x1="${NW - R}" y1="0" x2="${R}" y2="0"`,
        },
      },
    ]),
  );
  return (glassLight = { peak, far, rings, side, strips });
}

// The slab under each box and the light on its face, defined once per colour and thickness used.
// The glass by day or by night; stateTint and quiet only where they differ from sideTint.
interface GlassLook {
  sideTint: number;
  stateTint?: number;
  quiet?: number;
  deepen: number;
  ambient: number;
  reflect: number;
  spec: number;
  faceShade: number;
}
export function glassDefs(used: Set<string>) {
  const root = getComputedStyle(document.documentElement),
    night = root.colorScheme === 'dark',
    g: GlassLook = GLASS[night ? 'night' : 'day'];
  const rgb = (name: string) => hexRgb(root.getPropertyValue(name));
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
  const css = (c: number[]) => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`;
  const { peak, far, rings, side, strips } = glassLighting(),
    base = rgb('--glass-base');
  const slabs = [...used]
    .map(key => {
      const [tintVar, kind] = key.split('|'),
        tint = rgb(tintVar);
      // A map box with --activity or --grey glass is an activity still to do, or waiting.
      const tinted =
        (tintVar === '--state' && g.stateTint) || (/^--(activity|grey)$/.test(tintVar) && g.quiet) || g.sideTint;
      // In shade, coloured glass gets deeper in colour rather than grey: less light, more of the tint shows.
      const colour = ({ light, sky }: { light: number; sky: number }) => {
        const share = Math.min(0.95, tinted * (1 - (0.45 * g.deepen) / 1.1 + g.deepen * (1 - light)));
        return css(
          mix(
            mix(base, tint, share).map(v => v * (g.ambient + (1 - g.ambient) * light)),
            [255, 255, 255],
            g.reflect * sky,
          ),
        );
      };
      const id = `glass-${glassKey(key)}`;
      // Activities and states are flat: a thin edge round the face (which covers its inner half), no slab.
      if (kind !== 'goal')
        return `<g id="${id}"><rect width="${MAP.NW}" height="${MAP.NH}" rx="${GLASS.R}" fill="none" stroke="${css(mix(base, tint, tinted))}" stroke-width="2"/></g>`;
      const paint = (d: string, c: string) =>
        `<path d="${d}" fill="${c}" stroke="${c}" stroke-width=".35" stroke-linejoin="round"/>`;
      const corners = side[kind]
        .filter(x => !x.run)
        .map(x => paint(x.path, colour(x)))
        .join('');
      const runs = Object.entries(strips[kind])
        .map(([run, { path, along }]) => {
          const stops = side[kind]
            .filter(x => x.run === run)
            .map(x => `<stop offset="${+x.t!.toFixed(3)}" stop-color="${colour(x)}"/>`)
            .join('');
          return `<linearGradient id="${id}-${run}" gradientUnits="userSpaceOnUse" ${along}>${stops}</linearGradient>${paint(path, `url(#${id}-${run})`)}`;
        })
        .join('');
      return `<g id="${id}">${runs}${corners}</g>`;
    })
    .join('');
  const ring = (id: string, color: string, of: (x: { spec: number; shade: number }) => number) =>
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${peak[0]}" cy="${peak[1]}" r="${+far.toFixed(1)}">${rings.map((x, k) => `<stop offset="${+(k / 24).toFixed(3)}" stop-color="${color}" stop-opacity="${+of(x).toFixed(3)}"/>`).join('')}</radialGradient>`;
  return (
    slabs + ring('glass-spec', '#fff', x => g.spec * x.spec) + ring('glass-shade', '#000', x => g.faceShade * x.shade)
  );
}
// A CSS colour as #RGB or #RRGGBB (the build shortens #ffffff to #fff), as [r, g, b].
export function hexRgb(value: string) {
  let h = value.trim().slice(1);
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
export const glassKey = (key: string) => key.replace('--', '').replace('|', '-');
// The colour a box takes, as in the CSS: its status's, or else its kind's.
export const glassTint = (kind: string, st: string) =>
  (({ done: '--ok', doing: '--warn', late: '--bad', blocked: '--grey' }) as Record<string, string>)[st] || '--' + kind;
