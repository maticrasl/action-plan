import { expect, test } from 'vitest';
import { browserOf, feedbackDetails, feedbackUrl, type FeedbackEnv } from './feedback';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

const env: FeedbackEnv = {
  version: '2026.11.20-a1b2c3',
  ua: CHROME_WIN,
  width: 1280,
  height: 720,
  lang: 'English',
  installed: false,
  sync: 'on',
};

test('the details line holds exactly the listed details', () => {
  expect(feedbackDetails(env)).toBe(
    'Version 2026.11.20-a1b2c3 · Chrome 155 on Windows · 1280×720 · English · installed: no · sync: on',
  );
  expect(feedbackDetails({ ...env, installed: true, sync: 'not set up' })).toMatch(
    /installed: yes · sync: not set up$/,
  );
});

test('nothing personal gets in, whatever else the env object carries', () => {
  const leaky = { ...env, plan: 'My secret plan', title: 'Quit job', email: 'a@b.c', user: 'Ana' } as FeedbackEnv;
  const line = feedbackDetails(leaky);
  for (const bad of ['My secret plan', 'Quit job', 'a@b.c', 'Ana']) expect(line).not.toContain(bad);
});

test('browser and system from the user agent', () => {
  expect(browserOf(CHROME_WIN)).toBe('Chrome 155 on Windows');
  expect(
    browserOf(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    ),
  ).toBe('Edge 140 on Windows');
  expect(browserOf('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0')).toBe(
    'Firefox 140 on Linux',
  );
  expect(
    browserOf(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    ),
  ).toBe('Safari 18 on iOS');
  expect(
    browserOf(
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
    ),
  ).toBe('Chrome 150 on Android');
  expect(browserOf('')).toBe('unknown browser on unknown system');
});

test('links: the right form, values encoded', () => {
  expect(feedbackUrl('o/r', 'idea', '1+2')).toBe(
    'https://github.com/o/r/issues/new?template=feature.yml&version=1%2B2',
  );
  expect(feedbackUrl('o/r', 'bug', 'dev', 'Chrome 155 on Windows · 1×1')).toBe(
    'https://github.com/o/r/issues/new?template=bug.yml&version=dev&environment=Chrome%20155%20on%20Windows%20%C2%B7%201%C3%971',
  );
});
