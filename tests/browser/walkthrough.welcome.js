/** Page tests: the welcome card on a first visit, its four choices, and the banner over a sample plan. */
const ownPlans = () => plans.list.filter(p => !p.demo);
const welcomeOpen = () => !!$('.welcome') && !!$('.welcome-block');
const clearWalk = () => {
  prefs.set('walk', null);
  forgetWalk();
};

suite(async () => {
  await step('welcome: offered on a first visit only, not after the old tour', async () => {
    clearWalk();
    localStorage.removeItem('actionplan.v1.tourSeen');
    eq(offerWalk(true, storedWalk(), false), 'welcome', 'first visit, nothing stored');
    offerWelcome();
    await tick();
    await new Promise(r => requestAnimationFrame(r));
    assert($('.lang-pick'), 'the language picker first');
    $('.lang-pick [data-lang-done]').click();
    assert(welcomeOpen() && document.activeElement === $('.welcome [data-begin="own"]'), 'then the welcome card, own goal focused');
    const labels = [...$$('.welcome [data-begin]')].map(b => b.textContent);
    eq(labels, ['own', 'template', 'sample', 'self'].map(k => t(`welcome.${k}`)), 'four choices');
    // Tab stays inside.
    for (let i = 0; i < 5; i++) press('Tab');
    assert(document.activeElement.closest('.welcome'), 'Tab stays in the card');
    press('Escape');
    assert(!welcomeOpen() && getWalk().state === 'on' && ui.view === 'dashboard', 'Esc: as own goal');
    // Someone who saw the old tour is not new.
    clearWalk();
    prefs.set('tourSeen', true);
    eq(offerWalk(true, storedWalk(), true), 'keep', 'tourSeen: no welcome');
    assert(getWalk().state === 'off', 'and Getting started reads as off');
    return labels.join(' | ');
  });

  await step('welcome: each choice does what it says', () => {
    const res = [];
    // Own goal: the card on the Overview of this plan.
    clearWalk();
    showWelcome();
    $('.welcome [data-begin="own"]').click();
    assert(!welcomeOpen() && getWalk().state === 'on' && $('#view .walk'), 'own: card shown');
    res.push('own');
    // A click outside does the same.
    clearWalk();
    showWelcome();
    $('.welcome-block').click();
    assert(!welcomeOpen() && getWalk().state === 'on', 'outside: as own goal');
    // Template: the dialog opens; Getting started is on for the plan made.
    clearWalk();
    showWelcome();
    $('.welcome [data-begin="template"]').click();
    assert(tplDialog.open, 'template dialog open');
    assert(getWalk().state === 'on', 'template: on');
    document.querySelectorAll('dialog[open]').forEach(dl => dl.close());
    res.push('template');
    // Own way: off, with the toast that says where to find it.
    clearWalk();
    showWelcome();
    $('.welcome [data-begin="self"]').click();
    assert(getWalk().state === 'off' && !$('#view .walk'), 'self: off, no card');
    eq($('#toast').textContent, t('walk.hidden'), 'self: toast');
    res.push('self');
    return res.join(' ');
  });

  await step('sample: a demo with a banner on every view; no card, no ticks; start my own plan', () => {
    clearWalk();
    fresh('Mine');
    const own = plans.current;
    showWelcome();
    $('.welcome [data-begin="sample"]').click();
    assert(isDemo() && currentPlan().demo === true, 'sample opened as a demo');
    const missing = views.filter(v => {
      setView(v);
      return !$('#view .demo-banner') || $('#view .walk');
    });
    eq(missing, [], 'banner, and no card, on every view');
    setView('guide');
    assert($('#view .demo-banner'), 'also in the Guide');
    assert(!Object.keys(getWalk().done).length, 'nothing ticks in the sample');
    $('#view [data-demo="own"]').click();
    assert(plans.current === own && !isDemo() && ui.view === 'dashboard', 'back on my own plan');
    assert(plans.list.some(p => p.demo), 'the sample stays');
    assert($('#view .walk') && $('#view .walk-head .walk-n').textContent.startsWith('0'), 'card with 0 done');
    assert(!$('#view .demo-banner'), 'no banner on my plan');
  });

  await step('sample: switching to it hides the card; back, the card is unchanged; remove sample', () => {
    const own = plans.current;
    const sample = plans.list.find(p => p.demo);
    $('#view [data-walk="fold"]').click();
    openPlan(sample.id);
    setView('dashboard');
    assert(!$('#view .walk') && $('#view .demo-banner'), 'demo: banner, no card');
    $('#view [data-demo="remove"]').click();
    assert(!plans.list.some(p => p.id === sample.id) && plans.current === own, 'sample removed, my plan open');
    assert($('#view .walk.folded'), 'card as I left it');
    // With only the sample left, leaving it makes an own plan.
    plans.list.filter(p => p.id !== plans.current).forEach(p => deletePlan(p.id));
    loadSample();
    deletePlan(own);
    assert(!ownPlans().length && isDemo(), 'only the sample left');
    leaveDemo(false);
    assert(ownPlans().length === 1 && !isDemo() && currentPlan().name === t('plan.defaultName'), 'a new own plan');
  });

  await step('sample from Settings is marked too, and survives saving and loading', () => {
    loadSample();
    const id = plans.current;
    save();
    const stored = JSON.parse(localStorage.getItem('actionplan.plans')).list.find(p => p.id === id);
    assert(stored.demo === true, 'marker stored on the plan list entry');
    leaveDemo(true);
  });
});
