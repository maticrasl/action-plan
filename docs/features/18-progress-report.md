# 18. A progress report to share

**Goal:** telling one person how the week went helps many people more than any app can. The app
makes that easy: a short summary of the week, as text to paste into a message or as a picture,
with no account and no server.

Needs `13-done-log.md`. Offered after the weekly review of `14-reviews.md`.

## What the user sees

### Where

- Review view, "This week": a link **Share progress…** beside the finished review, and in the
  view's menu at any time.
- Overview: in the "This week" line's menu.

### The dialog

```
 Share progress
 Nothing is sent by Action Plan. You choose where this goes.

 Period     ( This week ▾ )           Plans   ( All plans ▾ )

 Include    ☑ Goals and how far along they are
            ☑ Steps done
            ☑ Routines kept
            ☑ Values recorded
            ☑ Next week's one thing
            ☐ My notes from the review

 ┌─ preview ──────────────────────────────────────────────┐
 │ My week, 10–16 November                                 │
 │                                                         │
 │ Goals                                                   │
 │ • Run 5 km without stopping: 60 % (was 45 %)            │
 │ • Starter emergency fund: 1,200 of 2,000 €              │
 │                                                         │
 │ Done: 4 steps                                           │
 │ • Buy running shoes                                     │
 │ • Book the check-up                                     │
 │ …                                                       │
 │ Routines                                                │
 │ • Run after work: 3 of 3                                │
 │ • Stretch after running: 2 of 3                         │
 │                                                         │
 │ Next week: Sports-medicine check-up                     │
 └─────────────────────────────────────────────────────────┘

 [ Copy text ]   [ Share… ]   [ Save picture ]
```

- **Period**: this week, last week, this month, last month.
- **Plans**: all plans (not demos), or one.
- The preview is the text exactly as it will be copied.
- **Copy text** copies it and says "Copied". **Share…** hands the text to the system's share
  sheet where the browser has one (phones); hidden elsewhere. **Save picture** downloads a PNG;
  on phones that can share files, it goes to the share sheet instead.
- The ticks are remembered on the device.
- "My notes from the review" is off by default and is offered only when the period has a
  finished review with text.

### The picture

One card, portrait, 1080 × 1350 px, light theme always: the title and dates, up to four goals
with the app's goal trail and percentage, the three counts as large numbers (steps done,
routine days, values), the routines as small rows of kept/total, and "Next week: …" at the
bottom. The app's mark and name small in a corner. No plan names when one plan is included.

What does not fit is left out with "+ 3 more" under its section; the picture never shrinks its
text.

## Rules

`core/report.ts`, pure: `buildReport(plans, journal, { from, to, include })` →
`{ title, goals: [{ title, now, was?, text }], steps: [title…], routines: [{ title, kept,
total }], values: [{ title, text }], focus?, notes? }`, and `reportText(report, t)` → the text.

- **Goals:** active goals of the chosen plans, and goals achieved in the period (marked
  "reached"). `now` is `goalProgress`; `was` is `progressAt(goal, from)` (`14-reviews.md`, B;
  when 14 B is not built, leave "was" out). A measured goal's text is "{current} of {target}
  {unit}"; a keep goal's (07) "in range {n} of {total} weeks".
- **Steps:** done in the period, from the done log, at most 10 by date, then "and {n} more".
  List items are not listed one by one: a completed list counts as one line.
- **Routines:** each routine that ran in the period: kept ÷ asked. For a week: ticks ÷ due
  days (or ÷ the week's target for flexible ones); for a month: weeks kept ÷ weeks (as in 14 B).
- **Values:** the latest value of each state recorded in the period, with the change since the
  latest value before the period when there is one ("Longest run: 3.4 km (+0.2)").
- **Focus:** the journal's focus when its week is the one after the period (weekly reports).
- **Notes:** the review's "What went well?" and "What got in the way?" as two lines.
- Empty sections are left out. A report with nothing at all says "Nothing to report for this
  time yet." and the three buttons are disabled.
- The text uses plain characters only: no markdown, bullets as "•", so it reads the same in any
  messenger.
- The language is the app's.

The picture is drawn on a canvas with the Canvas 2D API by `ui/report-picture.ts`, from the
same `report` object. No library. Fonts: the app's typeface when it is loaded
(`document.fonts.ready`), else the system's sans-serif.

### Privacy

The dialog's first line says it: nothing is sent by the app. The report is built on the device
and leaves only through Copy, the share sheet or the saved file. No link is created, nothing
is uploaded, and no report is stored.

## Strings

| Key | English |
|---|---|
| `share.btn` | Share progress… |
| `share.title` | Share progress |
| `share.lead` | Nothing is sent by Action Plan. You choose where this goes. |
| `share.period`, `share.plans`, `share.include` | Period · Plans · Include |
| `share.p.week`, `.lastWeek`, `.month`, `.lastMonth` | This week · Last week · This month · Last month |
| `share.allPlans` | All plans |
| `share.i.goals`, `.steps`, `.routines`, `.values`, `.focus`, `.notes` | Goals and how far along they are · Steps done · Routines kept · Values recorded · Next week's one thing · My notes from the review |
| `share.copy`, `share.share`, `share.picture` | Copy text · Share… · Save picture |
| `share.copied` | Copied |
| `share.empty` | Nothing to report for this time yet. |
| `report.title.week` | My week, {range} |
| `report.title.month` | My month, {month} |
| `report.goals`, `report.routines`, `report.values` | Goals · Routines · Values |
| `report.done` | `{ one: 'Done: {n} step', other: 'Done: {n} steps' }` |
| `report.was` | (was {pct} %) |
| `report.reached` | reached |
| `report.more` | and {n} more |
| `report.next` | Next week: {title} |
| `report.well`, `report.hard` | Went well: {text} · Got in the way: {text} |

## Guidance

- Guide, article `limits`, bullet "It has no other people in it": replace its last sentence
  by "After the weekly review, “Share progress…” makes a short summary you can send to one
  person, as text or as a picture."
- Guide, article `h-review`: one sentence naming the button.
- Guide, article `p-where`: ⚠ add "A progress report is made on your device and goes only
  where you send it."
- Tip, class D, `share-progress`: when 3 weekly reviews are finished and the dialog was never
  opened (`seen`): "Telling one person how your week went helps more than most tricks. “Share
  progress…” makes a short summary to send." Button: Share progress…. View: Review.

## Notes for the builder

1. Use the `frontend-design` skill for the picture: it is the only thing of the app that other
   people see. It should look like a card from the app, calm and legible on a phone screen in a
   chat.
2. `navigator.clipboard.writeText` needs a secure context and a click; fall back to selecting
   the preview text and telling the user to copy.
3. `navigator.share` with files is not everywhere; the app already tests this for plan files
   (`canShareFiles`). Use the same test with a PNG.
4. Titles in the picture are cut with an ellipsis to fit one line; text is drawn with
   `fillText`, so nothing typed by the user is ever interpreted.

## Test cases

Pure rules (unit tests, written first)
- `buildReport` for a week and a month: each section's content and order; empty sections left
  out; nothing at all gives the empty report.
- Steps capped at 10 with the "more" count; a completed list is one line.
- Routines: flexible and set-day for a week; a routine that started mid-week counts only its
  due days; monthly period counts weeks.
- Values: latest in the period with the change; no earlier value gives no change.
- Focus only for the following week; notes only when included and present.
- `reportText`: exact text for a fixed report in both languages; no characters outside plain
  text, "•" and line breaks.
- Scope: one plan versus all plans; demo plans never.

Page steps
- The dialog opens from both places; unticking a box changes the preview; the ticks are
  remembered after a reload.
- Copy puts the preview's text on the clipboard (stubbed) and shows "Copied".
- Save picture produces a PNG of 1080 × 1350 (check the size and that it is not blank by
  sampling pixels); with 9 goals, four are drawn and "+ 5 more" shows.
- "My notes" is offered only when the week's review has text.

Edge cases
- Titles with `<`, `&`, emoji and 80 characters: the text shows them as typed; the picture cuts
  with an ellipsis.
- No finished review, no focus: those sections are absent.
- Dark theme on: the picture is still light.
- Fonts not loaded (offline first start): the picture uses the fallback and is not blank.
- 360 px: the preview scrolls inside the dialog; buttons wrap.
