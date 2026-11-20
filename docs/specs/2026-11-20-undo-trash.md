# Sync-file guard, Undo and Recently deleted (synced)

Builds `docs/features/00-foundation.md` part 2 and `17-undo-trash-snapshots.md` session A, with
one change by the owner (2026-11-20): **Recently deleted syncs** across devices, unless an entry
is deleted for good (by hand, by Empty, or after 30 days). This replaces decision 3's "kept on
the device". Session B (earlier versions, merge from a backup) stays a later session.

## 1. Sync-file guard

- `SYNC_VERSION = 2` (`sync/drive.ts`); `toFile` writes it, `parseStore` returns it.
- `syncNow`: Drive file's version above `SYNC_VERSION` → no merge, no write, no apply; status
  `update` with a Reload button (`sync.status.update`, `sync.reload`). Local saving goes on.
- `docs/decisions.md`: raise `SYNC_VERSION` whenever a section is added.
- Copies older than this release have no guard: they drop `trash` when they upload. Any up-to-date
  device puts it back at its next sync (the merge is a union), so nothing is lost for good.

## 2. Undo

As in 17 ("Rules › Undo"): `undoable(label, fn)` in the store layer keeps in memory a copy of the
open plan, the visions and the plan list, runs `fn`, shows the toast with Undo for 8 s. Any other
save, a sync that changes the plan, or switching plan/user drops the copy. Deleting an item no
longer asks first (form, map, context menu, Delete key); deleting a plan keeps its dialog.

## 3. Recently deleted, synced

Per user, preference key `trash` through `userStorage` (like `tips`), and section `trash` in the
sync file. Not in plan exports.

```
trash = {
  items: [ { id, kind: 'goal'|'state'|'activity'|'vision'|'plan',
             title, plan, planName, deletedAt, payload } ],
  gone:  { [entryId]: time }   // deleted for good, restored, or undone
}
```

- `id` is a new id per deletion (not the item's id), so deleting the same item twice gives two
  entries.
- Merge (pure, `core/trash.ts`): union of `items` by id; an id in either side's `gone` is
  dropped; `gone` is the union. Items older than 30 days are dropped on every device; `gone`
  entries older than 40 days are dropped (by then no device still offers the item).
- Restore, Undo, Delete for good and Empty all write the entry's id to `gone`, so no other
  device offers it again.
- Size: at most 1 MB of text (it also travels in the sync file). Oldest go first; one entry over
  1 MB is not kept (plan-delete dialog says so, as in 17). A failed write never blocks a delete.
- Restore as in 17 (relationships only when both ends exist and `canRelate` allows; visions with
  `canParent`; a taken id gets a new one). An item whose plan exists but is not open is restored
  there in the background through `editPlan` (foundation part 3, `withPlan` and `editPlan`, built
  here as that file describes). An item whose plan is gone asks to restore into the open plan.
- A plan comes back with a new plan id (its old id has a tombstone) and its name, numbered when
  taken.
- Not trashed: "Remove sample" of the demo plan.
- Removing a user from the device removes their `trash` key; what synced stays in their Drive.

Texts: as in 17, except `trash.lead`: "Kept for 30 days. With Google sync, on all your devices."
and `planDel.restorable`: "You can restore it from Settings › Recently deleted for 30 days."
Guide articles `p-backup`, `p-delete`, `h-shortcuts` updated to match (and `p-google`: the
sync file also holds Recently deleted).

## Modules

`sync/drive.ts`, `sync/sync.ts` (guard, trash in local/apply store), `store/plans.ts` (`withPlan`, `editPlan`), `core/merge.ts` (merge
trash in `mergeStores`), new `core/trash.ts` (entries, merge, expiry, cap, restore rules), new
`store/trash.ts` (read/save), new `store/undo.ts` (`undoable`), the delete paths in `ui/` and
`views/map`, new dialog `ui/trash-dialog.ts`, Settings › Data button, `ui/plan-dialogs.ts`,
i18n EN/SL, Guide EN/SL.

## Tests

- Unit: guard (version read, newer file refused); trash merge (union, gone wins both ways,
  expiry 29/31 days, gone pruned at 40); cap drops oldest, oversize refused; restore rules from
  17's test list; `mergeStores` with and without `trash`.
- Fixture: a sync file written by the current code (version 1, no `trash`) reads and merges;
  a version 2 file still parses with the old reader's fields.
- Page: 17's page steps for undo and Recently deleted; plus two devices: deleted on A shows in
  B's Recently deleted after sync; restored on B is gone from A after sync; storage full;
  second user separate; newer sync file shows the Reload status.
