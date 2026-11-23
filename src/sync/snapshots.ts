/** Earlier versions: a dated copy of the sync file once a day, old copies pruned, copies read back. */
import { snapshotDate, snapshotName, snapshotsToDelete } from '../core/snapshots';
import { today } from '../core/dates';
import { prefs } from '../store/prefs';
import { drive, parseStore, type DriveFile } from './drive';
import type { FullStore } from '../core/merge';

// Called by a sync just before it changes the file `id`: copies it as it is now, once a day.
// Never throws, so a sync never fails for it; a failure is tried again at the next sync.
export async function copyBeforeSync(token: string, id: string): Promise<void> {
  const day = today();
  if (prefs.get('snapshotDay') === day) return;
  try {
    const files = await drive.snapshots(token);
    const name = snapshotName(day);
    if (!files.some(f => f.name === name)) {
      await drive.copy(token, id, name);
      files.push({ id: '', name });
    }
    prefs.set('snapshotDay', day);
    const gone = new Set(snapshotsToDelete(files.map(f => f.name)));
    for (const f of files) if (gone.has(f.name) && f.id) await drive.remove(token, f.id);
  } catch (e) {
    /* tried again at the next sync */
  }
}

// The copies, newest first, each with its day.
export async function listSnapshots(token: string): Promise<(DriveFile & { day: string })[]> {
  return (await drive.snapshots(token))
    .map(f => ({ ...f, day: snapshotDate(f.name)! }))
    .filter(f => f.day)
    .sort((a, b) => b.day.localeCompare(a.day));
}

// Throws SyncError 'update' for a copy made by a newer version (parseStore's guard).
export const readSnapshot = async (token: string, id: string): Promise<FullStore> =>
  parseStore(await drive.readText(token, id));
