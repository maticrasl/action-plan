// Runs after app.js: exercises the main flows and writes results into <pre id="OK">.
(async () => {
  if (window.moreTests) await moreTests({ step, assert });
  await tick();
  log('errors: ' + (__errors.length ? __errors.join(' || ') : 'none'));
  const pre = document.createElement('pre');
  pre.id = 'OK';
  pre.textContent = out.join('\n');
  document.body.append(pre);
})().catch(e => {
  const pre = document.createElement('pre');
  pre.id = 'OK';
  pre.textContent = 'HARNESS CRASH ' + e.stack;
  document.body.append(pre);
});
