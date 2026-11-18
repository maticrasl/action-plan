# Visions – design

## Why
Goals are SMART and get achieved; above them people hold wishes that never "finish" – "to be fit and live
healthily". A **vision** (SL *vizija*) names such a desired state. Goals serve visions, visions serve broader
visions, and when everything meets in one vision that every active goal serves, the user has found their
**Purpose** (SL *Smisel*).

## Decisions (agreed 2026-11-08)
- Visions exist **above and independent of action plans**: one shared list for all plans, synced with them.
- Vision → vision links: **any number of parents, no loops** (a DAG; A → B → C → A is refused).
- Only **goals** link to visions (any goal, any number of visions). Activities and states never do.
- A vision is never achieved; it has no status, dates or progress.
- Own view **Visions** (eye icon); visions also show on the **Map** in a band above the goals.
- Visions are drawn as **clouds**, not glass: the rounded box shape with blurred edges, silver; a vision that is
  *reached* is a little brighter; the Purpose vision is gold.
- Items that contribute to a vision get a **faint, wide glow** (fainter but larger than the map's selection
  glow) in every view: silver, or gold when Purpose holds.
- **Purpose** keeps the vision's own title, adds a gold "Purpose / Smisel" tag and turns gold. The popup
  congratulating the user shows **only the first time** (synced flag).
- Purpose's goals count across **every plan**.
- Map shows all visions by default, with a chip **Hide unrelated visions** (like *Hide achieved*).
- When Purpose holds, the **top-left logo** (the red-and-white blaze in `.brand`) turns gold. App icons,
  favicon and manifest never change. (Portrait phones hide `.brand`, so there it is not seen.)
- Sample plan and templates carry no visions (visions are global).

## Data
New localStorage key `actionplan.visions`:

```js
{ list: [{ id, title, description, parents: [visionId], createdAt, updatedAt }],
  deleted: { id: isoTime },     // tombstones, as plans/items use
  purposeFound: 'yyyy-mm-dd' }  // set when the popup was first shown; never cleared
```

On a goal (inside its plan): `visions: [visionId]` – the visions it serves directly. Ids that are not in the
vision list (deleted, or not synced yet) are ignored everywhere they are read; they are dropped from the goal
when the goal form is saved.

## Rules (pure functions, `js/visions.js`)
- `visionRoots()` – visions without (existing) parents.
- `visionReaches(a, b)` – b is reachable from a following parents. A parent p may be added to v only if
  `p !== v && !visionReaches(p, v)`.
- `goalVisionIds(g, goals)` – g's own vision ids plus those of its subgoal ancestors (a sub-goal serves what
  its parent serves).
- `reachedVisions()` – every vision linked by some goal in any plan, plus all their ancestors.
- **Contributing set** (per plan, ids): goals with a non-empty `goalVisionIds`; activities that `contributes`
  to one of them, and their sub-activity descendants; states that `measures` one of them; activities that
  `improves` such a state (and their sub-activity descendants). Relations of type `depends` never spread it.
- **Purpose** holds iff: at least one vision; exactly one root; at least one active goal (status `active`
  or absent) across all plans; every active goal in every plan has a non-empty `goalVisionIds`. The root is
  then *the Purpose vision*.
- Purpose is recomputed after every save, plan switch, sync and vision edit; other plans are read from
  localStorage (cached by a version counter bumped on save/sync).
- First time Purpose holds and `purposeFound` is unset: show the popup, set `purposeFound`.

## Sync
- The Drive file gains `visions: { list, deleted, purposeFound }`; files without it read as empty.
- `mergeVisions(a, b)`: per id the newer version wins (`newerOf`), tombstones as for plans, `purposeFound`
  = the earlier date set on either side. Then repair: walk visions newest first, drop parent ids that are
  missing or would close a loop.
- Visions are stamped (`updatedAt`) and tombstoned on save like plan items.
- A goal's `visions` merges with the goal (newer goal wins).

## Visions view
- Nav: first of the extra views (before Map), eye icon; on phones in the "More" sheet and landscape rail.
  Add button: "Add vision".
- Top: a note that visions are shared by all plans, and a **status line** guiding to Purpose:
  - no visions: empty state explaining visions with an example;
  - several roots: "N visions at the top – bring them under one to find your Purpose" (names);
  - active goals not serving a vision: "N active goals don't serve a vision yet" (names with plan);
  - Purpose: gold line "You have found your Purpose: <title>".
- Cards (clouds) in tree order: roots first, each child indented under its first parent; a vision with more
  parents shows "Also under: X, Y". A card shows title, description, Purpose tag, and the goals serving it
  directly, grouped by plan (current plan's goals open their form on tap; others show plan name).
- Card tap / menu: edit, add a sub-vision, delete (with confirm; children lose that parent, goals lose the
  link lazily).
- Vision form: title (required), description, "Serves" (checklist of visions that would not close a loop),
  and "Goals in this plan" (checklist of the current plan's goals).
- Goal form: new checklist "Serves vision".

## Map
- A **Visions** band above the goals (`kinds.vision` label), placed by the same layered layout: visions get
  layers above all goal layers; a parent vision sits above its children.
- Visibility: all visions; if a goal filter is set, only visions the filtered goals reach (with ancestors);
  chip **Hide unrelated visions** (pref `hideVisions`) hides visions not reached by any goal on the map
  (keeping ancestors of reached ones).
- Lines: goal → vision (`serves`) and vision → parent (`subvision`), each with a show/hide chip. Lines are
  synthetic (id `vl:<from>:<to>`), not stored relations. Selecting one shows it; a second click opens the
  vision form; Delete removes the link.
- Linking by tap: goal → vision or vision → goal adds the goal's link; vision → vision adds a parent if
  allowed (else toast the error); any other pairing with a vision toasts "only goals can serve visions".
- Vision nodes: cloud drawing (no glass slab), title + "N goals" sub-line; reached nodes brighter;
  Purpose gold with tag.

## Looks
- Tokens in `:root` and both dark blocks: `--vision`, `--vision-lit`, `--purpose`, `--vglow`, `--vglow-gold`.
- Cloud on map: a rounded rect filled with a silver gradient, through an SVG filter blurring its edge
  (`feGaussianBlur` + merge with a slightly inset sharp core so text stays readable). In cards: a blurred
  `::before` behind sharp text.
- Contribution glow: map – a wider, fainter filter (`vision-glow`) behind the node, and lines between two
  contributing items get a soft stroke glow; HTML views – class `vglow` (box-shadow ≈ `0 0 22px 4px` at low
  alpha) on goal cards, activity rows/cards, state cards, routine cards, graph cards, timeline rows,
  dashboard rows. Gold variants via `html.purpose`.
- `html.purpose .blaze-mark` circles gold.

## Texts and tutorial
EN + SL for all new strings (`kind.vision`, `view.visions`, `nav.visions`, `add.vision`, form labels, map
chips, status lines, popup, errors). By the user's decision visions are **not** added to the tutorial
(tour steps, help banners, ⓘ tips) nor to the sample plan or templates.

## Testing
- Rules: loop refused (direct and indirect), several parents allowed, roots, reached incl. through
  ancestors, contributing set (sub-goal, activity, sub-activity, measuring state, improving activity;
  depends not spreading).
- Purpose: true case; two roots false; no visions false; no active goals false; paused/achieved goal ignored;
  sub-goal counts through its parent; unlinked goal in another plan blocks; dangling vision id ignored.
- Popup once only; `purposeFound` survives losing Purpose.
- Storage/sync: stamps, tombstones, merge newer wins, loop created by two edits repaired, missing section.
- Views: Visions view (empty, cards, tree order, also-under, status lines), forms (save, loop options
  hidden, dangling cleaned), delete vision.
- Map: band present above goals, lines, hide toggle, goal filter, tap-linking paths, glow class on
  contributing nodes, gold under Purpose; perf with visions.
- Glow classes in dashboard, goals, activities, states, timeline, graphs; `html.purpose` and logo.
- Phone 390px screenshot of Visions view; EN/SL key parity; existing tour/help checks still pass.
