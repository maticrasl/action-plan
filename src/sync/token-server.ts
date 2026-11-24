/** Sign-in that lasts: Google's code popup, the token Worker (worker/token.ts), and the sealed token shared in Drive. */
import { GOOGLE_CLIENT_ID, TOKEN_SERVER } from './config';
import { DRIVE_API, DRIVE_UPLOAD, SYNC_SCOPE, SyncError, driveFetch, loadGis, type Token } from './drive';

// The part of Google's sign-in script this uses (the code model).
declare const google: {
  accounts: {
    oauth2: {
      initCodeClient(config: {
        client_id: string;
        scope: string;
        ux_mode: 'popup';
        login_hint?: string;
        select_account?: boolean;
        callback: (r: { code?: string; scope?: string; error?: string }) => void;
        error_callback: () => void;
      }): { requestCode(): void };
    };
  };
};

// In the account's Drive app folder: the sealed refresh token, for the account's other devices.
export const AUTH_FILE = 'actionplan-auth.json';

interface Answer {
  access_token: string;
  expires_in: number;
  sealed?: string;
}

async function post(path: string, body: object): Promise<Answer> {
  let res: Response;
  try {
    res = await fetch(TOKEN_SERVER + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new SyncError('offline');
  }
  if (res.status === 401 || res.status === 400) throw new SyncError('auth');
  if (!res.ok) throw new SyncError('error');
  return res.json();
}

const toToken = (a: Answer, sealed?: string): Token => ({
  value: a.access_token,
  expires: Date.now() + Number(a.expires_in) * 1000,
  ...(sealed && { sealed }),
});

// Tests swap these methods for fakes.
export const tokenServer = {
  // Google gives a refresh token only when the person consents, so once per account: it goes to
  // the app folder, and an account's later sign-ins (other devices) take it from there.
  async connect(hint: string, prompt: string): Promise<Token> {
    const answer = await post('/token', { code: await this.code(hint, prompt) });
    const token = toToken(answer, answer.sealed);
    if (answer.sealed)
      await this.share(token.value, answer.sealed).catch(() => {}); // this device has it anyway
    else token.sealed = await this.shared(token.value);
    return token;
  },

  async refresh(sealed: string): Promise<Token> {
    return toToken(await post('/refresh', { sealed }), sealed);
  },

  // The one in Drive, if Google still takes it (a dead one is removed, so it is not handed out again).
  async shared(access: string): Promise<string | undefined> {
    const file = await this.authFile(access);
    if (!file) return undefined;
    const { sealed } = await (await driveFetch(access, `${DRIVE_API}/${file}?alt=media`)).json();
    try {
      await this.refresh(sealed);
      return sealed;
    } catch (e) {
      if (e instanceof SyncError && e.code === 'auth')
        await driveFetch(access, `${DRIVE_API}/${file}`, { method: 'DELETE' });
      return undefined;
    }
  },

  async share(access: string, sealed: string): Promise<void> {
    const file = await this.authFile(access),
      body = JSON.stringify({ sealed });
    if (file)
      await driveFetch(access, `${DRIVE_UPLOAD}/${file}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    else {
      const boundary = 'actionplan' + Date.now().toString(36);
      const meta = JSON.stringify({ name: AUTH_FILE, parents: ['appDataFolder'] });
      await driveFetch(access, `${DRIVE_UPLOAD}?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
      });
    }
  },

  async authFile(access: string): Promise<string | undefined> {
    const q = encodeURIComponent(`name = '${AUTH_FILE}' and trashed = false`);
    const list: { files?: { id: string }[] } = await (
      await driveFetch(access, `${DRIVE_API}?spaces=appDataFolder&q=${q}&fields=files(id)`)
    ).json();
    return list.files?.[0]?.id;
  },

  // Google's popup: a one-time code for the Worker. `prompt` 'select_account' lets the person pick an account.
  async code(hint: string, prompt: string): Promise<string> {
    await loadGis();
    return new Promise((resolve, reject) => {
      google.accounts.oauth2
        .initCodeClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SYNC_SCOPE,
          ux_mode: 'popup',
          login_hint: hint || undefined,
          select_account: prompt === 'select_account',
          callback: r =>
            r.code && r.scope?.split(' ').includes(SYNC_SCOPE) ? resolve(r.code) : reject(new SyncError('auth')),
          error_callback: () => reject(new SyncError('auth')),
        })
        .requestCode();
    });
  },
};
