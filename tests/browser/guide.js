/** Page tests: the Guide page: opening it, its articles, actions, search, the weekly review, live facts, help mode's links. */
suite(async () => {
  const art = id => $(`#view [data-art="${id}"]`);
  const isOpen = id => art(id).querySelector('[data-guide-toggle]').getAttribute('aria-expanded') === 'true';
  const openIds = () =>
    [...$('#view').querySelectorAll('[data-guide-toggle][aria-expanded="true"]')].map(b => b.dataset.guideToggle);
  const shownArts = () => [...$('#view').querySelectorAll('[data-art]')].filter(a => !a.hidden).map(a => a.dataset.art);
  const search = q => {
    const box = $('#guideSearch');
    box.value = q;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const closeAll = () => {
    if (modal.open) modal.close();
    if (settings.open) settings.close();
    closeCtxMenu();
  };

  await step('opens from ? at the top right and from Settings, not from the views; ? again goes back', () => {
    fresh('Guide plan');
    setView('goals');
    assert(!$('.nav [data-view="guide"]'), 'not among the views');
    assert($('.topbar-actions #helpBtn + #settingsBtn'), '? sits beside Settings');
    $('#helpBtn').click();
    eq(ui.view, 'guide', '? opens it');
    eq($('#viewTitle').textContent, t('view.guide'), 'title');
    assert(![...document.querySelectorAll('.nav-item')].some(b => b.classList.contains('active')), 'no view marked');
    assert($('#helpBtn').getAttribute('aria-pressed') === 'true', '? shows it is on the Guide');
    $('#helpBtn').click();
    eq(ui.view, 'goals', '? returns to the view before');
    $('#helpBtn').click();
    eq(ui.view, 'guide', '? opens the Guide');
    $('#helpBtn').click();
    setView('timeline');
    $('#settingsBtn').click();
    $('#guideBtn').click();
    assert(!settings.open && ui.view === 'guide', 'Settings › Open the Guide');
    $('#helpBtn').click();
    eq(ui.view, 'timeline', 'and back');
  });

  await step('Escape leaves the Guide for the view before; not while a dialog is open or a search has text', () => {
    const esc = (target = document.body) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    setView('graphs');
    $('#helpBtn').click();
    modal.showModal();
    esc();
    eq(ui.view, 'guide', 'a dialog open: stays');
    modal.close();
    search('zzz');
    esc($('#guideSearch'));
    eq(ui.view, 'guide', 'Escape in a search with text: stays (the box clears it)');
    search('');
    esc($('#guideSearch'));
    eq(ui.view, 'graphs', 'back to the view before');
    esc();
    eq(ui.view, 'graphs', 'outside the Guide: nothing');
  });

  await step('every article is listed, in its group, closed', () => {
    setView('guide');
    guideState.open = null;
    render();
    eq(shownArts().join(), GUIDE.en.map(a => a.id).join(), 'all articles in order');
    const groups = [...$('#view').querySelectorAll('.guide-group h2')].map(h => h.textContent);
    eq(groups.join('|'), GUIDE_GROUPS.map(g => t(`guide.group.${g}`)).join('|'), 'group headings');
    eq(openIds().length, 0, 'none open');
    const body = art('method').querySelector('.guide-a');
    assert(body.hidden && body.getAttribute('hidden') === 'until-found', 'closed bodies stay findable');
    assert(!$('#view .help-banner') && !$('#view [data-help-tip]'), 'no help banner, no tips');
  });

  await step('openGuide opens one article, scrolls to it and focuses its title', () => {
    setView('dashboard');
    openGuide('routine-slips');
    eq(ui.view, 'guide');
    eq(openIds().join(), 'routine-slips', 'only that one open');
    assert(document.activeElement === art('routine-slips').querySelector('[data-guide-toggle]'), 'focus on its title');
    assert(!art('routine-slips').querySelector('.guide-a').hidden, 'its text shows');
    openGuide('h-map');
    eq(openIds().join(), 'h-map', 'another closes the first');
    openGuide('nonexistent');
    eq(ui.view, 'guide', 'unknown id still opens the page');
    eq(openIds().length, 0, 'with nothing open');
  });

  await step('clicking titles opens one at a time; again closes it', () => {
    openGuide('method');
    art('words').querySelector('[data-guide-toggle]').click();
    eq(openIds().join(), 'words', 'one at a time');
    eq(guideState.open, 'words', 'remembered while the app is open');
    art('words').querySelector('[data-guide-toggle]').click();
    eq(openIds().length, 0, 'closed again');
    assert(
      [...$('#view').querySelectorAll('[data-guide-toggle]')].every(b => b.tagName === 'BUTTON' && b.tabIndex === 0),
      'every title is a button that Tab reaches',
    );
  });

  await step('an open article shows its text, its action and its related articles', () => {
    openGuide('what-goal');
    const a = art('what-goal');
    assert(a.textContent.includes('Start from what bothers you'), 'text');
    eq(a.querySelector('[data-guide-do]').textContent, 'Start from a template', 'action');
    const rel = [...a.querySelectorAll('.guide-related [data-guide-open]')].map(b => b.dataset.guideOpen);
    eq(rel.join(), 'vision-how,smart-fit,too-many', 'related');
    a.querySelector('[data-guide-open="smart-fit"]').click();
    eq(openIds().join(), 'smart-fit', 'related link opens that one');
    // A link inside the text carries the other article's title.
    openGuide('not-starting');
    const inText = art('not-starting').querySelector('.guide-text [data-guide-open="let-go"]');
    eq(inText.textContent, 'This goal no longer feels right', 'link in the text');
  });

  await step('actions do what they say: a form, Settings at a section, a view, a dialog', async () => {
    openGuide('h-goals');
    art('h-goals').querySelector('[data-guide-do]').click();
    assert(modal.open && formCtx.kind === 'goal' && !formCtx.id, 'Add a goal opens a new goal');
    closeAll();
    openGuide('h-routines');
    art('h-routines').querySelector('[data-guide-do]').click();
    assert(modal.open && formCtx.kind === 'activity' && $('#modal [name="repeat"]'), 'Add a routine opens a routine');
    closeAll();
    openGuide('h-sync');
    art('h-sync').querySelector('[data-guide-do]').click();
    assert(settings.open, 'Settings open');
    await tick();
    const sec = $('#syncSection').getBoundingClientRect(),
      box = settings.getBoundingClientRect();
    assert(sec.top >= box.top - 1 && sec.top < box.bottom, 'at Account and sync');
    closeAll();
    openGuide('h-map');
    art('h-map').querySelector('[data-guide-do]').click();
    eq(ui.view, 'map', 'Open the Map');
    openGuide('what-goal');
    art('what-goal').querySelector('[data-guide-do]').click();
    assert(tplDialog.open, 'Start from a template');
    tplDialog.close();
    openGuide('p-backup');
    art('p-backup').querySelector('[data-guide-do]').click();
    assert(planExp.open, 'Export plan');
    planExp.close();
  });

  await step('search: words from the text, any case, without diacritics', () => {
    openGuide('');
    search('GRAVEYARD');
    eq(shownArts().join(), 'too-many', 'a word from a body, in capitals');
    assert(
      [...$('#view').querySelectorAll('.guide-group')].filter(g => !g.hidden).length === 1,
      'groups without matches hide',
    );
    search('late routine tick');
    assert(
      shownArts().includes('routine-slips') && shownArts().includes('h-routines') && !shownArts().includes('too-many'),
      'several words, all of them: ' + shownArts(),
    );
    search('zzqx');
    eq(shownArts().length, 0, 'nothing');
    eq($('#view .guide-none').textContent, 'Nothing found for “zzqx”. Try another word.', 'says so');
    assert(!$('#view .guide-none').hidden, 'message shows');
    search('');
    eq(shownArts().length, GUIDE.en.length, 'clearing shows everything');
    assert($('#view .guide-none').hidden, 'message gone');
    changeLanguage('sl');
    search('pokopalisce');
    eq(shownArts().join(), 'too-many', 'Slovenian without č, š, ž');
    search('');
    changeLanguage('en');
  });

  await step('the search text stays while the app is open', () => {
    openGuide('');
    search('graveyard');
    setView('goals');
    setView('guide');
    eq($('#guideSearch').value, 'graveyard', 'kept');
    eq(shownArts().join(), 'too-many', 'still filtered');
    search('');
  });

  await step('weekly review: the article is plain text with one button that opens the weekly review', () => {
    openGuide('review');
    const a = art('review');
    assert(!a.querySelector('input[type="checkbox"]'), 'no checklist (the review is a view of its own, feature 14)');
    a.querySelector('[data-guide-do="view-review"]').click();
    eq([ui.view, reviewView.tab], ['review', 'week'], 'opens This week');
  });

  await step('Explanations on screen: switched on the Guide, a link in each banner', () => {
    openGuide('');
    const sw = $('#view [data-guide-help]');
    eq(sw.closest('label').textContent.trim(), t('btn.help'), 'its name');
    sw.click();
    assert(ui.help, 'on');
    assert(!$('#view .help-banner'), 'the Guide itself shows none');
    for (const [view, id] of Object.entries(VIEW_ARTICLE)) {
      setView(view);
      const link = $('#view .help-banner [data-guide-open]');
      assert(link, `${view}: banner link`);
      eq(link.textContent, t('guide.more'), `${view}: its words`);
      link.click();
      eq(`${ui.view}:${openIds().join()}`, `guide:${id}`, `${view} opens its article`);
    }
    $('#view [data-guide-help]').click();
    assert(!ui.help, 'off again');
  });

  await step('live facts: sync, several users, plans only in this browser', () => {
    openGuide('h-sync');
    const text = () => art('h-sync').querySelector('.guide-text').textContent;
    assert(syncConfigured() && text().includes('Log in with Google') && !text().includes('not set up'), 'set up');
    const real = guideFacts;
    try {
      setGuideFacts(() => ({ ...real(), syncSetUp: false, noSync: true }));
      render();
      assert(
        text().includes('Sync is not set up for this copy') && !text().includes('Log in with Google'),
        'not set up',
      );
      openGuide('p-device');
      assert(!art('p-device').textContent.includes('kept apart'), 'one user: no word about several');
      setGuideFacts(() => ({ ...real(), multiUser: true }));
      render();
      assert(art('p-device').textContent.includes('kept apart'), 'several users');
    } finally {
      setGuideFacts(real);
    }
    openGuide('p-backup');
    const only = () => art('p-backup').textContent.includes('in this browser only right now');
    markSeen({ exported: false });
    render();
    assert(only(), 'no export, no sync: the warning');
    markSeen({ exported: true });
    render();
    assert(!only(), 'after an export: gone');
  });

  await step('install: no button without a way to install here', () => {
    openGuide('h-install');
    assert(!installPrompt && !art('h-install').querySelector('[data-guide-do]'), 'no prompt, no button');
  });

  await step('a language switch keeps the open article open', () => {
    openGuide('let-go');
    changeLanguage('sl');
    eq(openIds().join(), 'let-go', 'same article');
    eq(art('let-go').querySelector('[data-guide-toggle]').textContent, GUIDE.sl.find(a => a.id === 'let-go').title);
    changeLanguage('en');
  });

  await step('the Add button offers the kinds, as on the Map', () => {
    openGuide('');
    $('#addBtn').click();
    assert(!ctxMenu.hidden && ctxMenu.querySelectorAll('[data-add-kind], button').length >= 3, 'menu of kinds');
    closeAll();
  });

  await step('a demo plan and an empty plan show the full Guide', () => {
    loadSample();
    openGuide('');
    eq(shownArts().length, GUIDE.en.length, 'sample plan');
    fresh('Empty');
    render();
    eq(shownArts().length, GUIDE.en.length, 'empty plan');
    setView('dashboard');
  });
});
