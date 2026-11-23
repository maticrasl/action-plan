/** Page tests: the planned reward (feature 25): the field, the toast at the tick, the line on the card. */
suite(async () => {
  const toastText = () => $('#toast').textContent;
  const said = r => toastText().includes(r);
  const now = today();

  await step('activities: the reward saves, shows on the card, and ticking to Done says it', () => {
    fresh('Reward');
    setView('activities');
    openForm('activity', null, { repeat: '' });
    $('#modalBody [data-act-kind="once"]')?.click();
    $('#f-title').value = 'Write the CV';
    $('#f-dueDate').value = dateInput(addDays(now, 7));
    eq($('#f-reward').maxLength, 120, 'at most 120 characters');
    $('#f-reward').value = '  have a <b>coffee</b> on the balcony  ';
    submitForm();
    const a = db.activities[0];
    eq(a.reward, 'have a <b>coffee</b> on the balcony', 'trimmed, markup kept as typed');
    render();
    const card = $(`#view [data-open="${a.id}"]`);
    assert(card.textContent.includes(t('reward.card', { reward: a.reward })), 'the card says it');
    a.status = 'doing';
    render();
    hideToast();
    $(`#view [data-cycle="${a.id}"]`).click();
    eq(a.status, 'done', 'done');
    eq(toastText(), t('reward.toast', { reward: `${a.reward}.` }), 'the reward toast');
    hideToast();
    $(`#view [data-cycle="${a.id}"]`).click();
    assert(!said('coffee'), 'unticking says nothing about it');
    openForm('activity', a.id);
    $('#f-reward').value = '';
    submitForm();
    assert(!('reward' in a), 'emptied: no field');
  });

  await step('activities: a list’s last item says the reward; the menu’s Done too', () => {
    const list = mk('activity', {
      title: 'Pack',
      reward: 'watch a film!',
      list: [
        { id: 'i1', text: 'Shoes' },
        { id: 'i2', text: 'Coat' },
      ],
    });
    save();
    hideToast();
    tickListItem(list.id, 'i1');
    assert(!said('film'), 'not before the last item');
    tickListItem(list.id, 'i2');
    eq(toastText(), t('reward.toast', { reward: 'watch a film!' }), 'no extra stop after "!"');
    const step2 = mk('activity', { title: 'Call', reward: 'rest' });
    save();
    openCtxMenu(step2.id, 10, 10);
    $('#ctxMenu [data-ctx="status:done"]').click();
    eq(toastText(), t('reward.toast', { reward: 'rest.' }), 'from the menu');
  });

  await step('routines: today says the reward, a met week both, a past day only the plain message', () => {
    const daily = mk('activity', { title: 'Walk', reward: 'a cup of tea', repeat: { days: [0, 1, 2, 3, 4, 5, 6] } });
    save();
    hideToast();
    toggleCheckin(daily.id, now);
    eq(toastText(), t('reward.toast', { reward: 'a cup of tea.' }), 'today');
    toggleCheckin(daily.id, now);
    hideToast();
    toggleCheckin(daily.id, addDays(now, -1));
    assert(!said('tea'), 'a past day: the moment has passed');
    const weekly = mk('activity', { title: 'Swim', reward: 'sauna', repeat: { times: 1, per: 'week' } });
    save();
    toggleCheckin(weekly.id, now);
    eq(toastText(), t('reward.toastWith', { base: t('rt.metWeek'), reward: 'sauna.' }), 'week met: both');
  });

  await step('activities: the sample plan’s running routine has a reward', () => {
    loadSample();
    eq(
      db.activities.filter(a => a.reward).map(a => a.reward),
      [I18N[lang].sample.activities.find(x => x.reward).reward],
      'one routine',
    );
    assert(isRoutine(db.activities.find(a => a.reward)), 'a routine');
  });

  await step('routines: a tick that asks how much says the reward after the amount', () => {
    fresh('Reward amount');
    const s = mk('state', { title: 'Distance', unit: 'km', cumulative: true, entries: [] });
    const run = mk('activity', { title: 'Run', reward: 'stretch', repeat: { days: [0, 1, 2, 3, 4, 5, 6] } });
    rel(run, s, 'improves');
    save();
    render();
    hideToast();
    toggleCheckin(run.id, now, $('#view') || document.body);
    assert($('.amount-pop'), 'asks how much');
    assert(!said('stretch'), 'not yet');
    $('.amount-pop [data-amount-skip]').click();
    eq(toastText(), t('reward.toast', { reward: 'stretch.' }), 'after the amount is skipped');
  });
});
