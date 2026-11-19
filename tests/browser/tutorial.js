/** Page tests: the language picker on a first visit, help mode's tips in every view, the Show me ring. */
suite(async () => {
  await step('first visit: language picker before the welcome card', () => {
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

    // A plan with content keeps its name; Continue shows the welcome card in the chosen language.
    mk('goal', { title: 'Keep my name' });
    save();
    chooseLanguage(showWelcome);
    $('[data-lang-pick="en"]').click();
    assert(currentPlan().name === I18N.sl.strings['plan.defaultName'], 'plan with items not renamed');
    $('[data-lang-done]').click();
    assert(!$('.lang-pick') && $('#welcomeTitle').textContent === t('welcome.title'), 'welcome card in English');
    closeWelcome();
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
  await step('show me: the ring sits on its target, also inside a scrolled map, and goes on the next press', () => {
    setView('map');
    const wrap = $('#view .map-wrap');
    wrap.scrollLeft = wrap.scrollWidth;
    wrap.scrollTop = wrap.scrollHeight;
    const sels = ['#view .map-wrap .node.activity'];
    assert(spotlight(sels), 'ring shown');
    const ring = $('.spot-ring').getBoundingClientRect(),
      el = firstVisible(sels).getBoundingClientRect(),
      w = wrap.getBoundingClientRect();
    const cx = ring.left + ring.width / 2,
      cy = ring.top + ring.height / 2;
    const inside = (b, pad) => cx >= b.left - pad && cx <= b.right + pad && cy >= b.top - pad && cy <= b.bottom + pad;
    assert(ring.width > 0 && inside(el, SPOT_PAD) && inside(w, 0), 'ring on the node, inside the map');
    press('Escape');
    assert(!$('.spot-ring'), 'Esc removes it');
    assert(!spotlight(['#nothing-here']), 'nothing to point at: no ring');
    return `ring ${Math.round(ring.width)}x${Math.round(ring.height)}`;
  });
});
