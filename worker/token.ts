/** Cloudflare Worker: swaps a Google sign-in code or a sealed refresh token for an access token; stores nothing. */

// Settings: GOOGLE_CLIENT_ID and ALLOWED_ORIGINS in wrangler.toml, the other two as secrets.
export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SEAL_KEY: string; // base64 of 32 random bytes; changing it signs every device out
  ALLOWED_ORIGINS: string; // comma-separated, e.g. https://maticrasl.github.io
}

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

const bytes = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const key = (k: string) => crypto.subtle.importKey('raw', bytes(k), 'AES-GCM', false, ['encrypt', 'decrypt']);

// AES-GCM: the app holds the refresh token only in this form, which nothing but this Worker can open.
export async function seal(text: string, k: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(k), new TextEncoder().encode(text)),
  );
  return b64url(new Uint8Array([...iv, ...data]));
}

export async function unseal(sealed: string, k: string): Promise<string> {
  const b = bytes(sealed);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await key(k), b.slice(12));
  return new TextDecoder().decode(plain);
}

async function google(env: Env, params: Record<string, string>) {
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // 400 from Google: the code or refresh token is no good (used, revoked, expired). Anything else (401 is a
  // wrong or missing client secret) is the Worker's fault: 502, so the app falls back to Google's popup.
  if (!res.ok) return { status: res.status === 400 ? 401 : 502, body: null };
  return { status: 200, body };
}

async function handle(req: Request, env: Env, path: string): Promise<[number, unknown]> {
  const input = (await req.json().catch(() => null)) as { code?: unknown; sealed?: unknown } | null;
  if (path === '/token') {
    if (typeof input?.code !== 'string') return [400, null];
    const g = await google(env, { code: input.code, grant_type: 'authorization_code', redirect_uri: 'postmessage' });
    if (!g.body) return [g.status, null];
    const out = { access_token: g.body.access_token, expires_in: g.body.expires_in } as Record<string, unknown>;
    // Google gives a refresh token only when the person consents; later sign-ins share it through Drive.
    if (typeof g.body.refresh_token === 'string') out.sealed = await seal(g.body.refresh_token, env.SEAL_KEY);
    return [200, out];
  }
  if (path === '/refresh') {
    let refresh: string;
    try {
      refresh = await unseal(String(input?.sealed), env.SEAL_KEY);
    } catch (e) {
      return [400, null];
    }
    const g = await google(env, { refresh_token: refresh, grant_type: 'refresh_token' });
    return g.body ? [200, { access_token: g.body.access_token, expires_in: g.body.expires_in }] : [g.status, null];
  }
  return [404, null];
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') || '';
    // A check in the browser only: the sealed token is the real secret, this keeps other sites from using the Worker.
    if (!env.ALLOWED_ORIGINS.split(',').some(o => o.trim() === origin)) return new Response(null, { status: 403 });
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: cors });
    const [status, body] = await handle(req, env, new URL(req.url).pathname);
    return new Response(body ? JSON.stringify(body) : null, {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  },
};
