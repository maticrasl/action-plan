# 0. Foundation

**Goal:** three small pieces that several features need. No change the user can see, apart from
one new sync message.

Read `README.md` first (decision 1, "Stored data").

## 1. The journal: personal data that belongs to no plan

Reviews, discovery answers and "this week's one thing" are about the person, not about one plan.
They get one store, built like the visions store (`js/visions.js` at `5b71e59`).

### Shape

```
journal = {
  reviews:  [ { id, kind: 'week' | 'month' | 'year', period, doneAt, answers, updatedAt } ],
  sessions: [ { id, exercise, date, done, answers, made, updatedAt } ],
  focus:    { week, plan, item, at }        // absent when none was ever set
  deleted:  { [id]: time }                  // reviews and sessions deleted, as plans keep theirs
}
```

- `period`: `'2026-W47'` (ISO week, weeks start on Monday as in the app), `'2026-11'`, `'2026'`.
- `answers`: an object whose keys the owning feature defines (14 for reviews, 01 for sessions).
  The store does not look inside.
- `focus`: `week` is the Monday of the week as a date; `plan` and `item` are ids; `at` is the
  time it was set.
- Ids pass `safeId`. Anything of the wrong type is dropped by `normalizeJournal`.

### Storage and sync

- Local key `actionplan.journal`, through `userStorage`, so each user has their own (memory
  `users-login`: never call `localStorage` directly; reset the module's state in `enterUser`).
- Sync file: a new top-level section `journal`, beside `visions`. Touch points at `5b71e59`:
  `parseStore`, `toFile`, `localStore`, `dropStarterPlans`, `applyStore` (all in `js/drive.js`)
  and `mergeStores` (`js/sync.js`).
- Saving stamps `updatedAt` on reviews and sessions whose content changed and records deleted
  ids, exactly as `saveVisions` does. Share the code if it is the same; do not copy it a third
  time.

### Merge (`mergeJournal(a, b)`, pure, in `core/`)

- Reviews and sessions: by id, the newer `updatedAt` wins, ties by content (`newerOf`); a
  deletion later than the item's last change removes it; tombstones older than
  `TOMBSTONE_DAYS` are forgotten.
- Two reviews of the same `kind` and `period` with different ids (done on two devices before a
  sync): keep both. The Review view shows the later one and lists the other under past reviews.
- `focus`: the one with the later `at`.
- Either side missing or malformed counts as empty.

### API (store layer)

`journal` (read), `saveJournal()`, `addReview(r)`, `updateReview(id, patch)`,
`deleteReview(id)`, the same three for sessions, `setFocus(planId, itemId)`, `clearFocus()`.
Each saves and schedules a sync.

## 2. Sync-file guard

Today the sync file says `version: 1` and nothing reads it. A copy of the app that does not know
a section silently drops it when it uploads.

- `SYNC_VERSION = 2` in this release (the file now has `journal`). `toFile` writes it.
- `parseStore` returns the file's version. In `syncNow`, when the Drive file's version is higher
  than this copy's `SYNC_VERSION`: do not merge, do not write, do not apply. Set the sync status
  to a new one, `update`:

  | Key | English |
  |---|---|
  | `sync.status.update` | Your synced plans were saved by a newer version of Action Plan. Reload to update. |
  | `sync.reload` | Reload |

  The button reloads the page (after asking the service worker to check for an update, if the
  restructure left a helper for that).
- Local work is untouched and keeps being saved on the device; it syncs after the reload.
- Raise `SYNC_VERSION` in every later release that adds a section or changes what an older copy
  would drop. Say so in `docs/decisions.md`.

This cannot protect against copies older than this release; they do not have the guard. They
only drop the `journal` section, and any up-to-date device puts it back at its next sync.

## 3. Working on a plan that is not open

The Today view (09), the reviews (14) and life areas (03) read and change plans other than the
open one. Today only `planHealth` does that, by swapping the module's `db` for the other plan's
data and swapping it back (`js/app.js`, "How a plan is doing").

Add two functions to the store layer and use them everywhere else:

- `withPlan(data, fn)` — runs `fn` with `data` as the plan the core functions see, restores the
  open plan afterwards also when `fn` throws, returns what `fn` returns. Not re-entrant across
  awaits: `fn` must be synchronous. `planHealth` is rewritten to use it.
- `editPlan(planId, fn)` — changes a plan and saves it:
  - the open plan: `fn(db)`, then the normal `save()`;
  - another plan: read it, remember what it holds (the change-tracking snapshot that
    `stampChanges` compares against), run `fn(data)` inside `withPlan`, stamp what changed,
    write it under its key, bump `plansVersion`, schedule a sync. The open plan's own snapshot
    is not disturbed.
  - a plan id that no longer exists: do nothing, return `false`.
  - the "target reached" offer (`offerReached`) runs for the open plan only, as today.

`allPlansData()` (visions module) stays the way to *read* every plan; it is already cached per
change.

## Notes for the builder

1. Nothing in this file shows on screen except the `update` status. Do not add a journal view;
   features 01, 09 and 14 bring the screens.
2. The journal has no export of its own. `17-undo-trash-snapshots.md` adds a backup of
   everything, which includes it.
3. Removing a user (`removeUser`) deletes that user's keys by prefix; check that
   `actionplan.journal` goes with them.

## Test cases

Pure rules (unit tests, written first)
- `normalizeJournal`: empty, missing, wrong types, bad ids, unknown extra fields kept on items.
- `mergeJournal`: newer wins; deletion after the last change removes; a change after the deletion
  survives; same result merging a→b and b→a; two reviews for one period with different ids both
  kept; `focus` by later `at`; one side without a journal.
- `withPlan`: core answers (for example `goalProgress`, `routineToday`) for another plan match
  those given when that plan is open; the open plan is restored after a throw.
- `editPlan` on another plan: changed items get a new `updatedAt`, untouched ones keep theirs; a
  removed item gets a tombstone; a second `editPlan` on the open plan afterwards stamps only its
  own changes.

Page steps
- A review added on one user does not show for a second user on the device; switching back
  shows it again.
- Sync with a fake Drive: the journal goes up; a second device gets it; a file without `journal`
  merged with a local journal uploads the journal again.
- Guard: a Drive file with `version: 3` gives the `update` status, writes nothing, changes
  nothing locally; the Reload button reloads.

Edge cases
- Storage full when saving the journal: the toast `err.storage`, nothing else breaks.
- Two tabs: a review saved in one shows in the other on its next render (a `storage` listener,
  as for the users list).
- Fixture: a sync file written by this release is read by the fixture test; a `5b71e59` sync
  file (no `journal`, `version: 1`) still loads.

## Owner's choices (2026-11-21)

- The journal raises the sync file to `version: 3`. Older copies stop with the `update` status
  instead of writing a file without the journal.
- "Back up everything" includes the journal; restoring merges it (`mergeJournal`), never
  overwrites. Older versions restore such a file and ignore the journal.
