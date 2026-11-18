/** Playwright: the checks the in-page suite cannot make (tests/e2e), on the built app in Chromium. */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['./scripts/playwright-quiet.mjs']],
  use: { ...devices['Desktop Chrome'], locale: 'en-GB', timezoneId: 'Europe/Ljubljana' },
});
