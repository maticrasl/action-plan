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
