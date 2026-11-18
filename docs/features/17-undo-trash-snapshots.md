# 17. Undo, recently deleted, earlier versions, full backup

**Goal:** nothing a person wrote is lost by one wrong tap, and there is a way back from a bad
week of edits. Today a deleted item or plan is gone ("A deleted plan cannot be brought back"),
and visions are in no export at all.

Two sessions: **A** undo and recently deleted; **B** earlier versions and the full backup.

Read `README.md` first (decision 3, "Stored data") and `00-foundation.md`.

## What the user sees

### A. Undo

After deleting a goal, a state, an activity, a vision, a relationship or a plan, the toast gets
a button:

> Activity deleted · **Undo**

It stays for eight seconds, as toasts with a button do today. Undo puts back exactly what was
there: the item, its relationships, its notes, its place in lists.

The same button follows any action that changes many things at once: moving late steps (12), a
CSV import (19), changes made by the assistant (20), "Empty" of a list. Those features call the
helper below; they do not build their own.

Only the last action can be undone, and only until the next change or a reload.

### A. Recently deleted

Settings › Data gets a button **Recently deleted** (with a count when not empty). It opens a
dialog:

```
 Recently deleted                                              [ Empty ]
 Kept on this device for 30 days.

 ✓  Buy running shoes            activity · Running plan · deleted 2 days ago     [Restore]  ⋯
 ⚑  Run a marathon               goal · Running plan · deleted 5 days ago         [Restore]  ⋯
 ▣  House                        plan · 14 items · deleted 3 weeks ago            [Restore]  ⋯
```

- **Restore** puts the item back into its plan with its relationships and notes; a plan comes
  back under its name (with a number added if the name is taken now). The toast names what was
  restored and offers "Show".
- `⋯` offers **Delete for good**. **Empty** deletes all, after a confirmation.
- An item whose plan is gone: Restore asks "Its plan no longer exists. Restore into “{current
  plan}”?".
- Relationships to items that no longer exist are left out; the toast says so ("Restored. 2
  links could not be put back.").
- The line "Kept on this device for 30 days." is the whole explanation; the Guide says the rest.

The plan-delete dialog today says the deletion cannot be undone and offers a backup download.
Change its strong line to "You can restore it from Settings › Recently deleted for 30 days, on
this device." Keep the backup button.

### B. Earlier versions (with Google sync)

Settings › Account and sync gets a row **Earlier versions** (only when connected). It opens a
dialog listing dated copies kept in the user's Drive:

```
 Earlier versions
 Copies of all your plans, kept in your Google Drive.

 Today, 08:12            3 plans · 142 items
 Yesterday               3 plans · 140 items
 Sat 8 Nov               3 plans · 131 items
 …
 [ Open as copies… ]
```

- Choosing one and **Open as copies…** asks which plans to bring back (all ticked), and whether
  to bring back visions that are missing now. Each chosen plan is added as a new plan named
  "{name} ({date})". Nothing existing is changed.
- Offline, or sync paused: the dialog says "Connect to see earlier versions." with the usual
  button to continue syncing.

### B. Back up everything

Settings › Data gets **Back up everything**: one file with every plan, the visions and the
journal. And **Restore from a backup…**: choosing such a file opens the same "Open as copies…"
dialog as an earlier version, with one more choice:

- **Add as copies** (default): plans as new plans, missing visions, reviews and reflections that
  are not here.
- **Merge into my plans**: what a sync with another device would do: newer changes win on each
  item, and things deleted here after the backup stay deleted. One sentence says so.

The existing per-plan export and import stay as they are.

## Rules

### Undo

One helper in the store layer:

`undoable(label, fn)` — takes a copy of what `fn` may change (the open plan's data, the visions,
and the plan list when a plan is deleted), runs `fn`, and shows the toast `label` with Undo.
Undo puts the copies back, saves, and renders.

- Putting back goes through the normal save, so change tracking sees the returned items as
  changed now: they get a fresh `updatedAt` and their tombstones are removed (`stampChanges`
  already does this for an id that is back).
- The copy is kept in memory only. A later save by anything else (a tick, a sync that changed
  the plan) drops it and hides the toast's button: undoing over newer work would lose it.
- Switching user or plan drops it (`enterUser` already hides the toast for this reason).
- Deleting through the form's Delete button, the map (`askDeleteItem`), the Delete key and the
  context menu all go through it. The confirmation before deleting an item is removed where Undo
  now exists: one tap, then Undo. Deleting a plan keeps its dialog.

### Recently deleted

Device store, per user: key `actionplan.trash` through `userStorage`, not synced, not in any
export.

```
trash = [ { id, kind: 'goal' | 'state' | 'activity' | 'vision' | 'plan',
            title, plan, planName, deletedAt,
            payload } ]
```

- `payload` for an item: the item itself and the relationships that touched it. For a vision:
  the vision and the ids of visions that had it as a parent. For a plan: its name and its whole
  data.
- Every deletion adds an entry, also one that is then undone (Undo removes the entry again).
- Kept 30 days from `deletedAt`; older ones are dropped when the app starts and when the dialog
  opens.
- Size: the store may hold up to 1 MB of text. When adding would pass that, the oldest entries
  go first. A single entry over 1 MB (a large plan) is not kept: the plan-delete dialog then
  says "This plan is too large to keep in Recently deleted. Download a backup first." and keeps
  the backup button prominent.
- A failed write (storage full) must never block the deletion: the entry is skipped, the toast
  says "Deleted. It could not be kept in Recently deleted."

Restoring:

- An item goes back into `plan` (through `editPlan` when that plan is not open), keeping its
  id. If the id exists there again, it gets a new id and its relationships follow.
- Relationships are added only when both ends exist and the app's own rule allows the link
  (`canRelate`); the rest are counted for the toast.
- A vision goes back with those parents that still exist; visions that had it as a parent get it
  back when that makes no loop (`canParent`). Goals need nothing: a goal keeps the ids of the
  visions it serves even while they are gone.
- A plan is created with the stored data, as an import is.
- Restoring removes the entry.

### Earlier versions

- After a sync that changed the Drive file, and at most once per calendar day, the app asks
  Drive to copy the sync file as it was **before** this upload into the same hidden folder,
  named `actionplan-snapshot-<yyyy-mm-dd>.json`. Use Drive's copy call so nothing is uploaded
  twice; check the current Drive API documentation for it.
- Keep: the newest 7 daily copies, plus the newest copy of each of the 8 weeks before that.
  Older ones are deleted after a new one is made. `snapshotsToDelete(names, today)` is a pure
  function.
- The list reads names and sizes only; a copy's content is fetched when it is chosen.
- A snapshot is read with the same parser as the sync file, including the version guard: a
  snapshot from a newer version is listed but cannot be opened ("Made by a newer version.
  Reload to update.").
- Failure to make or prune a snapshot never fails the sync; it is tried again at the next one.
- The sync file's name and format do not change (they are a contract). The snapshot files are
  new names beside it; an older copy of the app ignores them, because it looks for the sync
  file by name.

### Full backup file

- Format: the sync file's own format (`format: 'actionplan-sync'`), with `kind: 'backup'` and
  `exportedAt` added. Name `Action Plan backup <date>.json`.
- Reading: the sync parser. A file with another `format` is refused with the existing import
  error; a plan file chosen here says "This is one plan. Use Import plan."
- "Add as copies": for each chosen plan a new plan (new plan id, items keep their ids);
  visions, reviews and reflections whose id is not present are added; those present are left
  alone. `focus` is not restored.
- "Merge into my plans": `mergeStores(local, file)` and then the normal apply, inside
  `undoable`.

### Open as copies: plans and visions

A plan from a snapshot or backup can hold goals serving visions that have since been deleted.
"Bring back missing visions" adds those by id; then the copied goals' links work without
further steps.

## Strings

| Key | English |
|---|---|
| `undo` | Undo |
| `toast.undone` | Put back |
| `trash.title` | Recently deleted |
| `trash.lead` | Kept on this device for 30 days. |
| `trash.empty` | Nothing was deleted lately. |
| `trash.restore`, `trash.forever`, `trash.emptyBtn` | Restore · Delete for good · Empty |
| `trash.confirmEmpty` | Delete all of these for good? |
| `trash.restored` | Restored “{name}” |
| `trash.restoredLinks` | `{ one: 'Restored. {n} link could not be put back.', other: 'Restored. {n} links could not be put back.' }` |
| `trash.planGone` | Its plan no longer exists. Restore into “{plan}”? |
| `trash.notKept` | Deleted. It could not be kept in Recently deleted. |
| `trash.tooLarge` | This plan is too large to keep in Recently deleted. Download a backup first. |
| `planDel.restorable` | You can restore it from Settings › Recently deleted for 30 days, on this device. |
| `versions.title` | Earlier versions |
| `versions.lead` | Copies of all your plans, kept in your Google Drive. |
| `versions.open` | Open as copies… |
| `versions.which` | Which plans? |
| `versions.visions` | Also bring back visions that are missing now |
| `versions.offline` | Connect to see earlier versions. |
| `versions.newer` | Made by a newer version. Reload to update. |
| `versions.done` | `{ one: 'Added {n} plan as a copy', other: 'Added {n} plans as copies' }` |
| `backup.all` | Back up everything |
| `backup.restore` | Restore from a backup… |
| `backup.copies` | Add as copies |
| `backup.merge` | Merge into my plans |
| `backup.mergeHint` | Like syncing with another device: the newer change wins on each item, and what you deleted here after the backup stays deleted. |
| `backup.isPlan` | This is one plan. Use Import plan. |

## Guidance

- Guide, article `p-backup`: replace "A deleted plan cannot be brought back; there is no
  recycle bin." with: "A deleted item or plan stays in Settings › Recently deleted for 30 days,
  on the device where you deleted it. With Google sync on, the app also keeps dated copies of
  all your plans in your Drive: Settings › Account and sync › Earlier versions." Add "Back up
  everything" to the list of ways to be safe, and say that it includes visions, reviews and
  reflections, which the single-plan export does not.
- Guide, article `p-delete`: add that Recently deleted is emptied by "Remove from this device".
  ⚠ Check this against the code: removing a user must delete `actionplan.trash` with the other
  keys.
- Guide, article `p-google`: ⚠ add that the hidden folder also holds the dated copies, and that
  "Delete hidden app data" removes them too.
- Guide, article `h-shortcuts`: "After deleting something, the message at the bottom offers
  Undo for a few seconds."
- The planned tip `backup` and walkthrough task `backup`: their "exported" check also counts a
  full backup (`seen` flag).

## Notes for the builder

1. Session A must not depend on B. `undoable` is needed by 12, 19 and 20.
2. Removing the delete confirmation is a behaviour change in every view. Update the page tests
   that answer the confirmation.
3. Drive counts the hidden folder against the user's storage. Fifteen copies of a file of a few
   hundred kilobytes is small; do not keep more.
4. Trash entries hold other people's text only in the sense of the user's own; still, never
   show `payload` text without `esc()`.
5. Privacy texts marked ⚠ state facts about the code; check them at the end.

## Test cases

Pure rules (unit tests, written first)
- Trash: add, expire at 30 days (29 kept, 31 dropped), size cap drops oldest first, an entry
  over the cap is refused, restore of an item with a taken id gets a new id and its
  relationships follow, relationships to missing ends are counted and left out, a link the rules
  forbid now (would make a loop) is left out.
- Vision restore: parents that exist return; a child link that would loop is skipped.
- `snapshotsToDelete`: 7 daily plus 8 weekly kept; two on one day cannot happen (same name
  replaces); names that are not snapshots are never listed for deletion; the sync file is never
  listed.
- Backup "add as copies": plans get new ids; existing visions untouched; missing ones added.

Page steps
- Delete an activity from the form, the map, the context menu and with the Delete key: no
  confirmation, toast with Undo; Undo restores the item with its relationships and notes, and
  the trash entry is gone.
- After Undo, a sync with a second device that never saw the deletion and one that did: the
  item exists on all three.
- Delete, then tick something else: the Undo button is gone; the item is in Recently deleted;
  Restore brings it back.
- Delete a plan: dialog shows the new line; Restore recreates it; the name gets a number when
  taken.
- Earlier versions with a fake Drive: first sync of the day makes one copy holding the
  *previous* content; a second sync the same day makes none; pruning keeps the right ones; "Open
  as copies" adds plans named with the date and changes no existing plan.
- Back up everything, remove a plan and a vision, restore as copies: both are back. Restore
  with Merge: an item deleted after the backup stays deleted; Undo reverts the merge.

Edge cases
- Storage full while deleting: the deletion happens, the toast says it was not kept.
- Second user on the device has their own Recently deleted; removing a user removes theirs.
- Two tabs: an entry restored in one is not offered again in the other after its next render.
- Offline: Earlier versions shows the message; nothing throws.
- A snapshot written by a newer version is listed and cannot be opened.
- A demo plan deleted with "Remove sample" does not go to Recently deleted.
- Phone width: the dialogs fit; long titles wrap.
