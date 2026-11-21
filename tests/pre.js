// Runs before the app: a fixed calendar day, clean storage, deterministic stubs, error capture.
// The suite always starts on Wednesday 18 November 2026 at noon, mid-month and weeks from a clock
// change. The clock is shifted, not frozen: code that measures elapsed time still sees it advance.
{
  const RealDate = Date,
    shift = new RealDate(2026, 10, 18, 12).getTime() - RealDate.now();
  window.Date = class extends RealDate {
    constructor(...a) {
      if (a.length) super(...a);
      else super(RealDate.now() + shift);
    }
    static now() {
      return RealDate.now() + shift;
    }
  };
}
window.__errors = [];
window.onerror = (msg, src, line, col) => {
  __errors.push(`${msg} @${(src || '').split('/').pop()}:${line}:${col}`);
};
addEventListener('unhandledrejection', e => __errors.push('unhandled: ' + ((e.reason && e.reason.stack) || e.reason)));
localStorage.clear();
sessionStorage.clear();
localStorage.setItem('actionplan.lang', 'en');
localStorage.setItem('actionplan.v1.tourSeen', 'true');
window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 0);
window.confirm = () => true;
window.prompt = (msg, def) => 'Prompted plan';
// Chrome's virtual time stands still for network fetches only. While a Blob is read, it
// runs the page's timers ahead and can spend the whole --virtual-time-budget, so the page is dumped
// before the suite ends (NO RESULT). Fetching a blob: URL holds virtual time like any fetch.
// The originals are kept because the suite replaces URL.createObjectURL to catch downloads.
{
  const fetchUrl = fetch,
    toUrl = URL.createObjectURL,
    revoke = URL.revokeObjectURL;
  for (const how of ['text', 'arrayBuffer']) {
    Blob.prototype[how] = async function () {
      const url = toUrl(this);
      try {
        return await (await fetchUrl(url))[how]();
      } finally {
        revoke(url);
      }
    };
  }
}
