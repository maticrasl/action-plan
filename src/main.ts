/** Boots the app: loads the modules in the old script order, then starts it. */
import { setLang, t } from './i18n/index';
import { applyStaticI18n, detectLang } from './ui/i18n-dom';
import './sync/config';
// Only listen on the page, so nothing else imports them; before the views, whose click listeners the first must precede.
import './ui/dialog';
import './ui/forms/events';
import { initTutorial, offerTour, tour } from './legacy/tutorial.js';
import './store/users';
import './store/visions';
import './legacy/backup.js';
import { bootUser, render } from './legacy/app.js';
import { emptyDb } from './core/model';
import { setDb } from './core/state';
import { on } from './store/events';
import { scheduleSync, setSyncPaused } from './sync/sync';
import { initSync, renderSync } from './legacy/sync-ui.js';
import { setRenderer } from './ui/render';
import { offerReached } from './ui/reached';
import { toast } from './ui/toast';
import { renderInstall } from './ui/install';
import { renderLangSwitch } from './ui/settings';
import { renderPlanSwitch } from './ui/plan-switcher';

// Screen parts below the views redraw through this.
setRenderer(render);
// Storage and sync reach the screen only through these.
on('saving', () => offerReached());
on('saved', () => scheduleSync());
on('plansChanged', () => {
  renderPlanSwitch();
  render();
});
on('storeReplaced', changed => {
  renderPlanSwitch();
  if (changed) render();
});
on('storageError', () => toast(t('err.storage')));
on('syncChanged', () => renderSync());
setSyncPaused(() => tour.step >= 0);

setLang(detectLang());
setDb(emptyDb());
applyStaticI18n();
renderLangSwitch();
const firstVisit = bootUser();
renderInstall();
initTutorial();
if (firstVisit) offerTour();
initSync();
