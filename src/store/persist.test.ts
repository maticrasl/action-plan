import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const load = async () => (await import('./persist')).keepStorage;
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('keepStorage', () => {
  test('asks the browser once per page load', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('navigator', { storage: { persist } });
    const keepStorage = await load();
    keepStorage();
    keepStorage();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  test('a browser without the API: nothing happens', async () => {
    vi.stubGlobal('navigator', {});
    expect(await load()).not.toThrow();
  });

  test('a refusal is ignored', async () => {
    vi.stubGlobal('navigator', { storage: { persist: () => Promise.reject(new Error('no')) } });
    (await load())();
    await new Promise(r => setTimeout(r));
  });
});
