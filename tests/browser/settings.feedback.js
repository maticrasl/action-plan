/** Page tests: Report a problem and Suggest a feature (what the dialog shows, the link it opens), the version line. */
suite(async () => {
  // Stubs for leaving the app: the address window.open gets, and the text copied.
  let opened = null,
    copied = null;
  const realOpen = window.open;
  window.open = url => (opened = url);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async text => (copied = text) },
    configurable: true,
  });
  const dlg = $('#feedback');

  await step('Settings: both rows, and the version copies on a click', async () => {
    $('#settingsBtn').click();
    assert(!settings.querySelector('[data-fb-rows]').hidden, 'rows shown');
    eq($('#versionBtn').textContent.trim(), 'Version dev');
    $('#versionBtn').click();
    await tick();
    eq(copied, 'dev');
    settings.close();
  });

  await step('Report a problem: the details shown in full, then the bug form with them', async () => {
    $('#settingsBtn').click();
    settings.querySelector('[data-fb="bug"]').click();
    assert(dlg.open, 'dialog open');
    const line = dlg.querySelector('.fb-details').textContent;
    assert(/^Version dev · .+ on .+ · \d+×\d+ · English · installed: no · sync: /.test(line), line);
    assert(!$('#feedbackCopy').hidden, 'copy offered');
    $('#feedbackCopy').click();
    await tick();
    eq(copied, line);
    $('#feedbackOpen').click();
    assert(!dlg.open, 'closes after opening GitHub');
    eq(
      opened,
      'https://github.com/maticrasl/action-plan/issues/new?template=bug.yml&version=dev&environment=' +
        encodeURIComponent(line.replace('Version dev · ', '')),
    );
    settings.close();
    return line;
  });

  await step('Suggest a feature: no details, only the version goes', () => {
    $('#settingsBtn').click();
    settings.querySelector('[data-fb="idea"]').click();
    assert(!dlg.querySelector('.fb-details') && $('#feedbackCopy').hidden, 'no details');
    $('#feedbackOpen').click();
    eq(opened, 'https://github.com/maticrasl/action-plan/issues/new?template=feature.yml&version=dev');
    settings.close();
  });

  await step('Cancel closes; Slovenian texts', () => {
    setLang('sl');
    applyStaticI18n();
    $('[data-fb="bug"]').click();
    eq($('#feedbackTitle').textContent, 'Prijavi težavo');
    dlg.querySelector('.modal-foot [data-fb-close]').click();
    assert(!dlg.open, 'closed');
    setLang('en');
    applyStaticI18n();
  });

  await step('the Guide ends with Tell us; no rows without a repository', () => {
    setView('guide');
    const rows = $('.guide-fb');
    assert(rows && rows.querySelectorAll('[data-fb]').length === 2, 'two rows in the Guide');
    rows.querySelector('[data-fb="idea"]').click();
    assert(dlg.open, 'opens from the Guide');
    dlg.close();
    eq(feedbackRows(''), '');
    setView('dashboard');
  });

  window.open = realOpen;
});
