/** Test build only: boots the app, exposes every module export on window, then runs the classic test scripts. */
import './main';
import * as i18n from './legacy/i18n.js';
import * as config from './legacy/config.js';
import * as templates from './legacy/templates.js';
import * as tutorial from './legacy/tutorial.js';
import * as sync from './legacy/sync.js';
import * as users from './legacy/users.js';
import * as visions from './legacy/visions.js';
import * as drive from './legacy/drive.js';
import * as backup from './legacy/backup.js';
import * as app from './legacy/app.js';

// The suite uses the app's names bare, as when every file was a classic script. Each one reads the
// live value; assigning one calls the owning module's set<Name>() or fails loudly.
for (const ns of [i18n, config, templates, tutorial, sync, users, visions, drive, backup, app]) {
  const mod = ns as Record<string, unknown>;
  for (const name of Object.keys(mod)) {
    const setter = mod['set' + name[0].toUpperCase() + name.slice(1)];
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => mod[name],
      set:
        typeof setter === 'function'
          ? (v: unknown) => setter(v)
          : () => {
              throw new Error(`test assigns ${name}: add a setter`);
            },
    });
  }
}

// The page lists the scripts to run after boot (vite.config.ts, TEST_PAGES); they run in order.
const after = document.querySelector<HTMLMetaElement>('meta[name="test-after"]')?.content.split(' ') ?? [];
for (const src of after) {
  const script = document.createElement('script');
  script.src = src;
  script.async = false;
  document.body.append(script);
}
