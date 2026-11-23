/** Today (feature 09): what is due and the routines today asks for, from every plan, under this week's one thing. */
import { esc, emptyState, $ } from '../ui/dom';
import { t } from '../i18n/index';
import { today, fmtDay } from '../core/dates';
import { todayItems, type TodayRow } from '../core/today';
import { clearFocus } from '../store/journal';
import { prefs } from '../store/prefs';
import { requestRender as render } from '../ui/render';
import { weekLine } from './day-rows';
import { focusCard, hasItems, openFocusPicker, planName, row, todaySources } from './focus';

export function renderToday() {
  const sources = todaySources();
  if (!sources.some(hasItems)) return emptyState(t('dash.emptyTitle'), t('dash.emptyText'), 'goal');
  const now = today(),
    lists = todayItems(sources, now),
    later = prefs.get('todayLater', false);
  // Plan headings only when there is more than one plan to tell apart.
  const many = sources.length > 1;
  const groups = (rows: TodayRow[], cls = '') =>
    [...new Set(rows.map(r => r.plan))]
      .map(plan => {
        const src = sources.find(s => s.plan === plan);
        const items = rows.filter(r => r.plan === plan).map(r => row(src, r.activity));
        return `<div class="today-plan" data-in-plan="${esc(plan)}">${many ? `<h3 class="today-plan-h">${esc(planName(plan))}</h3>` : ''}<div class="list ${cls}">${items.join('')}</div></div>`;
      })
      .join('');
  const nothing = !lists.due.length && !lists.routines.length;
  return `
    <p class="today-date">${esc(fmtDay(now, { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
    ${focusCard(sources)}
    ${nothing ? `<div class="empty">${t('today.none')}</div>` : ''}
    ${lists.due.length ? `<h2 class="section-title">${t('today.due')}</h2>${groups(lists.due)}` : ''}
    ${lists.routines.length ? `<h2 class="section-title">${t('today.routines')}</h2>${groups(lists.routines, 'routine-list')}` : ''}
    ${
      lists.later.length
        ? `<button type="button" class="list-more today-later" data-today="later" aria-expanded="${later}">${t('today.later')} (${lists.later.length})</button>${later ? groups(lists.later) : ''}`
        : ''
    }
    <section class="summary today-week">${weekLine(now, sources)}</section>`;
}

// The buttons Today draws (data-today).
export function todayClick(el: HTMLElement) {
  const what = el.dataset.today;
  if (what === 'later') {
    prefs.set('todayLater', !prefs.get('todayLater', false));
    render();
    return $('[data-today="later"]')?.focus({ preventScroll: true });
  }
  if (what === 'clear') {
    clearFocus();
    return render();
  }
  if (what === 'choose') return openFocusPicker();
}

/* ---------- The picker: the not-done steps of all plans, due soonest first ---------- */

