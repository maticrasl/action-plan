/** Playwright: after one visit the app starts without a connection, from the service worker's cache. */
import { expect, test } from '@playwright/test';
import { DIST, quietStart, serve } from './serve';

test('load once, go offline, reload: the app starts', async ({ page, context }) => {
  const app = await serve(DIST);
  await quietStart(page);
  await page.goto(app.url);
  await page.evaluate(() => navigator.serviceWorker.ready); // installed: the shell is cached
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // No connection: the browser is offline and the server is gone too.
  await context.setOffline(true);
  await app.close();
  await page.reload();
  await expect(page.locator('.nav [data-view="goals"]')).toBeVisible();
  await expect(page.locator('#view')).not.toBeEmpty();
  await page.locator('.nav [data-view="goals"]').click();
  await expect(page.locator('.nav [data-view="goals"]')).toHaveClass(/active/);
});
