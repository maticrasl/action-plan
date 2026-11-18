/** Page tests: states. */
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
        !/where you stand today|kje ste danes/i.test(t('help.view.states') + t('tour.states.text')),
        `${code}: help and tour updated`,
      );
      assert(
        /measure|meri/i.test(t('help.view.states')) && /measure|meri/i.test(t('tour.states.text')),
        `${code}: they talk about measuring`,
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
  await step('states: a click on a card asks for a new value; Edit is in its menu', () => {
    fresh('State value');
    const now = today();
    const s = mk('state', { title: 'Weight', unit: 'kg', history: [] });
    recordMeasurement(s, addDays(now, -3), '80');
    const sum = mk('state', { title: 'Run', unit: 'km', cumulative: true, scale: 'week', entries: [] });
    save();
    setView('states');
    const card = id => $(`.card.state[data-open="${id}"]`);
    card(s.id).click();
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
    assert(card(s.id).querySelector('.tag.state').textContent === '78.5 kg', 'the card shows it');
    // Empty saves nothing; Escape closes.
    card(s.id).click();
    $('.amount-pop').requestSubmit();
    assert(!$('.amount-pop') && s.history.length === 2, 'empty: nothing');
    card(s.id).click();
    $('.amount-pop input').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    assert(!$('.amount-pop'), 'Escape closes');
    // A state that adds up asks for an amount.
    card(sum.id).click();
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
});
