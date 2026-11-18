/** Page tests: help mode's tips in every view, and the tour's steps. */
suite(async () => {
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
