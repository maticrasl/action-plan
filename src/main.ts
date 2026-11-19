/** Boots the app: loads the modules in the old script order, then starts it. */
import { setLang, t } from './i18n/index';
import { applyStaticI18n, detectLang } from './ui/i18n-dom';
import './sync/config';
// Only listen on the page, so nothing else imports them; before the views, whose click listeners the first must precede.
import './ui/dialog';
import './ui/forms/events';
import { decorateDemo, offerWelcome } from './tutorial/welcome';
import { decorateWalk, listenWalk } from './tutorial/walkthrough';
import { decorateHelp } from './tutorial/help';
import { decorateTips, listenTips } from './tutorial/tips';
import './store/users';
import './store/visions';
import { bootUser, enterUser } from './boot';
import { onRendered, render } from './views/index';
// Listen-only, like ui/forms/events (whose click listener must come first).
import './views/events';
import { emptyDb } from './core/model';
import { setDb } from './core/state';
import { on } from './store/events';
import { scheduleSync } from './sync/sync';
import { connectSync, initSync, renderSync } from './ui/sync-ui';
import { setRenderer } from './ui/render';
import { offerReached } from './ui/reached';
import { toast } from './ui/toast';
import { renderInstall } from './ui/install';
import { renderLangSwitch } from './ui/settings';
import { renderPlanSwitch } from './ui/plan-switcher';
import { listenMap } from './views/map/index';
import { listenTlDrag } from './views/timeline/drag';
import { listenGraphs } from './views/graphs/points';
import { listenGuide } from './views/guide';

// Screen parts below the views redraw, switch users and offer the welcome through these.
setRenderer(render);
// The tutorial sits above the views: after every draw help mode's tips go on, then Getting started
// (its card above the help banner), the tip of the day, then the sample plan's banner above them.
onRendered(decorateHelp);
onRendered(decorateWalk);
onRendered(decorateTips);
onRendered(decorateDemo);
// Through the live bindings: offerWelcome can be replaced (setOfferWelcome), as the suite does.
connectSync({ enterUser: (id: string) => enterUser(id), offerWelcome: () => offerWelcome() });
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
// The graphs' pointing, the map's gestures, then the timeline's, in the order they had in app.js.
listenGraphs();
listenMap();
listenTlDrag();
listenGuide();
listenWalk();
listenTips();

setLang(detectLang());
setDb(emptyDb());
applyStaticI18n();
renderLangSwitch();
const firstVisit = bootUser();
renderInstall();
if (firstVisit) offerWelcome();
initSync();
