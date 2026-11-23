/** Page tests: Find your visions (feature 01): the three exercises, Reflections, saving as typed, undo and the Areas rating. */
suite(async () => {
  const dlg = $('#discDlg');
  const body = () => $('#discBody');
  const foot = sel => $(`#discFoot [data-disc-do="${sel}"]`);
  const type = (sel, value) => {
    const el = $(`#discBody ${sel}`);
    assert(el, `field ${sel}`);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const next = () => foot('next').click();
  const runs = () => journal.sessions;
  const setup = async name => {
    if (dlg.open) {
      dlg.close();
      await tick(); // the close event comes a moment later
    }
    fresh(name);
    setAside();
    clearVisions();
    journal.sessions = [];
    saveJournal();
    prefs.set('hiddenAreas', []);
  };
  const start = ex => {
    openDiscovery();
    $(`#discBody [data-disc-start="${ex}"]`).click();
  };

  await step('discovery: the Visions view offers it, empty and not; What for? needs a goal', async () => {
    await setup('Discovery entry');
    setView('visions');
    assert($('#view .empty [data-disc].primary'), 'the main button of the empty state');
    $('#view [data-disc]').click();
    assert(dlg.open, 'the chooser opens');
    eq(getSeen().discovery, true, 'seen');
    assert($('#discBody [data-disc-start="what-for"]').disabled, 'greyed without a goal');
    assert(body().textContent.includes(t('disc.needsGoal')), 'says why');
    dlg.close();
    mkV('To be calm');
    saveVisions();
    render();
    assert($('#view .vis-top [data-disc]'), 'beside the switch');
    putBack();
  });

  await step('good-day: answers saved, one sentence makes a vision with description and avoid', async () => {
    await setup('Good day');
    start('good-day');
    eq(runs().length, 0, 'nothing stored before anything is typed');
    eq($$('#discBody .disc-dots li').length, 5, 'five dots');
    type('[data-a="s1"]', 'Wake by the sea.');
    next();
    eq(runs().length, 1, 'stored on Next');
    type('[data-a="s2"]', 'Walk, write, cook.');
    next();
    next();
    type('[data-a="s4"]', 'Tired on the sofa.');
    next();
    type('[data-s5="0"][data-part="text"]', '  To live by the sea  ');
    type('[data-s5="0"][data-part="area"]', 'Home');
    next();
    eq(foot('add').textContent, tp('disc.addVisions', 1), 'Add as a vision');
    foot('add').click();
    assert(!dlg.open, 'closed');
    const v = visions.list.find(x => x.title === 'To live by the sea');
    assert(v, 'vision added, trimmed');
    eq(
      [v.area, v.description, v.avoid],
      ['Home', 'Wake by the sea.\n\nWalk, write, cook.', 'Tired on the sofa.'],
      'fields',
    );
    eq(ui.view, 'visions', 'Visions view opens');
    assert($(`#view .card.vision[data-open="${v.id}"]`), 'in view');
    const s = runs()[0];
    eq([s.exercise, s.done, s.made], ['good-day', true, [v.id]], 'the run is finished and knows what it made');
    eq(s.answers.s1, 'Wake by the sea.', 'answers kept');
    putBack();
  });

  await step('good-day: several sentences, no descriptions; a second Add cannot add twice; Undo removes them', async () => {
    await setup('Good day 2');
    start('good-day');
    for (let i = 0; i < 4; i++) next();
    type('[data-s5="0"][data-part="text"]', 'A');
    type('[data-s5="2"][data-part="text"]', 'B');
    next();
    assert(body().textContent.includes(t('disc.describeEach')), 'says to describe each');
    foot('add').click();
    eq(
      visions.list.map(v => [v.title, v.description]),
      [
        ['A', ''],
        ['B', ''],
      ],
      'two, without descriptions',
    );
    $('#toast button')?.click();
    eq(visions.list.length, 0, 'Undo removes them');
    openDiscovery();
    $(`#discBody [data-disc-open="${runs()[0].id}"]`).click();
    for (let i = 0; i < 5; i++) next();
    eq(foot('add').textContent, tp('disc.addVisions', 2), 'after Undo they can be added again');
    foot('add').click();
    openDiscovery();
    $(`#discBody [data-disc-open="${runs()[0].id}"]`).click();
    for (let i = 0; i < 5; i++) next();
    assert(!foot('add') && foot('finish'), 'made and still there: Finish only');
    dlg.close();
    putBack();
  });

  await step('what-for: the ladder, That is it, a goal in another plan gets the link; Undo takes it back', async () => {
    await setup('What for here');
    const here = currentPlan().id;
    fresh('What for there');
    const run = mk('goal', { title: 'Run 10 km' });
    save();
    const there = currentPlan().id;
    openPlan(here);
    mk('goal', { title: 'Paused one', status: 'paused' });
    save();
    start('what-for');
    const labels = $$('#discBody .disc-choice').map(l => l.textContent.trim());
    eq(labels[0], t('vis.goalInPlan', { goal: 'Run 10 km', plan: 'What for there' }), 'active first, with its plan');
    $(`#discBody input[value="${there}|${run.id}"]`).checked = true;
    next();
    assert(body().textContent.includes('“Run 10 km”. What is it for?'), 'asks about the goal');
    type('[data-ladder="0"]', 'To be fit');
    next();
    assert(body().textContent.includes(t('disc.ladderLead')), 'the lead from step 3 on');
    assert(body().textContent.includes('“To be fit”. And what is that for?'), 'asks about the answer');
    type('[data-ladder="1"]', 'Energy for my kids');
    foot('again').click();
    type('[data-ladder="2"]', 'Energy for my kids');
    next(); // That's it
    eq($('#discBody [data-vision="text"]').value, 'Energy for my kids', 'the last answer as the title');
    assert($('#discBody [data-serves]').checked, 'serves, ticked');
    foot('add').click();
    const v = visions.list.find(x => x.title === 'Energy for my kids');
    assert(v, 'added');
    eq(readPlan(there).goals[0].visions, [v.id], 'the goal in the other plan links it');
    eq(plans.current, here, 'the open plan stays');
    assert(!db.goals.some(g => g.visions), 'the open plan unchanged');
    $('#toast button').click();
    assert(!visions.list.length && !readPlan(there).goals[0].visions, 'Undo takes back both');
    putBack();
  });

  await step('what-for: an existing title links instead; at most five answers', async () => {
    await setup('What for link');
    const old = mkV('To Be Free');
    saveVisions();
    const g = mk('goal', { title: 'Save money' });
    save();
    start('what-for');
    next();
    type('[data-ladder="0"]', 'x');
    next();
    for (let i = 1; i < 4; i++) foot('again').click();
    assert(!foot('again'), 'no Ask again on the fifth');
    type('[data-ladder="4"]', 'to be free');
    next();
    eq(foot('add').textContent, t('disc.linkTo', { title: 'To Be Free' }), 'Link to');
    foot('add').click();
    eq(visions.list.length, 1, 'no duplicate');
    eq(g.visions, [old.id], 'linked');
    putBack();
  });

  await step('areas: ratings, step 2 for the low ones, pick, the vision form filled in; Areas shows the rating', async () => {
    await setup('Areas run');
    mkV('To be fit', [], { area: 'Health' });
    saveVisions();
    start('areas');
    const rows = $$('#discBody .disc-rate-name').map(x => x.textContent);
    eq(rows.slice(0, 2), ['Health', 'Finance'], 'in use first, then the suggestions');
    $('#discBody [data-rate="Health"][data-v="3"]').click();
    eq(document.activeElement.dataset.v, '3', 'focus stays on the pressed one');
    $('#discBody [data-rate="Career"][data-v="8"]').click();
    $('#discBody [data-rate="Career"][data-v="0"]').click();
    $('#discBody [data-rate="Home"][data-v="9"]').click();
    next();
    eq(
      $$('#discBody [data-better]').map(x => x.dataset.better),
      ['Health'],
      'only those rated 5 or lower',
    );
    type('[data-better="Health"]', 'Walk twice a week');
    next();
    eq(
      $$('#discBody input[name="disc-pick"]').map(x => x.value),
      ['Health', 'Home'],
      'only rated areas',
    );
    const pick = $('#discBody input[value="Health"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change', { bubbles: true }));
    next();
    assert(body().textContent.includes('Walk twice a week'), 'the line for the pick');
    foot('vision').click();
    assert(!dlg.open && $('#modal').open, 'the vision form');
    eq([$('#f-area').value, $('#f-description').value], ['Health', 'Walk twice a week'], 'filled in');
    $('#modal').close();
    eq(runs()[0].done, true, 'finished');
    eq(runs()[0].answers.ratings, { Health: 3, Home: 9 }, 'skip removes a rating');
    prefs.set('visionsMode', 'areas');
    setView('visions');
    const b = $$('#view .area-block').find(x => x.dataset.area === 'Health');
    assert(
      b.textContent.includes(t('disc.rated', { n: '3', date: fmtDay(today(), { day: 'numeric', month: 'short' }) })),
      'Rated on the block',
    );
    prefs.set('visionsMode', 'tree');
    putBack();
  });

  await step('areas: nothing low skips step 2; nothing rated ends at once', async () => {
    await setup('Areas none');
    start('areas');
    next();
    assert(body().textContent.includes(t('disc.nothingPicked')), 'ends at once');
    eq(runs().length, 0, 'nothing stored');
    dlg.close();
    start('areas');
    $('#discBody [data-rate="Health"][data-v="7"]').click();
    next();
    assert($('#discBody input[name="disc-pick"]'), 'straight to the pick');
    foot('back').click();
    assert($('#discBody .disc-rates'), 'Back returns to the ratings');
    dlg.close();
    putBack();
  });

  await step('reflections: close in the middle, continue there; edit an old answer; delete', async () => {
    await setup('Reflections');
    start('good-day');
    next();
    type('[data-a="s2"]', 'Half a thought');
    $('#discClose').click(); // Save and close
    await tick();
    eq(runs()[0].answers.s2, 'Half a thought', 'kept on close');
    openDiscovery();
    assert(body().textContent.includes(t('disc.unfinished')), 'listed as not finished');
    $(`#discBody [data-disc-open="${runs()[0].id}"]`).click();
    eq($('#discBody [data-a="s2"]').value, 'Half a thought', 'continues at the same step with the text');
    type('[data-a="s2"]', '<b>markup</b>');
    next();
    eq(runs()[0].answers.s2, '<b>markup</b>', 'saved as typed');
    foot('back').click();
    assert(!$('#discBody b'), 'markup shown as typed');
    dlg.close();
    openDiscovery();
    const id = runs()[0].id;
    $(`#discBody [data-disc-del="${id}"]`).click();
    eq(runs().length, 0, 'deleted');
    assert(!$(`#discBody [data-disc-open="${id}"]`), 'gone from the list');
    assert(journal.deleted[id], 'remembered, so a device that still has it loses it on sync');
    dlg.close();
    putBack();
  });

  await step('reflections: a finished one edited later does not change its visions', async () => {
    await setup('Edit later');
    start('good-day');
    for (let i = 0; i < 4; i++) next();
    type('[data-s5="0"][data-part="text"]', 'To be calm');
    next();
    foot('add').click();
    openDiscovery();
    $(`#discBody [data-disc-open="${runs()[0].id}"]`).click();
    assert(
      $('#discBody [data-a="s1"]'),
      `opens at the first step ${JSON.stringify(runs().map(s => [s.done, s.answers.step]))} ${body().innerHTML.slice(0, 300)}`,
    );
    for (let i = 0; i < 4; i++) next();
    type('[data-s5="0"][data-part="text"]', 'To be serene');
    next();
    dlg.close();
    eq(
      visions.list.map(v => v.title),
      ['To be calm'],
      'the vision as it was',
    );
    eq(runs()[0].answers.s5[0].text, 'To be serene', 'the answer changed');
    putBack();
  });

  await step('edge: an unknown exercise opens read-only; a deleted goal keeps its title; 4,000 characters', async () => {
    await setup('Edge');
    journal.sessions.push({
      id: uid(),
      exercise: 'values',
      date: today(),
      done: true,
      answers: { a: 'From the future' },
      made: [],
    });
    const g = mk('goal', { title: 'Learn piano' });
    save();
    openDiscovery();
    assert(body().textContent.includes(t('disc.reflection')), 'listed as Reflection');
    $(`#discBody [data-disc-open="${runs()[0].id}"]`).click();
    assert(body().textContent.includes('From the future') && $('#discFoot').hidden, 'read-only');
    openDiscovery();
    $('#discBody [data-disc-start="what-for"]').click();
    next();
    type('[data-ladder="0"]', 'x'.repeat(4100));
    eq($('#discBody [data-ladder="0"]').maxLength, 4000, 'the field holds 4,000');
    next();
    dlg.close();
    db.goals = db.goals.filter(x => x !== g);
    save();
    openDiscovery();
    const run = runs().find(s => s.exercise === 'what-for');
    $(`#discBody [data-disc-open="${run.id}"]`).click();
    foot('back').click();
    assert(body().textContent.includes('“Learn piano”'), 'the title as it was');
    dlg.close();
    putBack();
  });

  await step('edge: goals of a sample plan are not offered', async () => {
    await setup('Edge demo');
    mk('goal', { title: 'Sample goal' });
    currentPlan().demo = true;
    save();
    openDiscovery();
    assert($('#discBody [data-disc-start="what-for"]').disabled, 'no goals of its own');
    dlg.close();
    delete currentPlan().demo;
    putBack();
  });

  await step('guidance: the Guide, Getting started and the tip lead here', async () => {
    await setup('Guidance');
    GUIDE_DO['find-visions']();
    assert(dlg.open, 'Guide action');
    dlg.close();
    walkAction('find');
    assert(dlg.open, 'Getting started link');
    dlg.close();
    putBack();
  });
});
