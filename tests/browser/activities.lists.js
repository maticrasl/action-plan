/** Page tests: activities.lists. */
suite(async () => {
  await step('lists: items to tick off; all ticked means done', async () => {
    fresh('Lists');
    const g = mk('goal', { title: 'Race', progress: 'activities' });
    save();
    setView('activities');
    openForm('activity', null, { contributes: [g.id] });
    const btns = () => [...modal.querySelectorAll('[data-act-kind]')];
    eq(
      btns()
        .map(b => b.dataset.actKind)
        .join(),
      'once,list,routine,listRoutine',
      'four kinds offered',
    );
    btns()[1].click();
    assert(
      $('#listRows') && $('#f-repeat').value === 'none' && !$('#f-status'),
      'list: items, no status, does not repeat',
    );
    assert(
      !$('#listRows').classList.contains('no-ticks') && !modal.querySelector('[data-field="dueDate"]').hidden,
      'list: ticks and due date shown',
    );
    eq($('#listRows').children.length, 1, 'one empty item to start');
    $('#f-title').value = 'Pack';
    $('#f-startDate').value = dateInput(addDays(today(), 1));
    $('#f-dueDate').value = dateInput(addDays(today(), 5));
    submitForm();
    assert(
      modal.open && modal.querySelector('[data-field="list"]').classList.contains('invalid'),
      'an empty list is not saved',
    );
    eq(db.activities.length, 0, 'nothing saved yet');
    const input = i => $('#listRows').children[i].querySelector('.li-input');
    input(0).value = 'Shoes';
    input(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert(
      modal.open && $('#listRows').children.length === 2 && document.activeElement === input(1),
      'Enter adds the next item and focuses it',
    );
    assert(
      [...$('#listRows').querySelectorAll('.li-input')].every(i => i.getAttribute('enterkeyhint') === 'enter'),
      'a phone keyboard shows Enter, not Next, on items',
    );
    input(1).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }),
    );
    eq($('#listRows').children.length, 2, 'Enter that finishes typing in an input method adds nothing');
    input(1).value = 'Gels';
    modal.querySelector('[data-li-add]').click();
    input(2).value = 'Watch';
    modal.querySelector('[data-li-add]').click();
    eq($('#listRows').children.length, 4, 'Add item adds a row');
    $('#listRows').children[1].querySelector('[data-li-del]').click();
    eq(
      [...$('#listRows').querySelectorAll('.li-input')].map(i => i.value),
      ['Shoes', 'Watch', ''],
      'remove drops the row',
    );
    submitForm();
    const a = db.activities.find(x => x.title === 'Pack');
    assert(a && isList(a) && !isRoutine(a), 'saved as a list');
    eq(
      a.list.map(i => i.text),
      ['Shoes', 'Watch'],
      'empty rows left out',
    );
    assert(
      a.list.every(i => safeId(i.id) && !i.done),
      'items have ids, none done',
    );
    eq(a.status, 'todo', 'starts to do (its start is tomorrow)');
    eq(
      relsFrom(a.id, 'contributes').map(r => r.to),
      [g.id],
      'linked to the goal',
    );
    // On the card: tick one, then the other.
    render();
    // Items by their place in the list (ticked ones are shown last).
    const tick = i => document.querySelector(`.card.activity [data-li-tick="${a.id}"][data-li="${a.list[i].id}"]`);
    assert(tick(0) && tick(0).getAttribute('aria-checked') === 'false', 'items on the card');
    assert(
      document
        .querySelector(`.card.activity[data-open="${a.id}"]`)
        .textContent.includes(t('list.done', { done: 0, total: 2 })),
      'card shows 0/2 done',
    );
    tick(0).click();
    assert(!modal.open, 'ticking does not open the form');
    assert(a.list[0].done && a.status === 'doing', 'one ticked: in progress');
    eq(goalProgress(g), 0, 'goal not done yet');
    tick(1).click();
    eq(a.status, 'done', 'all ticked: done');
    eq(goalProgress(g), 100, 'goal counts it done');
    eq($('#toast').textContent, t('list.complete', { name: 'Pack' }), 'says it is done');
    tick(1).click();
    eq(a.status, 'doing', 'unticking one: back in progress');
    // The form keeps ids and ticks; ticking all there completes it too.
    const ids = a.list.map(i => i.id);
    openForm('activity', a.id);
    assert(!btns().length && $('#listRows').children.length === 2, 'editing opens the list');
    eq(
      [...$('#listRows').children].map(r => r.dataset.liRow),
      [ids[1], ids[0]],
      'the form lists the ticked item last',
    );
    assert(
      !$('#listRows').children[0].querySelector('.li-check').checked &&
        $('#listRows').children[1].querySelector('.li-check').checked,
      'ticks shown in the form',
    );
    $('#listRows').children[0].querySelector('.li-check').checked = true;
    input(0).value = 'GPS watch';
    submitForm();
    eq(a.list.map(i => i.id).sort(), [...ids].sort(), 'ids kept');
    eq(a.list.find(i => i.id === ids[1]).text, 'GPS watch', 'renamed');
    eq(a.status, 'done', 'all ticked in the form: done');
    // Blocked lists still finish, with the usual warning.
    const pre = mk('activity', { title: 'Register', status: 'todo' });
    rel(a, pre, 'depends');
    a.list[0].done = false;
    a.status = 'doing';
    save();
    render();
    tick(0).click();
    eq($('#toast').textContent, t('acts.notDone', { name: 'Register' }), 'warns about what it waits for');
    // On the overview row: a count.
    assert(activityRow(a).includes('>2/2<'), 'row shows the count');
    // Import: bad items dropped, bad lists removed.
    const d = normalize({
      activities: [
        { id: 'x1', title: 'L', list: [{ id: 'ok', text: 'a' }, { id: '<b>', text: 'x' }, { id: 'n', text: 3 }, null] },
        { id: 'x2', title: 'M', list: 'nope' },
      ],
    });
    eq(
      d.activities[0].list.map(i => i.id),
      ['ok'],
      'unsafe items dropped',
    );
    assert(!('list' in d.activities[1]), 'a list that is not an array is dropped');
    // Resetting progress unticks every item.
    const r = resetProgress(db);
    assert(
      r.activities.find(x => x.id === a.id).list.every(i => !i.done),
      'reset unticks items',
    );
    // Wording in Slovenian.
    changeLanguage('sl');
    openForm('activity');
    eq(btns()[1].querySelector('strong').textContent, I18N.sl.strings['f.actKind.list'], 'Slovenian kind');
    btns()[1].click();
    eq(
      modal.querySelector('[data-li-add]').textContent.trim(),
      '+ ' + I18N.sl.strings['list.add'],
      'Slovenian add button',
    );
    modal.close();
    changeLanguage('en');
  });
  await step('lists: ticks and edits stamp only the items they change', async () => {
    fresh('List times');
    const a = mk('activity', {
      title: 'Pack',
      status: 'todo',
      startDate: addDays(today(), 1),
      dueDate: addDays(today(), 4),
      list: [
        { id: 'p', text: 'Pins', done: false, at: '2000-01-01' },
        { id: 'q', text: 'Cap', done: false, at: '2000-01-01' },
        { id: 'r', text: 'Bib', done: false, at: '2000-01-01' },
      ],
    });
    save();
    setView('activities');
    document.querySelector(`[data-li-tick="${a.id}"][data-li="p"]`).click();
    assert(a.list[0].at > '2000-01-01' && a.list[1].at === '2000-01-01', 'a tick stamps that item only');
    openForm('activity', a.id);
    const rows = () => $('#listRows').children,
      row = id => $(`#listRows [data-li-row="${id}"]`);
    row('q').querySelector('.li-input').value = 'Cap and gloves';
    row('r').querySelector('[data-li-del]').click();
    modal.querySelector('[data-li-add]').click();
    eq(rows()[1].dataset.liRow, '', 'a new item goes above the ticked ones');
    rows()[1].querySelector('.li-input').value = 'Socks';
    submitForm();
    eq(
      a.list.map(i => i.text),
      ['Cap and gloves', 'Socks', 'Pins'],
      'saved in the order shown, ticked last',
    );
    const by = text => a.list.find(i => i.text === text);
    assert(
      by('Cap and gloves').at > '2000-01-01' && by('Socks').at && safeId(by('Socks').id),
      'renamed and new items stamped',
    );
    eq(a.droppedItems, { r: 1 }, 'removed item remembered');
    const pinsAt = by('Pins').at;
    openForm('activity', a.id);
    submitForm();
    eq(by('Pins').at, pinsAt, 'saving unchanged keeps the times');
    const r = resetProgress(db).activities.find(x => x.id === a.id);
    assert(r.list.every(i => !i.done && !i.at) && !r.droppedItems, 'reset clears ticks, times and removals');
    assert(
      !('droppedItems' in normalize({ activities: [{ id: 'z', title: 'Z', droppedItems: { x: 1 } }] }).activities[0]),
      'removals without a list dropped on import',
    );
  });
  await step('lists: ticked items move below the rest, on the card and in the form', () => {
    fresh('Done last');
    const a = mk('activity', {
      title: 'Pack',
      status: 'todo',
      startDate: today(),
      dueDate: addDays(today(), 4),
      list: ['a', 'b', 'c', 'd'].map(id => ({ id, text: id.toUpperCase(), done: false })),
    });
    save();
    setView('activities');
    const shown = () =>
      [...document.querySelectorAll(`.card.activity [data-li-tick="${a.id}"]`)].map(b => b.dataset.li);
    const tick = id => document.querySelector(`[data-li-tick="${a.id}"][data-li="${id}"]`);
    eq(shown(), ['a', 'b', 'c', 'd'], 'in order at first');
    tick('b').click();
    eq(shown(), ['a', 'c', 'd', 'b'], 'ticked one goes to the bottom');
    eq(document.activeElement, tick('b'), 'focus follows the item');
    tick('a').click();
    eq(shown(), ['c', 'd', 'a', 'b'], 'ticked ones keep their own order at the bottom');
    tick('b').click();
    eq(shown(), ['b', 'c', 'd', 'a'], 'unticked goes back to its place among the rest');
    eq(
      a.list.map(i => i.id),
      ['a', 'b', 'c', 'd'],
      'the stored order is unchanged by ticks',
    );
    // In the form: the ticked rows are last; ticking one there moves it down, unticking moves it back up.
    openForm('activity', a.id);
    const rows = () => [...$('#listRows').children].map(r => r.dataset.liRow);
    eq(rows(), ['b', 'c', 'd', 'a'], 'form: ticked last');
    const check = id => $(`#listRows [data-li-row="${id}"] .li-check`);
    check('c').click();
    eq(rows(), ['b', 'd', 'a', 'c'], 'form: ticking moves the row down');
    eq(document.activeElement, check('c'), 'form: focus stays on the tick');
    check('a').click();
    eq(rows(), ['a', 'b', 'd', 'c'], 'form: unticking moves it above the ticked ones');
    modal.querySelector('[data-li-add]').click();
    eq(rows().length, 5, 'added');
    eq(rows()[3], '', 'form: a new item goes above the ticked ones');
    eq(
      document.activeElement,
      $('#listRows').children[3].querySelector('.li-input'),
      'form: Add item puts the cursor in it',
    );
    $('#listRows').children[3].querySelector('.li-input').value = 'E';
    submitForm();
    eq(
      a.list.map(i => i.text),
      ['A', 'B', 'D', 'E', 'C'],
      'saved in the order shown',
    );
    eq(
      a.list.map(i => !!i.done),
      [false, false, false, false, true],
      'ticks saved',
    );
    // A routine list does the same with today's ticks.
    const r = mk('activity', {
      title: 'Morning',
      startDate: addDays(today(), -3),
      dueDate: addDays(today(), 20),
      repeat: { every: 1, unit: 'week', times: 3 },
      checkins: {},
      list: ['x', 'y', 'z'].map(id => ({ id, text: id, done: false })),
    });
    save();
    render();
    const rshown = () => [...document.querySelectorAll(`.rt-items [data-li-tick="${r.id}"]`)].map(b => b.dataset.li);
    tickListItem(r.id, 'x', today());
    eq(rshown(), ['y', 'z', 'x'], 'routine list: today’s ticked item last');
    tickListItem(r.id, 'x', today());
    eq(rshown(), ['x', 'y', 'z'], 'routine list: unticked, back in place');
    deletePlan(plans.current);
  });
  await step('lists: around the app', async () => {
    fresh('Lists around');
    const g = mk('goal', {
      title: 'Race day',
      progress: 'activities',
      startDate: today(),
      deadline: addDays(today(), 20),
    });
    const evil = '<img src=x onerror="window.__xss=1">';
    const a = mk('activity', {
      title: 'Pack',
      status: 'todo',
      startDate: addDays(today(), 1),
      dueDate: addDays(today(), 4),
      list: [
        { id: 'p', text: 'Pins' },
        { id: 'q', text: evil },
        { id: 'r', text: 'Saltsticks' + 'x'.repeat(80) },
      ],
    });
    rel(a, g, 'contributes');
    save();
    // Every view draws it, without errors.
    const before = __errors.length;
    for (const v of ['dashboard', 'goals', 'activities', 'states', 'map', 'timeline', 'graphs']) {
      setView(v);
      render();
    }
    eq(__errors.length, before, 'no errors in any view');
    setView('activities');
    // Item text is shown as text.
    assert(!window.__xss && !document.querySelector('.li-ticks img'), 'card: markup in an item is not run');
    assert(
      [...document.querySelectorAll('.li-text')].some(e => e.textContent === evil),
      'card: shown as typed',
    );
    openForm('activity', a.id);
    eq($('#listRows').children[1].querySelector('.li-input').value, evil, 'form: shown as typed');
    assert(!modal.querySelector('.li-rows img'), 'form: markup not run');
    modal.close();
    assert(!activityRow(a).includes('<img'), 'row: nothing unescaped');
    // Search finds a list by its items.
    ui.search = 'saltstick';
    render();
    assert(document.querySelector(`.card.activity[data-open="${a.id}"]`), 'search matches an item');
    ui.search = 'nothing like it';
    render();
    assert(!document.querySelector(`.card.activity[data-open="${a.id}"]`), 'search hides it otherwise');
    ui.search = '';
    render();
    // The keyboard stays on the item ticked, even as the card moves column.
    const tick = id => document.querySelector(`[data-li-tick="${a.id}"][data-li="${id}"]`);
    tick('p').focus();
    tick('p').click();
    eq(document.activeElement, tick('p'), 'focus kept on the ticked item');
    assert(tick('p').closest('.col[data-status="doing"]'), 'card moved to In progress');
    eq(tick('p').getAttribute('aria-checked'), 'true', 'checked state announced');
    // Help mode explains the items.
    setHelp(true);
    const dot = document.querySelector('[data-help-tip="list"]');
    assert(dot && dot.nextElementSibling?.matches('.li-ticks'), 'help dot before the items');
    dot.click();
    eq(
      document.querySelector('.help-pop, .help-tip, [role="tooltip"]')?.textContent,
      t('help.tip.list'),
      'help text shown',
    );
    setHelp(false);
    // Done lists hide with "Hide done"; the circle still moves a list by hand.
    tick('q').click();
    tick('r').click();
    eq(a.status, 'done', 'all ticked: done');
    eq(goalProgress(g), 100, 'goal progress counts it');
    ui.hideDone = true;
    render();
    assert(!document.querySelector(`.card.activity[data-open="${a.id}"]`), 'hidden with Hide done');
    ui.hideDone = false;
    render();
    cycleStatus(a.id);
    eq(a.status, 'todo', 'the circle moves it on by hand');
    tick('p').click();
    assert(
      !a.list[0].done && a.status === 'doing',
      'unticking one of three on a list moved back to To do: the two ticked put it in progress',
    );
    tick('p').click();
    eq(a.status, 'done', 'ticking the last one completes it again');
    // Whitespace items are left out; a list of only whitespace is not saved.
    openForm('activity', a.id);
    [...$('#listRows').querySelectorAll('.li-input')].forEach(i => (i.value = '   '));
    submitForm();
    assert(
      modal.open && modal.querySelector('[data-field="list"].invalid') && a.list.length === 3,
      'whitespace-only list refused, nothing changed',
    );
    eq(modal.querySelector('[data-field="list"] .err').textContent, t('err.listEmpty'), 'says why');
    // Title is still required first.
    $('#f-title').value = ' ';
    submitForm();
    assert(modal.querySelector('[data-field="title"].invalid'), 'empty title refused');
    modal.close();
    // Removing every row leaves one empty row to type in; Enter in the middle adds right below.
    openForm('activity', a.id);
    const rows = () => [...$('#listRows').children];
    // Removing a row moves focus to the next row's remove button – never into its text, which would
    // open the keyboard on a phone.
    const second = rows()[1];
    rows()[0].querySelector('[data-li-del]').click();
    assert(
      document.activeElement === second.querySelector('[data-li-del]') && !document.activeElement.matches('input'),
      'next row’s remove button focused, not its text',
    );
    rows().at(-1).querySelector('[data-li-del]').click();
    assert(
      document.activeElement === rows().at(-1).querySelector('[data-li-del]'),
      'removing the last row focuses the one above',
    );
    while (rows().length > 1) rows()[0].querySelector('[data-li-del]').click();
    rows()[0].querySelector('[data-li-del]').click();
    assert(
      rows().length === 1 &&
        rows()[0].querySelector('.li-input').value === '' &&
        document.activeElement === modal.querySelector('[data-li-add]'),
      'last row removed: a fresh empty one, Add item focused, no text field',
    );
    modal.close();
    openForm('activity', a.id);
    rows()[0]
      .querySelector('.li-input')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    rows()[1].querySelector('.li-input').value = 'Between';
    submitForm();
    eq(
      a.list.map(i => i.text.slice(0, 10)),
      ['Pins', 'Between', evil.slice(0, 10), 'Saltsticks'],
      'Enter adds below the item',
    );
    eq(a.status, 'doing', 'an unticked item added: back in progress');
    // Saving the form keeps a status set by hand when the ticks do not decide it.
    a.list.forEach(i => (i.done = false));
    a.status = 'doing';
    save();
    openForm('activity', a.id);
    $('#f-description').value = 'Bag by the door';
    submitForm();
    assert(a.status === 'doing' && a.description === 'Bag by the door', 'status kept on save');
    // Export and import keep the list as it is.
    const back = normalize(JSON.parse(JSON.stringify(db))).activities.find(x => x.id === a.id);
    eq(back.list, a.list, 'list survives a round trip');
    // Deleting the list removes it and its links.
    openForm('activity', a.id);
    $('#deleteBtn').click();
    assert(
      !db.activities.some(x => x.id === a.id) && !db.relations.some(r => r.from === a.id),
      'deleted with its links',
    );
  });
  await step('lists: two devices, through the real save path', () => {
    fresh('Two devices');
    const a = mk('activity', {
      title: 'Pack',
      status: 'todo',
      startDate: addDays(today(), 1),
      dueDate: addDays(today(), 4),
      list: [
        { id: 'p', text: 'Pins' },
        { id: 'q', text: 'Cap' },
        { id: 'r', text: 'Bib' },
      ],
    });
    save();
    const other = JSON.parse(JSON.stringify(db));
    // This device: ticks Pins on the card, removes Bib in the form.
    setView('activities');
    document.querySelector(`[data-li-tick="${a.id}"][data-li="p"]`).click();
    openForm('activity', a.id);
    $('#listRows [data-li-row="r"] [data-li-del]').click();
    submitForm();
    // The other device, offline: ticks Cap and adds Gels, a little later.
    const later = new Date(Date.now() + 60000).toISOString();
    const o = other.activities[0];
    o.list[1] = { ...o.list[1], done: true, at: later };
    o.list.push({ id: 'n', text: 'Gels', done: false, at: later });
    o.updatedAt = later;
    const m = mergePlans(db, other).activities.find(x => x.id === a.id);
    eq(
      m.list.map(i => `${i.text}:${i.done ? 'x' : '-'}`).sort(),
      ['Cap:x', 'Gels:-', 'Pins:x'],
      'both ticks kept, Bib stays removed, Gels added',
    );
    eq(m.status, 'doing', 'in progress');
    // Ticking Gels on the merged copy finishes it.
    const m2 = mergePlans(
      { ...emptyDb(), activities: [m] },
      {
        ...emptyDb(),
        activities: [
          {
            ...m,
            updatedAt: new Date(Date.now() + 120000).toISOString(),
            list: m.list.map(i =>
              i.id === 'n' ? { ...i, done: true, at: new Date(Date.now() + 120000).toISOString() } : i,
            ),
          },
        ],
      },
    ).activities[0];
    eq(m2.status, 'done', 'done once the merged list is all ticked');
  });
  await step('lists: a card with long items fits a phone', async () => {
    const a = {
      id: 'ph',
      title: 'Pack',
      status: 'doing',
      dueDate: addDays(today(), 3),
      list: [
        { id: 'a', text: 'Short', done: true },
        { id: 'b', text: 'A'.repeat(120) },
        { id: 'c', text: 'A rather long item that has to wrap over a few lines on a phone screen' },
      ],
    };
    db.activities.push(a);
    const frame = document.createElement('iframe');
    Object.assign(frame.style, {
      width: '390px',
      height: '700px',
      position: 'fixed',
      left: '-9999px',
      top: '0',
      border: '0',
    });
    frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body style="margin:0;padding:0 16px">${activityCard(a)}</body>`;
    await new Promise(res => {
      frame.onload = res;
      document.body.append(frame);
    });
    const doc = frame.contentDocument,
      card = doc.querySelector('.card').getBoundingClientRect();
    const items = [...doc.querySelectorAll('.li-tick')].map(b => b.getBoundingClientRect());
    assert(
      items.length === 3 && items.every(r => r.left >= card.left && r.right <= card.right + 0.5),
      'items inside the card',
    );
    assert(doc.documentElement.scrollWidth <= 390, `no sideways scroll (${doc.documentElement.scrollWidth})`);
    // Shown as b, c, then the ticked a.
    assert(items[0].height > items[2].height * 2, 'a long item wraps');
    eq(
      [...doc.querySelectorAll('.li-tick')].map(b => b.dataset.li),
      ['b', 'c', 'a'],
      'the ticked item last',
    );
    frame.remove();
    db.activities = db.activities.filter(x => x.id !== 'ph');
  });
});
