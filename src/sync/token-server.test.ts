import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../store/memory-storage';
import { setUsers, users } from '../store/users';
import { AUTH_KEY, SyncError, TOKEN_KEY, drive } from './drive';
import { AUTH_FILE, tokenServer } from './token-server';

vi.mock('./config', () => ({
  GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com',
  TOKEN_SERVER: 'https://worker.test',
  FEEDBACK_REPO: '',
}));

// Worker and Drive as one fake: `routes` maps 'METHOD path-start' to a reply (or a throw for offline).
let routes: Record<string, () => unknown>;
let calls: string[];
const answer =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  setUsers({
    current: 'a',
    list: [
      { id: 'a', ns: 'u.a.', name: 'Ana', account: { id: 'A', email: 'ana@x' } },
      { id: 'b', ns: 'u.b.', name: 'Bor', account: { id: 'B', email: 'bor@x' } },
    ],
  });
  drive.token = null;
  calls = [];
  routes = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method || 'GET'} ${url}`;
      calls.push(call);
      const hit = Object.keys(routes).find(k => call.startsWith(k));
      if (!hit) throw new Error('unexpected ' + call);
      return routes[hit]();
    }),
  );
  tokenServer.code = async () => 'code-1';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const stored = (ns = 'u.a.') => JSON.parse(localStorage.getItem('actionplan.' + ns + AUTH_KEY.slice(11)) as string);
const offline = () => {
  throw new TypeError('Failed to fetch');
};

describe('connecting through the token Worker', () => {
  test('first consent: the sealed token is kept and put in Drive for other devices', async () => {
    routes['POST https://worker.test/token'] = answer({ access_token: 'a1', expires_in: 3600, sealed: 'S1' });
    routes[`GET ${DRIVE}?spaces=appDataFolder`] = answer({ files: [] });
    routes['POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'] = answer({ id: 'f' });
    const token = await drive.request('ana@x', '');
    expect(token).toMatchObject({ value: 'a1', sealed: 'S1' });
    expect(calls.some(c => c.includes(encodeURIComponent(AUTH_FILE)))).toBe(true);
    drive.keep(token);
    expect(stored()).toMatchObject({ value: 'a1', sealed: 'S1' });
  });

  test('another device: no refresh token from Google, the one in Drive is taken', async () => {
    routes['POST https://worker.test/token'] = answer({ access_token: 'a1', expires_in: 3600 });
    routes[`GET ${DRIVE}?spaces=appDataFolder`] = answer({ files: [{ id: 'f' }] });
    routes[`GET ${DRIVE}/f?alt=media`] = answer({ sealed: 'S0' });
    routes['POST https://worker.test/refresh'] = answer({ access_token: 'a2', expires_in: 3600 });
    expect((await drive.request('', '')).sealed).toBe('S0');
  });

  test('the one in Drive no longer works: removed, sign-in lasts an hour', async () => {
    routes['POST https://worker.test/token'] = answer({ access_token: 'a1', expires_in: 3600 });
    routes[`GET ${DRIVE}?spaces=appDataFolder`] = answer({ files: [{ id: 'f' }] });
    routes[`GET ${DRIVE}/f?alt=media`] = answer({ sealed: 'dead' });
    routes['POST https://worker.test/refresh'] = answer(null, 401);
    routes[`DELETE ${DRIVE}/f`] = answer({});
    const token = await drive.request('', '');
    expect(token.sealed).toBeUndefined();
    expect(calls).toContain(`DELETE ${DRIVE}/f`);
  });

  test('popup closed: auth; Worker unreachable: Google popup token instead', async () => {
    tokenServer.code = async () => {
      throw new SyncError('auth');
    };
    await expect(drive.request('', '')).rejects.toMatchObject({ code: 'auth' });
    tokenServer.code = async () => 'code-1';
    routes['POST https://worker.test/token'] = offline;
    vi.stubGlobal('window', {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: (c: { callback: (r: object) => void }) => ({
              requestAccessToken: () => c.callback({ access_token: 'p1', expires_in: '3600' }),
            }),
            hasGrantedAllScopes: () => true,
          },
        },
      },
    });
    vi.stubGlobal('google', (window as unknown as { google: unknown }).google);
    expect(await drive.request('', '')).toMatchObject({ value: 'p1' });
  });
});

describe('a new hour without asking', () => {
  const expired = (sealed = 'S1') => drive.keep({ value: 'old', expires: Date.now() - 1000, sealed });

  test('expired: refreshed quietly and kept, also after the app was closed', async () => {
    expired();
    drive.token = null; // the app reopened: only storage is left
    routes['POST https://worker.test/refresh'] = answer({ access_token: 'a2', expires_in: 3600 });
    const spy = vi.spyOn(drive, 'request');
    expect(await drive.getToken(false)).toBe('a2');
    expect(spy).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ value: 'a2', sealed: 'S1' });
  });

  test('Google refuses it (revoked, expired): forgotten, Connect again', async () => {
    expired();
    routes['POST https://worker.test/refresh'] = answer(null, 401);
    await expect(drive.getToken(false)).rejects.toMatchObject({ code: 'auth' });
    expect(drive.token).toBeNull();
    expect(stored()).toBeNull();
  });

  test('Worker unreachable: offline, the sealed token kept for later', async () => {
    expired();
    routes['POST https://worker.test/refresh'] = offline;
    await expect(drive.getToken(false)).rejects.toMatchObject({ code: 'offline' });
    expect(stored().sealed).toBe('S1');
  });

  test("two users on one device: one's token is never used for the other", async () => {
    expired();
    users.current = 'b';
    drive.token = null;
    await expect(drive.getToken(false)).rejects.toMatchObject({ code: 'auth' });
    expect(calls).toEqual([]);
    expect(stored('u.a.').sealed).toBe('S1');
  });

  test('a token from before (sessionStorage) is still used, then moved', async () => {
    sessionStorage.setItem(
      'actionplan.u.a.' + TOKEN_KEY.slice(11),
      JSON.stringify({ value: 'v', expires: Date.now() + 3e6 }),
    );
    expect(await drive.getToken(false)).toBe('v');
    drive.keep(drive.token!);
    expect(sessionStorage.getItem('actionplan.u.a.' + TOKEN_KEY.slice(11))).toBeNull();
    expect(stored().value).toBe('v');
  });

  test('signing out forgets it here only (other devices keep using the one in Drive)', () => {
    drive.keep({ value: 'v', expires: Date.now() + 3e6, sealed: 'S1' });
    drive.forget();
    expect(stored()).toBeNull();
    expect(calls).toEqual([]);
  });
});
