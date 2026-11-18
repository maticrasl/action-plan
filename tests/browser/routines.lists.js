/** Page tests: routines with a list: ticking items each day, a week met, editing, escaping, Slovenian. */
suite(async () => {
  await step('routine lists: made from the choice, items ticked each day, the day follows them', async () => {
    fresh('Routine lists');
    const now = today();
    save();
    setView('activities');
    openForm('activity');
    const btns = () => [...modal.querySelectorAll('[data-act-kind]')];
    btns()
      .find(b => b.dataset.actKind === 'listRoutine')
      .click();
    assert($('#listRows') && $('#f-repeat').value === 'week' && !$('#f-status'), 'items and a repeat, no status');
    assert(
      $('#listRows').classList.contains('no-ticks') && getComputedStyle($('#listRows .li-check')).display === 'none',
      'no ticks in the form',
    );
    assert(
      modal.querySelector('[data-field="dueDate"]').hidden && !$('#repeatEnds').hidden,
      'ends instead of a due date',
    );
    eq($('#f-title').placeholder, t('f.listPh'), 'list placeholder');
    $('#f-title').value = 'Morning';
    $('#f-endDate').value = dateInput(addDays(now, 30));
    submitForm();
    assert(
      modal.open && modal.querySelector('[data-field="list"].invalid') && !db.activities.length,
      'an empty list is refused',
    );
    $('#listRows .li-input').value = 'Stretch';
    $('#listRows .li-input').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    $('#listRows').children[1].querySelector('.li-input').value = 'Water';
    // A hidden tick left checked is not saved: a routine list's items are ticked per day.
    $('#listRows .li-check').checked = true;
    submitForm();
    const a = db.activities.find(x => x.title === 'Morning');
    assert(a && isListRoutine(a) && !isList(a) && isRoutine(a), 'saved as a routine list');
    eq(
      a.list.map(i => [i.text, i.done]),
      [
        ['Stretch', false],
        ['Water', false],
      ],
      'items saved, none done',
    );
    assert(a.repeat.times === 3 && a.status === 'todo' && !a.listDays, 'three times a week, nothing ticked');
    render();
    const card = () => $(`.card.routine[data-open="${a.id}"]`);
    const item = i => card().querySelector(`.rt-items [data-li-tick][data-li="${a.list[i].id}"]`);
    eq(card().querySelectorAll('.rt-items [data-li-tick]').length, 2, 'today’s items on the card');
    eq(
      card().querySelector('.rt-items .label').textContent,
      t('list.today', { done: 0, total: 2 }),
      'counted for today',
    );
    eq(item(0).dataset.date, now, 'items are today’s');
    item(0).focus();
    item(0).click();
    assert(itemOn(a, now, a.list[0].id) && !checkedOn(a, now) && !modal.open, 'one item: ticked, the day not yet');
    eq(
      [...card().querySelectorAll('.li-pips i')].map(i => i.classList.contains('on')),
      [true, false],
      'a pip per item, the ticked one filled',
    );
    assert(card().querySelector('.li-tick.done').classList.contains('just'), 'the item just ticked pops');
    render();
    assert(!card().querySelector('.li-tick.just'), 'a later render does not pop it again');
    eq(document.activeElement, item(0), 'focus kept on the item');
    eq(item(0).getAttribute('aria-checked'), 'true', 'announced as checked');
    item(1).click();
    assert(checkedOn(a, now), 'the last item ticks the day');
    eq($('#toast').textContent, t('list.dayDone', { name: 'Morning' }), 'says the day is done');
    assert(
      $(`[data-checkin="${a.id}"][data-date="${now}"]`).getAttribute('aria-pressed') === 'true',
      'the strip shows the day ticked',
    );
    item(0).click();
    assert(
      !checkedOn(a, now) && itemOn(a, now, a.list[1].id) && !itemOn(a, now, a.list[0].id),
      'unticking one unticks the day, the other stays',
    );
    eq(a.checkins[now], 0, 'untick kept for sync');
    // The strip ticks and unticks the whole list.
    const day = iso => $(`.card.routine[data-open="${a.id}"] [data-checkin][data-date="${iso}"]`);
    day(now).click();
    assert(checkedOn(a, now) && a.list.every(i => itemOn(a, now, i.id)), 'ticking the day ticks every item');
    day(now).click();
    assert(!checkedOn(a, now) && a.list.every(i => !itemOn(a, now, i.id)), 'unticking the day unticks every item');
    // An earlier day keeps its own ticks; today's list is not touched.
    const y = addDays(now, -1);
    a.startDate = addDays(now, -10);
    save();
    render();
    ui.rtWeek[a.id] = mondayOf(y);
    render();
    day(y).click();
    assert(
      checkedOn(a, y) && a.list.every(i => itemOn(a, y, i.id)) && a.list.every(i => !itemOn(a, now, i.id)),
      'yesterday ticked whole, today untouched',
    );
    ui.rtWeek = {};
    render();
    eq(
      card().querySelector('.rt-items .label').textContent,
      t('list.today', { done: 0, total: 2 }),
      'tomorrow – today – starts afresh',
    );
    // A tick on a day that was ticked without its items (a routine that later got a list) leaves it ticked.
    setCheckin(a, addDays(now, -2), true);
    delete a.listDays[addDays(now, -2)];
    tickListItem(a.id, a.list[0].id, addDays(now, -2));
    assert(checkedOn(a, addDays(now, -2)), 'a ticked day stays ticked when one item is ticked');
    tickListItem(a.id, a.list[0].id, addDays(now, -2));
    assert(!checkedOn(a, addDays(now, -2)), 'and unticking an item unticks it');
    // Days it does not run on cannot be ticked, through the items either.
    tickListItem(a.id, a.list[0].id, addDays(now, 1));
    tickListItem(a.id, a.list[0].id, addDays(now, -40));
    assert(!a.listDays[addDays(now, 1)] && !a.listDays[addDays(now, -40)], 'no ticks outside its days');
    tickListItem(a.id, 'no-such-item', now);
    assert(!a.listDays[now]?.['no-such-item'], 'an unknown item is ignored');
    // On the overview: a count until the day is ticked; the circle ticks every item.
    setView('dashboard');
    const row = () => $(`.routine-row[data-open="${a.id}"]`);
    assert(row().textContent.includes(t('list.count', { done: 0, total: 2 })), 'overview: 0/2');
    tickListItem(a.id, a.list[0].id, now);
    assert(row().textContent.includes(t('list.count', { done: 1, total: 2 })), 'overview: 1/2');
    row().querySelector('[data-checkin]').click();
    assert(checkedOn(a, now) && a.list.every(i => itemOn(a, now, i.id)), 'overview circle ticks the list');
    assert(!row(), 'off the overview once the day is ticked');
    // The context menu's "done today" too.
    runCtxAction('checkin', a.id);
    assert(!checkedOn(a, now) && a.list.every(i => !itemOn(a, now, i.id)), 'menu untick unticks the list');
    setView('activities');
    // A routine that has not started, or has ended, shows no items to tick.
    const later = mk('activity', {
      title: 'Later',
      startDate: addDays(now, 3),
      repeat: { every: 1, unit: 'week', times: 2 },
      dueDate: addDays(now, 20),
      list: [{ id: 'l1', text: 'X' }],
    });
    const ended = mk('activity', {
      title: 'Ended',
      startDate: addDays(now, -20),
      repeat: { every: 1, unit: 'week', times: 2 },
      dueDate: addDays(now, -2),
      list: [{ id: 'e1', text: 'Y' }],
    });
    save();
    ui.hideDone = false;
    render();
    assert(!$(`.card.routine[data-open="${later.id}"] .rt-items`), 'not started: no items');
    assert(!$(`.card.routine[data-open="${ended.id}"]`)?.querySelector('.rt-items'), 'ended: no items');
    // Every view draws it.
    const before = __errors.length;
    for (const v of ['dashboard', 'goals', 'activities', 'states', 'map', 'timeline', 'graphs']) {
      setView(v);
      render();
    }
    eq(__errors.length, before, 'no errors in any view');
  });
  await step('routine lists: a week met says so; improving a state asks how much on the last item', async () => {
    fresh('Routine list amounts');
    const now = today();
    const a = mk('activity', {
      title: 'Swim',
      startDate: addDays(now, -10),
      dueDate: addDays(now, 30),
      repeat: { every: 1, unit: 'week', times: 1 },
      checkins: {},
      list: [
        { id: 'w', text: 'Warm up' },
        { id: 'l', text: 'Laps' },
      ],
    });
    save();
    setView('activities');
    const item = id => $(`.card.routine[data-open="${a.id}"] [data-li-tick="${a.id}"][data-li="${id}"]`);
    const weekTicked = () => daysBetween(periodOf(a, now).from, now).some(d => checkedOn(a, d));
    if (!weekTicked()) {
      item('w').click();
      item('l').click();
      eq($('#toast').textContent, t('rt.metWeek'), 'the week met wins over the day’s message');
    }
    item('w').click();
    assert(!checkedOn(a, now), 'unticked');
    // With a state that adds up: the last item asks first and stays unticked until answered.
    const km = mk('state', { title: 'Km', unit: 'km', cumulative: true, scale: 'week', entries: [] });
    rel(a, km, 'improves');
    save();
    render();
    if (itemOn(a, now, 'l')) item('l').click();
    item('w').click();
    assert(
      itemOn(a, now, 'w') && !itemOn(a, now, 'l') && !checkedOn(a, now) && !$('.amount-pop'),
      'state set up: one ticked, not asked yet',
    );
    item('l').click();
    assert($('.amount-pop') && !itemOn(a, now, 'l') && !checkedOn(a, now), 'asks how much, nothing ticked yet');
    closeAmountPop();
    assert(!itemOn(a, now, 'l') && !checkedOn(a, now), 'closing the question leaves the last item unticked');
    item('l').click();
    $('.amount-pop [data-amount]').value = '1,5';
    $('.amount-pop').requestSubmit();
    assert(
      !$('.amount-pop') && checkedOn(a, now) && itemOn(a, now, 'l') && itemOn(a, now, 'w'),
      'answered: the day and its items ticked',
    );
    eq(
      km.entries.map(e => [e.date, e.amount, e.routine]),
      [[now, '1.5', a.id]],
      'amount added',
    );
    item('w').click();
    assert(!checkedOn(a, now) && !km.entries.length, 'unticking an item unticks the day and takes its amount back');
    // Escape on the question only ticks.
    item('w').click();
    $('.amount-pop [data-amount]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(
      checkedOn(a, now) && itemOn(a, now, 'w') && itemOn(a, now, 'l') && !km.entries.length,
      'Escape ticks without an amount',
    );
  });
  await step('routine lists: switching kinds, items edited, import, reset, sync', () => {
    fresh('Routine list edits');
    const now = today();
    const a = mk('activity', {
      title: 'Evening',
      startDate: addDays(now, -5),
      dueDate: addDays(now, 20),
      repeat: { every: 1, unit: 'week', times: 3 },
      checkins: {},
      list: [
        { id: 'a1', text: 'Teeth', done: false },
        { id: 'a2', text: 'Read', done: false },
      ],
    });
    save();
    setView('activities');
    tickListItem(a.id, 'a1', now);
    // Editing keeps ids and today's ticks; renaming and adding work as on a list.
    openForm('activity', a.id);
    assert(
      $('#listRows').children.length === 2 &&
        $('#listRows').classList.contains('no-ticks') &&
        $('#f-repeat').value === 'week',
      'edit: items, no ticks, repeats',
    );
    $('#listRows').children[1].querySelector('.li-input').value = 'Read a chapter';
    modal.querySelector('[data-li-add]').click();
    $('#listRows').children[2].querySelector('.li-input').value = 'Lights out';
    submitForm();
    assert(
      isListRoutine(a) && a.list.length === 3 && a.list[0].id === 'a1' && a.list[1].text === 'Read a chapter',
      'saved',
    );
    assert(itemOn(a, now, 'a1') && a.list.every(i => !i.done), 'today’s ticks kept, no item done');
    // Turning it into a one-off list: ticks shown again, status follows the items.
    openForm('activity', a.id);
    $('#f-repeat').value = 'none';
    $('#f-repeat').dispatchEvent(new Event('change', { bubbles: true }));
    assert(
      !$('#listRows').classList.contains('no-ticks') && !modal.querySelector('[data-field="dueDate"]').hidden,
      'no repeat: ticks and due date back',
    );
    $('#listRows .li-check').checked = true;
    submitForm();
    assert(isList(a) && !isRoutine(a) && a.list[0].done && a.status === 'doing', 'now a list, in progress');
    // And back: a list that repeats.
    openForm('activity', a.id);
    $('#f-repeat').value = 'days';
    $('#f-repeat').dispatchEvent(new Event('change', { bubbles: true }));
    assert($('#listRows').classList.contains('no-ticks'), 'repeat: ticks hidden');
    submitForm();
    assert(
      isListRoutine(a) && a.list.every(i => !i.done) && a.status === 'todo',
      'a routine list again, items not done',
    );
    // Import keeps good day ticks and drops bad ones.
    const n = normalize({
      activities: [
        {
          id: 'r1',
          title: 'R',
          repeat: { every: 1, unit: 'week', times: 2 },
          list: [{ id: 'i', text: 'I' }],
          listDays: { [now]: { i: 1 } },
        },
        {
          id: 'r2',
          title: 'S',
          repeat: { every: 1, unit: 'week', times: 2 },
          list: [{ id: 'i', text: 'I' }],
          listDays: ['nope'],
        },
        { id: 'r3', title: 'T', repeat: { every: 1, unit: 'week', times: 2 }, listDays: { [now]: { i: 1 } } },
      ],
    }).activities;
    eq(n[0].listDays, { [now]: { i: 1 } }, 'day ticks kept');
    assert(!('listDays' in n[1]) && !('listDays' in n[2]), 'bad day ticks, or ones without a list, dropped');
    // Reset clears the day ticks with the check-ins.
    tickListItem(a.id, 'a1', now);
    const r = resetProgress(db).activities.find(x => x.id === a.id);
    assert(!r.listDays && !r.checkins && r.list.length === 3, 'reset clears day ticks, keeps items');
    // Sync: day ticks from both copies, per item; the newer copy wins a clash, unticks included.
    const base = {
      id: 'm',
      title: 'M',
      repeat: { every: 1, unit: 'week', times: 3 },
      list: [
        { id: 'x', text: 'X' },
        { id: 'y', text: 'Y' },
      ],
    };
    const phone = {
      ...base,
      updatedAt: '2099-01-02',
      checkins: { d1: 1 },
      listDays: { d1: { x: 1, y: 1 }, d2: { x: 1 } },
    };
    const laptop = {
      ...base,
      updatedAt: '2099-01-03',
      checkins: { d3: 1 },
      listDays: { d2: { x: 0, y: 1 }, d3: { x: 1, y: 1 } },
    };
    const m = mergeActivity(phone, laptop);
    eq(
      m.listDays,
      { d1: { x: 1, y: 1 }, d2: { x: 0, y: 1 }, d3: { x: 1, y: 1 } },
      'merged per day and item, newer wins',
    );
    eq(m.checkins, { d1: 1, d3: 1 }, 'check-ins merged as before');
    assert(phone.listDays.d2.x === 1 && !laptop.listDays.d1, 'copies left as they were');
    eq(mergeActivity(laptop, phone).listDays, m.listDays, 'same either way round');
    assert(
      !('listDays' in mergeActivity({ ...base, updatedAt: '1' }, { ...base, updatedAt: '2' })),
      'no day ticks: none added',
    );
  });
  await step('routine lists: removing the only unticked item in the form ticks the day', () => {
    fresh('Routine list removal');
    const now = today(),
      y = addDays(now, -1),
      y2 = addDays(now, -2),
      tom = addDays(now, 1);
    const a = mk('activity', {
      title: 'Gym',
      startDate: addDays(now, -5),
      dueDate: addDays(now, 20),
      repeat: { every: 1, unit: 'week', times: 3 },
      checkins: {},
      list: [
        { id: 'p', text: 'Push' },
        { id: 'q', text: 'Pull' },
        { id: 'r', text: 'Run' },
      ],
    });
    const km = mk('state', { title: 'Km', unit: 'km', cumulative: true, scale: 'week', entries: [] });
    rel(a, km, 'improves');
    a.listDays = {
      [now]: { p: 1, q: 1, r: 0 },
      [y]: { p: 1, r: 0 },
      [y2]: { p: 0, q: 0, r: 0 },
      [tom]: { p: 1, q: 1 },
    };
    save();
    setView('activities');
    // Renaming alone ticks nothing.
    openForm('activity', a.id);
    $('#listRows').children[0].querySelector('.li-input').value = 'Push-ups';
    submitForm();
    assert(!checkedOn(a, now), 'no item removed: the day stays unticked');
    openForm('activity', a.id);
    $('#listRows').children[2].querySelector('[data-li-del]').click();
    submitForm();
    eq(
      a.list.map(i => i.id),
      ['p', 'q'],
      'item removed',
    );
    assert(checkedOn(a, now), 'today had every other item ticked: ticked');
    assert(!checkedOn(a, y) && !checkedOn(a, y2), 'days with other items unticked stay unticked');
    assert(!checkedOn(a, tom), 'a day still to come is not ticked');
    assert(!km.entries.length && !$('.amount-pop'), 'no amount asked or added');
    render();
    assert(
      $(`[data-checkin="${a.id}"][data-date="${now}"]`).getAttribute('aria-pressed') === 'true',
      'the strip shows it',
    );
    // A day ticked already stays ticked; unticking an item still unticks it.
    tickListItem(a.id, 'q', now);
    assert(!checkedOn(a, now), 'unticking an item unticks the day again');
  });
  await step('routine lists: escaping, help, Slovenian, the sample plan, kind icons', async () => {
    fresh('Routine list around');
    const now = today(),
      evil = '<img src=x onerror="window.__xss=1">';
    const a = mk('activity', {
      title: 'Daily',
      startDate: addDays(now, -3),
      dueDate: addDays(now, 30),
      repeat: { every: 1, unit: 'week', times: 3 },
      checkins: {},
      list: [
        { id: 'q', text: evil },
        { id: 'r', text: 'Ok' },
      ],
    });
    save();
    setView('activities');
    assert(
      !window.__xss &&
        !$('.rt-items img') &&
        [...document.querySelectorAll('.rt-items .li-text')].some(e => e.textContent === evil),
      'item text shown as text',
    );
    setView('dashboard');
    assert(!$('.routine-row img'), 'overview row: nothing unescaped');
    setView('activities');
    setHelp(true);
    const dot = $('[data-help-tip="routineList"]');
    assert(dot && dot.parentElement.matches('.rt-items-head .label'), 'help dot by the label');
    dot.click();
    eq($('#helpTip')?.textContent, t('help.tip.routineList'), 'help text shown');
    assert(!$('.rt-items [data-help-tip="list"]'), 'the one-off list tip is not put on it');
    setHelp(false);
    changeLanguage('sl');
    render();
    eq(
      $('.rt-items .label').textContent,
      I18N.sl.strings['list.today'].replace('{done}', 0).replace('{total}', 2),
      'Slovenian count',
    );
    openForm('activity');
    eq(
      modal.querySelector('[data-act-kind="listRoutine"] strong').textContent,
      I18N.sl.strings['f.actKind.listRoutine'],
      'Slovenian kind',
    );
    modal.close();
    tickListItem(a.id, 'q', now);
    tickListItem(a.id, 'r', now);
    eq($('#toast').textContent, I18N.sl.strings['list.dayDone'].replace('{name}', 'Daily'), 'Slovenian toast');
    changeLanguage('en');
    // Each kind has its own icon, hidden from screen readers.
    openForm('activity');
    const icons = [...modal.querySelectorAll('[data-act-kind] svg.act-choice-icon')];
    assert(
      icons.length === 4 &&
        icons.every(s => s.getAttribute('aria-hidden') === 'true' && s.getBoundingClientRect().width >= 24),
      'four visible icons',
    );
    eq(new Set(icons.map(s => s.innerHTML)).size, 4, 'all different');
    const r = modal.querySelector('[data-act-kind="once"]'),
      ic = r.querySelector('svg').getBoundingClientRect(),
      tx = r.querySelector('strong').getBoundingClientRect();
    assert(ic.right <= tx.left, 'icon beside the text');
    assert(
      getComputedStyle(modal.querySelector('[data-act-kind="routine"] svg')).color !==
        getComputedStyle(modal.querySelector('[data-act-kind="list"] svg')).color,
      'routines and lists in different colours',
    );
    modal.close();
    // The sample plan's strength training is a routine list, ticked on the days it was done.
    for (const lang of ['en', 'sl']) {
      changeLanguage(lang);
      loadSample();
      const st = db.activities.find(x => isListRoutine(x));
      assert(
        st &&
          st.list.length === 3 &&
          st.list.every(i => i.text === I18N[lang].sample.activities[24].list[st.list.indexOf(i)]),
        `${lang}: strength training has its exercises`,
      );
      assert(
        Object.keys(st.checkins).every(d => st.list.every(i => itemOn(st, d, i.id))),
        `${lang}: every ticked day has its items ticked`,
      );
      deletePlan(plans.current);
    }
    changeLanguage('en');
  });
});
