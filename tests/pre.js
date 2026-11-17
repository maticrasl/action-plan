// Runs before the app: clean storage, deterministic stubs, error capture.
window.__errors = [];
window.onerror = (msg, src, line, col) => { __errors.push(`${msg} @${(src || '').split('/').pop()}:${line}:${col}`); };
addEventListener('unhandledrejection', e => __errors.push('unhandled: ' + (e.reason && e.reason.stack || e.reason)));
localStorage.clear();
sessionStorage.clear();
localStorage.setItem('actionplan.lang', 'en');
localStorage.setItem('actionplan.v1.tourSeen', 'true');
window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 0);
window.confirm = () => true;
window.prompt = (msg, def) => 'Prompted plan';
// Chrome's virtual time stands still for network fetches only. While Blob.text() reads a file, it
// runs the page's timers ahead and can spend the whole --virtual-time-budget, so the page is dumped
// before the suite ends (NO RESULT). Fetching a blob: URL holds virtual time like any fetch.
// The originals are kept because the suite replaces URL.createObjectURL to catch downloads.
{
  const fetchUrl = fetch, toUrl = URL.createObjectURL, revoke = URL.revokeObjectURL;
  Blob.prototype.text = async function () {
    const url = toUrl(this);
    try { return await (await fetchUrl(url)).text(); } finally { revoke(url); }
  };
}
