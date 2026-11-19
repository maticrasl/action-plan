/** Pointing at a graph: the crosshair and tooltip by pointer, focus and keys, zooming one graph, and redraws on resize. */
import { clamp, fmtNum } from '../../core/util';
import { withUnit } from '../../ui/text';
import { fmtRel } from '../../core/dates';
import { t } from '../../i18n/index';
import { viewEl } from '../../ui/dom';
import { ui } from '../../store/state';
import { modal } from '../../ui/forms/form';
import { requestRender as render } from '../../ui/render';
import { GR, grCharts, grDrawW, graphFor, signed } from './states';
import { findEntity } from '../../core/relations';
import type { State } from '../../core/model';
import type { Routine } from '../../core/routines/schedule';

// Hover / touch / keyboard: a crosshair snaps to the nearest measurement and a tooltip lists its values.
export function showGraphPoint(plot: HTMLElement, i: number) {
  const c = grCharts[plot.closest<HTMLElement>('[data-gr]')!.dataset.gr!];
  const p = c.points[clamp(i, 0, c.points.length - 1)];
  plot.dataset.i = String(c.points.indexOf(p));
  const cx = c.px(p.day),
    cy = c.py(p.value);
  const cross = plot.querySelector<HTMLElement>('.gr-cross')!,
    focus = plot.querySelector<HTMLElement>('.gr-focus')!,
    tip = plot.querySelector<HTMLElement>('.gr-tip')!;
  cross.setAttribute('x1', String(cx));
  cross.setAttribute('x2', String(cx));
  cross.hidden = false;
  focus.setAttribute('cx', String(cx));
  focus.setAttribute('cy', String(cy));
  focus.hidden = false;
  // Built with textContent: titles and units are user text.
  tip.replaceChildren();
  const row = (cls: string, text: string) => {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    tip.append(el);
  };
  if (c.tip) c.tip(p).forEach(([cls, text]) => row(cls, text));
  else {
    row('gr-tip-value', withUnit(fmtNum(p.value), c.unit));
    row('gr-tip-date', fmtRel(p.date, true));
    if (p !== c.points[0])
      row('gr-tip-row', t('gr.tipChange', { value: withUnit(signed(p.value - c.points[0].value), c.unit) }));
    c.targets.forEach(tg =>
      row('gr-tip-row', t('gr.tipTarget', { goal: tg.goal.title, value: withUnit(fmtNum(tg.value), c.unit) })),
    );
  }
  tip.hidden = false;
  // The chart's own width: a long one scrolls inside the plot.
  const w = Number(plot.querySelector('svg')!.getAttribute('width'));
  tip.style.left = `${clamp(cx + 12, 0, w - tip.offsetWidth)}px`;
  tip.style.top = `${clamp(cy - tip.offsetHeight - 10, 0, GR.H - tip.offsetHeight)}px`;
  if (cx + 12 + tip.offsetWidth > w) tip.style.left = `${Math.max(0, cx - 12 - tip.offsetWidth)}px`;
  // Keys can move to a bar scrolled out of sight.
  if (cx < plot.scrollLeft + GR.L || cx > plot.scrollLeft + plot.clientWidth - GR.R)
    plot.scrollLeft = cx - plot.clientWidth / 2;
}

export function hideGraphPoint(plot: HTMLElement) {
  plot.querySelectorAll<HTMLElement>('.gr-cross, .gr-focus, .gr-tip').forEach(el => (el.hidden = true));
  delete plot.dataset.i;
}

export function nearestPoint(plot: HTMLElement, clientX: number) {
  const c = grCharts[plot.closest<HTMLElement>('[data-gr]')!.dataset.gr!];
  const x = clientX - plot.querySelector('svg')!.getBoundingClientRect().left;
  let best = 0;
  c.points.forEach((p, i) => {
    if (Math.abs(c.px(p.day) - x) < Math.abs(c.px(c.points[best].day) - x)) best = i;
  });
  return best;
}

// Charts are drawn at the view's pixel width, so redraw them when it changes.
let grResize: ReturnType<typeof setTimeout> | undefined;

export function listenGraphs() {
  (['pointermove', 'pointerdown'] as const).forEach(type =>
    viewEl.addEventListener(type, e => {
      const plot = (e.target as Element).closest<HTMLElement>('.gr-plot');
      if (plot) showGraphPoint(plot, nearestPoint(plot, e.clientX));
    }),
  );
  viewEl.addEventListener('pointerout', e => {
    const plot = (e.target as Element).closest<HTMLElement>('.gr-plot');
    if (plot && !plot.contains(e.relatedTarget as Node | null) && document.activeElement !== plot) hideGraphPoint(plot);
  });
  viewEl.addEventListener('focusin', e => {
    if ((e.target as Element).matches('.gr-plot'))
      showGraphPoint(
        e.target as HTMLElement,
        grCharts[(e.target as Element).closest<HTMLElement>('[data-gr]')!.dataset.gr!].points.length - 1,
      );
  });
  viewEl.addEventListener('focusout', e => {
    if ((e.target as Element).matches('.gr-plot')) hideGraphPoint(e.target as HTMLElement);
  });
  viewEl.addEventListener('keydown', e => {
    const plot = (e.target as Element).closest?.<HTMLElement>('.gr-plot');
    if (!plot) return;
    const n = grCharts[plot.closest<HTMLElement>('[data-gr]')!.dataset.gr!].points.length;
    const i = Number(plot.dataset.i ?? n - 1);
    const factor = ({ '+': 1.25, '=': 1.25, '-': 0.8 } as Record<string, number | undefined>)[e.key];
    if (factor && !e.ctrlKey && !e.metaKey) {
      // Around the point the crosshair is on.
      e.preventDefault();
      const c = grCharts[plot.closest<HTMLElement>('[data-gr]')!.dataset.gr!];
      zoomGraph(
        plot,
        factor,
        plot.querySelector('svg')!.getBoundingClientRect().left + c.px(c.points[clamp(i, 0, n - 1)].day),
      );
      return showGraphPoint(plot, i);
    }
    const next = ({ ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 } as Record<string, number | undefined>)[
      e.key
    ];
    if (next === undefined) return;
    e.preventDefault();
    showGraphPoint(plot, next);
  });

  // Graphs fit the width: a resize that keeps it (a phone's on-screen keyboard opening) must not redraw,
  // which would close the value popup whose field brought the keyboard up.
  let width = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === width) return;
    width = innerWidth;
    clearTimeout(grResize);
    grResize = setTimeout(() => {
      if (ui.view === 'graphs' && !modal.open) render();
    }, 150);
  });
}

// Only that graph is redrawn, into the same element, so a pinch that started on it keeps going.
export function zoomGraph(plot: HTMLElement, factor: number, cx: number) {
  const id = plot.closest<HTMLElement>('[data-gr]')?.dataset.gr,
    c = grCharts[id!],
    item = id && findEntity(id)?.item;
  if (!c || !item) return;
  const z0 = clamp(ui.grZoom[id!] || 1, ...c.zoom),
    z = clamp(z0 * factor, ...c.zoom);
  if (z === z0) return;
  const svg = plot.querySelector('svg')!,
    w0 = Number(svg.getAttribute('width'));
  const u = (cx - svg.getBoundingClientRect().left - GR.L) / (w0 - GR.L - GR.R);
  ui.grZoom[id!] = z;
  const fresh = document.createElement('div');
  fresh.innerHTML = graphFor(item as State | Routine, grDrawW);
  const next = fresh.querySelector('.gr-plot')!;
  plot.className = next.className;
  plot.replaceChildren(...next.childNodes);
  const now = plot.querySelector('svg')!,
    w = Number(now.getAttribute('width'));
  plot.scrollLeft += now.getBoundingClientRect().left + GR.L + u * (w - GR.L - GR.R) - cx;
}
