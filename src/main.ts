/** Boots the app: loads the modules in the old script order, then starts it. */
import { applyStaticI18n, detectLang, setLang } from './legacy/i18n.js';
import './legacy/config.js';
import './legacy/templates.js';
import { initTutorial, offerTour } from './legacy/tutorial.js';
import './legacy/sync.js';
import './legacy/users.js';
import './legacy/visions.js';
import { initSync } from './legacy/drive.js';
import './legacy/backup.js';
import { bootUser, renderInstall, renderLangSwitch } from './legacy/app.js';

setLang(detectLang());
applyStaticI18n();
renderLangSwitch();
const firstVisit = bootUser();
renderInstall();
initTutorial();
if (firstVisit) offerTour();
initSync();
