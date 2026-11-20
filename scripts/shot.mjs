/** Writes a full-page PNG of one view with the sample plan, for the model or the owner to look at. */
// usage: npm run shot -- <view> [--phone] [--dark] [--page=<settings page id>]
//   writes shots/<view>[-phone][-dark].png and prints its path. --phone: 390×844 with touch.
// Uses the test build (its bridge puts loadSample and setView on window) in Playwright's Chromium.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveTestBuild } from './lib/chrome.mjs';

const VIEWS = ['dashboard', 'goals', 'activities', 'states', 'visions', 'map', 'timeline', 'graphs', 'guide', 'settings'];
const args = process.argv.slice(2);
const view = args.find(a => !a.startsWith('--'));
if (!VIEWS.includes(view)) {
  console.error(`usage: npm run shot -- <${VIEWS.join('|')}> [--phone] [--dark]`);
  process.exit(2);
}
const phone = args.includes('--phone'),
  dark = args.includes('--dark'),
  setPage = (args.find(a => a.startsWith('--page=')) || '').slice(7);

const { url, close } = await serveTestBuild();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    hasTouch: phone,
    isMobile: phone,
    colorScheme: dark ? 'dark' : 'light',
  });
  await page.addInitScript(() => {
    localStorage.setItem('actionplan.lang', 'en');
    localStorage.setItem('actionplan.v1.tourSeen', 'true');
  });
  await page.goto(url + 'index.html');
  await page.waitForFunction(() => typeof window.loadSample === 'function');
  await page.evaluate(
    ([v, p]) => {
      window.loadSample();
      if (v === 'settings') {
        document.querySelector('#settingsBtn').click(); // a dialog over the Overview
        if (p) document.querySelector(`[data-set-page="${p}"]`).click();
      } else window.setView(v);
    },
    [view, setPage],
  );
  await page.waitForTimeout(500); // the map and timeline settle their scroll after drawing
  const dir = join(ROOT, 'shots');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${view}${setPage ? '-' + setPage : ''}${phone ? '-phone' : ''}${dark ? '-dark' : ''}.png`);
  await page.screenshot({ path: out, fullPage: view !== 'settings' }); // a dialog: the window is enough
  console.log(out);
} finally {
  await browser.close();
  close();
}
