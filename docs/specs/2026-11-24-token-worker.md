# Sync that stays signed in: token Worker (WP-002)

Status: agreed 2026-11-24, built on `feat/token-worker`.

**Changed while building.** Google's code popup has no `prompt` option, so Google gives a
refresh token only on an account's first consent; a second device would get none. So the sealed
token is also kept in the account's Drive app folder (`actionplan-auth.json`, `{ sealed }`) and a
sign-in without one takes it from there (checked with one refresh; a dead one is removed). One
token per account, as Google recommends. Because all devices share it, **sign-out no longer
revokes it**: it forgets it on that device only (no `/revoke` route). Removing the app at
myaccount.google.com/permissions ends it everywhere. Worker unreachable on refresh: `offline`
(sync retries later), not `auth`. Points below that say otherwise are superseded by this.

## What

Today the app gets a one-hour Google access token from a popup and keeps it in sessionStorage.
When it expires, or the phone kills the app, sync stops until the person presses Connect.

After this change a tiny Cloudflare Worker holds the app's Google client secret and swaps a
long-lived refresh token for fresh access tokens. Sign-in happens once per device. The Worker
stores nothing and never sees plans: the app still talks to Drive directly.

## Flow

1. **Connect** (a click): the app opens Google's code popup (`initCodeClient`, `ux_mode: popup`,
   `access_type: offline`, same scope `drive.appdata`, same `login_hint`). Google returns a
   one-time `code`.
2. `POST <worker>/token {code}` → the Worker calls Google's token endpoint with the client secret
   (`redirect_uri: postmessage`) and answers `{access_token, expires_in, sealed}`. `sealed` is
   the refresh token encrypted with AES-GCM under a key only the Worker has (`SEAL_KEY`).
3. The app keeps `{value, expires}` as now, plus `sealed`, both in **localStorage for that user**
   (`userStorage`), so they survive the app being closed.
4. **Token expired, no click**: `POST <worker>/refresh {sealed}` → `{access_token, expires_in}`.
   `getToken(false)` does this quietly; sync never pauses.
5. **Sign out**: `POST <worker>/revoke {sealed}` (Google revokes it), then forget both. Fire and
   forget: sign-out works offline too.
6. **Worker unreachable or not set up** (`TOKEN_SERVER` empty in `sync/config.ts`): the app falls
   back to today's popup token. A refresh that Google refuses (`invalid_grant`: revoked or
   expired) drops `sealed` and shows today's "press Connect" state.

The Worker answers only `Origin: https://maticrasl.github.io` (and `http://localhost:5173` for
dev, set by a setting). No cookie (third-party cookies are blocked by Safari).

## Data shape

- New per-user key `actionplan.syncAuth` (localStorage via `userStorage`):
  `{ value: string, expires: number, sealed?: string }`. New key, nothing renamed.
- The old `actionplan.syncToken` (sessionStorage) is still read once on load so a person who is
  signed in when the update lands does not have to sign in again; then it is removed.
- Sync file, exports, backups: unchanged. No fixture needed (nothing an old version reads changes;
  an old version simply ignores the new key).

## Modules

- `worker/token.ts` (new, ~120 lines): the three routes, CORS, seal/unseal with Web Crypto.
  `worker/wrangler.toml`, `worker/README.md` (owner's one-time steps). Not in `src/`: it is not
  part of the page and is not built by Vite.
- `src/sync/config.ts`: `TOKEN_SERVER` url.
- `src/sync/drive.ts`: `getToken` gets the refresh step; `request` uses the code client when
  `TOKEN_SERVER` is set; `keep`/`forget` use the new key; `revoke()`. If drive.ts grows past
  ~380 lines the Worker calls go into a new `src/sync/token-server.ts`.
- `src/ui/sync-ui.ts`: sign-out calls `drive.revoke()` before `forget()`.
- `docs/decisions.md`: "no server of our own" becomes "a server for sign-in only, no data".
- i18n and Guide: the Sync article loses "sign in again after an hour"; Privacy text (WP-001)
  mentions the Worker. No new control, so Getting started and help tips are unchanged.

## Owner does once (written out in `worker/README.md`)

1. Cloudflare account (free plan); `npx wrangler login`.
2. Google Cloud: the existing web client gets its **client secret** (same client id).
3. `npx wrangler secret put GOOGLE_CLIENT_SECRET`, `... SEAL_KEY` (a generated value),
   `npm run worker:deploy`; paste the Worker address into `TOKEN_SERVER`.
4. **Publish the OAuth consent screen** (Testing → In production). While it is in Testing,
   Google expires refresh tokens after 7 days, so the gain would be small. `drive.appdata` is
   not a restricted scope; re-check Google's verification rules at that moment.

## Risk (accepted, stated)

`sealed` in localStorage can be stolen by script injection on the page; whoever has it can get
tokens for that person's app folder (only this app's own sync files, not their Drive) until they
sign out or remove the app in their Google account. Same exposure as any browser-held refresh
token. Every user text goes through `esc()`, and there are no third-party scripts besides Google's.

## Tests

Unit (`drive.test.ts`, Worker fake via `fetch` stub):
- connect with the Worker: code → token and `sealed` kept for this user
- expired token + `sealed` → quiet refresh, no popup
- refresh refused (`invalid_grant`) → `sealed` dropped, `auth` error
- Worker unreachable on refresh → `auth` (press Connect), nothing lost; on connect → popup fallback
- sign-out → revoke sent, both forgotten; works when offline
- two users on one device: each has their own `sealed`; switching never uses the other's
- old sessionStorage token taken over once
Worker (`worker/token.test.ts`, Node, Google stubbed): wrong origin → 403; seal round trip;
tampered `sealed` → 400; Google error passed on as 401.
