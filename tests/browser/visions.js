/** Page tests: visions through sync, the visions view, the forms, and phones. */
suite(async () => {
  await step('visions: sync merges them like plans, repairs loops, keeps the Purpose found first', () => {
    // The merging itself is tested in src/core/visions.test.ts.
    // Stores: a file without visions, this device's store, merge and apply.
    clearVisions();
    const A = mkV('Shared');
    saveVisions();
    const local = localStore();
    eq(
      local.visions.list.map(x => x.title),
      ['Shared'],
      'this device sends its visions',
    );
    const old = parseStore(
      JSON.stringify({ format: SYNC_FORMAT, version: 1, plans: { list: [], deleted: {} }, data: {} }),
    );
    eq(old.visions, { list: [], deleted: {} }, 'an older file has none');
    const merged = mergeStores(local, old);
    eq(
      merged.visions.list.map(x => x.id),
      [A.id],
      'merged with a file without visions: kept',
    );
    eq(toFile(merged).visions.list.length, 1, 'written to the file');
    merged.visions.list.push({
      id: 'remote',
      title: 'From the other device',
      parents: [A.id],
      updatedAt: new Date().toISOString(),
    });
    applyStore(merged);
    assert(
      findVision('remote') && JSON.parse(localStorage.getItem(VISIONS_KEY)).list.length === 2,
      'applied and stored',
    );
    applyStore({ plans: merged.plans, data: merged.data });
    assert(findVision('remote'), 'a store without visions leaves them alone');
    clearVisions();
  });
  await step('visions: the view – empty, cards in tree order, status toward a Purpose, both languages', () => {
    clearVisions();
    fresh('Vision view');
    setView('visions');
    assert(
      $('#view .empty [data-new="vision"]') && $('#view').textContent.includes(t('vis.shared')),
      'empty: explains and offers to add one',
    );
    eq($('#addBtn').getAttribute('aria-label'), t('add.vision'), 'the add button adds a vision');
    assert(!$('#view [data-sample], #view [data-templates]'), 'no sample or templates offered for visions');
    const A = mkV('Zeta life'),
      B = mkV('Alpha under Zeta', [A]),
      D = mkV('Beta top'),
      C = mkV('Child of two', [B, D]);
    const g = mk('goal', { title: 'Serving goal', visions: [B.id] }),
      u = mk('goal', { title: 'Lonely goal' });
    save();
    saveVisions();
    render();
    const cards = [...document.querySelectorAll('#view .card.vision')];
    eq(
      cards.map(c => c.querySelector('h3').textContent),
      ['Beta top', 'Zeta life', 'Alpha under Zeta', 'Child of two'],
      'roots by title, each child under its first parent',
    );
    eq(
      cards.map(c => c.style.getPropertyValue('--level')),
      ['0', '0', '1', '2'],
      'indented by level',
    );
    const childCard = cards[3];
    assert(
      childCard.textContent.includes(t('vis.alsoUnder')) && childCard.querySelector(`.tag.vision[data-open="${D.id}"]`),
      'a second parent is named',
    );
    assert(cards[2].querySelector(`.tag.goal[data-open="${g.id}"]`), 'goals serving it are listed');
    assert(
      cards[1].classList.contains('reached') &&
        cards[2].classList.contains('reached') &&
        !cards[0].classList.contains('reached'),
      'reached visions are brighter',
    );
    const status = $('#view .vis-status').textContent;
    assert(
      status.includes(tp('vis.manyRoots', 2, { names: '“Zeta life”, “Beta top”' })),
      `status names the visions at the top: ${status}`,
    );
    assert(status.includes('Lonely goal'), 'and the goals serving none');
    // A goal from another plan is listed with its plan's name.
    const here = plans.current;
    fresh('Other plan');
    mk('goal', { title: 'Far goal', visions: [A.id] });
    save();
    openPlan(here);
    setView('visions');
    assert(
      $('#view .tag.other-plan').textContent.includes('Far goal') &&
        $('#view .tag.other-plan').textContent.includes('Other plan'),
      "other plans' goals show their plan",
    );
    assert(
      $('#view .vis-status').textContent.includes(t('vis.goalInPlan', { goal: 'Lonely goal', plan: 'Vision view' })),
      'with several plans, unlinked goals name their plan',
    );
    deletePlan(plans.list.find(p => p.name === 'Other plan').id);
    openPlan(here);
    setView('visions');
    // Escaping.
    mkV('<img src=x onerror=alert(1)>');
    saveVisions();
    render();
    assert(!$('#view img') && $('#view').textContent.includes('<img'), 'titles are escaped');
    visions.list.pop();
    saveVisions();
    // Help mode: no tutorial text for visions, and no raw key either.
    setHelp(true);
    assert(
      !$('#view .help-banner') && !$('#view').textContent.includes('help.view'),
      'help mode: no banner, no raw key',
    );
    setHelp(false);
    // Slovenian.
    changeLanguage('sl');
    setView('visions');
    assert(
      $('#viewTitle').textContent === 'Vizije' && $('#view').textContent.includes('Vizije so skupne'),
      'Slovenian',
    );
    changeLanguage('en');
    render();
    deletePlan(plans.current);
    clearVisions();
  });
  await step('visions: forms – add, edit, loop-free parents, goals both ways, delete', () => {
    clearVisions();
    fresh('Vision forms');
    setView('visions');
    const g = mk('goal', { title: 'Goal one' }),
      g2 = mk('goal', { title: 'Goal two' });
    save();
    $('#view [data-new="vision"]').click();
    assert(modal.open && $('#modalTitle').textContent === t('new.vision'), 'the form opens');
    submitForm();
    assert(modal.querySelector('[data-field="title"].invalid'), 'a title is required');
    $('#f-title').value = '  To be fit  ';
    $('#f-description').value = 'Strong and rested';
    submitForm();
    assert(!modal.open && visions.list.length === 1, 'added');
    const A = visions.list[0];
    eq([A.title, A.description, A.parents], ['To be fit', 'Strong and rested', []], 'trimmed');
    assert($('#toast').textContent.includes(t('toast.visionAdded')), 'toast');
    // A narrower one from the card's menu, with its parent picked.
    openCtxMenu(A.id, 10, 10);
    const acts = [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx);
    assert(
      acts.includes('edit') &&
        acts.includes('add:vision:parents') &&
        acts.includes('show:map') &&
        acts.includes('delete') &&
        !acts.includes('link') &&
        !acts.includes('show:visions'),
      `menu: ${acts}`,
    );
    runCtxAction('add:vision:parents', A.id);
    assert(modal.querySelector(`[data-picker="vision"] [data-picked-id="${A.id}"]`), 'the broader vision is picked');
    $('#f-title').value = 'Run';
    // Goals in this plan, picked in the form.
    pickItem(modal.querySelector(`[data-name="goals"] .pick-opt[data-pick="${g.id}"]`));
    submitForm();
    const B = visions.list.find(v => v.title === 'Run');
    eq(B.parents, [A.id], 'saved under it');
    eq(g.visions, [B.id], 'the goal serves it');
    // Editing the broader one offers no vision below it.
    openForm('vision', A.id);
    const offered = [...modal.querySelectorAll('[data-name="parents"] .pick-opt')].map(o => o.dataset.pick);
    eq(offered, [], 'neither itself nor the one below it');
    modal.close();
    openForm('vision', B.id);
    eq(
      [...modal.querySelectorAll('[data-name="parents"] .pick-opt')].map(o => o.dataset.pick),
      [A.id],
      'the narrower one can go under the broader',
    );
    // Unpicking the goal takes the link away.
    unpickItem(modal.querySelector('[data-name="goals"]'), g.id);
    submitForm();
    assert(!('visions' in g), 'no visions left: no field');
    // The goal form links goals to visions, and drops ids of visions that are gone.
    g2.visions = ['ghost', A.id];
    save();
    openForm('goal', g2.id);
    const picker = modal.querySelector('[data-picker="vision"][data-name="visions"]');
    assert(
      picker && [...picker.querySelectorAll('[data-picked-id]')].map(x => x.dataset.pickedId).join() === A.id,
      'the goal form shows the visions it serves',
    );
    pickItem(picker.querySelector(`.pick-opt[data-pick="${B.id}"]`));
    Object.entries({
      specific: 'A specific outcome that is long enough',
      metric: 'Runs',
      unit: 'x',
      baseline: '0',
      target: '10',
      achievable: 'Yes it is doable',
      relevant: 'Matters a lot to me',
      deadline: '01/01/2099',
    }).forEach(([k, val]) => {
      const el = $('#f-' + k);
      if (el) el.value = val;
    });
    submitForm();
    assert(!modal.open, 'goal saved: ' + [...modal.querySelectorAll('.field.invalid')].map(f => f.dataset.field));
    eq(g2.visions, [A.id, B.id], 'serves both; the one that is gone is dropped');
    // Without any visions, the goal form has no such field.
    const kept = visions;
    visions = { list: [], deleted: {} };
    openForm('goal', g.id);
    assert(!modal.querySelector('[data-name="visions"]'), 'no visions: no field');
    modal.close();
    visions = kept;
    // Delete from the form: a narrower one lets go, goals keep a dangling id that is ignored.
    openForm('vision', A.id);
    $('#deleteBtn').click();
    assert(!findVision(A.id) && visions.deleted[A.id], 'deleted');
    eq(findVision(B.id).parents, [], 'the narrower vision lets go of it');
    eq(ownVisions(g2), [B.id], 'the goal keeps only what is there');
    assert($('#toast').textContent.includes(t('toast.deleted.vision')), 'toast');
    // Clicking a card opens it; the menu's delete asks and deletes.
    setView('visions');
    $(`#view .card.vision[data-open="${B.id}"]`).click();
    assert(modal.open && $('#modalTitle').textContent === t('edit.vision'), 'a card opens its form');
    modal.close();
    runCtxAction('delete', B.id);
    assert(!visions.list.length, 'deleted from the menu');
    deletePlan(plans.current);
    clearVisions();
  });
  await step('visions: phone – cards fit 390 px, the deepest level too', async () => {
    clearVisions();
    fresh('Phone visions');
    const A = mkV('A long vision title that goes on and on and on'),
      B = mkV('Narrower', [A]),
      C = mkV('Narrowest of them all', [B]),
      D = mkV('Deeper still', [C]);
    mk('goal', { title: 'G', visions: [D.id] });
    save();
    saveVisions();
    setView('visions');
    const frame = document.createElement('iframe');
    Object.assign(frame.style, {
      width: '390px',
      height: '900px',
      position: 'fixed',
      left: '-9999px',
      top: '0',
      border: '0',
    });
    frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body style="margin:0;padding:0 16px">${$('#view').innerHTML}</body>`;
    await new Promise(res => {
      frame.onload = res;
      document.body.append(frame);
    });
    const doc = frame.contentDocument,
      cards = [...doc.querySelectorAll('.card.vision')];
    eq(cards.length, 4, 'all four drawn');
    assert(
      cards.every(c => c.getBoundingClientRect().right <= 390 - 16 + 0.5 && c.getBoundingClientRect().width > 200),
      `inside the screen, still wide enough: ${cards.map(c => Math.round(c.getBoundingClientRect().width))}`,
    );
    assert(
      cards[3].getBoundingClientRect().left > cards[0].getBoundingClientRect().left,
      'deeper visions are indented',
    );
    assert(doc.documentElement.scrollWidth <= 390, `no sideways scroll: ${doc.documentElement.scrollWidth}`);
    frame.remove();
    deletePlan(plans.current);
    clearVisions();
  });
});
