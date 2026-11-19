# Feature plans: after the restructure and the guidance features

Written 2026-11-15 against commit `5b71e59`. For Opus 5.5 to build, one file per session unless a
file says otherwise. All user-facing text here is English only; translate to Slovenian while
building.

Function names such as `goalProgress` are the names in `js/app.js` at that commit. After the
restructure they live in `src/`; find them with `npm run map` and Grep, never by reading a file
whole.

## When to build

After `docs/restructure` (phase 10 done) **and** after the three guidance features in
`docs/guidance` (Guide page, walkthrough, tips). These plans use what those bring: the Guide's
articles and `openGuide(id)`, the tips catalogue in `core/guidance/`, the `seen` flags and the
demo-plan marker.

## Files

| File | Feature | Size |
|---|---|---|
| `00-foundation.md` | Shared pieces: journal store, sync-file guard, working on a plan that is not open | S |
| `01-guided-discovery.md` | Writing exercises that end in a vision | M |
| `03-life-areas.md` | Areas on visions and a balance view | M |
| `05-line-of-sight.md` | Which vision a step serves; visions with no active goal | S |
| `06-goal-form.md` | A goal saves with a title; obstacle and plan in place of "Why is this realistic?"; the golden glow needs SMART goals | M |
| `07-keep-goals.md` | Goals that keep a value within a range | M |
| `08-pace-and-forecast.md` | Pace line, needed rate and forecast on measured goals | S–M |
| `09-today.md` | Today across all plans, with this week's one thing | M |
| `12-replan.md` | Move late steps in one action | S |
| `13-done-log.md` | Completion dates and the done log | S–M |
| `14-reviews.md` | Weekly, monthly and yearly review (three sessions) | L |
| `15-notes.md` | Notes on items and measurements, closing note on a reached goal | M |
| `16-is-it-working.md` | Whether a routine goes together with movement in a state | M |
| `17-undo-trash-snapshots.md` | Undo, recently deleted, earlier versions, full backup (two sessions) | M |
| `18-progress-report.md` | A weekly summary to share as text or picture | S |
| `19-csv.md` | Measurements in and out as CSV | S |
| `20-mcp-server.md` | An MCP server so an AI assistant can read and change the plan (two sessions). Before the second, the owner chooses between an MCP server and a command with an agent skill | L |
| `21-future-to-avoid.md` | A second text on each vision | S |
| `25-planned-reward.md` | "After I do it, I…" on steps and routines | S |
| `30-what-it-costs.md` | One more question on the goal form | S |
| `feedback-link.md` | Link to report a bug or ask for a feature | S |

Numbers are the ones from the feature list agreed on 2026-11-15; gaps are features not chosen.
Feature 6 was agreed after the others; build it before 7 and 30, which add to the same form.
Files 7 and 30 describe their fields against the form as it is today and say to follow 6's
layout where it differs.

Read this file, then only the file of the feature you are building.

**Which feature is next** is in `STATUS.md`: the first line there that is not ticked. Tick it
when the feature is built, as that file says.

## Order

Each line needs the ones above it that it names.

| Step | Build | Needs |
|---|---|---|
| 1 | `00-foundation` | – |
| 2 | `13-done-log` | – |
| 3 | `17-undo-trash-snapshots` | 00 |
| 4 | `12-replan` | 17 (undo) |
| 5 | `15-notes` | 13 |
| 6 | `06-goal-form` | – |
| 7 | `30-what-it-costs`, `25-planned-reward`, `21-future-to-avoid` | – |
| 8 | `09-today` | 00, 13 |
| 9 | `05-line-of-sight` | 09 |
| 10 | `03-life-areas` | 00, 13 |
| 11 | `01-guided-discovery` | 00, 03, 21 |
| 12 | `08-pace-and-forecast` | – |
| 13 | `07-keep-goals` | 08, 15 |
| 14 | `16-is-it-working` | – |
| 15 | `14-reviews` (weekly, then monthly, then yearly) | 00, 09, 12, 13, 15; monthly also 03, 08, 16, 21, 30; yearly also 01 |
| 16 | `19-csv`, `18-progress-report` | 17 for 19; 13 and 14 for 18 |
| 17 | `feedback-link` | – |
| 18 | `20-mcp-server` | everything above that is built; 17 at least |

`feedback-link` can go out any time, also first.

## Decisions I made that the owner should confirm

Each is a default, chosen so that the plans hold together. Changing 1, 2, 4 or 9 changes several
files; say so before the first session.

| # | Decision | Why | Alternative |
|---|---|---|---|
| 1 | **New personal data that belongs to no plan** (reviews, discovery answers, this week's one thing) goes into one new store, the *journal*, kept per user and synced as a new section of the Drive file | Visions already work this way. One store means one merge rule and one place to back up | A hidden plan holding them; or no sync for them |
| 2 | **Notes are kept on the item they belong to**, not in a list of their own | An older copy of the app (a tab left open, a device not yet updated) keeps unknown fields on items but drops unknown lists when it saves. Text a person wrote must not be lost that way | A `notes` list in the plan: less merge code, but exposed to that loss |
| 3 | **Recently deleted is kept on the device**, 30 days, not synced. **Earlier versions** are dated copies in the user's Drive. Restoring never overwrites: it adds copies | Synced trash needs new merge rules for little gain. Overwriting would fight the merge and could lose newer work | Synced trash; restore in place |
| 4 | **Today is a new view**, first in the navigation, and not the start view. On phones the tab bar becomes Today · Overview · Goals · Activities · More; Current states moves into More | The Overview stays the page of one plan. Changing the start view would surprise people who use one plan | Make the Overview span plans with a switch; or make Today the start view |
| 5 | **Reviews cover all plans together**, weekly, monthly and yearly. No quarterly review | You are one person with one week. Quarters were dropped for states on 2026-11-03 | One review per plan; quarters instead of months |
| 6 | **A small dot on the Review item** in the navigation when last week has no review. Nothing else reminds | The planned tips `week`, `month` and `new-year` already speak once per period | No dot |
| 7 | **Life areas are text on a vision**, like the category on a goal, with the same suggestions. No list of areas to manage | The least that works. Areas are whatever the visions say | Areas as items of their own, with order and colour |
| 8 | **Visions get guidance texts** (Guide articles, tips, help texts) for the new features | Continues decision 4 of `docs/guidance/README.md`. On 2026-11-08 you said no tutorial texts for visions; if that still holds, drop the "Guidance" parts of files 01, 03, 05 and 21 | No texts for visions |
| 9 | **The MCP server talks to the open app, not to Google Drive.** It is a small program on the user's computer; the app in the browser connects to it; every tool call is carried out by the app itself | No Google sign-in for a second program, no copy of the data anywhere, works for guests, changes show at once and use the app's own rules. See `20-mcp-server.md` for what was ruled out and why | A server that reads and writes the Drive file |
| 10 | **Bug reports and feature requests go to GitHub Issues** of the app's repository, with two forms | It exists, costs nothing, and requests can be voted on with reactions. People need a GitHub account | GitHub Discussions; a Google Form; an e-mail address |
| 11 | **The sample plan** gets completion dates on its done steps, one note and one reward. Nothing for visions, discovery or reviews | The done log and notes should not be empty in the sample; your 2026-11-08 decision keeps visions out of it | Leave the sample as it is |
| 12 | **Templates** stay without notes, rewards, costs and completion dates | A template is a plan without the person in it | Rewards as suggestions in templates |
| 13 | **Only the glow loses its gold** while an active goal is not SMART. The Purpose itself stays found: gold card, "Purpose" tag, gold blaze at the top left | You said "golden glow". The glow is the reward; the rest says which vision is the Purpose | The Purpose is not found at all until every active goal is SMART (then blaze, card and tag lose their gold too) |
| 14 | **Letters light by today's rules** (for example 15 characters under "What exactly?"); they no longer block saving | The glow is meant to ask for real answers. A letter lit by one character would be the shortcut again | Any text lights a letter |

## Shared rules

### Voice

The voice rules in `docs/guidance/README.md` hold for every text here: speak to "you", short
sentences, say what is the case and one thing to try, never blame, no exclamation marks, the
app's own words exactly as the interface shows them, no study names or numbers, never promise a
result.

### Navigation after these features

Desktop sidebar, in this order: **Today**, Overview, Goals, Activities, Current states, Visions ·
Map, Timeline, Graphs · **Review**, Guide. Two new items only. Everything else lives inside an
existing view:

| Feature | Where it lives |
|---|---|
| Done log (13), reviews (14), progress report (18) | Review view |
| Life areas (03) | Visions view, a switch "Tree · Areas" |
| Guided discovery (01) | Visions view, button "Find your visions"; past ones under "Reflections" |
| Pace (08), keep band (07), "Is it working?" (16), CSV (19) | Graphs view and the goal card |
| Recently deleted, earlier versions, full backup (17), AI assistant (20), feedback (link) | Settings |

On phones, Review and Guide are in More. In phone landscape (the icon rail, see memory
`landscape-layout`) both new items are icons on the rail. Each new nav item needs an icon in the
style of the existing ones (24 × 24, stroke only).

### Stored data

The rule in `CLAUDE.md` holds: add fields with a default in `normalize`, never rename or reuse
one, and add a fixture in `tests/fixtures/` for every change. On top of that, three facts about
older copies of the app decide where new data may go:

1. **An older copy keeps unknown fields on a goal, state, activity, relationship or vision.** It
   reads the item, changes what it knows, and writes the whole item back. New fields on items are
   safe.
2. **An older copy drops unknown lists in a plan and unknown sections of the Drive file** when it
   saves or syncs (`normalize`, `mergePlans`, `mergeStores` and `normalizeVisions` build their
   result from the parts they know). So these plans add **no new list to a plan**, and one new
   section to the Drive file (`journal`), which a newer device puts back at its next sync because
   the merge is a union.
3. **Two edits of the same item on two devices: the later one wins whole**, except for the parts
   that have their own merge (a state's measurements and amounts, a routine's ticks, a list's
   items). Anything a person adds to over time (notes) needs its own merge by id, like list
   items have.

New fields are listed in each file under "Stored data". All are optional and absent by default,
so `normalize` only has to drop values of the wrong type.

Summary of what is added:

| Where | Field | Feature |
|---|---|---|
| activity | `doneAt` (date) | 13 |
| activity list item | `doneAt` (date) | 13 |
| goal | `achievedAt` (date) | 13 |
| goal, state, activity | `notes`, `droppedNotes` | 15 |
| state measurement, state amount | `note` | 15 |
| goal | `keep: { min?, max? }` | 07 |
| goal | `cost` | 30 |
| goal | `obstacle`, `ifThen` | 06 |
| activity | `reward` | 25 |
| vision | `avoid` | 21 |
| vision | `area` | 03 |
| journal (new store) | `reviews`, `sessions`, `focus`, `deleted` | 00, 01, 09, 14 |
| device only | `actionplan.trash`; preferences `hiddenAreas`, `assistant`, `seen.*` additions | 17, 03, 20 |

Dates are local calendar days as `yyyy-mm-dd`, as everywhere in the app. Times of change are ISO
timestamps, as `updatedAt` is.

Exports: `resetProgress` (used for a template export and for "start fresh" on import) clears
`doneAt`, `achievedAt`, `notes`, `droppedNotes` and measurement `note`s. A **template** export
also clears `reward` and `cost` (decision 12). A full copy keeps everything. Each file repeats
its part.

### Layers

Follow the import order (`i18n → core → store → sync → ui → views → tutorial → main`). Rules and
calculations go into `core/` as functions that take the data they work on as arguments, so
Vitest covers them without a page. Several existing core functions read the open plan from the
module's state; `00-foundation.md` adds the one helper for running them on another plan.

### Guidance for each feature

Since the Guide, the tips and "Explanations on screen" exist by then, a feature is not done
until:

- its **Guide article** is added or changed (each file gives the text under "Guidance"),
- the **help banner** of a new view exists (`help.view.<view>`), two sentences and the link
  "More in the Guide",
- a **tip** is added where the file names one, following the rules in `docs/guidance/03-tips.md`
  ("Writing a new tip later"),
- the walkthrough is checked: a task whose "Show me" target moved is fixed.

Texts for both languages; the parity check must pass.

### Design

Every new screen uses the `frontend-design` skill, as `CLAUDE.md` asks, and the existing look:
glass cards, the goal trail, list ticks, tags, the amount popover. No pill buttons (memory
`map-glass-look`). Phone width first: 360 px, no sideways scrolling. In phone landscape, spend
width, not height (memory `landscape-layout`).

### Tests

Each file ends with test cases: pure rules first (Vitest, written before the code), then page
steps, then edge cases. Every feature that changes stored data adds a fixture and a merge test
(two copies edited apart, merged both ways, same result). Draw-time budgets (`npm run perf`)
apply to anything drawn on the Overview, Today, Graphs, Map or Timeline.

## Parked

- **Reminders (feature 10).** Not now. The idea kept for later: write routines and deadlines
  into a calendar of the app's own in the user's Google Calendar, so that Google's apps do the
  reminding and no server is needed. It needs one more Google permission
  (`calendar.app.created`); whether that permission needs Google's verification was not
  confirmed and must be checked in the Cloud console first. A calendar file export is the
  fallback. Also in memory: `reminders-google-calendar-idea`.
- **A status "Idea" for goals** (part of the first proposal for feature 6; parked by the owner
  on 2026-11-15). A wish in one line that counts nowhere: not for Purpose, averages or Today.
  "Make it a goal" would set it Active and open the form. If built: an older copy of the app
  treats a status it does not know as active on the Overview, so check what it shows.
- **A server-side MCP server** (usable from a phone or from claude.ai without a program on the
  computer) and **WebMCP** (the page itself offering tools to a browser's assistant). See the end
  of `20-mcp-server.md`.

## Not chosen

For the record, from the list of 2026-11-15: 2 (vision check-in), 4 (written Purpose with
history), 10 (reminders, parked above), 11 (cue and small version), 22 (my story so far),
23 (faults and virtues), 24 (goal ranking), 26 ("what bothers me" list), 27 (then and now),
28 (evening line), 29 (things to stop), 31 (meaning marks).

## After building: memory and CLAUDE.md

- `CLAUDE.md`, under "Every user-facing change": add the Guide article and tips to the list, if
  the guidance work has not already done so.
- `docs/decisions.md`: one entry each for decisions 1, 2, 3 and 9 above, with the reason.
- Memory `measurement-notes-idea`: delete when 15 is built.
