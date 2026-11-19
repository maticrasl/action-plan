/** Page tests: the tip of the day: where it shows, its buttons, the Settings switch, the hint, blocks, escaping. */
const tipCard = () => $('#view .tip');
const resetTips = () => userStorage.removeItem(`${STORAGE_KEY}.tips`);
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

  await step('tips: Not now and × remove the card and are stored', () => {
    const g = noStepsPlan();
    const key = `no-steps:${g.id}`;
    setView('dashboard');
    $('#view .tip [data-tip="later"]').click();
    assert(!tipCard(), 'Not now: gone');
    eq(storedTips().shown[key].snoozed, d(7), 'put off for 7 days');
    noStepsPlan('Second');
    setView('dashboard');
    const key2 = tipCard().dataset.tipKey;
    $('#view .tip [data-tip="close"]').click();
    assert(!tipCard(), '×: gone');
    eq(storedTips().shown[key2].closed, true, 'closed for good');
    eq(localStore().tips.shown[key2].closed, true, 'and carried to the sync file');
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
