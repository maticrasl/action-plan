import { describe, expect, it } from 'vitest';
import { snapshotDate, snapshotName, snapshotsToDelete } from './snapshots';

// Names for the days `from` to `to` days before 2026-11-18 (a Wednesday).
const days = (from: number, to: number) => {
  const out: string[] = [];
  for (let n = from; n <= to; n++)
    out.push(snapshotName(new Date(Date.UTC(2026, 10, 18 - n)).toISOString().slice(0, 10)));
  return out;
};

describe('snapshot names', () => {
  it('round trip, and other names are not snapshots', () => {
    expect(snapshotName('2026-11-18')).toBe('actionplan-snapshot-2026-11-18.json');
    expect(snapshotDate('actionplan-snapshot-2026-11-18.json')).toBe('2026-11-18');
    expect(snapshotDate('actionplan-sync.json')).toBeNull();
    expect(snapshotDate('actionplan-snapshot-2026-13-45.json')).toBeNull();
    expect(snapshotDate('actionplan-snapshot-2026-11-18.json.bak')).toBeNull();
  });
});

describe('snapshotsToDelete', () => {
  it('keeps everything while there are few', () => {
    expect(snapshotsToDelete(days(0, 6))).toEqual([]);
    expect(snapshotsToDelete([])).toEqual([]);
  });

  it('keeps the newest 7 daily and the newest of each of the 8 weeks before', () => {
    const all = days(0, 120);
    const gone = snapshotsToDelete(all);
    const kept = all.filter(n => !gone.includes(n));
    expect(kept.slice(0, 7)).toEqual(days(0, 6));
    expect(kept.length).toBe(15);
    // One per week (weeks start on Monday) after the daily ones.
    const weeks = kept.slice(7).map(n => {
      const d = new Date(snapshotDate(n) + 'T00:00:00Z');
      return Math.floor((+d / 864e5 + 3) / 7); // days since 1970 (a Thursday), Monday-based
    });
    expect(new Set(weeks).size).toBe(8);
    // The newest of each week: Sunday, as each older week is complete.
    kept.slice(8).forEach(n => expect(new Date(snapshotDate(n) + 'T00:00:00Z').getUTCDay()).toBe(0));
  });

  it('never lists the sync file or names that are not snapshots', () => {
    const names = [...days(0, 60), 'actionplan-sync.json', 'notes.json', 'actionplan-snapshot-x.json'];
    const gone = snapshotsToDelete(names);
    expect(gone).not.toContain('actionplan-sync.json');
    expect(gone).not.toContain('notes.json');
    expect(gone).not.toContain('actionplan-snapshot-x.json');
    expect(gone.length).toBeGreaterThan(0);
  });

  it('works on unsorted input', () => {
    const names = days(0, 30).reverse();
    expect(snapshotsToDelete(names).length).toBe(names.length - 7 - 4);
  });
});
