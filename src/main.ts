/** Boots the app: loads the modules in the old script order, then starts it. */
import { setLang, t } from './i18n/index';
import { applyStaticI18n, detectLang } from './ui/i18n-dom';
import './legacy/config.js';
import { initTutorial, offerTour, tour } from './legacy/tutorial.js';
import './legacy/users.js';
import './legacy/visions.js';
import { initSync, renderSync, scheduleSync, setSyncPaused } from './legacy/drive.js';
import './legacy/backup.js';
import { bootUser, offerReached, render, renderInstall, renderLangSwitch, renderPlanSwitch, toast } from './legacy/app.js';
import { emptyDb } from './core/model';
import { setDb } from './core/state';
import { on } from './store/events';

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
