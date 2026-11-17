/** Boots the app: loads the modules in the old script order, then starts it. */
import { setLang } from './i18n/index';
import { applyStaticI18n, detectLang } from './ui/i18n-dom';
import './legacy/config.js';
import './legacy/templates.js';
import { initTutorial, offerTour } from './legacy/tutorial.js';
import './legacy/sync.js';
import './legacy/users.js';
import './legacy/visions.js';
import { initSync } from './legacy/drive.js';
import './legacy/backup.js';
import { bootUser, renderInstall, renderLangSwitch } from './legacy/app.js';
import { emptyDb } from './core/model';
import { setDb } from './core/state';

setLang(detectLang());
setDb(emptyDb());
applyStaticI18n();
renderLangSwitch();
const firstVisit = bootUser();
renderInstall();
initTutorial();
if (firstVisit) offerTour();
initSync();
