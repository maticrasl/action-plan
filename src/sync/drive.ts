/** Google Drive client: access token, account lookup, and reading and writing the sync file. */
import { currentUser, saveUsers, userSession, users } from '../store/users';
import { GOOGLE_CLIENT_ID } from './config';
import { mergeStores, type FullStore, type Store } from '../core/merge';
import { normalize, safeId } from '../core/normalize';
import { normalizeVisions } from '../core/visions';
import { readTips } from '../core/guidance/tip-history';
import { normalizeTrash } from '../core/trash';
import type { IdSet, ISOTime, Plan, User } from '../core/model';

// The part of Google's sign-in script (loaded at run time by loadGis) this uses.
interface TokenResponse {
  access_token: string;
  expires_in: string;
  error?: string;
}
declare const google: {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        login_hint?: string;
        callback: (r: TokenResponse) => void;
        error_callback: () => void;
      }): { requestAccessToken(options: { prompt: string }): void };
      hasGrantedAllScopes(r: TokenResponse, scope: string): boolean;
    };
  };
};

export interface Token {
  value: string;
  expires: number; // ms since 1970
}
// A Google account, as Drive tells it.
export interface Account {
  id: string;
  email: string;
  name: string;
}
// The sync file in Drive: its id, content, and the ids of extra copies to remove.
export interface Remote {
  id: string | null;
  content: FullStore | null;
  extra: string[];
}

export const SYNC_FILE = 'actionplan-sync.json';
// Raise in every release that adds a section an older copy would drop (docs/decisions.md).
export const SYNC_VERSION = 2;
export const SYNC_FORMAT = 'actionplan-sync';
export const SYNC_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export const TOKEN_KEY = 'actionplan.syncToken'; // sessionStorage: survives a reload, not a browser restart
export const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const DRIVE_ABOUT =
  'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,permissionId)';

// code: offline | auth | error | switched (another user took over) | account (someone else's account)
export class SyncError extends Error {
  declare code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/* ---------- Google: access token and Drive file ---------- */

export function loadGis(): Promise<void> {
  const memo = loadGis as typeof loadGis & { promise?: Promise<void> | null };
  if ((window as { google?: typeof google }).google?.accounts?.oauth2) return Promise.resolve();
  memo.promise ||= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve as () => void;
    s.onerror = () => {
      memo.promise = null;
      reject(new SyncError('offline'));
    };
    document.head.append(s);
  });
  return memo.promise;
}

export async function driveFetch(
  token: string,
  url: string,
  options: RequestInit & { headers?: Record<string, string> } = {},
) {
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  } catch (e) {
    throw new SyncError('offline');
  }
  if (res.status === 401) {
    if (drive.token?.value === token) drive.forget();
    throw new SyncError('auth');
  }
  if (!res.ok) throw new SyncError('error');
  return res;
}

// Tests swap these methods for an in-memory fake.
export const drive = {
  token: null as Token | null, // the current user's { value, expires }

  // A valid access token for the current user. Without one, only a click (interactive) may ask
  // Google for a new one, and it is kept only if it is for that user's own account.
  // Only a user with an account syncs (syncConnected), so `user.account` is there.
  async getToken(interactive?: boolean): Promise<string> {
    if (!this.token) {
      try {
        this.token = JSON.parse(userSession.getItem(TOKEN_KEY) as string);
      } catch (e) {
        /* none */
      }
    }
    const user = currentUser();
    if (this.token && this.token.expires - Date.now() > 60000) {
      // Linked before users existed: whose token this is gets learnt first, without a popup.
      if (user.account!.id) return this.token.value;
      const value = this.token.value,
        who = await this.whoami(value);
      if (currentUser() !== user) throw new SyncError('switched');
      try {
        this.claim(user, who);
      } catch (e) {
        this.forget();
        throw e;
      }
      return value;
    }
    if (!interactive) throw new SyncError('auth');
    const token = await this.request(user.account!.email, user.account!.id ? '' : 'select_account');
    const who = await this.whoami(token.value);
    if (currentUser() !== user) throw new SyncError('switched');
    this.claim(user, who);
    this.keep(token);
    return token.value;
  },

  // A token is used only for its user's own account. A user linked before users existed takes the
  // account it is for, unless another user here already has it.
  claim(user: User, who: Account): void {
    if (user.account!.id) {
      if (who.id !== user.account!.id) throw new SyncError('account');
      return;
    }
    if (users.list.some(u => u !== user && u.account?.id === who.id)) throw new SyncError('account');
    user.account = { id: who.id, email: who.email };
    saveUsers();
  },

  // Asks Google for an access token: `hint` is the account's email, `prompt` '' or 'select_account'.
  async request(hint: string, prompt: string): Promise<Token> {
    await loadGis();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SYNC_SCOPE,
        login_hint: hint || undefined,
        callback: r => {
          if (r.error || !google.accounts.oauth2.hasGrantedAllScopes(r, SYNC_SCOPE))
            return reject(new SyncError('auth'));
          resolve({ value: r.access_token, expires: Date.now() + Number(r.expires_in) * 1000 });
        },
        error_callback: () => reject(new SyncError('auth')),
      });
      client.requestAccessToken({ prompt });
    });
  },

  // Whose token it is: the Google account's { id, email, name }.
  async whoami(token: string): Promise<Account> {
    const { user } = await (await driveFetch(token, DRIVE_ABOUT)).json();
    if (!user?.permissionId) throw new SyncError('error');
    return {
      id: String(user.permissionId),
      email: String(user.emailAddress || ''),
      name: String(user.displayName || ''),
    };
  },

  // Remembers a token for the current user only.
  keep(token: Token): void {
    this.token = token;
    try {
      userSession.setItem(TOKEN_KEY, JSON.stringify(token));
    } catch (e) {
      /* ignore */
    }
  },

  forget(): void {
    this.token = null;
    try {
      userSession.removeItem(TOKEN_KEY);
    } catch (e) {
      /* ignore */
    }
  },

  // The sync file's id and content (null when there is none yet). Two devices connecting at the
  // same moment can each create a file; then all are merged and the extra ones listed for removal.
  async read(token: string): Promise<Remote> {
    const q = encodeURIComponent(`name = '${SYNC_FILE}' and trashed = false`);
    const list: { files?: { id: string }[] } = await (
      await driveFetch(token, `${DRIVE_API}?spaces=appDataFolder&q=${q}&orderBy=createdTime&fields=files(id)`)
    ).json();
    const files = list.files || [];
    if (!files.length) return { id: null, content: null, extra: [] };
    const contents: FullStore[] = [];
    for (const f of files)
      contents.push(parseStore(await (await driveFetch(token, `${DRIVE_API}/${f.id}?alt=media`)).text()));
    return {
      id: files[0].id,
      content: contents.reduce((a, b) => mergeStores(a, b)),
      extra: files.slice(1).map(f => f.id),
    };
  },

  async write(token: string, id: string | null, content: SyncFile): Promise<string> {
    const body = JSON.stringify(content);
    if (id) {
      await driveFetch(token, `${DRIVE_UPLOAD}/${id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      return id;
    }
    const boundary = 'actionplan' + Date.now().toString(36);
    const meta = JSON.stringify({ name: SYNC_FILE, parents: ['appDataFolder'] });
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await driveFetch(token, `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    return (await res.json()).id;
  },

  async remove(token: string, id: string): Promise<void> {
    await driveFetch(token, `${DRIVE_API}/${id}`, { method: 'DELETE' });
  },
};

// The sync file as read, before it is checked.
type RawFile = {
  format?: unknown;
  version?: unknown;
  plans?: { list?: Plan[]; deleted?: IdSet<ISOTime> };
  data?: Record<string, unknown>;
  visions?: unknown;
  tips?: unknown;
  trash?: unknown;
} | null;

export function parseStore(text: string): FullStore {
  let raw: RawFile;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new SyncError('error');
  }
  if (raw?.format !== SYNC_FORMAT || !Array.isArray(raw.plans?.list)) throw new SyncError('error');
  // A newer copy wrote it: merging could drop what this copy does not know, so nothing is merged.
  if (typeof raw.version === 'number' && raw.version > SYNC_VERSION) throw new SyncError('update');
  const list = raw.plans.list.filter(p => p && safeId(p.id) && typeof p.name === 'string');
  return {
    plans: { list, deleted: raw.plans.deleted && typeof raw.plans.deleted === 'object' ? raw.plans.deleted : {} },
    data: Object.fromEntries(list.map(p => [p.id, normalize(raw.data?.[p.id])])),
    visions: normalizeVisions(raw.visions),
    ...(raw.tips !== undefined && { tips: readTips(raw.tips) }),
    ...(raw.trash !== undefined && { trash: normalizeTrash(raw.trash) }),
  };
}

export const toFile = (store: Store) => ({
  format: SYNC_FORMAT,
  version: SYNC_VERSION,
  plans: store.plans,
  data: store.data,
  visions: store.visions,
  ...(store.tips && { tips: store.tips }),
  ...(store.trash && { trash: store.trash }),
});
export type SyncFile = ReturnType<typeof toFile>;
