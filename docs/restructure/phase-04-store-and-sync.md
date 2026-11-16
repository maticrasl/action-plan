# Phase 4 — State, storage and sync

**Goal:** one place owns the current data and how it is stored; the Drive client is separate
from the screen. This phase touches the code that reads and writes users' data: the fixture
test is your main guard. Run `npm run test:fixtures` after every move.

## What moves

| To | From | Notes |
|---|---|---|
| `store/users.ts` | `users.js` | user list, `userStorage`, `userSession`, key prefix rule |
| `store/prefs.ts` | `prefs`, `app.js:56-63` | |
| `store/state.ts` | `db`, `plans`, `ui`, `freshUi`, setters, `app.js:42-55, 72-73` | reassigned state with setters (RULES §8) |
| `store/plans.ts` | "Plans", `app.js:67-221` | `load`, `save`, `readPlan`, `openPlan`, create/rename/delete plan, name rules |
| `store/visions.ts` | storage part of `visions.js` | `loadVisions`, save, snapshot |
| `sync/drive.ts` | `drive.js`, network part | token, file read/write, account lookup |
| `sync/sync.ts` | `drive.js`, scheduling part | `syncNow`, `scheduleSync`, `syncState`, merge application |
| `sync/config.ts` | `config.js` | |

Sync's screen parts (`renderSync`, the sync button, sign-in dialogs) stay in legacy until phase 5.

## The one design change: events instead of upward calls

`save()` today calls `offerReached()` (a popup), `toast()` and `scheduleSync()`;
`openPlan()` calls `renderPlanSwitch()` and `render()`; the Drive code calls `render()` and
`toast()`. Storage must not import the screen.

Add `store/events.ts`: a minimal typed emitter, about 20 lines, no library:

```ts
type Events = { saved: void; planOpened: void; storeReplaced: void; storageError: void; syncChanged: void };
export function on<K extends keyof Events>(name: K, fn: (p: Events[K]) => void): void
export function emit<K extends keyof Events>(name: K, p: Events[K]): void
```

- Store and sync code `emit`. `main.ts` connects the events to the screen functions, **in the
  order the calls happen today**. Example: `save()` currently runs `offerReached()` first,
  then stamps and writes, then schedules the sync. If any of that order matters (it does for
  `offerReached`, which can change data before it is written), keep the call where it is by
  passing it in, e.g. a `beforeSave` hook, not by reordering.
- Use events only where a lower layer must reach a higher one. Do not convert ordinary
  downward calls.
- Add only the events you need; the list above is a guess from reading `save`, `openPlan` and
  `enterUser`.

## Steps

1. `users` first (it is the bottom: everything stores through it), then `prefs`, `state`,
   `plans`, `visions` store, then Drive. Move commit and type commit for each, as always.

2. **`enterUser` and `bootUser`** (`app.js:6062-6112`) reset state across many modules. They
   stay in legacy or `main.ts` this phase; they move to `main.ts` for good in phase 8. Do not
   spread their resets across modules now.

3. **Storage access.** After this phase `localStorage`/`sessionStorage` appear only in
   `store/users.ts`, the inline theme script in `index.html`, the language key, and the test
   files. Add an ESLint `no-restricted-globals` rule saying so for the rest of `src/`.

4. **Drive client and tests.** Tests swap Drive methods for fakes (`REAL_DRIVE = { ...drive }`
   at `tests/more.js:4`). `drive` must stay one exported object whose methods are looked up at
   call time, or those fakes stop working without any test failing loudly. Verify by making a
   Drive test fail on purpose once.

5. **Unit tests** (ported, as in phase 3): plan name rules, key prefix rule for the first and
   later users, `readUsers` with malformed input.

## Done when

- `npm run check` green; `src/legacy/users.js`, `drive.js`, `config.js`, `visions.js` are gone.
- Fixture test green at every commit of the branch (`git rebase --exec "npm run test:fixtures"`
  over the branch proves it).
- No module in `store/` or `sync/` imports from `ui/`, `views/`, `tutorial/` or legacy screen code.

## Owner check

Standard check, plus the data paths, on `npm run preview`:
- two plans: create, rename, switch, delete one
- export full copy and template; import both
- back up everything; restore from that backup: every plan comes back as a copy
- reload the page: everything is still there
- after "ship it", on the live site: sign-in state, sync button, a change on the PC arriving on
  the phone. Sync cannot be checked locally unless you added the localhost origins.
