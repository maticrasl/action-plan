/** Service worker: lets the installed app open without a connection. */
/* The app's own files are fetched from the network first, so an update shows on the next launch,
   and from the cache when offline. Fonts are kept once loaded. Everything else (Google sign-in
   and Drive) goes straight to the network. */

// Both are filled in at build time (vite.config.ts, serviceWorker()): the cache name changes with
// every build, and the shell lists the built files, whose names hold a hash.
const CACHE = __SW_CACHE__;
const SHELL = __SW_SHELL__;
const FONTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(networkFirst(req));
  else if (FONTS.includes(url.origin)) e.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit =
      (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' && (await cache.match('./')));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
