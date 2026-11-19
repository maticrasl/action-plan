# Guidance features: walkthrough, tips, Guide page

Written 2026-11-14 against commit `5b71e59`. For Opus 5.5 to build, one feature per session.
All user-facing text here is English only; translate to Slovenian while building.

## Files

| File | For | What it is |
|---|---|---|
| `README.md` | both | This overview: what is built, shared rules, decisions the owner should confirm |
| `01-guide-page.md` | Opus | Plan for the Guide page (the help page). Build first |
| `guide-content.en.md` | Opus | Every article of the Guide page, ready to translate |
| `02-walkthrough.md` | Opus | Plan and texts for the walkthrough that replaces the tour |
| `03-tips.md` | Opus | Rules and the full catalogue of tips |
| `findings.md` | Matic | The psychology behind it, what the app does well, what to improve, what it cannot do |

Read `README.md` and then only the file of the feature you are building. `guide-content.en.md`
is read when building the Guide page; the other features only link to its article ids.

## What is built

1. **Guide page** — a new view with answers: how the method works, what to do when stuck
   (the main part), how each feature works, what happens to the data, and what the app cannot do.
2. **Walkthrough** — replaces the guided tour. A "Getting started" card on the Overview with
   13 small tasks that the user does in their own plan. Tasks tick themselves when the plan shows
   they are done.
3. **Tips** — at most one short suggestion a day, chosen from what the user's plan looks like
   (a goal without steps, a routine that keeps slipping, three weeks away). Can be turned off.

They share one voice and one idea: **the app should help the person act, not only explain its
buttons.** The tour explained buttons. These three explain the method and catch the usual
places where people stop.

## When to build

`docs/restructure` puts a feature freeze on the project until its phase 10 is done. Build these
after it. File paths below use the layout that plan ends with (`src/…`). If the owner decides to
build earlier, the same design holds in the current files: `js/tutorial.js`, `js/i18n.js`,
`js/app.js`.

Order: **Guide page → walkthrough → tips.** The walkthrough and the tips link to Guide articles,
and the walkthrough's welcome and weekly review live on the Guide page.

## Decisions I made that the owner should confirm

Each is a default, chosen so work can go on. **Confirmed by the owner 2026-11-19: 1, 2, 4, 5** (3 taken with the Guide page). Changing 1 or 2 changes the plan a lot; say so
before the first session.

| # | Decision | Why | Alternative |
|---|---|---|---|
| 1 | The walkthrough is a **checklist card that ticks itself**, drawn like a goal with a list. It is not a real plan made of real goals and activities | A real "Getting started" plan would make the user switch between it and their own plan, could not tick itself, would count toward Purpose and the plan badges, and would sync as if it were their data | A real plan built from the app's own items, ticked by hand |
| 2 | **The tour is removed**, not kept beside the walkthrough. The sample plan stays, opened from the welcome card with a banner | Two introductions confuse; the tour's facts move into the Guide's "How do I…" articles | Keep "Take the tour" in Settings |
| 3 | The page is called **Guide**, and the `?` button in the top bar opens it. Help mode (banners and ⓘ dots) stays, renamed "Explanations on screen", switched on the Guide page and in Settings | "Help" suggests a manual; most of this page is about goals, not buttons. One `?` button should lead to answers | Name it "Help"; keep `?` as the help-mode switch |
| 4 | **Visions are included** in the Guide, the walkthrough (one optional task) and the tips | On 2026-11-08 you said no tutorial or help texts for visions. This request names "what goals/visions to define", so I took it as replacing that | Leave visions out again |
| 5 | Walkthrough and tip state is **kept per device**, in preferences, not synced | Preferences are not synced today; most tasks tick themselves from synced plan data anyway. On a second device the walkthrough is not offered when plans arrive from Drive | Sync it (a new section in the Drive file) |
| 6 | **No change to the goal form** in this work, although the research says its strict SMART gate is the app's biggest hurdle | You asked for three features. The Guide and the walkthrough work around the gate with advice. The change itself is the first item in `findings.md` | Do the form change first; then some Guide texts get simpler |
| 7 | Tips are **on by default**, at most one a day, none in the first days while the walkthrough's first stage is open | A tip is only useful if seen; one a day cannot become noise | Off by default |

## Shared rules for all three

### Voice (also for the Slovenian text)

- Speak to "you". Short sentences. Words a twelve-year-old knows.
- Say what is the case and one thing to try. No "should", no "must", no "don't forget".
- Never blame. A missed routine is information about the plan, not about the person.
- No exclamation marks. Praise is rare, specific and plain ("Four weeks in a row.").
- Use the app's own words exactly as the interface shows them: Overview, Goals, Activities,
  States, Visions, Map, Timeline, Graphs, current state, routine, routine list, list,
  "Progress from", "Activities done", "Routines kept", "Adds up", Paused, Achieved.
  When a label changes, these texts change with it.
- No study names or numbers in the app. The research is in `findings.md`, for the owner.
- Never promise a result ("you will reach your goal").

### Text storage

- Short strings (walkthrough, tips, page chrome) go into the language files as usual, with the
  key prefixes named in each feature file (`guide.*`, `walk.*`, `tip.*`).
- Guide articles are long. Give each language its own article file beside its strings
  (`src/i18n/guide.en.ts`, `guide.sl.ts`): a list of
  `{ id, group, title, body, related?, action? }`. `body` is a small fixed HTML subset written
  by us (`<p> <ul> <ol> <li> <strong> <em>`), never user input.
- The parity check between languages must cover the article files too: same ids, same groups.

### Shared small pieces

- **Demo plan marker.** The sample plan loaded from the welcome card or from Settings is marked
  as a demo in the plan list entry (one optional field; old versions ignore it). In a demo
  plan: the walkthrough card is hidden, tasks do not tick, tips do not show. Check that the
  marker survives sync; if the plan list is not what syncs, keep the marker in device
  preferences as a set of plan ids instead.
- **Seen flags.** One preference `seen` holds small facts that are not plan data: views opened
  (`map`, `timeline`, `graphs`, `visions`), a full export made, the context menu used, the
  days the app was opened (last 30 dates), the date of the last weekly review. The walkthrough
  and the tips both read it. Per user, per device.
- **Guide links.** One function opens the Guide at an article: `openGuide(articleId)`.
  The walkthrough, tips and help banners use it.
- **Spotlight.** The tour's spotlight and card placement (`placeTour`, `bringIntoView`) is kept
  as a one-step "Show me" pointer: it highlights one control until the next click. Everything
  else of the tour goes.

### Layers

Follow the import order of the restructure (`i18n → core → store → sync → ui → views →
tutorial → main`). Suggested homes, to adjust to what exists by then:

- `core/guidance/` — pure rules: walkthrough task checks, tip conditions, tip choice. Take the
  plan, visions, the `seen` flags and today's date as arguments; no page APIs, so Vitest
  covers them.
- `views/guide.ts` — the Guide page.
- `tutorial/` — the walkthrough card, welcome card, tip card, help mode. It registers what it
  draws through the existing `onRendered` hook, as help mode does.

### Stored data

- New preference keys only: `walk`, `tips`, `seen`. Nothing existing changes shape.
- The demo marker is the only addition outside preferences. Add a fixture for it.
- `tourSeen` is still read once (see the walkthrough's upgrade rule), then left alone.

### Tests

Each feature file ends with its test cases, main paths and edge cases. Write the pure-rule
tests first (Vitest), then the page steps. The old tour's page steps are deleted with the tour.

## After building: memory and CLAUDE.md

- Memory `sync-i18n-and-tutorial` should then read: every change checks EN+SL wording **and**
  the walkthrough tasks, the tips' conditions and texts, the Guide's "How do I…" articles, the
  help banners and ⓘ tips.
- Memory `visions-hierarchy-plan`: remove "no tutorial, help texts" if decision 4 stands.
- `CLAUDE.md` (project): one line under project notes — "User-facing guidance follows the voice
  rules in `docs/guidance/README.md`."
