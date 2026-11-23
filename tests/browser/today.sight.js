/** Page tests: line of sight (feature 05): the vision tag on rows and goal cards, the Purpose line, the toast, "What is next?". */
suite(async () => {
  const toastText = () => $('#toast').firstChild?.textContent;
  const tag = id => $(`#view [data-open="${id}"] .tag.los`);
  // One plan, its own visions: Fit (served by "Run 5 km") under the Purpose "Good life"; Calm, unserved.
  const setup = () => {
    fresh('Line of sight');
    setAside();
    clearVisions();
    const life = mkV('Good life'),
      fit = mkV('To be fit and live healthily', [life]),
      calm = mkV('Calm', [life]);
    const run = mk('goal', { title: 'Run 5 km', visions: [fit.id] });
    const shoes = mk('activity', { title: 'Buy running shoes', dueDate: today(), status: 'doing' });
    const plain = mk('activity', { title: 'Tidy the desk', dueDate: today() });
    const daily = mk('activity', {
      title: 'Stretch',
      status: 'doing',
      repeat: { every: 1, unit: 'day' },
      checkins: {},
    });
    rel(shoes, run, 'contributes');
    rel(daily, run, 'contributes');
    save();
    saveVisions();
    return { life, fit, calm, run, shoes, plain, daily };
  };

  await step('sight: rows on Today and the Overview name the vision; tapping lands on its card', () => {
    const { fit, shoes, plain, daily } = setup();
    for (const view of ['today', 'dashboard']) {
      setView(view);
      assert(tag(shoes.id)?.textContent.includes(fit.title), `${view}: the step names its vision`);
      assert(!tag(plain.id), `${view}: a step serving no vision shows nothing`);
      assert(tag(daily.id)?.textContent.includes(fit.title), `${view}: the routine row too`);
    }
    tag(shoes.id).click();
    eq(ui.view, 'visions', 'the Visions view');
    assert($(`.card.vision[data-open="${fit.id}"]`), 'with the card');
    assert(!modal.open, 'no form opens');
    putBack();
  });

  await step('sight: with a Purpose, Today has the gold line and rows serving only it show no tag', () => {
    const { life, run, shoes } = setup();
    run.visions = [life.id];
    const other = mk('goal', { title: 'Sleep well', visions: [life.id] });
    save();
    setView('today');
    eq($('#view .today-purpose')?.textContent, t('los.purpose', { title: life.title }), 'the Purpose line');
    assert(!tag(shoes.id), 'no tag for the Purpose itself');
    assert(other, 'two goals');
    putBack();
  });

  await step('sight: no Purpose line without one; no visions at all: no tags, no lines', () => {
    const { shoes } = setup();
    mk('goal', { title: 'Unlinked' });
    save();
    setView('today');
    assert(!$('#view .today-purpose'), 'an active goal serves no vision: no Purpose');
    clearVisions();
    setView('today');
    assert(!tag(shoes.id) && !$('#view .today-purpose'), 'nothing without visions');
    setView('visions');
    assert(!$('#view .vis-unserved'), 'no lines');
    putBack();
  });

  await step('sight: ticking says what it is for; with a reward, the reward', () => {
    const { fit, shoes, plain } = setup();
    setView('dashboard');
    hideToast();
    $(`#view [data-cycle="${shoes.id}"]`).click();
    eq(shoes.status, 'done', 'done');
    eq(toastText(), t('los.done', { vision: fit.title }), 'the "for" toast');
    hideToast();
    shoes.status = 'doing';
    shoes.reward = 'a coffee';
    render();
    $(`#view [data-cycle="${shoes.id}"]`).click();
    eq(toastText(), t('reward.toast', { reward: 'a coffee.' }), 'the reward toast instead');
    hideToast();
    plain.status = 'doing';
    render();
    $(`#view [data-cycle="${plain.id}"]`).click();
    assert(!$('#toast').classList.contains('show'), 'no vision: no toast');
    putBack();
  });

  await step('sight: a long title is cut in the toast and the tag', () => {
    const { fit, shoes } = setup();
    fit.title = 'To be fit, strong and live healthily for many years to come';
    saveVisions();
    setView('dashboard');
    hideToast();
    $(`#view [data-cycle="${shoes.id}"]`).click();
    const msg = toastText();
    assert(msg.includes('…') && msg.length < t('los.done', { vision: fit.title }).length, `cut: ${msg}`);
    hideToast();
    shoes.status = 'doing';
    render();
    const el = tag(shoes.id).querySelector('.los-t');
    assert(el.scrollWidth > el.clientWidth, 'the tag ends in an ellipsis');
    putBack();
  });

  await step('sight: goal cards list the visions they serve', () => {
    const { fit, run } = setup();
    const loose = mk('goal', { title: 'Loose' });
    save();
    setView('goals');
    const card = $(`#view .card[data-open="${run.id}"]`);
    assert(
      card.textContent.includes(t('los.serves')) && card.querySelector('.tag.los')?.textContent.includes(fit.title),
      'Serves',
    );
    assert(!$(`#view .card[data-open="${loose.id}"] .tag.los`), 'none without visions');
    putBack();
  });

  await step('sight: an unserved vision asks what is next; a new goal for it takes the line away', () => {
    const { fit, calm, life, run } = setup();
    setView('visions');
    const line = id => $(`.card.vision[data-open="${id}"] .vis-unserved`);
    assert(!line(fit.id) && !line(life.id), 'served, also through a narrower vision');
    eq(line(calm.id)?.querySelector('p').textContent, t('los.unserved'), 'Calm is unserved');
    run.status = 'achieved';
    run.achievedAt = d(-3);
    save();
    render();
    eq(
      line(fit.id)?.querySelector('p').textContent,
      t('los.reached', { goal: run.title, date: fmtDay(run.achievedAt, { day: 'numeric', month: 'short' }) }),
      'the reached sentence',
    );
    run.achievedAt = d(-31);
    save();
    render();
    eq(line(fit.id)?.querySelector('p').textContent, t('los.unserved'), 'not after 30 days');
    line(calm.id).querySelector('[data-los-next]').click();
    assert(modal.open && $(`#modalBody [data-pick="${calm.id}"]`)?.hasAttribute('data-picked'), 'Calm is chosen');
    $('#f-title').value = 'Meditate daily';
    submitForm();
    assert(!line(calm.id), 'the line is gone');
    putBack();
  });

  await step('sight: both languages', () => {
    const { fit, shoes } = setup();
    setLang('sl');
    setView('today');
    assert(tag(shoes.id)?.textContent.includes(fit.title), 'the tag in Slovenian');
    setView('visions');
    assert($('#view .vis-unserved [data-los-next]').textContent === 'Kaj je naslednje?', 'the button in Slovenian');
    setLang('en');
    putBack();
  });
});
