# 1. Guide page

**Goal:** one place that answers "how does this work?", "what do I do when I'm stuck?" and
"what happens to my data?". Build this first; the walkthrough and tips link into it.

The article texts are in `guide-content.en.md`.

## What the user sees

A new view, **Guide**. It is not among the views in the navigation (owner, 2026-11-19): its
button is the `?` at the top right, beside Settings, which opens it from anywhere; pressing `?`
while on the Guide returns to the previous view.

```
Guide
[ Search the guide…                              ]

 Getting started            3 of 13 done   [Continue]      <- walkthrough summary (feature 2)
 Explanations on screen     ( o)                           <- help mode switch

 START HERE
   > How Action Plan works
   > The words the app uses
 WHEN YOU ARE STUCK
   > I don't know what goal to set
   > I keep missing my routine
   > …
 HOW DO I…
   > Goals   > Current states   > Activities   > Routines   > …
 YOUR DATA AND PRIVACY
   > Where my plans are kept
   > …
 WHAT THIS APP CANNOT DO
   > …
```

- Each line is an article that opens in place (one open at a time; the page scrolls its title
  to the top). Use `<details>`/`<summary>` or buttons with `aria-expanded`; either way the
  browser's find-in-page should find text in closed articles if the platform allows it
  (`hidden="until-found"` where supported; not required).
- An open article shows its text, an optional **action button** ("Add a routine", "Open
  Account and sync") that does the thing, and **Related** links to other articles.
- **Search** filters articles by words in the title and body, in the current language, ignoring
  case and diacritics (č, š, ž). No matches: "Nothing found for “{query}”. Try another word."
- The view has no Add button action of its own: the top bar's Add button offers the usual
  choice of kinds, as on the Map.
- The view shows no help banner and no tips.

## Behaviour

- `openGuide(id)` switches to the Guide, opens that article, scrolls to it, moves focus to its
  title. An unknown id opens the Guide with nothing open.
- The open article and the search text are remembered while the app is open, not across starts.
- The Guide reads live facts only where an article says so (marked **live** in the content
  file): whether sync is set up and on, whether the app is installed, how many users are on the
  device. Everything else is fixed text.
- **Weekly review** (article `review`) is interactive: five lines with checkboxes and a button
  "Review done". The checkboxes are not stored. The button stores today's date in
  `seen.lastReview`, shows the toast "Review done. See you next week.", and ticks the
  walkthrough task. Each line has a small link that opens the place it talks about.
- **Help mode** is renamed "Explanations on screen" (`btn.help`). Its switch sits on the Guide
  page and stays in Settings. The top-bar button no longer toggles it. Each help banner gets a
  link at its end, "More in the Guide", opening the matching "How do I…" article. The Visions
  view gets a banner too (decision 4), text in the content file under `help.view.visions`.
- Settings: the "Help" group becomes one button, "Open the Guide". "Take the tour" goes away
  with the tour (feature 2).

## Strings (prefix `guide.`)

| Key | English |
|---|---|
| `view.guide` | Guide |
| `guide.search` | Search the guide… |
| `guide.noMatch` | Nothing found for “{query}”. Try another word. |
| `guide.group.start` | Start here |
| `guide.group.stuck` | When you are stuck |
| `guide.group.how` | How do I… |
| `guide.group.data` | Your data and privacy |
| `guide.group.limits` | What this app cannot do |
| `guide.related` | Related |
| `guide.more` | More in the Guide |
| `guide.open` | Open the Guide |
| `btn.help` | Explanations on screen |
| `guide.review.done` | Review done |
| `guide.review.toast` | Review done. See you next week. |

## Notes for the builder

1. **Privacy articles state facts about the code.** Before shipping, check every sentence
   marked ⚠ in the content file against the code as it is then (what is stored where, which
   addresses the app contacts, what the Google permission covers, how switching users works).
   Change the sentence, not the code, if they differ, and tell the owner.
2. **"How do I…" articles repeat what help banners and the old tour said.** After this, they
   are the one full explanation; banners can be shortened to two sentences plus the link.
   Shortening them is optional and should be its own commit.
3. Feature texts go stale. Add the articles to the per-change routine (see README, memory).
4. Use the `frontend-design` skill for the page, as `CLAUDE.md` asks. The page should read like
   a calm printed handbook: generous line height, a text column no wider than about 70
   characters, no cards inside cards.

## Test cases

Main paths
- The Guide opens from `?` and from Settings, and is not in the navigation; `?` again returns to the
  previous view.
- Every article id in the English file exists in the Slovenian file, in the same group.
- Every `related` id and every id used by `openGuide` anywhere in the code exists.
- Opening an article closes the other; its action button does what its label says (one test per
  action kind: open a form, open Settings at a section, switch view).
- Search: a word from a body finds its article; case and diacritics are ignored; clearing the
  box shows everything; no match shows the message.
- Weekly review: "Review done" stores today's date and shows the toast; the checkboxes are
  empty again on the next visit.
- Help mode: switching on the Guide page shows banners in the views; each banner's link opens
  the right article.

Edge cases
- `openGuide('nonexistent')` opens the page with nothing open and no error.
- Live facts: the sync article shows the "not set up for this copy" variant when no client id
  is configured; the install article hides its button when installed.
- Phone width (360 px): no sideways scrolling; article text wraps; search box fits.
- Language switch while an article is open keeps the same article open in the new language.
- Keyboard: Tab reaches every article title; Enter/Space opens; focus lands on the title after
  `openGuide`.
- A demo plan and an empty plan both show the full Guide.
