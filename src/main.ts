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
import { askForTip, decorateTips, listenTips } from './tutorial/tips';
import { setAskTip } from './views/guide';
import { userKey } from './store/users';
import './store/visions';
import { bootUser, enterUser } from './boot';
import { measureTopbar, onRendered, render } from './views/index';
// Listen-only, like ui/forms/events (whose click listener must come first).
import './views/events';
import { emptyDb } from './core/model';
import { setDb } from './core/state';
import { on } from './store/events';
import { keepStorage } from './store/persist';
import { JOURNAL_KEY, loadJournal } from './store/journal';
import { scheduleSync } from './sync/sync';
import { takeOtherTab } from './sync/tabs';
import { connectSync, initSync, renderSync } from './ui/sync-ui';
import { setRenderer } from './ui/render';
import { offerReached } from './ui/reached';
import { toast } from './ui/toast';
import { dropUndo, listenUndo } from './ui/undo';
import { renderInstall } from './ui/install';
import { renderLangSwitch } from './ui/settings';
import { renderPlanSwitch } from './ui/plan-switcher';
import { listenMap } from './views/map/index';
import { listenTlDrag } from './views/timeline/drag';
import { listenGraphs } from './views/graphs/points';
import { listenGuide } from './views/guide';
import { listenFeedback } from './ui/feedback';
import { listenTrash } from './ui/trash-dialog';
import { listenRestore } from './ui/restore-dialog';
import { listenReplan } from './ui/replan';
import { listenCsv } from './ui/csv-dialog';

// Screen parts below the views redraw, switch users and offer the welcome through these.
setRenderer(render);
// The tutorial sits above the views: after every draw help mode's tips go on, then Getting started
// (its card above the help banner), the tip of the day, then the sample plan's banner above them.
onRendered(decorateHelp);
onRendered(decorateWalk);
onRendered(decorateTips);
setAskTip(askForTip);
onRendered(decorateDemo);
// Through the live bindings: offerWelcome can be replaced (setOfferWelcome), as the suite does.
connectSync({ enterUser: (id: string) => enterUser(id), offerWelcome: () => offerWelcome() });
// Storage and sync reach the screen only through these.
on('saving', () => offerReached());
on('saved', () => {
  dropUndo();
  keepStorage();
  scheduleSync();
});
on('plansChanged', () => {
  renderPlanSwitch();
  render();
});
on('storeReplaced', changed => {
  if (changed) dropUndo();
  renderPlanSwitch();
  if (changed) render();
});
on('storageError', () => toast(t('err.storage')));
on('syncChanged', () => renderSync());
// Once a merged backup is in Drive, undoing it here would be undone by the next sync.
on('uploaded', () => dropUndo(true));
// Another tab saved the journal: this one takes it over, so it never writes an old copy back.
addEventListener('storage', e => e.key === userKey(JOURNAL_KEY) && loadJournal());
// Another tab saved plans or visions: merged here item by item (sync/tabs.ts).
addEventListener('storage', e => takeOtherTab(e.key));
addEventListener('resize', measureTopbar);
// The graphs' pointing, the map's gestures, then the timeline's, in the order they had in app.js.
listenGraphs();
listenMap();
listenTlDrag();
listenGuide();
listenWalk();
listenTips();
listenFeedback();
listenTrash();
listenRestore();
listenReplan();
listenCsv();
listenUndo();

setLang(detectLang());
setDb(emptyDb());
applyStaticI18n();
renderLangSwitch();
const firstVisit = bootUser();
renderInstall();
if (firstVisit) offerWelcome();
initSync();
