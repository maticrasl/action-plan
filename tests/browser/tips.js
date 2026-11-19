/** Page tests: the tip of the day: where it shows, its buttons, the Settings switch, the hint, blocks, escaping. */
const tipCard = () => $('#view .tip');
const resetTips = () => {
  userStorage.removeItem(`${STORAGE_KEY}.tips`);
  userStorage.removeItem(`${STORAGE_KEY}.seen`);
  setAsked(null);
};
const storedTips = () => JSON.parse(userStorage.getItem(`${STORAGE_KEY}.tips`));
// A plan whose goal has had no steps for ten days: the tip "no-steps" is the one chosen.
const noStepsPlan = (title = 'Learn the piano') => {
  resetTips();
  fresh('Tips');
  return mk('goal', { title, createdAt: d(-10) });
};

suite(async () => {
  await step('tips: no-steps on the Overview under the summary, and on Goals; not on Activities', () => {
    const g = noStepsPlan();
    setView('dashboard');
    assert(tipCard(), 'a card on the Overview');
    assert($('#view .tip .tip-label .tip-bulb[aria-hidden="true"]'), 'a light bulb beside "Tip", hidden from screen readers');
    eq(getComputedStyle(tipCard()).borderLeftColor, getComputedStyle($('#view .tip .tip-bulb .glass')).fill, 'rule and bulb share the tip yellow');
    eq(tipCard().dataset.tipKey, `no-steps:${g.id}`, 'keyed to the goal');
    assert(tipCard().textContent.includes('“Learn the piano” has no steps yet'), 'names the goal');
    assert(tipCard().previousElementSibling?.classList.contains('summary'), 'right under the summary');
    setView('goals');
    assert(tipCard(), 'on the view it is about');
    setView('activities');
    assert(!tipCard(), 'not on another view');
    eq(storedTips().shown[`no-steps:${g.id}`].n, 1, 'one showing recorded, however many draws');
  });

  await step('tips: the button opens the activity form with the goal chosen; acting on it ends tips for the day', () => {
    const g = noStepsPlan();
    setView('dashboard');
    $('#view .tip [data-tip="do"]').click();
    assert(modal.open && $('[data-act-kind]', modal), 'the activity form asks the kind');
    $('[data-act-kind="once"]', modal).click();
    assert($(`[data-pick="${g.id}"][data-picked]`, modal), 'the goal is chosen');
    modal.close();
    const a = mk('activity', { title: 'First lesson' });
    rel(a, g, 'contributes');
    setView('dashboard');
    assert(!tipCard(), 'the card is gone');
    setView('goals');
    assert(!tipCard(), 'and no other tip takes its place today (only-result and no-measure are true)');
  });

  await step('tips: Why this helps opens its Guide article', () => {
    noStepsPlan();
    setView('dashboard');
    $('#view .tip [data-guide-open]').click();
    assert(ui.view === 'guide' && guideState.open === 'first-steps', `the article, got ${guideState.open}`);
    setView('dashboard');
  });

  await step('tips: × puts the tip off for a week; Don’t show this again closes it; both are stored', () => {
    const g = noStepsPlan();
    const key = `no-steps:${g.id}`;
    setView('dashboard');
    eq($('#view .tip .tip-close').getAttribute('aria-label'), 'Not now', '× says what it does');
    $('#view .tip .tip-close').click();
    assert(!tipCard(), '×: gone');
    eq(storedTips().shown[key].snoozed, d(7), 'put off for 7 days');
    assert(!storedTips().shown[key].closed, 'not closed for good');
    noStepsPlan('Second');
    setView('dashboard');
    const key2 = tipCard().dataset.tipKey;
    const never = $('#view .tip [data-tip="never"]');
    eq(never.textContent, "Don't show this again", 'an explicit button');
    never.click();
    assert(!tipCard(), 'gone');
    eq(storedTips().shown[key2].closed, true, 'closed for good');
    eq(localStore().tips.shown[key2].closed, true, 'and carried to the sync file');
  });

  await step('tips: Another tip goes through the true tips, records none of them, then says nothing is left', () => {
    const g = noStepsPlan();
    const day = `no-steps:${g.id}`;
    setView('dashboard');
    const keys = [];
    for (let i = 0; i < 30 && !$('#view .tip-none'); i++) {
      $('#view .tip [data-tip="another"]').click();
      if (tipCard() && !$('#view .tip-none')) keys.push(tipCard().dataset.tipKey);
    }
    assert(keys.length >= 2, `several tips offered: ${keys}`);
    eq(new Set(keys).size, keys.length, 'each once');
    assert(!keys.includes(day), 'not the tip of the day again');
    eq(Object.keys(storedTips().shown), [day], 'asked-for tips are not recorded');
    assert($('#view .tip-none [data-guide-open="tips-all"]'), 'nothing left: a link to Tips and tricks');
    setView('goals');
    assert(!$('#view .tip-none'), 'only on the Overview');
    setView('dashboard');
    $('#view .tip-none .tip-close').click();
    eq(tipCard()?.dataset.tipKey, day, '×: the tip of the day is back');
  });

  await step('tips: an asked-for tip that is acted on gives way to the tip of the day', () => {
    const g = noStepsPlan();
    setView('dashboard');
    $('#view .tip [data-tip="another"]').click();
    const key = tipCard().dataset.tipKey;
    assert(key !== `no-steps:${g.id}`, key);
    $('#view .tip .tip-close').click();
    eq(tipCard()?.dataset.tipKey, `no-steps:${g.id}`, 'put off: the tip of the day again');
    eq(storedTips().shown[key].snoozed, d(7), 'and the asked-for tip is put off');
  });

  await step('tips: Show me a tip in Tips and tricks opens the Overview with a tip, also when tips are off', () => {
    const g = noStepsPlan();
    saveTips({ ...getTips(), off: true });
    openGuide('tips-all');
    const art = $('#view [data-art="tips-all"]');
    assert(art && art.textContent.includes('Ctrl + Enter saves'), 'the article lists the tricks');
    $('[data-guide-do="ask-tip"]', art).click();
    eq(ui.view, 'dashboard', 'on the Overview');
    assert(tipCard() && tipCard().dataset.tipKey.startsWith('no-steps:' + g.id), `a tip: ${tipCard()?.dataset.tipKey}`);
    eq(storedTips().day, undefined, 'tips off: nothing recorded');
  });

  await step('tips: days, views, the menu and the templates are noted while tips are on', () => {
    const g = noStepsPlan();
    setView('map');
    eq(getSeen().views?.map, true, 'Map opened');
    assert(getSeen().days?.includes(today()), 'today');
    openCtxMenu(g.id, 10, 10);
    closeCtxMenu();
    eq(getSeen().menu, true, 'the menu');
    openTemplates();
    tplDialog.close();
    eq(getSeen().templates, true, 'the templates');
    resetTips();
    saveTips({ ...getTips(), off: true });
    setView('timeline');
    assert(!getSeen().views?.timeline && !getSeen().days, 'tips off: nothing noted');
    setView('dashboard');
  });

  await step('tips: a goal reached this week is praised on Goals; its button opens the goal', () => {
    resetTips();
    fresh('Tips');
    const g = mk('goal', { title: 'Run 5 km', createdAt: d(-10), status: 'achieved', statusSince: d(-2) });
    setView('goals');
    eq(tipCard()?.dataset.tipKey, `achieved:${g.id}`, 'the achieved tip');
    assert(tipCard().textContent.includes('You reached “Run 5 km”'), 'names it');
    $('#view .tip [data-tip="do"]').click();
    assert(modal.open, 'the goal form');
    modal.close();
    setView('dashboard');
  });

  await step('tips: the class D buttons open what they name', () => {
    noStepsPlan();
    TIP_DO.map();
    eq(ui.view, 'map', 'try-map: the Map');
    TIP_DO.share();
    assert(planExp.open && $('input[name="exportKind"][value="template"]', planExp).checked, 'share: export as a template');
    planExp.close();
    TIP_DO.templates();
    assert(tplDialog.open, 'templates');
    tplDialog.close();
    TIP_DO.addRoutineList();
    assert(modal.open && $('#modalBody').textContent.length, 'routine-list: the form');
    modal.close();
    setView('dashboard');
  });

  await step('tips: the Settings switch removes the card at once and brings it back', () => {
    noStepsPlan();
    setView('dashboard');
    const box = $('#settings [data-setting="tips"]');
    renderSettings();
    assert(box.checked, 'on by default');
    box.click();
    assert(!tipCard() && getTips().off, 'off: no card');
    box.click();
    assert(tipCard() && !getTips().off, 'on again: the tip of the day is back');
  });

  await step('tips: the settings hint shows on the first three showings only', () => {
    noStepsPlan();
    setView('dashboard');
    assert($('#view .tip .tip-hint'), 'first showing: the hint');
    noStepsPlan();
    saveTips({ ...getTips(), shown: { old: { n: 3, last: d(-40) } } });
    setView('dashboard');
    assert(tipCard() && !$('#view .tip .tip-hint'), 'fourth showing: no hint');
  });

  await step('tips: a long title with characters that need escaping is shown safely', () => {
    const title = `<b>Tom & "Jerry"</b> ${'x'.repeat(70)}`;
    noStepsPlan(title);
    setView('dashboard');
    assert(tipCard().textContent.includes(title), 'the title as typed');
    assert(!$('#view .tip b'), 'no markup from the title');
    assert(tipCard().scrollWidth <= tipCard().clientWidth + 1, 'it wraps');
  });

  await step('tips: none in a sample plan, while Getting started opens, or two days after the first item', () => {
    const g = noStepsPlan();
    replaceWalk({ state: 'on', started: today(), done: {}, skipped: [] });
    setView('dashboard');
    assert(!$('#view .tip'), 'Getting started first stage open');
    replaceWalk({ state: 'off', done: {}, skipped: [] });
    g.createdAt = d(-1);
    setView('dashboard');
    assert(!tipCard(), 'first item yesterday: quiet');
    loadSample();
    setView('dashboard');
    assert(!tipCard(), 'sample plan: none');
  });

  await step('tips: the item of the tip is deleted while it shows: the card goes, no error', () => {
    const g = noStepsPlan();
    setView('dashboard');
    assert(tipCard(), 'shown');
    db.goals.splice(db.goals.indexOf(g), 1);
    setView('dashboard');
    assert(!tipCard(), 'gone');
  });

  await step('tips: Slovenian texts', () => {
    noStepsPlan('Klavir');
    setLanguage('sl');
    setView('dashboard');
    const text = tipCard().textContent;
    setLanguage('en');
    assert(text.includes('Nasvet') && text.includes('»Klavir« še nima korakov'), text);
  });
});
