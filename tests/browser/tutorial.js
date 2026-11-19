/** Page tests: the language picker on a first visit, help mode's tips in every view, the tour's steps. */
suite(async () => {
  await step('first visit: language picker before the tour', () => {
    changeLanguage('en');
    let done = 0;
    chooseLanguage(() => done++);
    const card = $('.lang-pick');
    assert(
      card && $('.lang-pick-block') && document.activeElement === $('[data-lang-done]'),
      'picker open, Continue focused',
    );
    const options = [...card.querySelectorAll('[data-lang-pick]')]
      .map(b => `${b.dataset.langPick}=${b.textContent}`)
      .join(' ');
    assert(
      card.querySelector('[data-lang-pick="en"]').getAttribute('aria-pressed') === 'true',
      'current language marked',
    );
    card.querySelector('[data-lang-pick="sl"]').click();
    assert(lang === 'sl' && localStorage.getItem(LANG_KEY) === 'sl', 'language switched and saved');
    assert(
      $('#langPickTitle').textContent === 'Izberite jezik' &&
        card.querySelector('[data-lang-pick="sl"]').getAttribute('aria-pressed') === 'true',
      'card redrawn in Slovenian',
    );
    assert(currentPlan().name === I18N.sl.strings['plan.defaultName'], 'empty starter plan renamed');
    const tabs = [];
    for (let i = 0; i < card.querySelectorAll('button').length + 1; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      tabs.push(document.activeElement.closest('.lang-pick') ? 'in' : 'out');
    }
    assert(!tabs.includes('out'), 'Tab stays in the card');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!$('.lang-pick') && !$('.lang-pick-block') && done === 1, 'Escape closes and continues');

    // A plan with content keeps its name; Continue starts the tour in the chosen language.
    mk('goal', { title: 'Keep my name' });
    save();
    chooseLanguage(startTour);
    $('[data-lang-pick="en"]').click();
    assert(currentPlan().name === I18N.sl.strings['plan.defaultName'], 'plan with items not renamed');
    $('[data-lang-done]').click();
    assert(
      !$('.lang-pick') && tour.step === 0 && $('#tourTitle').textContent === t('tour.about.title'),
      'tour starts in English',
    );
    assert(
      $('[data-tour="next"]').textContent === t('tour.next') && !$('[data-tour="back"]'),
      'about slide first, Next',
    );
    assert(t('tour.about.text').includes('SMART'), 'describes the app');
    $('[data-tour="next"]').click();
    assert(
      $('#tourTitle').textContent === t('tour.welcome.title') &&
        $('[data-tour="next"]').textContent === t('tour.start'),
      'then the tour intro with Start',
    );
    endTour(false);
    return options;
  });

  loadSample(); // help tips decorate the sample plan's items
  await step('help mode decorates views', () => {
    setHelp(true);
    // By Sunday every sample routine has met its week; untick one so the overview lists a routine any day.
    const cook = db.activities.find(a => a.repeat?.times === 5),
      kept = cook.checkins;
    cook.checkins = {};
    const seen = new Set();
    const per = views.map(v => {
      setView(v);
      $('#view')
        .querySelectorAll('[data-help-tip]')
        .forEach(d => seen.add(d.dataset.helpTip));
      return `${v}:${$('#view').querySelectorAll('[data-help-tip]').length}`;
    });
    cook.checkins = kept;
    const missing = HELP_TIPS.map(h => h.key).filter(k => !seen.has(k));
    assert(!missing.length, 'tips never shown: ' + missing);
    const dot = $('[data-help-tip]');
    dot.click();
    assert($('#helpTip'), 'tip opens');
    dot.click();
    assert(!$('#helpTip'), 'tip closes');
    setHelp(false);
    return per.join(' ');
  });
  await step('Escape: closes a tip first, then help mode; not while a dialog is open', () => {
    const esc = () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    setView('goals');
    setHelp(true);
    $('[data-help-tip]').click();
    esc();
    assert(!$('#helpTip') && ui.help, 'first Escape closes only the tip');
    $('#modal').showModal();
    esc();
    assert(ui.help, 'help stays on while a dialog is open');
    $('#modal').close();
    esc();
    assert(!ui.help && $('#helpBtn').getAttribute('aria-pressed') === 'false', 'next Escape ends help mode');
  });
  await step('tour: every step target resolves', async () => {
    setView('dashboard');
    const planCount = plans.list.length;
    startTour();
    const res = [];
    for (let i = 0; i < tour.steps.length; i++) {
      showStep(i);
      const s = tour.steps[i];
      const ok = !s.target || !!firstVisible(s.target);
      res.push(`${s.key}${s.target ? '=' + s.target.join('|') : ''}${ok ? '' : '!MISSING'}`);
      assert(ok, 'target missing for ' + s.key);
      assert(
        $('.tour-card h2').textContent && !$('.tour-card h2').textContent.startsWith('tour.'),
        'title for ' + s.key,
      );
      // The spotlight sits on the target and inside the map it may be in, also when the map was
      // scrolled so the target was out of sight. (Read from its style: it glides there.)
      const spotOk = () => {
        const el = firstVisible(s.target),
          st = $('.tour-spot').style;
        if (!el || el.closest('.topbar, .nav')) return;
        const spot = {
          left: parseFloat(st.left),
          top: parseFloat(st.top),
          width: parseFloat(st.width),
          height: parseFloat(st.height),
        };
        const r = el.getBoundingClientRect(),
          w = el.parentElement.closest('.map-wrap, .tl-scroll')?.getBoundingClientRect() || r;
        const cx = spot.left + spot.width / 2,
          cy = spot.top + spot.height / 2;
        const inside = (b, pad) =>
          cx >= b.left - pad && cx <= b.right + pad && cy >= b.top - pad && cy <= b.bottom + pad;
        assert(
          spot.width > 0 && inside(r, SPOT_PAD) && inside(w, 0),
          `spotlight on the target for ${s.key}: spot ${JSON.stringify(spot)} target ${JSON.stringify(r)}`,
        );
      };
      spotOk();
      const wrap = firstVisible(s.target)?.parentElement.closest('.map-wrap');
      if (wrap) {
        wrap.scrollLeft = wrap.scrollWidth;
        wrap.scrollTop = wrap.scrollHeight;
        showStep(i);
        spotOk();
      }
    }
    $('[data-tour="finish"]').click();
    assert(tour.step === -1 && plans.list.length === planCount, 'tour plan removed');
    const skipped = TOUR_STEPS.filter(s => !tour.steps.includes(s)).map(s => s.key);
    return `steps[${res.join(', ')}] optional-skipped[${skipped}]`;
  });
});
