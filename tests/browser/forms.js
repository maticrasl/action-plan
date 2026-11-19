/** Page tests: the item forms (validation, links, relations, deleting), link lists, Ctrl+Enter, date fields, numbers. */
suite(async () => {
  loadSample(); // the first steps edit the sample plan, and later ones use what they made
  await step('goal form: invalid then valid save', () => {
    setView('goals');
    openForm('goal');
    $('#f-title').value = 'Hi';
    submitForm();
    const invalid = [...modal.querySelectorAll('.field.invalid')].map(f => f.dataset.field).join(',');
    Object.entries({
      title: 'Test goal one',
      specific: 'A specific outcome that is long enough',
      metric: 'Pages',
      unit: 'p',
      baseline: '1,5',
      target: '10.5',
      achievable: 'Yes it is doable',
      relevant: 'Matters a lot to me',
      deadline: '2099-01-01',
    }).forEach(([k, v]) => {
      $('#f-' + k).value = v;
    });
    $('#modalForm').dispatchEvent(new Event('input'));
    const live = $('#smartLiveText').textContent;
    submitForm();
    const g = db.goals.find(x => x.title === 'Test goal one');
    assert(g && g.baseline === '1.5' && g.target === '10.5', 'goal saved with parsed numbers');
    assert(!modal.open, 'modal closed');
    return `invalid=[${invalid}] live="${live}"`;
  });
  await step('drag from inside a dialog to its backdrop keeps it open', () => {
    openForm('goal');
    const press = el => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    press($('#f-title'));
    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(modal.open, 'press inside, release outside keeps it open');
    press(modal);
    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(!modal.open, 'a real backdrop click still closes');
  });
  await step('new item: relationships folded; open when editing or links are preset', () => {
    const sec = () => modal.querySelector('details.link-sec');
    for (const k of ['goal', 'state', 'vision']) {
      openForm(k);
      assert(sec() && !sec().open && sec().querySelector('[data-picker]'), `${k}: new form folds its link lists`);
      modal.close();
    }
    openForm('activity', null, { repeat: 'once' });
    assert(sec() && !sec().open && sec().querySelector('#f-parent'), 'activity: parent and link lists folded');
    modal.close();
    const g = db.goals[0];
    openForm('goal', g.id);
    assert(sec().open, 'editing: open');
    modal.close();
    openForm('activity', null, { repeat: 'once', contributes: [g.id] });
    assert(sec().open, 'a preset link: open');
    modal.close();
  });
  await step('changed form: Cancel, ×, backdrop and Escape ask before discarding', () => {
    const realConfirm = window.confirm;
    let asked = 0,
      answer = false;
    window.confirm = () => (asked++, answer);
    try {
      openForm('goal');
      $('[data-close].btn').click();
      assert(!modal.open && asked === 0, 'unchanged: closes without asking');
      openForm('goal');
      $('#f-title').value = 'Half typed';
      $('#f-title').dispatchEvent(new Event('input', { bubbles: true }));
      $('[data-close].btn').click();
      assert(modal.open && asked === 1, 'Cancel asks; No keeps the form');
      $('.modal-head [data-close]').click();
      modal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const esc = new Event('cancel', { cancelable: true });
      modal.dispatchEvent(esc);
      assert(modal.open && asked === 4 && esc.defaultPrevented, '×, backdrop and Escape ask too');
      assert($('#f-title').value === 'Half typed', 'what was typed is kept');
      answer = true;
      $('[data-close].btn').click();
      assert(!modal.open && asked === 5, 'Yes discards and closes');
      assert(!db.goals.some(x => x.title === 'Half typed'), 'nothing saved');
    } finally {
      window.confirm = realConfirm;
      if (modal.open) modal.close();
    }
  });
  await step('bad number is rejected', () => {
    openForm('state');
    $('#f-title').value = 'Bad number state';
    $('#f-value').value = '12abc';
    submitForm();
    const err = modal.querySelector('[data-field="value"] .err').textContent;
    assert(err, 'error shown');
    modal.close();
    return err;
  });
  await step('state form with history', () => {
    openForm('state');
    $('#f-title').value = 'Pages read';
    $('#f-value').value = '3,25';
    submitForm();
    const s = db.states.find(x => x.title === 'Pages read');
    assert(s && s.value === '3.25' && s.history.length === 1);
    openForm('state', s.id);
    $('#f-value').value = '4';
    $('#f-date').value = '2099-01-02';
    [...modal.querySelectorAll('[data-name="goals"] .pick-opt')]
      .find(o => o.textContent.includes('Test goal one'))
      .click();
    submitForm();
    assert(s.history.length === 2 && relsFrom(s.id, 'measures').length === 1);
    return `history=${s.history.length}`;
  });
  await step('state form: new measurement, same date replaces, table and delete', () => {
    const s = db.states.find(x => x.title === 'Pages read');
    openForm('state', s.id);
    assert($('#f-value').value === '' && parseDateInput($('#f-date').value) === today(), 'value empty, dated today');
    assert(modal.querySelector('[data-field="value"] .hint').textContent.includes('4'), 'hint names the latest value');
    submitForm(); // empty value keeps the measurements
    assert(s.history.length === 2 && s.value === '4' && s.date === '2099-01-02', 'empty value keeps the latest');
    openForm('state', s.id);
    $('#f-value').value = '2';
    submitForm(); // today: before 2099, so the value stays the latest
    openForm('state', s.id);
    $('#f-value').value = '5';
    $('#f-date').value = '2099-01-02';
    submitForm();
    // 3.25 was recorded today when the state was made, so both new values replaced one.
    assert(
      s.history.map(h => h.value).join() === '2,5' && s.value === '5',
      'same date replaced: ' + JSON.stringify(s.history),
    );
    setView('graphs');
    const dates = [...$(`[data-gr="${s.id}"] .gr-table tbody`).rows].map(r => r.cells[0].textContent);
    assert(
      dates.join() === [fmtDate('2099-01-02'), t('day.today').replace(/^./, c => c.toUpperCase())].join(),
      'newest first: ' + dates,
    );
    $(`[data-gr="${s.id}"] [data-del-measure][data-date="2099-01-02"]`).click();
    assert(
      !s.history.some(h => h.date === '2099-01-02') && s.dropped['2099-01-02'],
      'measurement deleted and remembered',
    );
    assert(s.date === today() && s.value === s.history[s.history.length - 1].value, 'value follows the latest left');
    assert($(`[data-gr="${s.id}"] .gr-table`).open, 'table stays open');
    recordMeasurement(s, '2099-01-02', '6');
    assert(!s.dropped && s.value === '6', 're-recording a deleted date clears it');
    return `history=${s.history.length}`;
  });
  await step('activity form + parent + validation', () => {
    openForm('activity', null, { repeat: 'once' });
    $('#f-title').value = 'Child act';
    $('#f-startDate').value = '2099-02-01';
    $('#f-dueDate').value = '2099-01-01';
    submitForm();
    const err = modal.querySelector('[data-field="dueDate"] .err').textContent;
    $('#f-dueDate').value = '2099-03-01';
    const parent = db.activities[0];
    $('#f-parent').value = parent.id;
    submitForm();
    const a = db.activities.find(x => x.title === 'Child act');
    assert(a && relsFrom(a.id, 'subactivity')[0].to === parent.id);
    return err;
  });
  await step('relation form: add, invalid, edit, delete', () => {
    const g = db.goals.find(x => x.title === 'Test goal one');
    const a = db.activities.find(x => x.title === 'Child act');
    const pick = (f, id) => {
      $(f).value = id;
      $(f).dispatchEvent(new Event('change', { bubbles: true }));
    };
    const types = () => [...$('#f-type').options].map(o => o.value);
    openForm('relation', null, { from: a.id });
    pick('#f-to', g.id);
    assert(
      types().includes('contributes') && !types().includes('subgoal') && !types().includes('measures'),
      'only fitting types: ' + types(),
    );
    $('#f-type').value = 'contributes';
    submitForm();
    const r = db.relations.find(x => x.from === a.id && x.to === g.id && x.type === 'contributes');
    assert(r, 'relation added');
    openForm('relation');
    pick('#f-from', g.id);
    pick('#f-to', g.id);
    assert(types().join() === '', 'nothing links an item to itself');
    submitForm();
    const err = modal.querySelector('[data-field="type"] .err').textContent;
    assert(modal.open && err === t('err.self'), 'self link refused');
    // A type that only fits the other way round swaps the two items.
    const g2 = db.goals.find(x => !canRelate(a.id, x.id, 'contributes'));
    pick('#f-from', g2.id);
    pick('#f-to', a.id);
    assert(types().includes('rev:contributes') && !types().includes('contributes'), 'reverse group: ' + types());
    modal.close();
    openForm('relation', r.id);
    const s = db.states[0];
    pick('#f-to', s.id);
    $('#f-type').value = 'improves';
    submitForm();
    assert(r.type === 'improves' && r.to === s.id, 'edited');
    openForm('relation', r.id);
    $('#deleteBtn').click();
    assert(!db.relations.includes(r), 'deleted');
    return err;
  });
  await step('cycle status + drag-free status changes', () => {
    setView('activities');
    const a = db.activities.find(x => x.title === 'Child act');
    const seq = [];
    for (let i = 0; i < 3; i++) {
      $(`[data-cycle="${a.id}"]`).click();
      seq.push(a.status);
    }
    return seq.join('>');
  });
  await step('context menu actions', () => {
    setView('map');
    const g = db.goals.find(x => x.title === 'Test goal one');
    openCtxMenu(g.id, 50, 50);
    const items = [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx).join(',');
    runCtxAction('status:achieved', g.id);
    assert(g.status === 'achieved');
    runCtxAction('focus', g.id);
    assert(ui.mapGoal === g.id);
    runCtxAction('highlight', g.id);
    assert(ui.mapSelected === g.id);
    runCtxAction('add:goal:subgoal', g.id);
    assert(modal.open);
    modal.close();
    runCtxAction('delete', g.id);
    assert(!findEntity(g.id) && ui.mapGoal === '' && ui.mapSelected === null, 'delete clears filters and selection');
    const a = db.activities[1];
    openCtxMenu(a.id, 10, 10);
    const aItems = [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx).join(',');
    closeCtxMenu();
    return `${items} || ${aItems}`;
  });
  await step('delete via form clears selection', () => {
    const s = db.states.find(x => x.title === 'Pages read');
    ui.mapSelected = s.id;
    openForm('state', s.id);
    $('#deleteBtn').click();
    assert(!findEntity(s.id) && ui.mapSelected === null);
  });

  await step('link lists: chosen items on top, search opens the list, goals grouped by category', () => {
    fresh('Pickers');
    const g1 = mk('goal', { title: 'Run a marathon', category: 'Health' });
    const g2 = mk('goal', { title: 'Save money', category: 'Finance' });
    const g3 = mk('goal', { title: 'Življenje brez skrbi' });
    mk('goal', { title: 'Sleep well', category: 'Health' });
    const a = mk('activity', { title: 'Train', startDate: d(0), dueDate: d(7) });
    rel(a, g1, 'contributes');
    openForm('activity', a.id);
    const pk = modal.querySelector('.picker[data-picker="goal"]');
    const list = pk.querySelector('.pick-list'),
      search = pk.querySelector('.picker-search');
    assert(!modal.querySelector('.picker input[type="checkbox"]'), 'no checkboxes in the link pickers');
    assert(list.hidden && search.getAttribute('aria-expanded') === 'false', 'list closed at first');
    const chosen = () => [...pk.querySelectorAll('[data-unpick]')].map(b => b.dataset.unpick);
    eq(chosen(), [g1.id], 'linked goal shown as chosen');
    search.focus();
    assert(!list.hidden && search.getAttribute('aria-expanded') === 'true', 'focusing the search opens the list');
    const shown = () => [...pk.querySelectorAll('.pick-opt:not([hidden])')].map(o => o.dataset.pick);
    eq(
      [...pk.querySelectorAll('.pick-group:not([hidden]) .pick-head')].map(h => h.textContent),
      ['Finance', 'Health', 'No category'],
      'category groups',
    );
    assert(!shown().includes(g1.id) && shown().length === 3, 'chosen goal not offered again');
    pk.querySelector(`.pick-opt[data-pick="${g2.id}"]`).click();
    eq(chosen(), [g1.id, g2.id], 'clicking adds it');
    assert(!list.hidden && document.activeElement === search, 'list stays open, typing goes on');
    search.value = 'zivlj';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    eq(shown(), [g3.id], 'search ignores case and accents');
    assert(pk.querySelectorAll('.pick-group:not([hidden])').length === 1, 'empty groups hidden');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert(modal.open && chosen().includes(g3.id), 'Enter adds the first match, form stays open');
    search.value = 'nothing like this';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    assert(
      !pk.querySelector('.pick-empty').hidden && pk.querySelector('.pick-empty').textContent === 'No matches',
      'no matches message',
    );
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert(document.activeElement.matches('.pick-opt'), 'arrow down moves into the list');
    document.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    assert(list.hidden && modal.open && document.activeElement === search, 'Escape closes the list, not the form');
    modal.querySelector('#f-title').focus();
    assert(list.hidden, 'leaving the search closes the list');
    pk.querySelector(`[data-unpick="${g1.id}"]`).click();
    assert(!chosen().includes(g1.id), '× removes it');
    search.focus();
    assert(shown().includes(g1.id), 'removed goal offered again');
    submitForm();
    eq(
      relsFrom(a.id, 'contributes')
        .map(r => r.to)
        .sort(),
      [g2.id, g3.id].sort(),
      'saved links',
    );
    openForm('goal', g2.id);
    const acts = modal.querySelector('.picker[data-picker="activity"]');
    assert(
      !acts.querySelector('.pick-head') &&
        acts.querySelector('[data-unpick]').closest('.tag').textContent.includes('Train'),
      'activities flat, contributing one chosen',
    );
    modal.close();
    changeLanguage('sl');
    openForm('activity', null, { repeat: 'once' });
    assert(modal.querySelector('.pick-none').textContent === I18N.sl.strings['pick.none'], 'Slovenian empty text');
    modal.close();
    changeLanguage('en');
  });
  await step('forms: Ctrl+Enter (or ⌘+Enter) saves from any field', () => {
    fresh('Ctrl Enter');
    const now = today();
    const g = mk('goal', { title: 'Fit' });
    save();
    setView('activities');
    const press = (el, mods) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...mods }));
    // A new list: Ctrl+Enter in an item saves instead of adding the next one.
    openForm('activity');
    modal.querySelector('[data-act-kind="list"]').click();
    $('#f-title').value = 'Pack';
    $('#listRows .li-input').value = 'Tent';
    $('#f-dueDate').value = dateInput(addDays(now, 3));
    press($('#listRows .li-input'), { ctrlKey: true });
    const a = db.activities.find(x => x.title === 'Pack');
    assert(a && !modal.open && a.list.length === 1, 'saved from a list item, no row added');
    eq($('#toast').textContent, t('toast.activityAdded'), 'says it was added');
    // ⌘+Enter in the details; the edit is kept.
    openForm('activity', a.id);
    $('#f-description').value = 'For the weekend';
    press($('#f-description'), { metaKey: true });
    assert(!modal.open && a.description === 'For the weekend', '⌘+Enter in a text area saves');
    // In a link picker's search it saves rather than linking the first match.
    openForm('activity', a.id);
    const search = modal.querySelector('.picker[data-picker="goal"] .picker-search');
    search.value = 'Fi';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    press(search, { ctrlKey: true });
    assert(!modal.open && !relsFrom(a.id, 'contributes').some(r => r.to === g.id), 'picker: saved, nothing linked');
    // An invalid form stays open with its errors.
    openForm('goal');
    press($('#f-title'), { ctrlKey: true });
    assert(modal.open && modal.querySelector('.field.invalid'), 'invalid: stays open');
    modal.close();
    // The kind choice has nothing to save.
    openForm('activity');
    press(modal.querySelector('[data-act-kind]'), { ctrlKey: true });
    assert(modal.open && formCtx.choose && db.activities.length === 1, 'kind choice: nothing saved');
    modal.close();
    // Plain Enter in a list item still adds the next one.
    openForm('activity', a.id);
    press($('#listRows .li-input'), {});
    assert(modal.open && $('#listRows').children.length === 2, 'plain Enter adds an item');
    modal.close();
    eq($('#saveBtn').title, t('btn.saveKey'), 'Save says its shortcut');
  });
  await step('date fields: dd/mm/yyyy typing, picker and validation', () => {
    const ok = [
      ['7/3/2026', '2026-03-07'],
      ['07/03/2026', '2026-03-07'],
      ['7.3.2026', '2026-03-07'],
      ['7. 3. 2026', '2026-03-07'],
      ['29/02/2028', '2028-02-29'],
      ['2026-03-07', '2026-03-07'],
    ];
    ok.forEach(([s, iso]) => assert(parseDateInput(s) === iso, `${s} → ${parseDateInput(s)}`));
    ['31/02/2026', '29/02/2027', '13/13/2026', '7/3/26', 'tomorrow', '', '2026-3-7'].forEach(s =>
      assert(parseDateInput(s) === null, `${s} should be rejected`),
    );
    assert(dateInput('2026-03-07') === '07/03/2026' && dateInput('') === '', 'shown as dd/mm/yyyy');

    fresh('Dates');
    changeLanguage('sl');
    openForm('activity', null, { repeat: 'once' });
    const due = $('#f-dueDate');
    assert(
      due.type === 'text' &&
        due.placeholder === 'dd/mm/llll' &&
        $('[data-field="dueDate"] .date-pick').title === 'Izberi datum',
      'Slovenian dd/mm/llll field',
    );
    const type = ch => {
      due.value += ch;
      due.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
    };
    due.value = '';
    due.focus();
    '24102026'.split('').forEach(type);
    const typed = due.value;
    assert(typed === '24/10/2026', 'slashes added while typing: ' + typed);
    due.value = '';
    '7/3/2026'.split('').forEach(type);
    assert(due.value === '7/3/2026', 'typed slashes kept: ' + due.value);
    // The calendar: Monday first, opens on the field's date, picks into the field.
    const calBtn = f => $(`[data-field="${f}"] [data-cal-open]`);
    const key = k =>
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    $('#f-startDate').value = '15/02/2026';
    calBtn('startDate').click();
    const cal1 = $('[data-field="startDate"] .cal');
    const head = cal1.querySelector('.cal-head strong').textContent;
    const weekdays = [...cal1.querySelectorAll('.cal-wd')].map(w => w.textContent);
    const blanks = cal1.querySelectorAll('.cal-grid > span:not(.cal-wd)').length;
    assert(
      calBtn('startDate').getAttribute('aria-expanded') === 'true' &&
        document.activeElement.dataset.calDay === '2026-02-15',
      'opens on the field date, day focused',
    );
    assert(
      /^pon/i.test(weekdays[0]) && /^ned/i.test(weekdays[6]) && blanks === 6,
      `Monday first: ${weekdays} blanks=${blanks}`,
    ); // 1 Feb 2026 is a Sunday
    assert(
      cal1.querySelector('[data-cal-day="2026-02-15"]').getAttribute('aria-pressed') === 'true',
      'chosen day marked',
    );
    key('ArrowRight');
    key('ArrowDown');
    key('PageDown');
    const kb = document.activeElement.dataset.calDay;
    assert(kb === '2026-03-23', 'arrow and page keys: ' + kb);
    key('ArrowLeft');
    $('[data-field="startDate"] [data-cal-move="-1"]').click();
    const back = $('[data-field="startDate"] .cal-head strong').textContent;
    $('[data-field="startDate"] [data-cal-move="1"]').click();
    assert(document.activeElement.dataset.calMove === '1' && /feb/i.test(back), 'month buttons: ' + back);
    const moved = $('[data-field="startDate"] .cal-head strong').textContent;
    $('[data-field="startDate"] [data-cal-day="2026-03-01"]').click();
    assert($('#f-startDate').value === '01/03/2026' && !$('.cal'), 'picked day fills the field and closes');
    // Focus goes to the calendar button: in the text box a phone would bring up its keyboard.
    assert(
      document.activeElement === calBtn('startDate') && calBtn('startDate').getAttribute('aria-expanded') === 'false',
      'focus back on the calendar button, not the text box',
    );
    assert(
      !String(getSelection()) && $('#f-startDate').selectionStart === $('#f-startDate').selectionEnd,
      'no text selected',
    );
    // An empty end date opens on the start date's month (also after the start was set by the calendar).
    due.value = '';
    calBtn('dueDate').click();
    const dueHead = $('[data-field="dueDate"] .cal-head strong').textContent;
    assert(document.activeElement.dataset.calDay === '2026-03-01', 'due calendar opens at the start date');
    key('Escape');
    assert(!$('.cal') && modal.open && document.activeElement === calBtn('dueDate'), 'Escape closes only the calendar');
    calBtn('dueDate').click();
    modal.dispatchEvent(new Event('cancel', { cancelable: true }));
    assert(!$('.cal') && modal.open, 'dialog cancel closes only the calendar');
    calBtn('dueDate').click();
    calBtn('startDate').click();
    assert(
      document.querySelectorAll('.cal').length === 1 && $('[data-field="startDate"] .cal'),
      'one calendar at a time',
    );
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    assert(!$('.cal'), 'click outside closes');
    calBtn('dueDate').click();
    $('[data-field="dueDate"] [data-cal-pick=""]').click();
    assert(due.value === '' && !$('.cal') && document.activeElement === calBtn('dueDate'), 'clear empties the field');
    calBtn('dueDate').click();
    $('[data-field="dueDate"] .cal-foot [data-cal-pick]').click();
    assert(due.value === dateInput(today()) && document.activeElement === calBtn('dueDate'), 'today button');
    $('#f-title').value = 'Dated activity';
    due.value = '31/02/2026';
    submitForm();
    const err = modal.querySelector('[data-field="dueDate"] .err').textContent;
    assert(modal.open && err === t('err.date'), 'impossible date rejected: ' + err);
    due.value = '7/3/2026';
    submitForm();
    const a = db.activities.find(x => x.title === 'Dated activity');
    assert(a && a.startDate === '2026-03-01' && a.dueDate === '2026-03-07', 'stored as yyyy-mm-dd');
    openForm('activity', a.id);
    const shown = [$('#f-startDate').value, $('#f-dueDate').value];
    modal.close();
    changeLanguage('en');
    openForm('goal');
    const enPh = $('#f-deadline').placeholder,
      start = $('#f-startDate').value;
    modal.close();
    assert(enPh === 'dd/mm/yyyy' && start === dateInput(today()), 'English field and today as default start');
    return `typed ${typed} | calendar ${head} → ${moved}, due opens ${dueHead}, ${weekdays.join(' ')} | edit shows ${shown.join(', ')} | sl error "${err}"`;
  });
  await step('parseNum: separators, signs and junk', () => {
    const ok = [
      ['78.5', 78.5],
      ['78,5', 78.5],
      ['1 234,5', 1234.5],
      ['1,234.5', 1234.5],
      ['1.234,5', 1234.5],
      ['−3', -3],
      ['+2', 2],
      ['.5', 0.5],
      [' 7 ', 7],
      ["1'000", 1000],
      ['0', 0],
    ];
    ok.forEach(([s, v]) => assert(parseNum(s) === v, `${s} → ${parseNum(s)}`));
    ['12abc', '', '1.2.3', '-', 'abc', null, undefined, '1,2,3'].forEach(s =>
      assert(Number.isNaN(parseNum(s)), `${s} should be NaN`),
    );
    changeLanguage('sl');
    const sl = numInput('78.5');
    changeLanguage('en');
    const en = numInput('78.5');
    assert(sl === '78,5' && en === '78.5' && numInput('') === '' && numInput(null) === '');
    return `${ok.length} valid, 8 rejected, sl input=${sl}`;
  });
});
