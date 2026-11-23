/** Playwright: the app on a phone (390×844, touch): the tab bar, the More sheet, the floating add button, a form, the timeline turned sideways. */
import { expect, test } from '@playwright/test';
import { DIST, quietStart, serve } from './serve';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

let app: Awaited<ReturnType<typeof serve>>;
test.beforeAll(async () => {
  app = await serve(DIST);
});
test.afterAll(() => app.close());

test('tab bar at the bottom, More sheet, floating add button, a form that fits', async ({ page }) => {
  await quietStart(page);
  await page.goto(app.url);
  const nav = page.locator('.nav');
  await expect(nav).toBeVisible();
  const bar = (await nav.boundingBox())!;
  expect(bar.y + bar.height).toBeCloseTo(844, 0);
  expect(bar.width).toBe(390);

  // More holds the extra views; picking one closes the sheet.
  await page.locator('#navMore').tap();
  const sheet = page.locator('#navSheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-sheet-view]')).toHaveCount(5);
  await sheet.locator('[data-sheet-view="timeline"]').tap();
  await expect(sheet).toBeHidden();
  await expect(page.locator('#navMore')).toHaveClass(/active/);

  // The add button floats above the tab bar, at the right.
  await page.locator('.nav [data-view="goals"]').tap();
  const add = page.locator('#addBtn');
  const fab = (await add.boundingBox())!;
  expect([fab.width, fab.height]).toEqual([56, 56]);
  expect(fab.x + fab.width).toBeCloseTo(390 - 16, 0);
  expect(fab.y + fab.height).toBeLessThanOrEqual(bar.y);

  // It opens the goal form, which fits the screen.
  await add.tap();
  const form = page.locator('#modal');
  await expect(form).toBeVisible();
  const box = (await form.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('#f-title').fill('Run a marathon');
  await expect(page.locator('#f-title')).toHaveValue('Run a marathon');
});

test('turned sideways, the timeline dates stick at the top of the screen', async ({ page }) => {
  await quietStart(page);
  await page.goto(app.url);
  await page.locator('[data-sample]').first().tap();
  await page.locator('#navMore').tap();
  await page.locator('[data-sheet-view="timeline"]').tap();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('.tl-body .tl-row').last().scrollIntoViewIfNeeded();
  await expect.poll(async () => (await page.locator('.tl-head').boundingBox())!.y).toBeLessThan(2);
});
