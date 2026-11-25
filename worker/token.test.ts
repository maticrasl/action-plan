import { afterEach, describe, expect, test, vi } from 'vitest';
import worker, { seal, unseal, type Env } from './token';

const env: Env = {
  GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret',
  SEAL_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
  ALLOWED_ORIGINS: 'https://app.example, http://localhost:5173',
};
const call = (path: string, body: unknown, origin = 'https://app.example', method = 'POST') =>
  worker.fetch(
    new Request('https://worker.example' + path, {
      method,
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }),
    env,
  );
// Google's token endpoint, answering `reply` with `status`; returns the stub to see what was sent.
const google = (reply: unknown, status = 200) => {
  const f = vi.fn(async () => new Response(JSON.stringify(reply), { status }));
  vi.stubGlobal('fetch', f);
  return f;
};
const sent = (f: ReturnType<typeof google>) =>
  new URLSearchParams(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
afterEach(() => vi.unstubAllGlobals());

describe('token worker', () => {
  test('seal round trip; a changed or foreign blob is refused', async () => {
    const s = await seal('refresh-1', env.SEAL_KEY);
    expect(s).not.toContain('refresh-1');
    expect(await unseal(s, env.SEAL_KEY)).toBe('refresh-1');
    const flipped = s.slice(0, -2) + (s.endsWith('A') ? 'B' : 'A') + s.slice(-1);
    await expect(unseal(flipped, env.SEAL_KEY)).rejects.toThrow();
    const other = btoa(String.fromCharCode(...new Uint8Array(32).fill(8)));
    await expect(unseal(s, other)).rejects.toThrow();
  });

  test('code: exchanged with the secret, refresh token handed back sealed', async () => {
    const f = google({ access_token: 'a1', expires_in: 3599, refresh_token: 'r1' });
    const res = await call('/token', { code: 'c1' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
    const body = await res.json();
    expect(body).toMatchObject({ access_token: 'a1', expires_in: 3599 });
    expect(await unseal(body.sealed, env.SEAL_KEY)).toBe('r1');
    const p = sent(f);
    expect([p.get('code'), p.get('client_secret'), p.get('redirect_uri'), p.get('grant_type')]).toEqual([
      'c1',
      'secret',
      'postmessage',
      'authorization_code',
    ]);
  });

  test('code without a refresh token (granted before): no sealed', async () => {
    google({ access_token: 'a1', expires_in: 3599 });
    const body = await (await call('/token', { code: 'c1' })).json();
    expect(body.sealed).toBeUndefined();
  });

  test('refresh: a fresh access token for the sealed refresh token', async () => {
    const f = google({ access_token: 'a2', expires_in: 3599 });
    const res = await call('/refresh', { sealed: await seal('r1', env.SEAL_KEY) });
    expect(await res.json()).toEqual({ access_token: 'a2', expires_in: 3599 });
    expect([sent(f).get('refresh_token'), sent(f).get('grant_type')]).toEqual(['r1', 'refresh_token']);
  });

  test('Google refusing (revoked, expired) is 401; a broken blob 400; Google down 502', async () => {
    google({ error: 'invalid_grant' }, 400);
    expect((await call('/refresh', { sealed: await seal('r1', env.SEAL_KEY) })).status).toBe(401);
    expect((await call('/refresh', { sealed: 'junk' })).status).toBe(400);
    expect((await call('/refresh', {})).status).toBe(400);
    google({ error: 'x' }, 500);
    expect((await call('/token', { code: 'c' })).status).toBe(502);
    google({ error: 'invalid_client' }, 401); // secret missing or wrong: not the person's fault
    expect((await call('/token', { code: 'c' })).status).toBe(502);
  });

  test('only the app origins; preflight answered; other paths 404', async () => {
    const f = google({ access_token: 'a1', expires_in: 1 });
    expect((await call('/token', { code: 'c' }, 'https://evil.example')).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
    const pre = await call('/token', null, 'http://localhost:5173', 'OPTIONS');
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect((await call('/nope', {})).status).toBe(404);
  });
});
