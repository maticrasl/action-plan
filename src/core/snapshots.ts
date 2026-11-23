/** Dated copies of the sync file in Drive: their names and which old ones to delete. */

export const SNAPSHOT_PREFIX = 'actionplan-snapshot-';
const NAME = /^actionplan-snapshot-(\d{4}-\d{2}-\d{2})\.json$/;
const DAILY = 7,
  WEEKLY = 8;

export const snapshotName = (day: string) => `${SNAPSHOT_PREFIX}${day}.json`;

// The day in a snapshot's name, or null when the name is not a snapshot's.
export function snapshotDate(name: string): string | null {
  const day = NAME.exec(name)?.[1];
  const ms = day ? Date.parse(day + 'T00:00:00Z') : NaN;
  return !isNaN(ms) && new Date(ms).toISOString().startsWith(day!) ? day! : null;
}

// Monday-based week number (1 January 1970 was a Thursday).
const week = (day: string) => Math.floor((Date.parse(day + 'T00:00:00Z') / 864e5 + 3) / 7);

// Keeps the newest 7 copies, then the newest copy of each of the 8 weeks before them. Names that
// are not snapshots are never listed.
export function snapshotsToDelete(names: string[]): string[] {
  const dated = names
    .map(name => ({ name, day: snapshotDate(name) }))
    .filter((s): s is { name: string; day: string } => !!s.day)
    .sort((a, b) => b.day.localeCompare(a.day));
  const weeks = new Set<number>();
  return dated
    .slice(DAILY)
    .filter(s => {
      const w = week(s.day);
      if (weeks.has(w) || weeks.size >= WEEKLY) return true;
      weeks.add(w);
      return false;
    })
    .map(s => s.name);
}
