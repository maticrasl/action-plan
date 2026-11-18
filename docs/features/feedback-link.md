# Link to report a bug or ask for a feature

**Goal:** a person who finds something broken, or misses something, can say so in two taps, and
the owner gets reports that can be acted on. Today there is no way from the app to its makers.

Read `README.md` first (decision 10).

## The platform

**GitHub Issues** of the app's repository (`maticrasl/action-plan`, public). Two issue forms and
a chooser. Requests can be voted on with 👍, searched, and answered; the owner can ask Claude
to work on one by number.

What the owner should know before choosing this:

- People need a GitHub account to write. For friends who have none, the dialog below also
  offers "Copy details" so they can send a message any other way.
- Everything written there is public. The app's texts say so, and the forms ask for no
  personal data.

## What the user sees

### In Settings

The "Help" group (which the Guide work turns into "Open the Guide") gets two more rows:

- **Report a problem**
- **Suggest a feature**

and at the very bottom of Settings a line in small type: **Version {version}**.

The Guide page gets the same two rows at its end, under a heading "Tell us".

### What a row does

Each opens a small dialog first, because the next step leaves the app:

> **Report a problem**
> This opens Action Plan's page on GitHub, where problems are collected. You need a free GitHub
> account to write there, and what you write is public. Do not paste anything from your plans
> that you want to keep private.
>
> These details help find the cause and will be filled in for you:
> `Version 2026.11.15-a1b2c3 · Chrome 155 on Windows · 1280×720 · English · installed: no · sync: on`
>
> [ Open GitHub ]   [ Copy details ]   Cancel

- **Open GitHub** opens the right form in a new tab with the details filled in.
- **Copy details** copies the line, for people who report another way.
- "Suggest a feature" has the same dialog without the details line (only the version is
  passed).

## Rules

### What is sent in the link

Only these, and nothing else, ever:

| Detail | Source |
|---|---|
| version | the build stamp (below) |
| browser and system | a short reading of `navigator.userAgentData` or the user agent: browser name and major version, operating system name |
| window size | `innerWidth × innerHeight` |
| language | the app's language |
| installed | whether the app runs installed (the check the install button uses) |
| sync | `on`, `paused`, `off` or `not set up` |

No plan names, no item titles, no counts of items, no account, no user name, no e-mail, no
storage contents. `feedbackDetails(env)` in `core/` builds the line from an `env` object, so a
unit test can prove what it contains.

### The links

Config constant `FEEDBACK_REPO = 'maticrasl/action-plan'` beside the Google client id. The
links are:

- `https://github.com/<repo>/issues/new?template=bug.yml&version=…&environment=…`
- `https://github.com/<repo>/issues/new?template=feature.yml&version=…`

Query values are encoded with `encodeURIComponent`. Issue forms fill a field from a query
parameter named after the field's `id`; check GitHub's current documentation for issue forms
and for creating an issue from a URL before relying on this, and test with the real
repository.

When `FEEDBACK_REPO` is empty (someone else's copy of the app), the rows are not shown.

Links open with `target="_blank"` and `rel="noopener"`.

### The version

- The build writes a stamp into the app: date and short commit, for example
  `2026.11.15-a1b2c3` (Vite `define`; the restructure already stamps the service worker's
  cache name at build time, use the same value).
- Shown at the bottom of Settings. A click on it copies it.
- In development builds: `dev`.

### In the repository

`.github/ISSUE_TEMPLATE/`:

- `bug.yml` — "Report a problem". Fields: *What happened?* (required), *What did you expect?*,
  *Steps to make it happen again*, `version` (input), `environment` (input), and a checkbox
  "I have not included anything from my plans that I want to keep private". Label `bug`.
- `feature.yml` — "Suggest a feature". Fields: *What would you like to be able to do?*
  (required), *What do you do today instead?*, `version` (input). Label `idea`.
- `config.yml` — `blank_issues_enabled: false`, and one contact link to the app's Guide page
  ("How do I…? Look in the Guide first").

Texts of the forms in English. Create the labels `bug` and `idea` in the repository (the owner
does this once, or Claude with `gh label create` on the owner's word).

A short `SUPPORT.md` or a line in the repository's README: where to report, that reports are
public, and that the app's makers cannot see anyone's plans.

## Strings

| Key | English |
|---|---|
| `fb.bug` | Report a problem |
| `fb.idea` | Suggest a feature |
| `fb.heading` | Tell us |
| `fb.bugText` | This opens Action Plan's page on GitHub, where problems are collected. You need a free GitHub account to write there, and what you write is public. Do not paste anything from your plans that you want to keep private. |
| `fb.ideaText` | This opens Action Plan's page on GitHub, where ideas are collected. You need a free GitHub account to write there, and what you write is public. |
| `fb.details` | These details help find the cause and will be filled in for you: |
| `fb.open` | Open GitHub |
| `fb.copy` | Copy details |
| `fb.copied` | Copied |
| `settings.version` | Version {version} |
| `fb.env.installed` | installed: {yes} |
| `fb.env.sync` | sync: {state} |

## Guidance

- Guide, new article `feedback` in the group "What this app cannot do" (rename the group
  heading only if the owner wishes; otherwise place it last in "How do I…"): "**Report a
  problem, suggest a feature** — Both are in Settings and at the end of this page. They open
  the app's page on GitHub. What you write there is public, so leave out anything from your
  plans that is private. The people who make Action Plan cannot see your plans, so describe
  what you did and what happened."
- Guide, article `p-where`: ⚠ add "When you report a problem, the app fills in its version,
  your browser and window size, the language, and whether sync is on. Nothing from your plans."

## Notes for the builder

1. This feature has no dependency on the others and can be built first.
2. Do not add an in-app form that posts anywhere. The app has no server, and a form that sends
   text to a third party would break the privacy promise.
3. The details line is shown in full before anything opens, so the person sees exactly what
   leaves.

## Test cases

- Unit: `feedbackDetails` for a fixed `env` gives the exact line; it contains none of: a plan
  name, an item title, an e-mail address, a user name (feed an `env` holding such values in
  other fields and assert they are absent).
- Unit: the built URLs are correctly encoded (a version with `+`, a browser name with spaces).
- Page: both rows open their dialog; "Open GitHub" opens the right address (stub `window.open`
  and read it); "Copy details" copies the line; the version shows in Settings and copies on
  click.
- Page: with `FEEDBACK_REPO` empty, no rows on Settings or the Guide.
- Edge: offline: the dialog still opens, the link is still offered; 360 px; both languages.
- By hand, once, on the real repository: each link opens its form with the fields filled.
