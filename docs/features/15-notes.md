# 15. Notes

**Goal:** a dated place for what the numbers do not say: "knees fine after long runs", "moved
the date because of the flu", "what made the difference". Notes on goals, activities and current
states; a short note on a single measurement (the idea parked on 2026-10-27); and a closing note
when a goal is reached.

Read `README.md` first (decision 2, "Stored data").

## What the user sees

### Notes on an item

In the form of a goal, an activity or a current state, a section **Notes** at the end:

```
 NOTES
 [ Add a note…                                             ]  [ today ▾ ]  [Add]
 15 Nov   Moved the long run to Sunday; Saturdays never work.            ⋯
 2 Nov    Knees fine after 6 km.                                         ⋯
```

- Newest first. `⋯` offers Edit and Delete. Editing happens in place.
- A note is saved with the form's own Save, like every other field. Cancel drops what was added.
- The date defaults to today and can be set back, not forward.
- At most 2,000 characters; a counter shows from 1,800.

Without opening the form:

- The item's context menu (long-press or right-click) gets **Add a note**. It opens a small
  popover at the item, like the amount popover: a text field, the date, Add. Enter adds; Esc
  or a click elsewhere leaves everything as it was.
- A card that has notes shows a small tag `✎ 3`. Tapping it opens the form scrolled to Notes.

### A note on a measurement

- The value popover (plain state) and the amount popover (state that adds up) get an optional
  line **Note** under the number. So does the value row in the state form.
- In Graphs, the table under a graph shows the note beside the value; a point with a note has a
  small ring, and its tooltip shows the note under the value.
- At most 200 characters.

### The closing note

When a goal becomes Achieved (the "target reached" toast's button, the form, the context menu),
a small dialog follows:

> **You reached “Run 5 km without stopping”**
> What made the difference? Two lines are enough; you will be glad of them at the next goal.
> [ …                                            ]
>
> [ Save ]   Skip

- Save stores the text as a note on the goal, dated today, of the kind `closing`. Skip stores
  nothing. Both close the dialog; the goal is achieved either way.
- The dialog appears once per goal becoming achieved. Setting a goal back to Active and
  achieving it again shows it again, with the earlier closing note below the field.
- `07-keep-goals.md` adds a second question to this dialog ("Keep this result?"). Leave room.
- A closing note shows in the goal's Notes with a small label "Closing note".
- Not shown in a demo plan, and not while the walkthrough's welcome card is open.

## Rules

### Stored data

On a goal, an activity or a state:

```
notes:        [ { id, date, text, kind?, at } ]     // kind: 'closing' or absent
droppedNotes: { [noteId]: 1 }                        // deleted notes, so a merge does not bring them back
```

- `date` is the day the note is about; `at` is the time it was written or last changed.
- Kept sorted by `date`, then `at`.
- `normalize` drops notes without a plain id or with a non-string text; drops `notes` and
  `droppedNotes` of the wrong type.

On a measurement (`history` entry of a plain state) and on an amount (`entries` of a state that
adds up): `note`, a string. Absent when empty.

### Merge

Add one helper, shaped like `mergeEntries` and `mergeList` (`js/sync.js` at `5b71e59`), and call
it for all three kinds:

`mergeNotes(merged, newer, older)` — notes from both copies by id; on a clash the one with the
later `at` wins; a note in either copy's `droppedNotes` is gone; `droppedNotes` is the union.

- States and activities have a merge function already (`mergeState`, `mergeActivity`): call the
  helper there. Goals merge as whole items today: add `mergeGoal` (newer copy wins, then
  `mergeNotes`) and register it beside the other two.
- Measurement notes need nothing: a measurement merges as one piece (per date, per amount id).

A copy of the app from before this feature keeps `notes` on items it does not understand (it
writes whole items back). When it merges two edits of the same goal it takes the newer goal
whole, so a note added on the other device at the same time can be missing until that device
syncs again with an up-to-date copy. Accept that.

### Changing notes

Pure functions in `core/`: `addNote(item, { date, text, kind })`, `editNote(item, id, text,
date)`, `deleteNote(item, id)` (removes and records in `droppedNotes`), `notesOf(item)` (newest
first). Text is trimmed; empty text is not added; an edit to empty text deletes.

### Export, import, deletion

- `resetProgress` removes `notes`, `droppedNotes` and every measurement `note`.
- The import question ("Keep the progress?") lists notes: add them to `progressCounts`
  (`import.notes`: "{n} notes").
- Deleting an item deletes its notes with it; restoring it from Recently deleted (17) brings
  them back.
- Notes are searched by the views' search box (title and description are today; add note
  texts).

### The done log

A note appears in the done log (13) on its `date`, under the filter "All" only, as
`✎ <item title>: <first 80 characters>`.

## Strings

| Key | English |
|---|---|
| `notes.title` | Notes |
| `notes.add` | Add a note… |
| `notes.addBtn` | Add |
| `notes.count` | `{ one: '{n} note', other: '{n} notes' }` |
| `notes.edit`, `notes.delete` | Edit · Delete |
| `notes.closing` | Closing note |
| `notes.tooLong` | A note can hold 2,000 characters. |
| `ctx.addNote` | Add a note |
| `toast.noteAdded` | Note added |
| `f.valueNote` | Note |
| `f.valueNotePh` | Optional: what was different today? |
| `closing.title` | You reached “{name}” |
| `closing.text` | What made the difference? Two lines are enough; you will be glad of them at the next goal. |
| `closing.save`, `closing.skip` | Save · Skip |
| `closing.earlier` | Last time you wrote: |
| `import.notes` | `{ one: '{n} note', other: '{n} notes' }` |

## Guidance

- Guide, article `h-states`: add "A value can carry a short note, such as “after two weeks
  off”. It shows under the graph and on the point."
- Guide, article `h-goals` and `h-activities`: add one sentence each: "Notes at the end of the
  form keep dated remarks; long-press the card and choose “Add a note” to write one quickly."
- Guide, article `reached`, first bullet ("Note what worked… Write two lines in the goal's
  description"): change to "The app asks when you mark the goal Achieved. Two lines are
  enough."
- Tips: the planned tip `achieved` ("…what made the difference?") gets the button **Write a
  closing note** when the goal has none, opening the dialog again.
- Sample plan: one note on a goal and one on a measurement (decision 11).

## Notes for the builder

1. The state description field was changed on 2026-10-27 from "where you are now" to "what is
   measured", because snapshot text went stale. Notes are the dated home for that text. Do not
   bring the old meaning back.
2. Notes in forms follow the form's Save and Cancel. Notes from the popover save at once (with
   a toast), like an amount.
3. Keep notes out of cards, apart from the count tag. The cards are busy enough.
4. Text goes into the page only through `esc()`. Line breaks in a note are shown as line breaks
   (`white-space: pre-line`), nothing else is interpreted.

## Test cases

Pure rules (unit tests, written first)
- `addNote`, `editNote`, `deleteNote`: trimmed; empty not added; edit to empty deletes; order by
  date then `at`; deleted id recorded.
- `mergeNotes`: a note added on each side gives both; the same note edited on both sides keeps
  the later `at`; deleted on one side and edited earlier on the other stays deleted; merging
  a→b and b→a gives the same; items without notes on either side get no empty array.
- `mergeGoal`: the newer goal's fields win and notes from both are kept.
- `normalize`: bad notes dropped, good ones kept; a `5b71e59` plan loads unchanged.
- `resetProgress` clears notes and measurement notes; `progressCounts` counts them.

Page steps
- Add a note in the goal form, save: the tag `✎ 1` shows; cancel instead: nothing added.
- Add from the context menu: popover, Enter adds, toast; Esc adds nothing.
- Edit and delete in the form; the deleted note does not come back after a sync with a copy
  that still has it.
- A value with a note: shown in the table, ring on the point, text in the tooltip; the note
  survives editing the state's title.
- Achieve a goal three ways (toast button, form, context menu): the closing dialog shows each
  time; Save stores a `closing` note; Skip stores none.
- Search finds an item by a word in its note.

Edge cases
- 2,000 characters accepted, 2,001 refused with the message; a note with `<b>`, `&`, quotes
  and line breaks is shown as typed.
- A note dated before the item's start date is allowed.
- Demo plan: no closing dialog.
- Phone width: the popover fits above the keyboard; the Notes section wraps.
- Fixture: a plan with notes on all three kinds and on a measurement.
