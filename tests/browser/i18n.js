/** Page tests: English and Slovenian: every view in both, plurals, fallbacks, today/tomorrow/yesterday. */
suite(async () => {
  loadSample(); // the views below draw the sample plan
  for (const code of ['en', 'sl']) {
    await step(`views render with sample (${code})`, () => {
      changeLanguage(code);
      return views
        .map(v => {
          setView(v);
          assert($('#view').children.length, v + ' empty');
          return `${v}=${fp()}`;
        })
        .join(' ');
    });
  }
  changeLanguage('en');

  await step('i18n: plurals, fallbacks and language detection', () => {
    const forms = code => {
      changeLanguage(code);
      return [1, 2, 3, 5, 101, 102, 104].map(n => tp('states.measurements', n)).join(', ');
    };
    const sl = forms('sl'),
      en = forms('en');
    eq(sl, '1 meritev, 2 meritvi, 3 meritve, 5 meritev, 101 meritev, 102 meritvi, 104 meritve', 'Slovenian plurals');
    assert(en.startsWith('1 measurement, 2 measurements'), 'English plurals');
    assert(t('no.such.key') === 'no.such.key', 'missing key falls back to the key');
    assert(fill('{a} and {b}', { a: 1 }) === '1 and {b}', 'unknown placeholder kept');
    I18N.sl.strings['__only.en'] = undefined;
    I18N.en.strings['__only.en'] = 'English text';
    changeLanguage('sl');
    const fb = t('__only.en');
    changeLanguage('en');
    delete I18N.sl.strings['__only.en'];
    delete I18N.en.strings['__only.en'];
    assert(fb === 'English text', 'missing translation falls back to English');
    localStorage.setItem(LANG_KEY, 'sl');
    const saved = detectLang();
    localStorage.setItem(LANG_KEY, 'xx');
    const bad = detectLang();
    localStorage.setItem(LANG_KEY, 'en');
    assert(saved === 'sl' && I18N[bad], 'detectLang');
    return sl;
  });
  await step('dates: today, tomorrow and yesterday where an item’s date is shown, in both languages', () => {
    const now = today();
    eq(
      [-1, 0, 1, 2].map(n => fmtRel(addDays(now, n))),
      ['yesterday', 'today', 'tomorrow', fmtDate(addDays(now, 2))],
      'words for the three days only',
    );
    eq(
      [fmtRel(now, true), fmtRel(''), fmtSpan(now, addDays(now, 1), true)],
      ['Today', '', 'Today – tomorrow'],
      'capitalised alone; a span',
    );
    fresh('Relative dates');
    const due = mk('activity', { title: 'Due', startDate: addDays(now, -5), dueDate: addDays(now, 1) });
    const done = mk('activity', {
      title: 'Done',
      status: 'done',
      startDate: addDays(now, -5),
      dueDate: addDays(now, -1),
    });
    const s = mk('state', { title: 'Weight', unit: 'kg', history: [] });
    recordMeasurement(s, now, '80');
    save();
    setView('activities');
    const tags = id => [...$(`[data-open="${id}"]`).querySelectorAll('.tag')].map(x => x.textContent);
    assert(
      tags(due.id).includes('Tomorrow') && tags(done.id).includes('Yesterday'),
      'deadline tags: ' + tags(due.id) + ' / ' + tags(done.id),
    );
    setView('states');
    assert(
      $(`.card.state[data-open="${s.id}"]`).textContent.includes(t('states.asOf', { date: 'today' })),
      'As of today',
    );
    changeLanguage('sl');
    assert($(`.card.state[data-open="${s.id}"]`).textContent.includes('Izmerjeno danes'), 'Izmerjeno danes');
    eq(
      [-1, 0, 1].map(n => fmtRel(addDays(now, n), true)),
      ['Včeraj', 'Danes', 'Jutri'],
      'Slovenian words',
    );
    changeLanguage('en');
    deletePlan(plans.current);
    return fmtSpan(now, addDays(now, 1), true);
  });
});
