/** Playwright: data made by the pre-restructure app survives the new build on the same origin; the old cache goes. */
import { expect, test, type Page } from '@playwright/test';
import { DIST, oldApp, quietStart, serve } from './serve';

type Stored = { plans: { current: string; list: { id: string; name: string }[] }; goals: string[] };
const stored = (page: Page) =>
  page.evaluate((): Stored => {
    const plans = JSON.parse(localStorage.getItem('actionplan.plans')!);
    const plan = JSON.parse(localStorage.getItem('actionplan.plan.' + plans.current)!);
    return {
      plans: { current: plans.current, list: plans.list.map((p: Stored['plans']['list'][0]) => ({ id: p.id, name: p.name })) },
      goals: plan.goals.map((g: { title: string }) => g.title),
    };
  });
const cacheNames = (page: Page) => page.evaluate(() => caches.keys());

test('old app, then the new build on the same origin: data intact, old cache gone', async ({ page }) => {
  const app = await serve(oldApp());
  await quietStart(page);
  await page.goto(app.url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(await cacheNames(page)).toEqual(['actionplan-v1']);

  // Data made with the old app: the sample plan (its scripts are classic, so loadSample is global).
  await page.evaluate(() => (window as unknown as { loadSample: () => void }).loadSample());
  const before = await stored(page);
  expect(before.goals.length).toBeGreaterThan(0);

  // The new build replaces the old files; the next launch loads it from the network.
  app.setRoot(DIST);
  await page.reload();
  await expect(page.locator('script[type="module"]')).toHaveCount(1); // the built app, not the old scripts
  await expect.poll(() => cacheNames(page), { timeout: 15000 }).toEqual([expect.stringMatching(/^actionplan-(?!v1$)/)]);
  await page.reload();
  expect(await stored(page)).toEqual(before);
  await expect(page.locator('.plan-switch').first()).toContainText(before.plans.list.find(p => p.id === before.plans.current)!.name);
  await app.close();
});
