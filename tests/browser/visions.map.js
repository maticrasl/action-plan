/** Page tests: visions on the map, and the glow of what serves one in every view. */
suite(async () => {
  await step('visions: the map – a band above goals, clouds, lines, hiding unrelated visions, linking', () => {
    clearVisions();
    fresh('Vision map');
    const A = mkV('Health'),
      B = mkV('Fitness', [A]),
      C = mkV('Unrelated');
    const g = mk('goal', { title: 'Run', visions: [B.id], deadline: d(30) }),
      g2 = mk('goal', { title: 'Read', deadline: d(40) });
    const a = mk('activity', { title: 'Train', dueDate: d(5) });
    rel(a, g, 'contributes');
    save();
    saveVisions();
    setView('map');
    const svg = $('.map-wrap svg');
    eq(
      [...svg.querySelectorAll('.band')].map(b => b.classList[1]),
      ['vision', 'goal', 'activity'],
      'visions on top',
    );
    const y = id =>
      Number(
        svg
          .querySelector(`[data-map-node="${id}"]`)
          .getAttribute('transform')
          .match(/,([\d.]+)\)/)[1],
      );
    assert(y(A.id) < y(B.id) && y(B.id) < y(g.id), 'the broader vision above the narrower, both above goals');
    assert(
      svg.querySelectorAll('.node.vision').length === 3 && !svg.querySelector('.node.vision use'),
      'visions are clouds, not glass',
    );
    assert(svg.querySelector('#vision-cloud') && svg.querySelector('#vision-glow'), 'their filters are defined');
    eq(
      getComputedStyle(svg.querySelector(`[data-map-node="${B.id}"] rect.cloud`)).filter.includes('url'),
      true,
      'with blurred edges',
    );
    assert(
      svg.querySelector(`[data-map-node="${B.id}"]`).classList.contains('reached') &&
        !svg.querySelector(`[data-map-node="${C.id}"]`).classList.contains('reached'),
      'reached visions are brighter',
    );
    assert(
      svg.querySelector(`[data-rel-edit="${visionRelId(g.id, B.id)}"]`) &&
        svg.querySelector(`[data-rel-edit="${visionRelId(B.id, A.id)}"]`),
      'lines to visions',
    );
    // Glow on what works toward a vision.
    assert(
      svg.querySelector(`[data-map-node="${g.id}"]`).classList.contains('vglow') &&
        svg.querySelector(`.vglow-halos [data-halo="${a.id}"]`),
      'the goal and its activity glow',
    );
    // The glow lies under every line and box: its layer comes before them all.
    const layer = svg.querySelector('.vglow-halos');
    const lineLayer = svg.querySelector('.vglow-lines');
    assert(
      lineLayer &&
        !svg.querySelector('.edge-g .edge-vglow') &&
        [...svg.querySelectorAll('.edge-g, .node')].every(
          x => lineLayer.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      'lines glow in a layer under all lines and boxes',
    );
    assert(
      parseFloat(getComputedStyle(lineLayer.querySelector('.edge-vglow')).strokeWidth) >= 12 &&
        getComputedStyle(lineLayer).filter.includes('vision-line-glow'),
      'a wide, soft glow',
    );
    assert(
      svg.querySelector('#vision-glow feComposite[operator="out"]'),
      "the boxes' glow is cut away inside every box",
    );
    assert(
      !svg.querySelector('.node .node-vglow') &&
        [...svg.querySelectorAll('.edge-g, .node')].every(
          x => layer.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      'the glow is drawn under all lines and boxes',
    );
    assert(!svg.querySelector(`[data-map-node="${g2.id}"]`).classList.contains('vglow'), 'an unrelated goal does not');
    assert(
      svg.querySelector(`[data-rel-edit="${db.relations[0].id}"]`).classList.contains('vglow') &&
        svg.querySelector(`.vglow-lines [data-line-glow="${visionRelId(g.id, B.id)}"]`),
      'and the lines between them',
    );
    // Folding the goals hides the goal → vision lines, not the vision → vision ones.
    $('[data-map-fold="goal"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(
      !$(`[data-rel-edit="${visionRelId(g.id, B.id)}"]`) && $(`[data-rel-edit="${visionRelId(B.id, A.id)}"]`),
      'goal → vision lines hidden with the goals',
    );
    $('[data-map-fold="goal"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert($(`[data-rel-edit="${visionRelId(g.id, B.id)}"]`), 'and back');
    // Hide unrelated visions.
    $('[data-hide-visions]').click();
    eq(
      [...$('.map-wrap svg').querySelectorAll('.node.vision')].map(n => n.dataset.mapNode).sort(),
      ids([A, B]),
      'only what goals serve, and above it',
    );
    assert(
      prefs.get('hideVisions') === true && $('[data-hide-visions]').getAttribute('aria-pressed') === 'true',
      'remembered',
    );
    $('[data-hide-visions]').click();
    eq($('.map-wrap svg').querySelectorAll('.node.vision').length, 3, 'shown again');
    // One goal picked: only its visions.
    ui.mapGoal = g2.id;
    render();
    eq($('.map-wrap svg').querySelectorAll('.node.vision').length, 0, 'a goal serving none: no visions');
    ui.mapGoal = g.id;
    render();
    eq(
      [...$('.map-wrap svg').querySelectorAll('.node.vision')].map(n => n.dataset.mapNode).sort(),
      ids([A, B]),
      'its visions and those above',
    );
    ui.mapGoal = '';
    render();
    // Linking by tapping (or dragging).
    assert(
      canLink(g2.id, C.id) &&
        canLink(C.id, g2.id) &&
        !canLink(a.id, A.id) &&
        !canLink(A.id, B.id) &&
        canLink(C.id, A.id),
      'which links fit',
    );
    linkItems(C.id, g2.id);
    eq(g2.visions, [C.id], 'vision then goal: the goal serves it');
    assert(
      $('#toast').textContent.includes(t('map.visionLinked', { a: 'Read', b: 'Unrelated' })),
      'said so, goal first',
    );
    linkItems(g2.id, C.id);
    assert($('#toast').textContent.includes(t('err.relExists')), 'not twice');
    linkItems(C.id, A.id);
    eq(C.parents, [A.id], 'vision onto vision: serves it');
    linkItems(A.id, C.id);
    assert($('#toast').textContent.includes(t('err.visionLoop')) && !A.parents.length, 'no loops');
    linkItems(a.id, A.id);
    assert($('#toast').textContent.includes(t('err.visionGoalOnly')) && !('visions' in a), 'only goals serve visions');
    // Selecting a line, editing and removing it.
    const line = visionRelId(g.id, B.id);
    $(`[data-rel-edit="${line}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    assert(
      ui.mapRel === line &&
        $('.map-rel-selection').textContent.includes('Run') &&
        $('.map-rel-selection').textContent.includes(t('rel.serves')),
      'selected, and named',
    );
    openForm('relation', line);
    assert(
      modal.open && $('#modalTitle').textContent === t('edit.vision') && $('#f-title').value === 'Fitness',
      'editing it opens the vision',
    );
    modal.close();
    openRelMenu(line, 20, 20);
    assert(!ctxMenu.hidden && ctxMenu.querySelector('[data-ctx="rel-remove"]'), 'it has a menu');
    closeCtxMenu();
    $(`[data-rel-remove="${line}"]`).click();
    assert(!('visions' in g) && !ui.mapRel && $('#toast').textContent.includes(t('map.visionUnlinked')), 'removed');
    removeRelation(visionRelId(C.id, A.id));
    eq(C.parents, [], 'a vision line removed');
    // A vision's menu on the map links and highlights.
    openCtxMenu(A.id, 10, 10);
    const acts = [...ctxMenu.querySelectorAll('[data-ctx]')].map(b => b.dataset.ctx);
    assert(
      acts.includes('link') &&
        acts.includes('highlight') &&
        acts.includes('show:visions') &&
        !acts.includes('show:map'),
      `map menu: ${acts}`,
    );
    closeCtxMenu();
    // Shown in the map from the Visions view, with filters that hid it cleared.
    ui.hideVisions = true;
    ui.mapGoal = g2.id;
    setView('visions');
    showIn('map', C.id);
    assert(
      ui.view === 'map' && $(`[data-map-node="${C.id}"]`) && !ui.hideVisions && !ui.mapGoal,
      'show in map reveals it',
    );
    // Double-click opens it.
    const n = () => $(`[data-map-node="${A.id}"]`);
    n().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    n().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    assert(modal.open && $('#f-title').value === 'Health', 'double-click opens it');
    modal.close();
    // Only visions, no items: the map still draws them.
    fresh('Only visions');
    setView('map');
    assert($('.map-wrap svg .node.vision') && !$('#view > .empty'), 'visions alone are drawn');
    clearVisions();
    render();
    assert(!$('[data-hide-visions]') && !$('[data-map-fold="vision"]'), 'no visions: no vision toggle or band');
    deletePlan(plans.current);
    deletePlan(plans.list.find(p => p.name === 'Vision map').id);
  });
  await step('visions: glow in every view, gold Purpose, logo, popup once', async () => {
    clearVisions();
    fresh('Glow');
    setAside();
    const A = mkV('Purposeful life');
    const g = mk('goal', { ...SMART, title: 'Lead', visions: [A.id], deadline: d(20), startDate: d(-5) });
    const u = mk('goal', { ...SMART, title: 'Loose', deadline: d(25), startDate: d(-5) });
    const a = mk('activity', { title: 'Practise', status: 'doing', dueDate: d(0), startDate: d(-2) });
    const r = mk('activity', {
      title: 'Daily habit',
      startDate: d(-10),
      repeat: { every: 1, unit: 'day' },
      checkins: {},
    });
    const s = mk('state', {
      title: 'Level',
      value: '3',
      date: d(-1),
      history: [
        { date: d(-3), value: '1' },
        { date: d(-1), value: '3' },
      ],
    });
    const ua = mk('activity', { title: 'Loose work', status: 'doing', dueDate: d(0), startDate: d(-2) });
    rel(a, g, 'contributes');
    rel(r, g, 'contributes');
    rel(s, g, 'measures');
    rel(ua, u, 'contributes');
    save();
    saveVisions();
    const glowing = () =>
      [...document.querySelectorAll('#view .vglow')].map(el => el.dataset.ctxItem || el.dataset.tlNode);
    const per = {};
    for (const v of ['dashboard', 'goals', 'activities', 'states', 'timeline', 'graphs']) {
      setView(v);
      per[v] = glowing();
      assert(
        per[v].length && !per[v].includes(u.id) && !per[v].includes(ua.id),
        `${v}: only what serves a vision glows (${per[v]})`,
      );
    }
    assert(
      per.goals.includes(g.id) &&
        per.activities.includes(a.id) &&
        per.states.includes(s.id) &&
        per.timeline.includes(g.id) &&
        per.graphs.includes(s.id) &&
        per.dashboard.includes(a.id),
      JSON.stringify(per),
    );
    // On the timeline the labels beside the bars stay over every bar's glow.
    setView('timeline');
    const lbl = $('#view .tl-bar-label'),
      bar = $('#view .tl-row.vglow .tl-bar, #view .tl-row.vglow .tl-milestone');
    assert(
      lbl && bar && +getComputedStyle(lbl).zIndex > +getComputedStyle(bar).zIndex,
      'timeline labels sit over glowing bars',
    );
    assert(
      getComputedStyle(bar).boxShadow.includes('12px'),
      `a bar's glow stays within its row: ${getComputedStyle(bar).boxShadow}`,
    );
    setView('goals');
    const card = id => $(`#view .card[data-ctx-item="${id}"]`);
    // The glow lies behind the cards: a layer under the card itself, not a shadow of the card that could cover its neighbours.
    const halo = getComputedStyle(card(g.id), '::before');
    assert(
      halo.boxShadow.includes('26px') &&
        halo.zIndex === '-1' &&
        getComputedStyle(card(u.id), '::before').boxShadow === 'none',
      `the glow is a layer behind the card: ${halo.boxShadow}`,
    );
    const withGlow = getComputedStyle(card(g.id)).boxShadow;
    card(g.id).classList.remove('vglow');
    eq(withGlow, getComputedStyle(card(g.id)).boxShadow, 'the card itself looks the same');
    card(g.id).classList.add('vglow');
    assert(getComputedStyle($('#view')).isolation === 'isolate', 'the view keeps the glow above its own background');
    const silver = getComputedStyle(document.documentElement).getPropertyValue('--vglow').trim();
    assert(!document.documentElement.classList.contains('purpose'), 'not yet a Purpose');
    const logo = () => getComputedStyle($('.brand .blaze-mark circle')).fill;
    const red = logo();
    // Purpose: the loose goal is paused.
    assert(!visions.purposeFound, 'not found yet');
    u.status = 'paused';
    save();
    render();
    assert(document.documentElement.classList.contains('purpose'), 'Purpose');
    const dlg = $('#purposeDlg');
    assert(dlg.open && $('#purposeText').textContent === t('purpose.text', { name: A.title }), 'congratulated');
    eq(visions.purposeFound, today(), 'remembered');
    assert(
      getComputedStyle(document.documentElement).getPropertyValue('--vglow').trim() !== silver,
      'the glow turns gold',
    );
    assert(logo() !== red, `the logo turns gold: ${logo()}`);
    dlg.querySelector('button').click();
    await tick();
    assert(!dlg.open, 'closes');
    render();
    assert(!dlg.open, 'not shown again');
    setView('visions');
    assert(
      $('#view .card.vision.purpose .tag.purpose') && $('#view .vis-status.found').textContent.includes(A.title),
      'the Purpose card is gold, tagged, and the status says so',
    );
    setView('map');
    assert(
      $(`[data-map-node="${A.id}"]`).classList.contains('purpose') &&
        $(`[data-map-node="${A.id}"] .sub`).textContent.startsWith(t('vis.purpose')),
      'gold on the map too',
    );
    // Lost and found again: no second popup.
    u.status = 'active';
    save();
    render();
    assert(
      !document.documentElement.classList.contains('purpose') && logo() === red,
      'lost: silver again, the logo red',
    );
    u.status = 'paused';
    save();
    render();
    assert(document.documentElement.classList.contains('purpose') && !dlg.open, 'found again without a popup');
    // In Slovenian.
    visions.purposeFound = undefined;
    changeLanguage('sl');
    render();
    assert(
      dlg.open &&
        $('#purposeTitle').textContent === 'Našli ste svoj Smisel' &&
        $('#purposeText').textContent.includes('Purposeful life'),
      'Slovenian popup',
    );
    dlg.close();
    changeLanguage('en');
    render();
    // No visions: nothing glows.
    clearVisions();
    setView('goals');
    assert(
      !document.querySelector('#view .vglow') && !document.documentElement.classList.contains('purpose'),
      'no visions: no glow',
    );
    putBack();
    deletePlan(plans.current);
  });
  await step('golden glow: only while every active goal is SMART; the Purpose card stays gold', () => {
    clearVisions();
    fresh('Golden');
    setAside();
    const here = plans.current;
    const A = mkV('Golden life');
    const g = mk('goal', { ...SMART, title: 'Finished goal', visions: [A.id], startDate: d(-5), deadline: d(30) });
    visions.purposeFound = today(); // found before: no popup
    save();
    saveVisions();
    setView('goals');
    const root = document.documentElement;
    const glow = () => getComputedStyle(root).getPropertyValue('--vglow').trim();
    const halo = () => getComputedStyle($(`#view .card[data-ctx-item="${g.id}"]`), '::before').boxShadow;
    const logo = () => getComputedStyle($('.brand .blaze-mark circle')).fill;
    assert(root.classList.contains('purpose') && root.classList.contains('golden'), 'all SMART: golden');
    const gold = { glow: glow(), halo: halo(), logo: logo() };
    // An unfinished goal serving the Purpose.
    const v = mk('goal', { title: 'Learn to cook', visions: [A.id], startDate: d(-1) });
    save();
    render();
    assert(root.classList.contains('purpose') && !root.classList.contains('golden'), 'Purpose, but not golden');
    assert(glow() !== gold.glow && halo() !== gold.halo, `the glow is silver: ${halo()}`);
    assert(logo() !== gold.logo, `the blaze is not gold: ${logo()}`);
    setView('visions');
    assert(
      $('#view .card.vision.purpose .tag.purpose') && $('#view .vis-status.found').textContent.includes(A.title),
      'the Purpose card, its tag and the found line stay',
    );
    const line = $('#view .vis-vague');
    assert(
      line && line.textContent.includes('“Learn to cook”'),
      'the Visions view names the goal: ' + line?.textContent,
    );
    line.querySelector(`[data-open="${v.id}"]`).click();
    assert(modal.open && $('#f-title').value === 'Learn to cook', 'its name opens its form');
    Object.entries({ ...SMART, deadline: d(40) }).forEach(([k, val]) => ($('#f-' + k).value = val));
    submitForm();
    assert(!modal.open && root.classList.contains('golden') && glow() === gold.glow, 'finished: gold again');
    assert(!$('#view .vis-vague') && logo() === gold.logo, 'no line; the blaze is gold');
    // Pausing an unfinished goal brings the gold back too.
    const w = mk('goal', { title: 'Sleep better', visions: [A.id] });
    save();
    render();
    assert(!root.classList.contains('golden'), 'another unfinished goal');
    w.status = 'paused';
    save();
    render();
    assert(root.classList.contains('golden'), 'paused: gold');
    // An unfinished goal in a plan that is not open.
    fresh('Golden other');
    mk('goal', { title: 'Far vague', visions: [A.id] });
    save();
    openPlan(here);
    setView('visions');
    const far = $('#view .vis-vague');
    assert(
      !root.classList.contains('golden') &&
        far?.textContent.includes(t('vis.goalInPlan', { goal: 'Far vague', plan: 'Golden other' })) &&
        !far.querySelector('[data-open]'),
      "another plan's goal takes the gold and is named with its plan: " + far?.textContent,
    );
    deletePlan(plans.list.find(p => p.name === 'Golden other').id);
    openPlan(here);
    clearVisions();
    putBack();
    deletePlan(plans.current);
  });
});
