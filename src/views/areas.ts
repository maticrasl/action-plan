/** The Areas side of the Visions view (feature 03): each part of life with its visions, active goals and effort. */
import { t, tp } from '../i18n/index';
import {
  areaKey,
  areaReport,
  areaSentences,
  emptyAreas,
  renameGoals,
  renameVisions,
  type AreaBlock,
} from '../core/areas';
import { latestRatings } from '../core/discovery';
import { journal } from '../store/journal';
import { visions } from '../core/state';
import { fmtDay, today } from '../core/dates';
import { esc, progressBar } from '../ui/dom';
import { prefs } from '../store/prefs';
import { allPlansData, saveVisions } from '../store/visions';
import { editPlan } from '../store/plans';
import { undoable } from '../ui/undo';
import { requestRender as render } from '../ui/render';
import { openForm } from '../ui/forms/form';

export type VisionsMode = 'tree' | 'areas';
export const visionsMode = (): VisionsMode => (prefs.get<string>('visionsMode', 'tree') === 'areas' ? 'areas' : 'tree');
const hiddenAreas = (): string[] => {
  const v = prefs.get<unknown>('hiddenAreas', []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
};

// Tree · Areas, above the view's content.
export const modeSwitch = (mode: VisionsMode) =>
  `<div class="seg vis-mode" role="group" aria-label="${esc(t('areas.switch'))}">${(['tree', 'areas'] as const)
    .map(
      m => `<button type="button" data-vis-mode="${m}" aria-pressed="${m === mode}">${esc(t(`areas.${m}`))}</button>`,
    )
    .join('')}</div>`;

const sources = () =>
  allPlansData()
    .filter(p => !p.plan.demo)
    .map(p => ({ plan: p.plan.id, data: p.data }));

function block(b: AreaBlock, ratings: ReturnType<typeof latestRatings>) {
  const name = b.name || t('areas.none');
  const r = b.name ? ratings.get(areaKey(b.name)) : undefined;
  return `<section class="card area-block" data-area="${esc(b.name)}">
    <div class="card-head"><h3>${esc(name)}</h3>${
      b.name
        ? `<button type="button" class="icon-btn" data-area-rename="${esc(b.name)}" aria-label="${esc(t('areas.rename'))}" title="${esc(t('areas.rename'))}">✎</button>`
        : ''
    }</div>
    ${b.visions.length ? `<div class="links">${b.visions.map(v => `<span class="tag vision" data-open="${esc(v.id)}">◇ ${esc(v.title)}</span>`).join('')}</div>` : ''}
    <div class="area-counts">
      <p class="meta">${esc(b.goals ? tp('areas.goals', b.goals) : t('areas.noGoal'))}${b.effort ? ` · ${esc(tp('areas.effort', b.effort))}` : ''}</p>
      ${r ? `<p class="meta area-rated">${esc(t('disc.rated', { n: String(r.value), date: fmtDay(r.date, { day: 'numeric', month: 'short' }) }))}</p>` : ''}
      ${
        b.goals || !b.visions.length
          ? progressBar(b.share)
          : `<button type="button" class="btn" data-los-next="${esc(b.visions[0].id)}">${t('los.next')}</button>`
      }
    </div>
  </section>`;
}

export function renderAreas() {
  const r = areaReport(sources(), today());
  const ratings = latestRatings(journal.sessions);
  const lines = areaSentences(r).map(s =>
    s.key === 'most'
      ? t('areas.most', { area: s.area })
      : s.key === 'unserved'
        ? s.more
          ? tp('areas.unservedMore', s.more, { area: s.area })
          : t('areas.unserved', { area: s.area })
        : t('areas.quiet'),
  );
  const empty = emptyAreas(t('cat.suggestions').split(','), r, hiddenAreas()).map(s => s.trim());
  return `${lines.length ? `<div class="vis-status">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
    <div class="area-list">${[...r.blocks, ...(r.none ? [r.none] : [])].map(b => block(b, ratings)).join('')}</div>
    ${
      empty.length
        ? `<section class="area-empty"><h3>${esc(t('areas.empty'))}</h3><p class="meta">${esc(t('areas.emptyHint'))}</p>
      <div class="links">${empty
        .map(
          a =>
            `<span class="area-chip"><button type="button" class="tag" data-area-new="${esc(a)}">${esc(a)}</button><button type="button" class="icon-btn" data-area-hide="${esc(a)}" aria-label="${esc(`${t('areas.hide')}: ${a}`)}" title="${esc(t('areas.hide'))}">×</button></span>`,
        )
        .join('')}</div></section>`
        : ''
    }`;
}

// Clicks on the Visions view's switch and the Areas side; false when the element is none of them.
export function areasClick(el: HTMLElement): boolean {
  const d = el.dataset;
  if (d.visMode) prefs.set('visionsMode', d.visMode === 'areas' ? 'areas' : 'tree');
  else if (d.areaNew) return (openForm('vision', null, { area: d.areaNew }), true);
  else if (d.areaHide) prefs.set('hiddenAreas', [...hiddenAreas(), d.areaHide]);
  else if (d.areaRename) return (renameArea(d.areaRename), true);
  else return false;
  render();
  return true;
}

function renameArea(from: string) {
  const to = (prompt(t('areas.renameAsk', { area: from }), from) || '').trim().slice(0, 80);
  if (!to || to === from) return;
  undoable(
    () => {
      if (renameVisions(visions.list, from, to)) saveVisions();
      allPlansData().forEach(p => {
        if (p.data.goals.some(g => g.category?.trim().toLowerCase() === from.trim().toLowerCase()))
          editPlan(p.plan.id, data => renameGoals(data, from, to));
      });
      render();
      return t('areas.renamed', { from, to });
    },
    undefined,
    true,
  );
}
