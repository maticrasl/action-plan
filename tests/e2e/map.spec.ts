/** Playwright: the map with real (classic) scrollbars, which the in-page suite hides: no needless sideways scroll. */
import { expect, test } from '@playwright/test';
import { DIST, quietStart, serve } from './serve';

// Short, so the pane scrolls up and down and shows a vertical scrollbar that takes room.
test.use({ viewport: { width: 1280, height: 300 }, launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

let app: Awaited<ReturnType<typeof serve>>;
test.beforeAll(async () => {
  app = await serve(DIST);
});
test.afterAll(() => app.close());

test('a map that fits the width has no horizontal scrollbar beside a vertical one', async ({ page }) => {
  await quietStart(page);
  await page.goto(app.url);
  await page.locator('.nav [data-view="map"]').click();
  await expect(page.locator('#view[data-view="map"]')).toBeVisible();
  const pane = await page.evaluate(() => {
    const m = document.querySelector('#view')!.parentElement!;
    return { sw: m.scrollWidth, cw: m.clientWidth, sh: m.scrollHeight, ch: m.clientHeight, ow: m.offsetWidth };
  });
  expect(pane.sh, 'it scrolls up and down').toBeGreaterThan(pane.ch);
  expect(pane.ow, 'its scrollbar takes room').toBeGreaterThan(pane.cw);
  expect(pane.sw, 'nothing to scroll sideways').toBe(pane.cw);
});
