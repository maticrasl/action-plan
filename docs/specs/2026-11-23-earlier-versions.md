# Earlier versions and merging a backup (WP-006, feature 17 session B)

The rules, texts and tests are in `docs/features/17-undo-trash-snapshots.md` (B). This page
records what is left to build and the choices made while building it.

## What

1. **Dated copies in Drive.** The first sync of a day that is about to change the Drive file first
   copies the file as it is (Drive `files.copy`, nothing uploaded) to
   `actionplan-snapshot-<yyyy-mm-dd>.json` in the app folder, then deletes what
   `snapshotsToDelete` names (keeps 7 daily + the newest of each of the 8 weeks before).
   A failure never fails the sync; it is tried at the next sync.
2. **Earlier versions** row in Settings › Account and sync (connected only). Its dialog lists the
   copies by date (names only; content is fetched when one is chosen). Choosing one opens the
   restore chooser. A copy from a newer version says "Made by a newer version. Reload to update."
3. **Restore chooser** (shared by earlier versions and Restore from a backup…): plans to bring
   back (all ticked), "Also bring back visions that are missing now" (ticked). For a backup file
   also *Add as copies* (default) or *Merge into my plans*. Merge = `mergeStores(local, backup)`
   then the normal apply, with Undo.

## Data

- New Drive files only; the sync file's name and format do not change, and older copies look
  the sync file up by name, so they never see the snapshots. No local stored data changes.
- `prefs.snapshotDay` (per user, this device): the day a copy was last made, so Drive is listed
  at most once a day per device.

## Choices made while building

- The list shows the date only (from the name), not "3 plans · 142 items": counting would need
  every copy downloaded. The chooser shows the plans once a copy is opened.
- Undo of a merge puts the whole previous local store back. It is offered only until the next
  upload to Drive: after that, a later sync would bring the merged items back.
- The programmatic `restoreText` (fixtures, tests) keeps adding everything as copies.

## Modules

`core/snapshots.ts` (names, pruning; unit test), `sync/drive.ts` (list, copy, read by id),
`sync/snapshots.ts` (make and prune after sync), `sync/sync.ts` (call it; `uploaded` event),
`ui/restore-dialog.ts` (chooser), `ui/versions-dialog.ts` (list), `ui/plan-io.ts`
(options for `restoreBackup`, `mergeBackup`), `ui/undo.ts` (whole-store undo), `index.html`,
i18n, Guide `p-backup`, `p-google`.

## Tests

Unit: `snapshotsToDelete` (7 + 8 kept, foreign names never, sync file never, bad dates).
Page (`tests/browser/versions.js`): first sync of the day copies the previous file; second sync
that day does not; pruning deletes the named ones; a failing copy does not fail the sync; Earlier
versions lists copies and adds chosen plans as dated copies without touching existing plans;
the visions box; a newer-version copy cannot be opened; offline message; backup restore with a
subset of plans; Merge keeps a deletion made after the backup; Undo reverts the merge.
