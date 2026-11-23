/** Help mode: a banner on each view and an ⓘ tip on the first of each key control. */
import { ui } from '../store/state';
import { $, esc } from '../ui/dom';
import { I18N, t, type TextKey } from '../i18n/index';
import { VIEW_ARTICLE } from '../i18n/guide';
import { clamp } from '../core/util';
import { setHelp } from '../ui/settings';

export const EDGE = 16;

/* ---------- Help mode ----------
   While on, each view opens with a banner explaining what it is for, and the
   first instance of each key control gets an ⓘ button with a one-line tip. */

// A tip's key names its text, help.tip.<key>: a key without a text does not compile.
type TipKey = { [K in TextKey]: K extends `help.tip.${infer T}` ? T : never }[TextKey];

export const HELP_TIPS: { sel: string; key: TipKey; where?: InsertPosition }[] = [
  { sel: '.summary-line', key: 'summary', where: 'beforeend' },
  { sel: '[data-category-select]', key: 'categories' },
  { sel: '.card.goal .smart', key: 'smart' },
  { sel: '.trail-ends', key: 'trail', where: 'beforeend' },
  { sel: '.gr-card:not(:has(.gr-scale)) .gr-value', key: 'stateValue' },
  { sel: '.cu-add', key: 'addAmount' },
  { sel: '.check', key: 'check' },
  { sel: '.rt-items-head .label', key: 'routineList', where: 'beforeend' },
  { sel: ':not(.rt-items) > .li-ticks', key: 'list', where: 'beforebegin' },
  { sel: '.routines-title', key: 'routines', where: 'beforeend' },
  { sel: '.routine-list', key: 'routineToday', where: 'beforebegin' },
  { sel: '[data-hide-done]', key: 'hideDone' },
  { sel: '[data-log-scope]', key: 'logScope' },
  { sel: '[data-replan]', key: 'replan' },
  { sel: '.gr-delta', key: 'grChange' },
  { sel: '.gr-plot', key: 'grLegend', where: 'beforebegin' },
  { sel: '.map-legend', key: 'status', where: 'beforeend' },
];

export function decorateHelp() {
  closeHelpTip();
  // The Guide is the explanation itself: no banner, no tips there.
  if (!ui.help || ui.view === 'guide') return;
  const view = $('#view');
  // Each view's banner ends with a link to its "How do I…" article in the Guide.
  const article = VIEW_ARTICLE[ui.view];
  if (I18N.en.strings[('help.view.' + ui.view) as TextKey])
    view.insertAdjacentHTML(
      'afterbegin',
      `<aside class="help-banner">
    <span class="help-mark" aria-hidden="true">?</span><p>${t(('help.view.' + ui.view) as TextKey)}${
      article
        ? ` <button type="button" class="guide-ref" data-guide-open="${article}">${esc(t('guide.more'))}</button>`
        : ''
    }</p>
    <button type="button" class="btn ghost" data-help-off>${t('help.off')}</button></aside>`,
    );
  HELP_TIPS.forEach(({ sel, key, where = 'afterend' }) => {
    view
      .querySelector(sel)
      ?.insertAdjacentHTML(
        where,
        `<button type="button" class="help-dot" data-help-tip="${key}" aria-expanded="false" aria-label="${esc(t('help.tipLabel'))}" title="${esc(t('help.tipLabel'))}">i</button>`,
      );
  });
}

export function openHelpTip(dot: HTMLElement) {
  closeHelpTip();
  const tip = document.createElement('div');
  tip.className = 'help-tip';
  tip.id = 'helpTip';
  tip.setAttribute('role', 'tooltip');
  tip.textContent = t(('help.tip.' + dot.dataset.helpTip) as TextKey);
  document.body.append(tip);
  dot.setAttribute('aria-expanded', 'true');
  dot.setAttribute('aria-describedby', 'helpTip');
  const r = dot.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const below = r.bottom + 8 + tip.offsetHeight <= innerHeight - EDGE;
  tip.style.left = `${clamp(r.left + r.width / 2 - tip.offsetWidth / 2, EDGE, vw - tip.offsetWidth - EDGE)}px`;
  tip.style.top = `${below ? r.bottom + 8 : r.top - 8 - tip.offsetHeight}px`;
}

export function closeHelpTip() {
  $('#helpTip')?.remove();
  document.querySelectorAll('[data-help-tip][aria-expanded="true"]').forEach(d => {
    d.setAttribute('aria-expanded', 'false');
    d.removeAttribute('aria-describedby');
  });
}

// Capture phase: an ⓘ inside a card must not also open the card's edit form.
document.addEventListener(
  'click',
  e => {
    const dot = (e.target as HTMLElement).closest<HTMLElement>('[data-help-tip]');
    if (dot) {
      e.preventDefault();
      e.stopPropagation();
      if (dot.getAttribute('aria-expanded') === 'true') closeHelpTip();
      else openHelpTip(dot);
      return;
    }
    closeHelpTip();
    if ((e.target as HTMLElement).closest('[data-help-off]')) setHelp(false);
  },
  true,
);
addEventListener('keydown', e => {
  if (e.key === 'Escape') closeHelpTip();
});
addEventListener('resize', closeHelpTip);
addEventListener('scroll', closeHelpTip, true);
