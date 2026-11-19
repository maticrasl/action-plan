/** The Guide: how the method works, what to do when stuck, how each feature works, what happens to the data. */
import { GUIDE, GUIDE_GROUPS, type Article, type GuideAction, type GuideFact } from '../i18n/guide';
import { lang, t, type TextKey } from '../i18n/index';
import { liveBody, matchesQuery, plainText, withRefs } from '../core/guidance/search';
import { today } from '../core/dates';
import { ui, type ViewName } from '../store/state';
import { users } from '../store/users';
import { getSeen, markSeen } from '../store/seen';
import { syncConfigured, syncConnected } from '../sync/sync';
import { $, esc, settings, viewEl } from '../ui/dom';
import { lastView, setView } from '../ui/nav';
import { openForm } from '../ui/forms/form';
import { openTemplates } from '../ui/templates-dialog';
import { openExport } from '../ui/plan-io';
import { installHintKey, installPrompt, isInstalled } from '../ui/install';
import { openSettings, setHelp } from '../ui/settings';
import { toast } from '../ui/toast';

// The open article and the search text, kept while the app is open (not stored).
export const guideState: { open: string | null; query: string } = { open: null, query: '' };

// The facts that decide which parts of an article show (data-only in the article files).
export let guideFacts = (): Record<GuideFact, boolean> => ({
  syncSetUp: syncConfigured(),
  noSync: !syncConfigured(),
  multiUser: users.list.length > 1,
  localOnly: !syncConnected() && !getSeen().exported,
});
// Tests replace guideFacts to draw the other variants.
export function setGuideFacts(f: typeof guideFacts) {
  guideFacts = f;
}

const articles = () => GUIDE[lang];
const titleOf = (id: string) => articles().find(a => a.id === id)?.title ?? id;
const ref = (id: string) =>
  `<button type="button" class="guide-ref" data-guide-open="${esc(id)}">${esc(titleOf(id))}</button>`;

// What each action button does.
const view = (v: ViewName) => () => setView(v);
export const GUIDE_DO: Record<GuideAction, () => void> = {
  'add-goal': () => openForm('goal'),
  'add-activity': () => openForm('activity'),
  'add-routine': () => openForm('activity', null, { repeat: 'routine' }),
  'add-state': () => openForm('state'),
  'add-vision': () => openForm('vision'),
  templates: () => openTemplates(),
  export: () => openExport(),
  install: () => $('#installBtn').click(),
  settings: () => openSettings(),
  'settings-sync': () => openSettings('syncSection'),
  'view-dashboard': view('dashboard'),
  'view-goals': view('goals'),
  'view-activities': view('activities'),
  'view-states': view('states'),
  'view-map': view('map'),
  'view-timeline': view('timeline'),
  'view-graphs': view('graphs'),
};

// The words search looks in: the title, the text as it shows now, and the review's lines.
const searchText = (a: Article, facts: Record<GuideFact, boolean>) =>
  [a.title, plainText(withRefs(liveBody(a.body, facts), titleOf)), ...(a.review ?? []).map(r => plainText(r.text))].join(
    ' ',
  );

function actionHtml(a: Article) {
  if (!a.action) return '';
  // Installing needs the browser's prompt; where there is none, the browser's own way is said instead.
  if (a.action.do === 'install') {
    if (isInstalled()) return '';
    const hint = installHintKey();
    return `${hint && hint !== 'install.hint' ? `<p class="guide-hint">${esc(t(hint))}</p>` : ''}${
      installPrompt
        ? `<p class="guide-act"><button type="button" class="btn primary" data-guide-do="install">${esc(a.action.label)}</button></p>`
        : ''
    }`;
  }
  return `<p class="guide-act"><button type="button" class="btn primary" data-guide-do="${a.action.do}">${esc(a.action.label)}</button></p>`;
}

function reviewHtml(a: Article) {
  if (!a.review) return '';
  return `<ol class="guide-review">${a.review
    .map(
      r => `<li><label><input type="checkbox"><span>${r.text}</span></label>
      <button type="button" class="guide-go" data-guide-do="${r.go}">${esc(r.label)}</button></li>`,
    )
    .join('')}</ol>
    <p class="guide-act"><button type="button" class="btn primary" data-review-done>${esc(t('guide.review.done'))}</button></p>`;
}

function articleHtml(a: Article, facts: Record<GuideFact, boolean>, shown: boolean) {
  const open = guideState.open === a.id;
  const related = a.related?.length
    ? `<p class="guide-related"><span>${esc(t('guide.related'))}</span> ${a.related.map(ref).join('')}</p>`
    : '';
  return `<article class="guide-art" data-art="${a.id}"${shown ? '' : ' hidden'}>
    <h3><button type="button" class="guide-q" id="gq-${a.id}" data-guide-toggle="${a.id}" aria-expanded="${open}" aria-controls="ga-${a.id}">${esc(a.title)}</button></h3>
    <div class="guide-a" id="ga-${a.id}" role="region" aria-labelledby="gq-${a.id}"${open ? '' : ' hidden="until-found"'}>
      <div class="guide-text">${withRefs(liveBody(a.body, facts), ref)}</div>
      ${reviewHtml(a)}${actionHtml(a)}${related}
    </div>
  </article>`;
}

export function renderGuide() {
  const facts = guideFacts();
  const shown = new Set(
    articles()
      .filter(a => matchesQuery(searchText(a, facts), guideState.query))
      .map(a => a.id),
  );
  const groups = GUIDE_GROUPS.map(g => {
    const list = articles().filter(a => a.group === g);
    return `<section class="guide-group" data-group="${g}"${list.some(a => shown.has(a.id)) ? '' : ' hidden'}>
      <h2>${esc(t(('guide.group.' + g) as TextKey))}</h2>
      ${list.map(a => articleHtml(a, facts, shown.has(a.id))).join('')}
    </section>`;
  }).join('');
  return `<div class="guide">
    <div class="guide-tools">
      <input type="search" id="guideSearch" class="search guide-search" data-guide-search value="${esc(guideState.query)}" placeholder="${esc(t('guide.search'))}" aria-label="${esc(t('guide.search'))}" autocomplete="off" spellcheck="false">
      <label class="guide-switch switch"><span>${esc(t('btn.help'))}</span><input type="checkbox" data-guide-help${ui.help ? ' checked' : ''}></label>
    </div>
    <p class="guide-none" role="status"${shown.size ? ' hidden' : ''}>${esc(t('guide.noMatch', { query: guideState.query.trim() }))}</p>
    ${groups}
  </div>`;
}

// Shows the articles that match the search box, without redrawing (the box keeps its focus).
function filterGuide() {
  const facts = guideFacts();
  let any = false;
  viewEl.querySelectorAll<HTMLElement>('.guide-group').forEach(g => {
    let inGroup = false;
    g.querySelectorAll<HTMLElement>('[data-art]').forEach(el => {
      const a = articles().find(x => x.id === el.dataset.art)!;
      el.hidden = !matchesQuery(searchText(a, facts), guideState.query);
      inGroup ||= !el.hidden;
    });
    g.hidden = !inGroup;
    any ||= inGroup;
  });
  const none = $('.guide-none', viewEl);
  none.hidden = any;
  none.textContent = t('guide.noMatch', { query: guideState.query.trim() });
}

// Opens one article in place (null closes them all) and brings its title to the top.
function showArticle(id: string | null, focus = false) {
  guideState.open = id;
  viewEl.querySelectorAll<HTMLElement>('[data-guide-toggle]').forEach(b => {
    const open = b.dataset.guideToggle === id;
    b.setAttribute('aria-expanded', String(open));
    const body = $(`#ga-${b.dataset.guideToggle}`, viewEl);
    if (open) body.removeAttribute('hidden');
    else body.setAttribute('hidden', 'until-found');
  });
  const title = id ? $<HTMLElement>(`#gq-${id}`, viewEl) : null;
  if (!title) return;
  // Just below the top bar, which stays in place while the page scrolls under it.
  const bar = $('.topbar').getBoundingClientRect().bottom;
  scrollTo(0, scrollY + title.getBoundingClientRect().top - Math.max(bar, 0) - 8);
  if (focus) title.focus({ preventScroll: true });
}

// Switches to the Guide with that article open, its title focused. An unknown id opens nothing.
export function openGuide(id: string) {
  const known = articles().some(a => a.id === id);
  guideState.query = '';
  guideState.open = known ? id : null;
  setView('guide');
  if (known) showArticle(id, true);
}

// The ? button: to the Guide, or from it back to the view before.
export const toggleGuide = () => (ui.view === 'guide' ? setView(lastView) : openGuide(''));

export function listenGuide() {
  $('#helpBtn').addEventListener('click', toggleGuide);
  $('#guideBtn').addEventListener('click', () => {
    settings.close();
    openGuide('');
  });
  // Article links work everywhere in the view, also in the help banners of other views.
  viewEl.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-guide-open],[data-guide-toggle],[data-guide-do],[data-review-done]',
    );
    if (!el) return;
    if (el.dataset.guideOpen) return openGuide(el.dataset.guideOpen);
    if (el.dataset.guideToggle)
      return showArticle(guideState.open === el.dataset.guideToggle ? null : el.dataset.guideToggle);
    if (el.dataset.guideDo) return GUIDE_DO[el.dataset.guideDo as GuideAction]();
    markSeen({ lastReview: today() });
    toast(t('guide.review.toast'));
  });
  viewEl.addEventListener('input', e => {
    const box = e.target as HTMLInputElement;
    if (!box.matches('[data-guide-search]')) return;
    guideState.query = box.value;
    filterGuide();
  });
  viewEl.addEventListener('change', e => {
    const box = e.target as HTMLInputElement;
    if (box.matches('[data-guide-help]')) setHelp(box.checked);
  });
  // Find in page reveals a closed article: it becomes the open one.
  viewEl.addEventListener(
    'beforematch',
    e => {
      const body = (e.target as HTMLElement).closest<HTMLElement>('.guide-a');
      if (body) showArticle(body.id.slice(3));
    },
    true,
  );
}
