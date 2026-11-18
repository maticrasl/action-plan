# 19. Measurements in and out as CSV

**Goal:** someone with two years of weight in a spreadsheet can bring it in, and anyone can
take their measurements out to a spreadsheet. Today values are typed one by one and leave the
app only inside a plan file.

Needs `17-undo-trash-snapshots.md` (session A, for Undo). Uses the measurement note of 15 when
built.

## What the user sees

### Export

- On a state's graph card (Graphs) and in the state form, a menu entry **Export as CSV**: one
  file for that state.
- In the Export plan dialog, a third choice beside "Full copy" and "Template":
  **Measurements (CSV)**, one file with every state of the plan.

### Import

On a state's graph card and in the state form: **Import from CSV…**. It asks for a file, or
text pasted into a field, and then shows a preview:

```
 Import into “Body weight” (kg)

 Read 124 rows: date in column 1 (day/month/year), value in column 2, note in column 3.
   2 Jan 2025     82.4
   9 Jan 2025     82.1      after the holidays
   16 Jan 2025    81.7
   … and 121 more

 118 new · 5 on days that already have a value · 1 skipped
   line 17: “n/a” is not a number

 On days that already have a value:   (•) keep mine   ( ) take the file's

 Dates read as   ( day/month/year ▾ )

 [ Import 118 values ]   Cancel
```

- The app works out the columns and the date order by itself (rules below) and says what it
  read. The date order can be changed; the preview follows.
- Skipped lines are listed with their line number and reason, the first five, then "and {n}
  more".
- After importing: toast "118 values imported · Undo".
- A state with no measurements can be imported into right after it is created.

## Rules

### File format written

- UTF-8 with a byte-order mark (spreadsheets then read the letters right), lines ending in
  CRLF, comma as separator, fields quoted when they hold a comma, a quote or a line break,
  quotes doubled.
- One state: header `date,value,note` (plain state) or `date,amount,note` (adds up). Dates as
  `yyyy-mm-dd`. Numbers with a dot, no thousands separator.
- Whole plan: header `state,unit,date,value,note`, one line per measurement or amount, by
  state, then date.
- A text cell that starts with `=`, `+`, `-` or `@` is written with a leading apostrophe, so a
  spreadsheet does not run it as a formula. Numbers are never changed.
- File name: the state's (or plan's) name with characters a file name cannot hold removed, and
  today's date, as plan exports are named.

### Reading

`core/csv.ts`, pure, no library:

- `parseCsv(text)` → rows of cells. Handles the byte-order mark, CRLF and LF, quoted fields
  with doubled quotes and line breaks inside, empty lines (skipped), and a trailing empty line.
  The separator is the one of comma, semicolon and tab that gives the same number of columns
  (at least two) on the most lines among the first 20.
- `readMeasurements(rows, { order })` →
  `{ header, columns: { date, value, note? }, order, rows: [{ line, date, value, note }],
     skipped: [{ line, reason }] }`.
  - **Header:** the first row is a header when its value cell is not a number. Columns are
    found by header words (date/datum, value/amount/vrednost/znesek/količina,
    note/opomba/comment); without a header, by content: the first column where most cells are
    dates, the first where most are numbers.
  - **Dates:** `yyyy-mm-dd`; or three numbers separated by `/`, `.` or `-` with a four-digit
    year last. The order of day and month: if any first number is over 12, day first; if any
    second number is over 12, month first; when neither, day first (as the app's own date
    fields) and the preview's choice lets the user change it. A time after the date is ignored.
  - **Numbers:** dot or comma as the decimal mark; spaces and thin spaces as thousands
    separators; a unit after the number is ignored when it equals the state's unit. `1.234,5`
    and `1,234.5` are read by which mark comes last.
  - Reasons for skipping: no date, date not read, date in the future, no number.

### Writing into the state

- **Plain state:** one value per day. Rows are applied in file order, so a later row for the
  same day wins inside the file. For days that already have a value, "keep mine" skips the row,
  "take the file's" replaces it (through `recordMeasurement`, which also clears a remembered
  deletion of that day).
- **State that adds up:** every row becomes an amount. A row equal in date and amount to an
  existing amount is counted as "already there" and skipped, so the same file imported twice
  adds nothing. The choice in the dialog reads "Rows already there: skip / add again".
- Notes, when the note column exists and 15 is built, go on the measurement or amount.
- The state's value and date follow its latest measurement as always.
- One `undoable` action (17).
- At most 20,000 rows are read; more gives "This file has more than 20,000 rows. Split it."

### What it does not do

- It does not create states from a file, import routines' ticks, or import several states at
  once. One state at a time, chosen first.

## Strings

| Key | English |
|---|---|
| `csv.export` | Export as CSV |
| `export.csv` | Measurements (CSV) |
| `export.csvHint` | Every current state's values, for a spreadsheet. |
| `csv.import` | Import from CSV… |
| `csv.title` | Import into “{name}” |
| `csv.paste` | …or paste the rows here |
| `csv.read` | `{ one: 'Read {n} row: {how}.', other: 'Read {n} rows: {how}.' }` |
| `csv.how` | date in column {d} ({order}), value in column {v} |
| `csv.howNote` | , note in column {c} |
| `csv.order.dmy`, `csv.order.mdy`, `csv.order.ymd` | day/month/year · month/day/year · year-month-day |
| `csv.orderLabel` | Dates read as |
| `csv.more` | … and {n} more |
| `csv.summary` | {new} new · {clash} on days that already have a value · {skipped} skipped |
| `csv.summaryAdds` | {new} new · {clash} already there · {skipped} skipped |
| `csv.clash` | On days that already have a value: |
| `csv.mine`, `csv.theirs` | keep mine · take the file's |
| `csv.dupes` | Rows already there: |
| `csv.skip`, `csv.again` | skip · add again |
| `csv.reason.noDate`, `.badDate`, `.future`, `.noNumber` | no date · “{text}” is not a date · the date has not come yet · “{text}” is not a number |
| `csv.line` | line {n}: {reason} |
| `csv.do` | `{ one: 'Import {n} value', other: 'Import {n} values' }` |
| `csv.done` | `{ one: '{n} value imported', other: '{n} values imported' }` |
| `csv.none` | Nothing to import was found in this file. |
| `csv.tooMany` | This file has more than 20,000 rows. Split it. |

## Guidance

- Guide, article `h-states`: add "Values you already keep in a spreadsheet can be brought in:
  on the state's graph, “Import from CSV…” reads a file with a date and a value on each line.
  “Export as CSV” takes them out again."
- Guide, article `h-plans`, under Export plan: "*Measurements (CSV)* for a spreadsheet."
- No tip.

## Notes for the builder

1. No file leaves the device: the file is read in the page. Say nothing about uploading.
2. The preview is worked out once per file and once more when the date order changes; importing
   uses exactly the previewed result.
3. A draw-time budget exists for a state form with 1,100 amounts. Importing 5,000 rows must not
   freeze the page for more than a second; if it does, apply in chunks before the single save.

## Test cases

Pure rules (unit tests, written first)
- `parseCsv`: comma, semicolon, tab; quoted fields with separators, quotes and line breaks;
  byte-order mark; CRLF and LF; empty lines; one column only gives nothing to import.
- Header detection with and without a header, in English and Slovenian words.
- Dates: ISO; `31/12/2025` forces day first; `12/31/2025` forces month first; `05/06/2025`
  defaults to day first and follows the chosen order; two-digit years refused; a date with a
  time; 29 February in a leap and a non-leap year; a future date skipped.
- Numbers: `82.4`, `82,4`, `1 234,5`, `1.234,5`, `1,234.5`, `82.4 kg` with unit kg, `n/a`.
- Writing: quoting, doubled quotes, the apostrophe before `=`, `+`, `-`, `@` in text only;
  a round trip (export then import into an empty state) gives the same measurements and notes.
- Plain state: later row for a day wins; keep mine / take the file's.
- Adds up: identical rows skipped on a second import; "add again" adds them.

Page steps
- Export one state: the file's text is as specified. Export the plan's measurements: every
  state present.
- Import a file of 124 rows: preview counts are right, the first rows show, skipped lines are
  listed; Import adds them; the graph shows them; Undo removes them all and restores replaced
  values.
- Paste instead of a file gives the same preview.
- Changing the date order changes the preview and the result.

Edge cases
- An empty file; a file that is a plan export (JSON): "Nothing to import was found".
- 20,001 rows refused; 5,000 rows imported without a freeze.
- A value for a day whose measurement was deleted earlier comes back (the remembered deletion
  is cleared).
- Sync after an import: all values reach a second device.
- Slovenian: decimal commas in the preview; both languages.
- 360 px: the preview table scrolls inside the dialog; the buttons stay visible.
