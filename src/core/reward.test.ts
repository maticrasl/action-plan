import { describe, expect, test } from 'vitest';
import { rewardToast } from './reward';

describe('rewardToast', () => {
  test('alone, after the usual text, and with the stop it already has', () => {
    expect(rewardToast('have a coffee')).toBe('Done. Now: have a coffee.');
    expect(rewardToast('have a coffee', "That's this week done.")).toBe("That's this week done. Now: have a coffee.");
    expect(rewardToast('read ten pages!')).toBe('Done. Now: read ten pages!');
    expect(rewardToast('rest.')).toBe('Done. Now: rest.');
  });
  test('no reward leaves the usual text', () => {
    expect(rewardToast(undefined, 'Done today')).toBe('Done today');
    expect(rewardToast('   ', 'Done today')).toBe('Done today');
    expect(rewardToast('')).toBe('');
  });
});
