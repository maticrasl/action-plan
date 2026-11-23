/** Page tests: the one-time-or-routine choice, the board, start dates, card menus, the overview's next actions. */
suite(async () => {
  await step('a new activity first asks: one-time or routine', async () => {
    fresh('Kind first');
    const g = mk('goal', { title: 'Fit' });
    save();
    setView('activities');
    document.querySelector('[data-new="activity"]').click();
    const btns = () => [...modal.querySelectorAll('[data-act-kind]')];
    assert(
      modal.open &&
        btns()
          .map(b => b.dataset.actKind)
          .join() === 'once,list,routine,listRoutine',
      'four choices shown',
    );
    assert($('#saveBtn').hidden && !$('#f-title'), 'no form and no Save yet');
    eq($('#modalTitle').textContent, t('new.activity'), 'titled New activity');
    await new Promise(r => setTimeout(r, 60));
    eq(document.activeElement, btns()[0], 'the first choice is focused');
    $('#modalForm').requestSubmit();
    assert(modal.open && db.activities.length === 0 && btns().length === 4, 'Enter on the form saves nothing');
    btns()[0].click();
    assert(modal.open && !$('#saveBtn').hidden && $('#f-title'), 'one-time: the form opens');
    eq($('#f-repeat').value, 'none', 'one-time: does not repeat');
    assert(
      !modal.querySelector('[data-field="status"]').hidden && !modal.querySelector('[data-field="dueDate"]').hidden,
      'one-time: status and due date shown',
    );
    $('#f-title').value = 'Sign up';
    $('#f-dueDate').value = dateInput(addDays(today(), 7));
    submitForm();
    const once = db.activities.find(a => a.title === 'Sign up');
    assert(once && !isRoutine(once), 'saved as a one-time activity');
    // From a goal's menu: the goal stays linked through the choice.
    openForm('activity', null, { contributes: [g.id] });
    assert(btns().length === 4, 'menu add asks too');
    btns()[2].click();
    eq($('#f-repeat').value, 'week', 'routine: a number of times a week');
    assert(
      !$('#repeatEnds').hidden &&
        modal.querySelector('[data-field="status"]').hidden &&
        modal.querySelector('[data-field="dueDate"]').hidden,
      'routine: ends shown, status and due date hidden',
    );
    assert(
      modal.querySelector('[data-unpick]')?.closest('.tag')?.textContent.includes('Fit'),
      'the goal is still picked',
    );
    $('#f-title').value = 'Run';
    $('#f-endDate').value = dateInput(addDays(today(), 30));
    submitForm();
    const run = db.activities.find(a => a.title === 'Run');
    assert(run && isRoutine(run) && run.repeat.unit === 'week' && run.repeat.times === 3, 'saved as a routine');
    eq(
      relsFrom(run.id, 'contributes').map(r => r.to),
      [g.id],
      'linked to the goal',
    );
    // Editing skips the choice; so does anything else new.
    openForm('activity', run.id);
    assert(!btns().length && $('#f-title').value === 'Run' && !$('#saveBtn').hidden, 'editing opens the form');
    modal.close();
    openForm('goal');
    assert(!btns().length && !$('#saveBtn').hidden, 'a goal opens its form');
    modal.close();
    // Cancel from the choice leaves nothing behind; the next form shows Save again.
    openForm('activity');
    modal.close();
    openForm('state');
    assert(
      !$('#saveBtn').hidden && formCtx.kind === 'state' && !formCtx.choose,
      'Save back after cancelling the choice',
    );
    modal.close();
    eq(db.activities.length, 2, 'nothing saved from the cancelled choice');
    changeLanguage('sl');
    openForm('activity');
    eq(btns()[2].querySelector('strong').textContent, I18N.sl.strings['f.actKind.routine'], 'Slovenian labels');
    modal.close();
    changeLanguage('en');
  });
  await step('activity kind: every way in asks first, and the answer carries what was preset', () => {
    fresh('Kind paths');
    const g = mk('goal', { title: 'Fit', category: 'Health' }),
      parent = mk('activity', { title: 'Big job', startDate: today(), dueDate: addDays(today(), 9) });
    const s = mk('state', { title: 'Weight' });
    save();
    const btns = () => [...modal.querySelectorAll('[data-act-kind]')];
    // Each context-menu "add activity" asks, then keeps its link.
    const cases = [
      ['subactivity', parent, () => $('#f-parent').value === parent.id],
      ['contributes', g, () => !!modal.querySelector('[data-picker="goal"] [data-picked-id]')],
      ['improves', s, () => !!modal.querySelector('[data-picker="state"] [data-picked-id]')],
    ];
    for (const [type, item, picked] of cases) {
      for (const kind of ['once', 'list', 'routine', 'listRoutine']) {
        runCtxAction(`add:activity:${type}`, item.id);
        assert(modal.open && btns().length === 4 && formCtx.choose, `${type}: asks first`);
        btns()
          .find(b => b.dataset.actKind === kind)
          .click();
        assert(!formCtx.choose && !$('#saveBtn').hidden, `${type}/${kind}: the form, with Save`);
        assert(picked(), `${type}/${kind}: link kept`);
        assert(!!$('#listRows') === kind.startsWith('list') && !!$('#f-repeat'), `${type}/${kind}: the right fields`);
        eq($('#f-repeat').value, kind.includes('outine') ? 'week' : 'none', `${type}/${kind}: repeat preset`);
        modal.close();
      }
    }
    // A list made from a parent's menu is saved under it.
    runCtxAction('add:activity:subactivity', parent.id);
    btns()[1].click();
    $('#f-title').value = 'Pack';
    $('#f-dueDate').value = dateInput(addDays(today(), 3));
    $('#listRows .li-input').value = 'Shoes';
    submitForm();
    const pack = db.activities.find(a => a.title === 'Pack');
    eq(
      relsFrom(pack.id, 'subactivity').map(r => r.to),
      [parent.id],
      'list saved as a sub-activity',
    );
    // The empty board's button and the view's Add button ask too.
    setView('activities');
    $('#addBtn').click();
    assert(modal.open && btns().length === 4, 'Add button asks');
    modal.close();
    // Clicking around the choices (not on one) changes nothing.
    openForm('activity');
    modal.querySelector('.act-choice').click();
    assert(modal.open && btns().length === 4 && formCtx.choose, 'a click between the choices does nothing');
    modal.close();
    // Every choice is a button with its own name; the group has a label, in both languages.
    for (const lang of ['en', 'sl']) {
      changeLanguage(lang);
      openForm('activity');
      eq($('#modalTitle').textContent, I18N[lang].strings['new.activity'], `${lang}: title`);
      eq(
        modal.querySelector('.act-choice').getAttribute('aria-label'),
        I18N[lang].strings['f.actKind'],
        `${lang}: group label`,
      );
      assert(
        btns().every(
          b => b.type === 'button' && b.querySelector('strong').textContent && b.querySelector('span').textContent,
        ),
        `${lang}: named and described`,
      );
      modal.close();
    }
    changeLanguage('en');
  });
  await step('activity kind: the choices fit a phone', async () => {
    for (const lang of ['en', 'sl']) {
      changeLanguage(lang);
      const frame = document.createElement('iframe');
      Object.assign(frame.style, {
        width: '390px',
        height: '700px',
        position: 'fixed',
        left: '-9999px',
        top: '0',
        border: '0',
      });
      frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body style="margin:0;padding:0 16px"><div class="modal-body">${activityChoice()}</div></body>`;
      await new Promise(res => {
        frame.onload = res;
        document.body.append(frame);
      });
      await fontsLoaded(frame.contentDocument);
      const doc = frame.contentDocument,
        rs = [...doc.querySelectorAll('.act-choice-btn')].map(b => b.getBoundingClientRect());
      assert(rs.length === 4 && rs.every(r => r.left >= 15 && r.right <= 375), `${lang}: inside the gutters`);
      assert(
        rs.every((r, i) => !i || rs[i - 1].bottom <= r.top),
        `${lang}: one under another`,
      );
      assert(rs.at(-1).bottom <= 700, `${lang}: all four fit on the screen`);
      assert(doc.documentElement.scrollWidth <= 390, `${lang}: no sideways scroll`);
      frame.remove();
    }
    changeLanguage('en');
  });
  await step('activities: no columns, in progress first, then due date; cards flow by height', () => {
    fresh('Flow');
    const mkA = (title, status, dueDate) => mk('activity', { title, status, ...(dueDate ? { dueDate } : {}) });
    const late = mkA('Late todo', 'todo', addDays(today(), 1));
    const none = mkA('No date', 'todo');
    const done = mkA('Done one', 'done', addDays(today(), -5));
    const doing = mkA('Doing', 'doing', addDays(today(), 9));
    const first = mkA('Early todo', 'todo', addDays(today(), -1));
    const tall = mkA('Tall', 'doing', addDays(today(), 10));
    tall.list = Array.from({ length: 10 }, (_, k) => ({ id: 'i' + k, text: 'Item ' + k }));
    save();
    setView('activities');
    assert(!$('#view').querySelector('.board, .col, [data-drag], [draggable]'), 'no columns, no drag');
    const order = () => [...document.querySelectorAll('.acts .card')].map(c => c.dataset.open);
    eq(
      order(),
      [doing, tall, first, late, none, done].map(x => x.id),
      'doing, todo, done; by due date',
    );
    eq($('.acts .routines-title span').textContent, '6', 'counted');
    $(`[data-cycle="${none.id}"]`).click();
    eq(none.status, 'doing', 'the circle moves it along');
    eq(order()[2], none.id, 'and it moves up with in progress');
    ui.hideDone = true;
    render();
    assert(!order().includes(done.id), 'hide done hides it');
    ui.hideDone = false;
    render();
    // Masonry: each card spans rows by its own height; the tall card makes its column longer.
    const box = id => document.querySelector(`.acts [data-open="${id}"]`).getBoundingClientRect();
    const span = id => document.querySelector(`.acts [data-open="${id}"]`).style.gridRowEnd;
    assert(span(tall.id) !== span(doing.id), 'heights differ: ' + span(tall.id) + ' / ' + span(doing.id));
    assert(box(doing.id).height < box(tall.id).height / 2, 'a short card keeps its own height');
    const tops = order().map(id => box(id).top);
    assert(tops[0] === tops[1], 'left to right on the first row');
    return `${getComputedStyle($('.acts .flow')).gridTemplateColumns.split(' ').length} columns`;
  });
  await step('overview: the active next actions first, expandable', () => {
    const before = plans.current;
    loadSample();
    changeLanguage('en');
    untickCook();
    setView('dashboard');
    const titles = [...$('#view').querySelectorAll('.section-title')].map(h => h.firstChild.textContent.trim());
    assert(
      titles.join('|') === `${t('dash.next')}|${t('rt.title')}|${t('dash.goalsInProgress')}`,
      'next actions, routines, then the goals',
    );
    const todo = db.activities.filter(a => a.status !== 'done' && !isRoutine(a)).sort(byDueDate);
    const shown = () => [...$('#view').querySelectorAll('.list:not(.routine-list) > .row')].map(r => r.dataset.open);
    const more = () => $('[data-next-more]');
    const due = todo.filter(a => a.dueDate && a.dueDate <= today());
    const going = todo.filter(a => due.includes(a) || a.status === 'doing');
    assert(
      due.length && due.length < going.length && going.length < todo.length,
      `the sample has due, other active and not started ones: ${due.length}, ${going.length}, ${todo.length}`,
    );
    assert(shown().join() === due.map(a => a.id).join(), 'those due by today, by due date');
    assert(
      more().textContent === t('dash.showAll', { n: going.length }) && more().getAttribute('aria-expanded') === 'false',
      'show all with the count',
    );
    window.scrollTo(0, 0);
    more().click();
    assert(shown().join() === going.map(a => a.id).join(), 'expanded to all active ones');
    assert(window.scrollY === 0 && document.documentElement.scrollHeight > innerHeight, 'page stays where it was');
    assert(
      more().textContent === t('dash.showFewer') &&
        more().getAttribute('aria-expanded') === 'true' &&
        document.activeElement === more(),
      'show fewer, focus kept',
    );
    assert(prefs.get('nextAll') === true, 'remembered');
    more().click();
    assert(shown().length === due.length && prefs.get('nextAll') === false, 'collapsed again');
    // No button when every active one is due.
    going.filter(a => !due.includes(a)).forEach(a => (a.status = 'done'));
    render();
    assert(shown().length === due.length && !more(), 'no button when all are shown');
    deletePlan(plans.current);
    openPlan(before);
    return `${todo.length} to do`;
  });
  await step('activities: on its start date a to-do activity is in progress, once per start date', () => {
    fresh('Auto start');
    const past = mk('activity', { startDate: d(-3) }),
      now = mk('activity', { startDate: d(0) }),
      soon = mk('activity', { startDate: d(1) });
    const none = mk('activity'),
      done = mk('activity', { status: 'done', startDate: d(-5) });
    const routine = mk('activity', { startDate: d(-10), repeat: { every: 1, unit: 'week', times: 2 }, checkins: {} });
    setView('activities');
    eq(
      [past, now, soon, none, done, routine].map(a => a.status),
      ['doing', 'doing', 'todo', 'todo', 'done', 'todo'],
      'statuses',
    );
    eq(past.autoStarted, past.startDate, 'remembers the start date it acted on');
    assert(
      $(`.acts [data-open="${past.id}"] .check.doing`) && $(`.acts [data-open="${soon.id}"] .check:not(.doing)`),
      'cards show their status',
    );
    eq(
      JSON.parse(localStorage.getItem(planKey(plans.current))).activities.find(a => a.id === now.id).status,
      'doing',
      'and it is saved',
    );
    // Set back by hand, it stays; a new start date starts it again.
    runCtxAction('status:todo', past.id);
    setView('dashboard');
    setView('activities');
    eq(past.status, 'todo', 'set back to to do, it stays');
    past.startDate = d(-1);
    render();
    eq(past.status, 'doing', 'a new start date starts it again');
    // A start date reached while the app was in the background.
    soon.startDate = d(0);
    document.dispatchEvent(new Event('visibilitychange'));
    eq(soon.status, 'doing', 'coming back to the app starts it');
    assert($(`.acts [data-open="${soon.id}"] .check.doing`), 'and redraws the view');
    // Only activities started by hand count as progress (when importing or saving a template).
    eq(progressCounts(db).started, 0, 'started by date is not progress');
    runCtxAction('status:doing', none.id);
    eq(progressCounts(db).started, 1, 'started by hand is');
    // A plan shared as a template starts over.
    const tpl = resetProgress(db);
    assert(
      tpl.activities.every(a => a.status === 'todo' && !('autoStarted' in a)),
      'templates forget it',
    );
    // A new activity starts today unless changed, so it is in progress at once; editing one without
    // a start date leaves it empty.
    openForm('activity', null, { repeat: 'once' });
    eq($('#f-startDate').value, dateInput(today()), 'a new activity starts today');
    $('#f-title').value = 'Fresh';
    $('#f-dueDate').value = dateInput(addDays(today(), 5));
    submitForm();
    const fresh1 = db.activities.find(a => a.title === 'Fresh');
    eq([fresh1.startDate, fresh1.status], [today(), 'doing'], 'saved from today, in progress');
    assert($(`.acts [data-open="${fresh1.id}"] .check.doing`), 'shown as in progress');
    openForm('activity', none.id);
    eq($('#f-startDate').value, '', 'an existing one without a start date stays empty');
    modal.close();
    deletePlan(plans.current);
  });
  await step('activities: a long-press (or right-click) on a card opens its menu', async () => {
    fresh('Card menu');
    const a = mk('activity', { title: 'Paint the fence' });
    const r = mk('activity', {
      title: 'Stretch',
      startDate: d(-7),
      repeat: { every: 1, unit: 'week', times: 3 },
      checkins: {},
    });
    save();
    setView('activities');
    const card = id => $(`.routines [data-ctx-item="${id}"]`);
    const touch = (type, el, x = 60, y = 60) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: 11,
          clientX: x,
          clientY: y,
        }),
      );
    const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const longPress = async (el, withClick) => {
      touch('pointerdown', el);
      await wait(LONG_PRESS_MS + 80);
      touch('pointerup', el);
      if (withClick) click(el);
    };
    const acts = () => [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx);
    const tapMenu = act => {
      const b = ctxMenu.querySelector(`[data-ctx="${act}"]`);
      touch('pointerdown', b);
      touch('pointerup', b);
      click(b);
    };
    for (const withClick of [false, true]) {
      await longPress(card(a.id).querySelector('h3'), withClick);
      assert(
        !ctxMenu.hidden && ctxMenu.dataset.id === a.id,
        `${withClick ? 'with' : 'without'} a lifting click: menu open`,
      );
      assert(!modal.open, 'the press does not also open the form');
      eq(
        acts(),
        [
          'edit',
          'note',
          'status:todo',
          'status:doing',
          'status:done',
          'add:activity:subactivity',
          'show:map',
          'show:timeline',
          'link',
          'delete',
        ],
        'activity options, no highlighting',
      );
      tapMenu('status:' + (withClick ? 'todo' : 'doing'));
      assert(ctxMenu.hidden, 'one tap runs the item');
      eq(a.status, withClick ? 'todo' : 'doing', 'status set from the menu');
    }
    assert($(`.acts [data-ctx-item="${a.id}"] .check:not(.doing):not(.done)`), 'the card shows it');
    // Routines: tick today off from the menu.
    await longPress(card(r.id));
    assert(
      !ctxMenu.hidden && ctxMenu.dataset.id === r.id && acts().includes('checkin') && !acts().includes('status:done'),
      'routine menu',
    );
    tapMenu('checkin');
    assert(checkedOn(r, today()), 'ticked off today');
    // A short tap still opens the form; a swipe opens nothing.
    touch('pointerdown', card(a.id));
    touch('pointerup', card(a.id));
    click(card(a.id));
    assert(modal.open && formCtx.id === a.id && ctxMenu.hidden, 'a short tap opens the form');
    modal.close();
    touch('pointerdown', card(a.id), 60, 60);
    touch('pointermove', card(a.id), 60, 90);
    await wait(LONG_PRESS_MS + 80);
    touch('pointerup', card(a.id), 60, 90);
    assert(ctxMenu.hidden, 'a swipe (scrolling the board) opens no menu');
    // Right-click with a mouse opens the same menu instead of the browser's.
    const rc = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 });
    card(a.id).querySelector('.meta, h3').dispatchEvent(rc);
    assert(rc.defaultPrevented && !ctxMenu.hidden && ctxMenu.dataset.id === a.id, 'right-click opens the menu');
    closeCtxMenu();
    // The map still offers highlighting.
    setView('map');
    openCtxMenu(a.id, 10, 10);
    assert(acts().includes('highlight'), 'map menu still highlights');
    closeCtxMenu();
    deletePlan(plans.current);
  });
  await step('overview: next actions show what is due by today, then what else is in progress', () => {
    fresh('Due today');
    changeLanguage('en');
    setView('dashboard');
    ui.nextAll = false;
    const shown = () => [...$('#view').querySelectorAll('.list:not(.routine-list) > .row')].map(r => r.dataset.open);
    const more = () => $('[data-next-more]');
    const ids = xs => xs.map(a => a.id).join();
    // Due by today (overdue, today – one of them in progress), in progress but due later or undated,
    // and not started yet.
    const over = mk('activity', { dueDate: d(-9) }),
      todayA = mk('activity', { dueDate: d(0), status: 'doing' });
    const doingLater = mk('activity', { dueDate: d(6), status: 'doing' }),
      doingUndated = mk('activity', { status: 'doing' });
    const later = mk('activity', { dueDate: d(1) }),
      undated = mk('activity');
    // Neither finished activities nor routines count.
    mk('activity', { dueDate: d(-2), status: 'done' });
    mk('activity', { dueDate: d(-3), repeat: { times: 1, per: 'week' }, checkins: {} });
    render();
    assert(shown().join() === ids([over, todayA]), `collapsed: only those due by today, got ${shown().length}`);
    assert(more()?.textContent === t('dash.showAll', { n: 4 }), 'show all counts the active ones');
    more().click();
    assert(
      shown().join() === ids([over, todayA, doingLater, doingUndated]),
      'expanded: also the others in progress, by due date',
    );
    assert(!shown().includes(later.id) && !shown().includes(undated.id), 'never those not started');
    more().click();
    assert(shown().join() === ids([over, todayA]), 'collapsed back');
    // Nothing due, some in progress: a note, and the button for them.
    [over, todayA].forEach(a => (a.status = 'done'));
    render();
    assert(
      !shown().length &&
        viewEl.textContent.includes(t('dash.noneDue')) &&
        more()?.textContent === t('dash.showAll', { n: 2 }),
      'none due: says so, the rest behind the button',
    );
    more().click();
    assert(shown().join() === ids([doingLater, doingUndated]), 'the ones in progress');
    more().click();
    // Nothing active, but not all done.
    [doingLater, doingUndated].forEach(a => (a.status = 'done'));
    render();
    assert(
      !shown().length && viewEl.textContent.includes(t('dash.noneActive')) && !more(),
      'none active: says so, no button',
    );
    assert(!viewEl.textContent.includes(t('dash.allDone')), 'not "nothing left to do"');
    // Everything done.
    [later, undated].forEach(a => (a.status = 'done'));
    render();
    assert(
      viewEl.textContent.includes(t('dash.allDone')) && !more() && !viewEl.textContent.includes(t('dash.noneActive')),
      'all done',
    );
    // An activity whose start date comes is started: listed once expanded, or at once if due.
    const starts = mk('activity', { startDate: d(0), dueDate: d(9) });
    render();
    assert(starts.status === 'doing' && !shown().length && more(), 'started today, due later: behind the button');
    starts.dueDate = d(-1);
    render();
    assert(shown().join() === starts.id && !more(), 'and once due, listed, with no button');
    deletePlan(plans.current);
    return 'ok';
  });
});
