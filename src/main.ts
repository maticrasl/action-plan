/** Boots the app: loads the modules in the old script order, then starts it. */
import { setLang, t } from './i18n/index';
import { applyStaticI18n, detectLang } from './ui/i18n-dom';
import './sync/config';
// Only listen on the page, so nothing else imports them; before the views, whose click listeners the first must precede.
import './ui/dialog';
import './ui/forms/events';
import { initTutorial, isTourRunning, offerTour } from './tutorial/tour';
import { decorateHelp } from './tutorial/help';
import './store/users';
import './store/visions';
import { bootUser, enterUser } from './legacy/app.js';
import { onRendered, render } from './views/index';
// Listen-only, like ui/forms/events (whose click listener must come first).
import './views/events';
import { emptyDb } from './core/model';
import { setDb } from './core/state';
import { on } from './store/events';
import { scheduleSync, setSyncPaused } from './sync/sync';
import { connectSync, initSync, renderSync } from './ui/sync-ui';
import { setRenderer } from './ui/render';
import { offerReached } from './ui/reached';
import { toast } from './ui/toast';
import { renderInstall } from './ui/install';
import { renderLangSwitch } from './ui/settings';
import { renderPlanSwitch } from './ui/plan-switcher';

// Screen parts below the views redraw, switch users and offer the tour through these.
setRenderer(render);
// The tutorial sits above the views: help mode's tips go on after every draw.
onRendered(decorateHelp);
// Through the live bindings: offerTour can be replaced (setOfferTour), as the suite does.
connectSync({ enterUser: (id: string) => enterUser(id), offerTour: () => offerTour() });
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
setSyncPaused(isTourRunning);

setLang(detectLang());
setDb(emptyDb());
applyStaticI18n();
renderLangSwitch();
const firstVisit = bootUser();
renderInstall();
initTutorial();
if (firstVisit) offerTour();
initSync();
