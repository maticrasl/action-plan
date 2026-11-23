/** Page tests: state descriptions in both languages, the sample's, state cards on Graphs and their + for a new value. */
suite(async () => {
  await step('states: the description is what is measured, in both languages', () => {
    const labels = {
      en: ['What is measured', /how you measure it/i],
      sl: ['Kaj merite', /kako jo merite/i],
    };
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      fresh(`States ${code}`);
      const s = mk('state', { title: 'Longest run', unit: 'km', description: 'My own words stay as they were.' });
      openForm('state', s.id);
      eq(modal.querySelector('[data-field="description"] label').textContent, labels[code][0], `${code} label`);
      assert(
        labels[code][1].test($('#f-description').placeholder),
        `${code} placeholder: ${$('#f-description').placeholder}`,
      );
      eq($('#f-description').value, 'My own words stay as they were.', `${code}: existing text kept`);
      submitForm();
      eq(s.description, 'My own words stay as they were.', `${code}: saved unchanged`);
      // The help no longer asks to describe where you stand today.
      assert(
        !/where you stand today|kje ste danes/i.test(t('help.view.graphs')),
        `${code}: help updated`,
      );
      assert(
        /measure|meri/i.test(t('help.view.graphs')),
        `${code}: it talks about measuring`,
      );
      deletePlan(plans.current);
    }
    changeLanguage('en');
    return labels.en[0];
  });
  await step('states: sample descriptions stay true as new values come in', () => {
    const out = [];
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      loadSample();
      eq(db.states.length, 7, `${code}: seven states`);
      for (const s of db.states) {
        assert(s.description && s.description.length > 20, `${code} ${s.title}: has a description`);
        // A lasting description does not repeat a reading: no measured value or change appears in it.
        const values = (s.history || [])
          .map(h => h.value)
          .concat(s.value)
          .filter(Boolean);
        assert(
          !values.some(v => new RegExp(`(^|\\D)${v}(\\D|$)`).test(s.description)),
          `${code} ${s.title}: no reading in “${s.description}”`,
        );
        assert(
          !/\b(so far|still|down \d|last month|doslej|še vedno|prejšnji mesec|shujšal)\b/i.test(s.description),
          `${code} ${s.title}: no snapshot wording in “${s.description}”`,
        );
      }
      out.push(db.states[0].description);
      deletePlan(plans.current);
    }
    changeLanguage('en');
    return out.join(' | ');
  });
  await step('states: + on a card asks for a new value; Edit is in its menu', () => {
    fresh('State value');
    const now = today();
    const s = mk('state', { title: 'Weight', unit: 'kg', history: [] });
    recordMeasurement(s, addDays(now, -3), '80');
    const sum = mk('state', { title: 'Run', unit: 'km', cumulative: true, scale: 'week', entries: [] });
    save();
    setView('graphs');
    const card = id => $(`[data-gr="${id}"]`),
      plus = id => card(id).querySelector('[data-add-amount]');
    plus(s.id).click();
    assert(!modal.open && $('.amount-pop'), 'a popup, not the form');
    eq(
      [
        $('.amount-pop .amount-title').textContent,
        $('.amount-pop .amount-hint').textContent,
        $('.amount-pop [data-amount-date]').value,
      ],
      [
        t('sv.title', { name: 'Weight' }),
        t('sv.latest', { value: '80 kg', date: fmtDate(addDays(now, -3)) }),
        dateInput(now),
      ],
      'title, latest value, today',
    );
    $('.amount-pop [data-amount]').value = 'lots';
    $('.amount-pop').requestSubmit();
    assert($('.amount-pop .amount-err').textContent === t('err.number'), 'not a number: refused');
    $('.amount-pop [data-amount]').value = '78,5';
    $('.amount-pop').requestSubmit();
    eq([s.value, s.date, s.history.length], ['78.5', now, 2], 'recorded as the latest');
    eq($('#toast').textContent, t('sv.saved', { value: '78.5 kg', name: 'Weight' }), 'says so');
    eq(card(s.id).querySelector('.gr-value').textContent, '78.5 kg', 'the card shows it');
    // Empty saves nothing; Escape closes.
    plus(s.id).click();
    $('.amount-pop').requestSubmit();
    assert(!$('.amount-pop') && s.history.length === 2, 'empty: nothing');
    plus(s.id).click();
    $('.amount-pop input').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    assert(!$('.amount-pop'), 'Escape closes');
    // A state that adds up asks for an amount.
    plus(sum.id).click();
    assert(
      $('.amount-pop .amount-title').textContent === t('cu.addTo', { name: 'Run' }) && !$('.amount-pop .amount-hint'),
      'an amount for one that adds up',
    );
    closeAmountPop();
    // Editing is in the card's menu.
    card(s.id).dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    );
    ctxMenu.querySelector('[data-ctx="edit"]').click();
    assert(ctxMenu.hidden && modal.open && formCtx.kind === 'state' && formCtx.id === s.id, 'Edit opens the form');
    modal.close();
    // So is adding: a value, or an amount for one that adds up; on the map too.
    const menuOn = el =>
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
    menuOn(card(s.id));
    eq(ctxMenu.querySelector('[data-ctx="value"]').textContent, t('ctx.addValue'), 'Add a value in the menu');
    ctxMenu.querySelector('[data-ctx="value"]').click();
    assert(
      ctxMenu.hidden && !modal.open && $('.amount-pop .amount-title').textContent === t('sv.title', { name: 'Weight' }),
      'it opens the popup',
    );
    closeAmountPop();
    menuOn(card(sum.id));
    eq(
      ctxMenu.querySelector('[data-ctx="value"]').textContent,
      t('ctx.addAmount'),
      'Add an amount for one that adds up',
    );
    ctxMenu.querySelector('[data-ctx="value"]').click();
    assert($('.amount-pop .amount-title').textContent === t('cu.addTo', { name: 'Run' }), 'it asks for an amount');
    closeAmountPop();
    setView('map');
    menuOn($(`[data-map-node="${s.id}"]`));
    ctxMenu.querySelector('[data-ctx="value"]').click();
    $('.amount-pop [data-amount]').value = '77';
    $('.amount-pop').requestSubmit();
    assert(s.value === '77' && s.history.length === 2, 'from the map: same day replaced');
    deletePlan(plans.current);
    return `${s.history.length} measurements`;
  });
  await step('states: a card on Graphs shows what the States view showed; one without data too', () => {
    fresh('State cards');
    const g = mk('goal', { title: 'Run a half marathon', target: '21', deadline: addDays(today(), 60) });
    const s = mk('state', { title: 'Longest run', unit: 'km', description: 'Easy pace, weekend run.', history: [] });
    recordMeasurement(s, addDays(today(), -10), '8');
    recordMeasurement(s, today(), '10');
    const bare = mk('state', { title: 'Savings', description: 'Emergency fund.' });
    const a = mk('activity', { title: 'Long run' });
    rel(s, g, 'measures');
    rel(a, s, 'improves');
    save();
    setView('graphs');
    const card = $(`[data-gr="${s.id}"]`),
      text = card.textContent;
    assert(text.includes('Easy pace, weekend run.'), 'description');
    assert(text.includes(t('states.asOf', { date: 'today' })), 'as of today');
    assert(text.includes(tp('states.improvers', 1)) && text.includes(tp('states.measurements', 2)), 'improvers and count');
    assert(card.querySelector(`.links [data-open="${g.id}"]`), 'the goal it measures');
    assert(!card.querySelector('[data-open].btn') && !card.querySelector('.gr-legend'), 'no Edit button, no legend');
    const plus = card.querySelector('.card-head [data-add-amount]');
    assert(plus && plus.getBoundingClientRect().width >= 40, 'a large + in the head');
    const empty = $(`[data-gr="${bare.id}"]`);
    assert(
      empty && !empty.querySelector('.gr-plot') && empty.querySelector('[data-add-amount]') && empty.textContent.includes('Emergency fund.'),
      'a state without data: a card with +, without a plot',
    );
    eq([...document.querySelectorAll('.nav [data-view="states"]')].length, 0, 'no States tab');
    deletePlan(plans.current);
    return 'ok';
  });
  await step('states: a saved States view opens Graphs', () => {
    prefs.set('view', 'states');
    enterUser(currentUser().id);
    eq(ui.view, 'graphs', 'Graphs instead');
    return ui.view;
  });
});
