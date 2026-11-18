// Runs before the app in the stored-data fixture pages (scripts/fixtures.mjs): a frozen clock,
// counted ids, no network, and storage set to what the fixture holds. fixture-config.js sets __FX.
window.__errors = [];
window.onerror = (msg, src, line, col) => {
  __errors.push(`${msg} @${(src || '').split('/').pop()}:${line}:${col}`);
};
addEventListener('unhandledrejection', e => __errors.push('unhandled: ' + ((e.reason && e.reason.stack) || e.reason)));

// The clock stands still at __FX.clock; a builder may move it with __clock.set(iso).
(() => {
  const RealDate = Date;
  let now = RealDate.parse(__FX.clock);
  window.__clock = {
    set: at => {
      now = typeof at === 'number' ? at : RealDate.parse(at);
    },
    get now() {
      return now;
    },
  };
  window.Date = class extends RealDate {
    constructor(...a) {
      if (a.length) super(...a);
      else super(now);
    }
    static now() {
      return now;
    }
  };
})();

// Ids in creation order: 00000000-0000-4000-8000-000000000001, …
(() => {
  let n = 0;
  const next = () => '00000000-0000-4000-8000-' + (++n).toString(16).padStart(12, '0');
  Object.defineProperty(crypto, 'randomUUID', { value: next, configurable: true });
})();

Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });
window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 0);
window.confirm = () => true;
window.prompt = (msg, def) => def ?? '';
window.alert = () => {};

localStorage.clear();
sessionStorage.clear();
for (const [k, v] of Object.entries(__FX.storage || {})) localStorage.setItem(k, v);
