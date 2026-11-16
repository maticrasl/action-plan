# Phase 5 — Shared screen parts

**Goal:** everything on screen that is not a view: helpers, dialogs, forms, menus, settings.
The largest block is "Forms" (`app.js:3193-3869`, 677 lines) and the "Events" half of the file
(`3870-6059`). Likely two sessions; cut after forms.

## What moves

| To | From (`5b71e59`) | 
|---|---|
| `ui/dom.ts` | `$`, `viewEl`, `esc` (222–306), "Small render helpers" 1266–1337 |
| `ui/i18n-dom.ts` | already there from phase 2 |
| `ui/toast.ts` | toast with action button, 3870–3898 |
| `ui/dialog.ts` | backdrop-click rule (press inside, release outside does not close), open/close helpers |
| `ui/forms/` | "Forms" 3193–3869: `form.ts` (open, validate, submit), then one file per kind (goal, activity, state, vision) and one for the relations field. Follow the code's own seams |
| `ui/calendar.ts` | "Calendar for date fields" 4389–4533 |
| `ui/reached.ts` | "Target reached" 3899–3950 |
| `ui/amount-popover.ts` | "Amount popover" 3951–4081 |
| `ui/nav.ts` | "More menu" 4082– (only the menu part), sidebar collapse 4951–4970 |
| `ui/plan-io.ts` | dialogs of "Import / export / sample" 4534–4807, and all of `backup.js` (full backup and restore) |
| `ui/templates-dialog.ts` | 4808–4905 |
| `ui/settings.ts` | 4906–4950, language and theme 5951–6010 |
| `ui/plan-switcher.ts` | 5765–5866 |
| `ui/plan-dialogs.ts` | delete 5867–5917, merge 5918–5950 |
| `ui/install.ts` | 6011–6059 |
| `ui/sync-ui.ts` | `renderSync` and sign-in screens left from phase 4 |

Section 4082–4388 is 307 lines under the header "More menu" with only 4 functions: it almost
certainly holds the large delegated click/keyboard handlers. Outline it first.

## The hard part: delegated event handlers

Much of the app listens once on `document` or `#view` and dispatches by `e.target.closest(…)`.
Such a handler mentions every feature and cannot be moved to one module.

1. Outline the handlers (`addEventListener` at top level: about 116). Classify each as
   *belongs to one feature* (move with the feature) or *dispatcher*.
2. For each dispatcher, keep **one** listener, in `ui/events.ts`, and let features register
   their branch:
   ```ts
   onClick('[data-category]', (el, e) => { … })   // registered from the feature's module
   ```
   The dispatcher tries registered selectors **in the order the `if` branches stand today**.
   Order is behaviour: several branches match nested elements and the first one wins, some
   `return`, some fall through. Reproduce exactly that. Registration order must therefore be
   explicit (one list in `ui/events.ts` that imports the handlers), not the accident of module
   load order.
3. If a dispatcher has intricate fall-through logic, leave it whole in `ui/events.ts` calling
   exported functions of the features. A 200-line dispatcher that is correct beats an elegant
   registry that is subtly different. Record in `STATUS.md` which you chose.
4. Listeners that depend on timing (the scroll guard after a menu opens, long-press timers,
   double-click detection via `lastNodeClick`) move together with their state variables. Never
   separate a timer from the variable it guards.

## Steps

1. `ui/dom.ts` first; everything else imports it. `const viewEl = $('#view')` and
   `const modal = $('#modal')` look up the page at load time. That is fine in a module (the
   script runs after the document is parsed) and is not a call into another module.
2. Then toast, dialog, calendar, forms; then the rest in table order.
3. Element lookups: do not convert `$('#id')` calls to typed wrappers en masse. Add types where
   the compiler asks (`as HTMLInputElement` at the lookup), nothing more.
4. HTML strings stay HTML strings. Do not introduce a template helper or change how escaping
   is done. `esc()` is the security boundary against injected markup from imported plans:
   after each move, check that the moved code still calls it wherever it did (the verbatim
   check covers this).
5. Unit tests are not required here. The in-page suite covers screen code; phase 9 reorganises it.

## Done when

- `npm run check` green. `app.js` is under about 2,500 lines (views and their gestures remain).
- No file in `ui/` imports from `views/` or from legacy view code. Where a dialog must cause a
  redraw, it calls a `requestRender()` that `main.ts` connects, or emits an event from phase 4.

## Owner check

Standard check with extra attention to: every dialog (open, Escape, backdrop click, selecting
text inside and releasing outside), the calendar by mouse and keyboard, Ctrl+Enter to save,
validation messages on an empty goal form, the phone "More" menu, undo in a toast.
