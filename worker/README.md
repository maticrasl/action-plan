# Token Worker

Keeps Google Drive sync signed in. The app gets a one-time code from Google's sign-in popup and
sends it here. The Worker swaps it, using the app's client secret, for an access token (one hour)
and a refresh token, and hands the refresh token back **sealed** (encrypted with `SEAL_KEY`).
The app keeps the sealed token and sends it to `/refresh` for each new hour. The Worker stores
nothing and never sees plans: the app talks to Drive itself. Design:
`docs/specs/2026-11-24-token-worker.md`.

## One-time setup (owner)

1. **Google client secret.** Google Cloud Console → *Google Auth Platform → Clients* → the web
   client the app uses (id in `src/sync/config.ts`) → copy its client secret, or add one.
   Under *Authorized JavaScript origins* keep `https://maticrasl.github.io` (and
   `http://localhost:5173` for dev). No redirect URI is needed (the popup uses `postmessage`).
2. **Publish the consent screen.** *Google Auth Platform → Audience → Publish app*. While it is in
   *Testing*, Google ends refresh tokens after 7 days. Check what the Console asks for
   verification of the `drive.appdata` scope at that moment.
3. **Cloudflare.** Make a free account at dash.cloudflare.com, then in this repo:
   ```
   npx wrangler login
   npx wrangler secret put GOOGLE_CLIENT_SECRET --config worker/wrangler.toml
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   npx wrangler secret put SEAL_KEY --config worker/wrangler.toml   (paste the line above)
   npm run worker:deploy
   ```
   Wrangler prints the Worker's address, e.g. `https://action-plan-token.<you>.workers.dev`.
4. **Tell the app.** Put that address in `TOKEN_SERVER` in `src/sync/config.ts`. In the same
   change an agent updates the texts that say Google asks again about once an hour
   (`settings.syncHelp`-like keys in `i18n/en.ts`/`sl.ts`, the Sync and Privacy articles in
   `i18n/guide.*.ts`: grep `once an hour` and `no server`). Then ship.

Until `TOKEN_SERVER` is set the app signs in as before (a popup about once an hour).

## Later

- A new `SEAL_KEY` makes every sealed token unreadable: everyone presses Connect once.
- A new client secret needs only `wrangler secret put GOOGLE_CLIENT_SECRET`; sealed tokens keep working.
- Logs: `npx wrangler tail --config worker/wrangler.toml`.
