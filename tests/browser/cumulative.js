/** Page tests: states that add up: goals per period, ticks with amounts, + on the card, totals, the form. */
suite(async () => {
  await step('cumulative: goals use the higher of this and the last period; reached only by a complete one', () => {
    fresh('Cumulative goals');
    const now = today(),
      lastWeek = addDays(now, -7);
    const s = mk('state', { cumulative: true, scale: 'month', entries: [entry(lastWeek, 20)] });
    const g = mk('goal', {
      title: 'Run 30 km a week',
      unit: 'km',
      baseline: '10',
      target: '30',
      metric: 'Weekly km',
      period: 'week',
    });
    rel(s, g, 'measures');
    refreshTotal(s);
    assert(
      goalCurrent(g) === 20 && Math.round(goalProgress(g)) === 50,
      `last week counts while this week is behind: ${goalCurrent(g)}`,
    );
    s.entries.push(entry(now, 25));
    assert(goalCurrent(g) === 25, 'this week counts once it is ahead');
    assert(!goalReached(g), 'not reached');
    s.entries.push(entry(now, 10));
    assert(goalProgress(g) === 100 && !goalReached(g), 'a strong week under way is 100 % but not reached yet');
    s.entries.push(entry(lastWeek, 11));
    assert(goalReached(g), 'a complete week at the target is');
    // A goal that goes down: a month under way only counts once it is worse than the last full one.
    const sp = mk('state', {
      cumulative: true,
      entries: [entry(addDays(calPeriod('month', now).from, -1), 350), entry(now, 50)],
    });
    const h = mk('goal', {
      title: 'Spend less',
      unit: '€',
      baseline: '400',
      target: '300',
      metric: 'Spending',
      period: 'month',
    });
    rel(sp, h, 'measures');
    assert(goalCurrent(h) === 350 && Math.round(goalProgress(h)) === 50, `last month: ${goalCurrent(h)}`);
    sp.entries.push(entry(now, 330));
    assert(goalCurrent(h) === 380, 'this month once it is worse');
    // Before entries reach back into a complete month, nothing counts: the month under way (or an empty one
    // before it) is well under target, but says nothing yet.
    const sq = mk('state', { cumulative: true, entries: [entry(now, 50)] });
    const q = mk('goal', {
      title: 'Spend less, just begun',
      unit: '€',
      baseline: '400',
      target: '300',
      metric: 'Spending',
      period: 'month',
    });
    rel(sq, q, 'measures');
    assert(
      goalCurrent(q) === 400 && goalProgress(q) === 0 && !goalReached(q),
      `first month: ${goalCurrent(q)}, ${goalProgress(q)} %`,
    );
    sq.entries.push(entry(addDays(calPeriod('month', now).from, -1), 280));
    assert(goalCurrent(q) === 280 && goalReached(q), 'a full month under target reaches it');
    // The same state counted in total by another goal.
    const k = mk('goal', {
      title: 'Spend under 1000 in all',
      unit: '€',
      baseline: '0',
      target: '1000',
      metric: 'Spending',
    });
    rel(sp, k, 'measures');
    assert(goalCurrent(k) === 730 && goalPeriod(k) === 'total' && !goalReached(k), `in total: ${goalCurrent(k)}`);
    // Goal card: the two periods side by side.
    setView('goals');
    ui.goalFilter = 'all';
    render();
    const line = $(`.card.goal[data-open="${g.id}"] .cu-periods`).textContent;
    assert(line === 'This week: 35 km · last week: 31 km', line);
    // An in-total state suggests its total as the starting value.
    const tot = mk('state', { cumulative: true, unit: '€', entries: [entry(now, 2450)] });
    const f = mk('goal', { title: 'Save 6000 more', unit: '€', baseline: '', target: '6000', metric: 'Saved' });
    rel(tot, f, 'measures');
    openForm('goal', f.id);
    assert($('[data-field="baseline"] .hint').textContent.includes('2,450 €'), 'baseline hint');
    modal.close();
    deletePlan(plans.current);
    return line;
  });
  await step('cumulative: a goal picks how it counts a state that adds up', () => {
    fresh('Goal counts');
    const now = today(),
      lastWeek = addDays(calPeriod('week', now).from, -1);
    const km = mk('state', {
      title: 'Km',
      unit: 'km',
      cumulative: true,
      scale: 'month',
      entries: [entry(lastWeek, 24), entry(now, 6)],
    });
    const g = mk('goal', {
      title: 'Run 30 a week',
      specific: 'Run thirty kilometres every week.',
      achievable: 'Three short runs.',
      relevant: 'For the marathon.',
      unit: 'km',
      baseline: '0',
      target: '30',
      metric: 'Km',
      startDate: addDays(now, -30),
      deadline: addDays(now, 60),
    });
    // A new state that adds up, nothing added yet: the goal can already pick how it counts.
    const empty = mk('state', { title: 'New km', unit: 'km', cumulative: true, entries: [] });
    const g0 = mk('goal', { title: 'Run 20 a week' });
    rel(empty, g0, 'measures');
    openForm('goal', g0.id);
    assert(
      !$('[data-field="period"]').hidden && $('[data-field="period"] .hint').textContent.includes('New km'),
      'Counts before the first amount',
    );
    modal.close();
    rel(km, g, 'measures');
    save();
    openForm('goal', g.id);
    eq(
      [...$('#f-period').options].map(o => o.value),
      ['total', 'day', 'week', 'month', 'year'],
      'Counts: in total or per period',
    );
    assert(
      $('#f-period').value === 'total' && $('[data-field="baseline"] .hint').textContent,
      'in total by default, with the baseline hint',
    );
    $('#f-period').value = 'week';
    submitForm();
    assert(g.period === 'week' && goalCurrent(g) === 24, `per week: ${goalCurrent(g)}`);
    setView('goals');
    ui.goalFilter = 'all';
    render();
    eq(
      $(`.card.goal[data-open="${g.id}"] .cu-periods`).textContent,
      'This week: 6 km · last week: 24 km',
      'goal card line',
    );
    openForm('goal', g.id);
    assert(
      $('#f-period').value === 'week' && !$('[data-field="baseline"] .hint')?.textContent,
      'per week: no baseline hint',
    );
    modal.close();
    // Several states: the most recently updated one counts, and it adds up.
    const old = mk('state', { title: 'Old', history: [] });
    recordMeasurement(old, addDays(now, -20), '3');
    rel(old, g, 'measures');
    openForm('goal', g.id);
    assert(!$('[data-field="period"]').hidden && measuringState(g) === km, 'the newer state adds up: Counts shown');
    modal.close();
    // Switched to plain: the period stays on the goal but is not used, and Counts is not shown.
    convertState(km, false);
    save();
    openForm('goal', g.id);
    assert($('[data-field="period"]').hidden, 'no Counts for a plain state');
    $('#f-target').value = '31';
    submitForm();
    assert(g.period === 'week' && goalCurrent(g) === Number(stateValue(km)), `kept, unused: ${goalCurrent(g)}`);
    deletePlan(plans.current);
    return g.period;
  });
  await step(
    'cumulative: a tick asks how much; untick, delete and an amount on the state keep both in step',
    async () => {
      fresh('Cumulative routines');
      const now = today(),
        y = addDays(now, -1);
      const run = mk('activity', {
        title: 'Run',
        startDate: addDays(now, -30),
        repeat: { every: 1, unit: 'week', times: 3 },
        checkins: {},
      });
      const km = mk('state', { title: 'Km', unit: 'km', cumulative: true, scale: 'week', entries: [] });
      const longest = mk('state', { title: 'Longest', history: [] });
      rel(run, km, 'improves');
      rel(run, longest, 'improves');
      save();
      setView('activities');
      const day = iso => $(`.card.routine[data-open="${run.id}"] [data-checkin][data-date="${iso}"]`);
      day(now).click();
      const pop = $('.amount-pop');
      assert(
        pop &&
          pop.querySelectorAll('[data-amount]').length === 1 &&
          document.activeElement === pop.querySelector('[data-amount]'),
        'one field (plain states are not asked), focused',
      );
      assert(!checkedOn(run, now), 'nothing ticked yet');
      pop.querySelector('[data-amount]').value = 'abc';
      pop.requestSubmit();
      assert(
        $('.amount-pop .amount-err').textContent === t('err.number') && !km.entries.length,
        'a wrong number is refused',
      );
      $('.amount-pop [data-amount]').value = '7,5';
      $('.amount-pop').requestSubmit();
      assert(!$('.amount-pop') && checkedOn(run, now), 'ticked');
      eq(
        km.entries.map(e => [e.date, e.amount, e.routine]),
        [[now, '7.5', run.id]],
        'entry tagged with the routine',
      );
      assert(!longest.history.length, 'plain state untouched');
      // Escape (or "Just tick") only ticks.
      if (runsOn(run, y)) {
        ui.rtWeek[run.id] = mondayOf(y);
        render();
        day(y).click();
        $('.amount-pop [data-amount]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert(checkedOn(run, y) && km.entries.length === 1, 'Escape ticks only');
        day(y).click();
        assert(!checkedOn(run, y) && !$('.amount-pop'), 'unticking asks nothing');
      }
      // A click elsewhere leaves it unticked.
      ui.rtWeek = {};
      render();
      // Unticking removes the routine's amounts that day.
      day(now).click();
      assert(
        !checkedOn(run, now) && !km.entries.length && Object.keys(km.droppedEntries).length === 1,
        'untick drops the entry, remembered for sync',
      );
      assert(km.value === '', 'total follows');
      // An amount added on the state ticks the routine, tagged.
      const e1 = addEntry(km, y, 5);
      assert(checkedOn(run, y) && e1.routine === run.id, 'entry on the state ticks the routine');
      const e2 = addEntry(km, y, 3);
      deleteEntry(km, e1.id);
      assert(checkedOn(run, y), 'another entry that day keeps the tick');
      deleteEntry(km, e2.id);
      assert(!checkedOn(run, y), 'deleting the last one unticks');
      // Not before the routine starts, and not in the future.
      const early = addEntry(km, addDays(now, -60), 4),
        later = addEntry(km, addDays(now, 3), 4);
      assert(
        !checkedOn(run, addDays(now, -60)) && !early.routine && !later.routine,
        'outside the routine’s days: no tick, no tag',
      );
      // With two routines feeding it, an entry ticks both, tagged with neither.
      const bike = mk('activity', {
        title: 'Bike',
        startDate: addDays(now, -30),
        repeat: { every: 1, unit: 'week', times: 2 },
        checkins: {},
      });
      rel(bike, km, 'improves');
      const both = addEntry(km, now, 10);
      assert(checkedOn(run, now) && checkedOn(bike, now) && !both.routine, 'two routines: both ticked, untagged');
      // Overview rows ask the same (a routine ticked today is not on the overview).
      setView('dashboard');
      assert(!$(`.routine-row[data-open="${bike.id}"]`), 'ticked today: not on the overview');
      setView('activities');
      $(`.card.routine[data-open="${bike.id}"] [data-checkin][data-date="${now}"]`).click();
      assert(!checkedOn(bike, now) && !$('.amount-pop'), 'unticking asks nothing');
      setView('dashboard');
      $(`.routine-row[data-open="${bike.id}"] [data-checkin]`).click();
      assert($('.amount-pop'), 'ticking from the overview asks');
      $('.amount-pop [data-amount-skip]').click();
      assert(checkedOn(bike, now) && !$('.amount-pop'), '"Just tick"');
      deletePlan(plans.current);
      return `${km.entries.length} entries left`;
    },
  );
  await step('cumulative: + on the state card adds an amount with its date', () => {
    fresh('Cumulative card');
    const s = mk('state', { title: 'Saved', unit: '€', cumulative: true, entries: [] });
    save();
    setView('graphs');
    assert(!$(`[data-gr="${s.id}"] .meta`), 'no meta row');
    $(`[data-add-amount="${s.id}"]`).click();
    assert(
      !modal.open && $('.amount-pop [data-amount-date]').value === dateInput(today()),
      'opens by the button, not the form; today',
    );
    $('.amount-pop [data-amount]').value = '120';
    $('.amount-pop [data-amount-date]').value = '31/02/2026';
    $('.amount-pop').requestSubmit();
    assert($('.amount-pop .amount-err').textContent === t('err.date'), 'a wrong date is refused');
    $('.amount-pop [data-amount-date]').value = '01/02/2026';
    $('.amount-pop').requestSubmit();
    eq(
      s.entries.map(e => [e.date, e.amount]),
      [['2026-02-01', '120']],
      'added',
    );
    assert($('#toast').textContent === t('cu.added', { value: '120 €', name: 'Saved' }), $('#toast').textContent);
    const card = $(`[data-gr="${s.id}"]`);
    assert(
      card.querySelector('.gr-value').textContent === '120 € in total' &&
        document.activeElement === $(`[data-add-amount="${s.id}"]`),
      'total on the card, focus back on +',
    );
    // Empty adds nothing; a click elsewhere closes.
    $(`[data-add-amount="${s.id}"]`).click();
    $('.amount-pop').requestSubmit();
    assert(!$('.amount-pop') && s.entries.length === 1, 'empty: nothing');
    $(`[data-add-amount="${s.id}"]`).click();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    assert(!$('.amount-pop'), 'click elsewhere closes');
    deletePlan(plans.current);
    return card.querySelector('.gr-value').textContent;
  });
  await step('cumulative: the card shows the total, and this period’s sum when the graph shows periods', () => {
    fresh('Cumulative scale card');
    const s = mk('state', {
      title: 'Run',
      unit: 'km',
      cumulative: true,
      scale: 'week',
      entries: [entry(addDays(calPeriod('week', today()).from, -1), 12)],
    });
    save();
    setView('graphs');
    const card = () => $(`[data-gr="${s.id}"]`);
    eq(card().querySelector('.gr-value').textContent, '0 km this week', 'nothing yet this week');
    eq(scaleText(s, 'week'), '0 km this week', 'scaleText');
    s.scale = 'total';
    render();
    const text = card().querySelector('.gr-value').textContent;
    eq(text, '12 km in total', 'in total: the total');
    deletePlan(plans.current);
    return text;
  });
  await step('cumulative: the form switches between adding up and single values, both ways', () => {
    fresh('Cumulative form');
    const now = today();
    const s = mk('state', { title: 'Pages', history: [] });
    recordMeasurement(s, addDays(now, -2), '10');
    recordMeasurement(s, now, '20');
    save();
    openForm('state', s.id);
    const change = (sel, v) => {
      $(sel).value = v;
      $(sel).dispatchEvent(new Event('change', { bubbles: true }));
    };
    assert($('[data-field="value"] label').textContent === t('f.value') && !$('#addsUpHint').textContent, 'plain form');
    eq(
      [...$('#f-addsUp').options].map(o => o.value),
      ['', 'yes'],
      'adds up: no or yes',
    );
    change('#f-addsUp', 'yes');
    assert(
      $('[data-field="value"] label').textContent === t('cu.addAmount') &&
        $('#addsUpHint').textContent === t('cu.toCumulative'),
      'labels follow',
    );
    let asked = '';
    window.confirm = m => {
      asked = m;
      return false;
    };
    submitForm();
    assert(
      asked === t('cu.confirmToCumulative', { name: 'Pages' }) && !s.cumulative && modal.open,
      'asks first; cancelling keeps it',
    );
    window.confirm = () => true;
    $('#f-value').value = '5';
    submitForm();
    assert(
      s.cumulative === true && s.entries.length === 3 && stateScale(s) === 'total',
      `measurements became entries, plus the new amount: ${s.entries.length}`,
    );
    eq(
      entriesOf(s)
        .filter(e => e.date === now)
        .map(e => e.amount)
        .sort(),
      ['20', '5'],
      'today: two entries',
    );
    // Saving again keeps the graph's scale and the entries.
    s.scale = 'month';
    openForm('state', s.id);
    assert($('#entryList') && !$('#entryList').hidden && $('#f-addsUp').value === 'yes', 'entry list');
    submitForm();
    assert(s.cumulative === true && s.scale === 'month' && s.entries.length === 3, 'scale and entries kept');
    // Marking an entry deletes it on saving, not on cancelling.
    openForm('state', s.id);
    const first = $('[data-drop-entry]');
    first.click();
    assert(
      first.getAttribute('aria-pressed') === 'true' && first.closest('.entry').classList.contains('dropped'),
      'marked',
    );
    modal.close();
    assert(s.entries.length === 3, 'cancel keeps it');
    openForm('state', s.id);
    $(`[data-drop-entry="${first.dataset.dropEntry}"]`).click();
    submitForm();
    assert(s.entries.length === 2 && s.droppedEntries[first.dataset.dropEntry], 'save deletes it');
    // Back to single values: each day's amounts add up.
    s.entries.push(entry(now, 1.5));
    openForm('state', s.id);
    change('#f-addsUp', '');
    assert($('#addsUpHint').textContent === t('cu.toPlain'), 'hint');
    submitForm();
    assert(!s.cumulative, 'plain again');
    const todayValue = s.history.find(h => h.date === now).value;
    assert(stateValue(s) === s.value && s.date === stateDate(s), 'value follows its history');
    deletePlan(plans.current);
    return `today ${todayValue}`;
  });
});
