/** Page tests: Settings switches, installing the app, the phone and landscape layouts, the glass look, scrollbars. */
suite(async () => {
  await step('settings switches', () => {
    $('#settingsBtn').click();
    assert(settings.open);
    const box = settings.querySelector('[data-setting="hideDone"]');
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    assert(ui.hideDone === box.checked);
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    settings.querySelector('[data-setting="navCollapsed"]').click();
    const col = $('.app').classList.contains('nav-collapsed');
    settings.querySelector('[data-setting="navCollapsed"]').click();
    settings.querySelector('[data-theme-set="dark"]').click();
    const th = document.documentElement.dataset.theme;
    settings.querySelector('[data-theme-set="system"]').click();
    const sync = $('#syncSection .sync-body').textContent.trim().slice(0, 40);
    settings.close();
    return `collapsed=${col} theme=${th} sync="${sync}"`;
  });

  await step('install: hidden without a way to install, hint for Firefox', () => {
    const shown = el => getComputedStyle(el).display !== 'none';
    renderInstall();
    assert($('#installSection').hidden && !shown($('#installBtn')), 'Chrome without a prompt shows nothing');
    const ua = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');
    try {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
        configurable: true,
      });
      renderInstall();
      assert(
        !$('#installSection').hidden &&
          !shown($('#installBtn')) &&
          $('#installHint').textContent === t('install.firefoxHint'),
        'Firefox: a hint, no button',
      );
    } finally {
      delete navigator.userAgent;
      if (navigator.userAgent !== ua.get.call(navigator)) throw new Error('user agent not restored');
      renderInstall();
    }
    return $('#installHint').textContent || 'hidden';
  });
  await step('phone tab bar: graphs, timeline and map under More', () => {
    setView('goals');
    // The tests run at desktop width; show the menu as a phone would.
    const phone = document.head.appendChild(document.createElement('style'));
    phone.textContent = '.nav-more { display: flex } .nav-sheet:not([hidden]) { display: flex }';
    const more = $('#navMore'),
      sheet = $('#navSheet');
    assert(
      sheet.hidden && more.getAttribute('aria-expanded') === 'false' && !more.classList.contains('active'),
      'closed at first',
    );
    more.click();
    const items = [...sheet.querySelectorAll('[data-sheet-view]')].map(b => b.dataset.sheetView);
    assert(!sheet.hidden && more.getAttribute('aria-expanded') === 'true', 'opens');
    assert(items.join() === 'visions,map,timeline,graphs,review', 'lists the extra views');
    assert(sheet.querySelector('[data-sheet-view="timeline"]').textContent.trim() === t('nav.timeline'), 'with labels');
    assert(document.activeElement === sheet.querySelector('button'), 'first item focused');
    sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    assert(document.activeElement.dataset.sheetView === 'review', 'arrows wrap');
    sheet.querySelector('[data-sheet-view="timeline"]').click();
    assert(
      ui.view === 'timeline' && sheet.hidden && more.classList.contains('active'),
      'picks a view, closes, More marked',
    );
    more.click();
    assert(document.activeElement.dataset.sheetView === 'timeline', 'current view focused');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(sheet.hidden && document.activeElement === more, 'Escape closes and refocuses More');
    more.click();
    $('#view').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    assert(sheet.hidden, 'click outside closes');
    more.click();
    more.click();
    assert(sheet.hidden, 'More toggles');
    setView('goals');
    assert(!more.classList.contains('active'), 'More unmarked on a main tab');
    phone.remove();
    return items.join();
  });
  await step('install: offered in Settings when the browser allows it', async () => {
    changeLanguage('en');
    assert($('#installSection').hidden, 'hidden until the browser offers it');
    let prompted = 0;
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    offer.prompt = () => prompted++;
    offer.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(offer);
    assert(offer.defaultPrevented, 'browser banner held back');
    assert(
      !$('#installSection').hidden && !$('#installBtn').hidden && $('#installHint').textContent === t('install.hint'),
      'section and button shown',
    );
    changeLanguage('sl');
    assert(
      $('#installHint').textContent === I18N.sl.strings['install.hint'] &&
        $('#installBtn').textContent === 'Namesti aplikacijo',
      'translated',
    );
    changeLanguage('en');
    $('#installBtn').click();
    await new Promise(r => setTimeout(r, 0));
    assert(prompted === 1 && $('#installBtn').hidden && $('#installSection').hidden, 'prompt shown once, then hidden');
    $('#installBtn').click();
    assert(prompted === 1, 'no second prompt');
    window.dispatchEvent(new Event('appinstalled'));
    assert($('#toast').textContent === t('install.done'), 'installed toast');
  });
  await step(
    'layout: a phone held sideways gets a slim icon rail and a title bar that scrolls away; no tab bar',
    async () => {
      // The app's markup and stylesheet in a frame of each size (headless Chrome's window cannot shrink that far).
      const sizes = {
        portrait: [390, 844],
        landscape: [844, 390],
        'small landscape': [736, 360],
        'large landscape': [932, 430],
        desktop: [1280, 900],
        'desktop collapsed': [1280, 900],
      };
      const out = [];
      for (const [name, [w, h]] of Object.entries(sizes)) {
        const frame = document.createElement('iframe');
        Object.assign(frame.style, {
          width: `${w}px`,
          height: `${h}px`,
          position: 'fixed',
          left: '-9999px',
          top: '0',
          border: '0',
        });
        const app = $('.app').cloneNode(true);
        app.classList.toggle('nav-collapsed', name === 'desktop collapsed');
        frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body>${app.outerHTML}</body>`;
        await new Promise(res => {
          frame.onload = res;
          document.body.append(frame);
        });
        await fontsLoaded(frame.contentDocument);
        const doc = frame.contentDocument,
          css = sel => frame.contentWindow.getComputedStyle(doc.querySelector(sel));
        const nav = doc.querySelector('.nav').getBoundingClientRect(),
          tabs = [...doc.querySelectorAll('.nav-item[data-view]')];
        const kind = css('.nav').position === 'fixed' ? 'tabs' : nav.width < 80 ? 'rail' : 'sidebar';
        out.push(`${name}=${kind}`);
        if (name === 'portrait') {
          frame.remove();
          continue;
        }
        if (name.endsWith('landscape')) {
          eq(kind, 'rail', `${name}: a rail at the side, not a tab bar`);
          assert(nav.width <= 64 && nav.height >= h - 1, `${name}: slim and full height (${nav.width}×${nav.height})`);
          eq(css('.nav').overflowY, 'auto', `${name}: the rail scrolls if the icons do not fit`);
          assert(
            tabs.every(b => b.getBoundingClientRect().bottom <= h + 1),
            `${name}: every view's icon is on screen`,
          );
          assert(
            tabs.every(b => b.querySelector('span').getBoundingClientRect().width <= 1 && b.title !== undefined),
            `${name}: icons only`,
          );
          assert(
            ['.brand span', '.nav .plan-switch', '.nav-footer', '#navMore'].every(
              sel => css(sel).display === 'none' || doc.querySelector(sel).getBoundingClientRect().width <= 1,
            ),
            `${name}: no name, plan switcher, collapse toggle or More button in the rail`,
          );
          assert(css('.plan-name').display !== 'none', `${name}: the plan switcher sits above the title`);
          eq(css('.topbar').position, 'static', `${name}: the title bar scrolls away`);
          assert(doc.querySelector('.topbar').getBoundingClientRect().height <= 80, `${name}: and is compact`);
        } else {
          eq(kind, name === 'desktop' ? 'sidebar' : 'rail', `${name}: unchanged`);
          eq(css('.topbar').position, 'sticky', `${name}: the title bar stays`);
          assert(css('.plan-name').display === 'none', `${name}: the plan switcher is in the sidebar`);
        }
        frame.remove();
      }
      eq(out[0], 'portrait=tabs', 'phones held upright keep the tab bar');
      return out.join(' ');
    },
  );
  await step('every view: items are tinted glass like the map boxes, in lighter type', () => {
    loadSample();
    const css = el => getComputedStyle(el);
    const views = {
      dashboard: '.card, .list .row',
      goals: '.card',
      activities: '.card',
      states: '.card',
      timeline: '.tl-bar, .tl-milestone',
      graphs: '.card',
    };
    for (const [view, sel] of Object.entries(views)) {
      setView(view);
      const items = [...document.querySelectorAll(`#view ${sel}`)];
      assert(
        items.length && items.every(x => x.classList.contains('glass')),
        `${view}: ${items.length} items, all glass`,
      );
      // No edge and no grey shadow: the box-shadow is the slab's side, solid steps in its tint, down and to the right.
      const odd = items.filter(x => {
        const c = css(x),
          steps = c.boxShadow.match(/\d+(\.\d+)?px \d+(\.\d+)?px 0px/g) || [];
        return (
          c.borderTopWidth !== '0px' ||
          c.borderLeftWidth !== '0px' ||
          !steps.length ||
          !c.backgroundImage.includes('linear-gradient') ||
          !c.boxShadow.includes('inset')
        );
      });
      eq(
        odd.map(x => x.className),
        [],
        `${view}: no edge, a side and the light on the face`,
      );
    }
    // Tinted by status, else by kind: a late goal red, a goal in progress amber, a state violet; goals cut thicker.
    setView('goals');
    const card = st => $(`#view .card.goal.st-${st}`),
      side = el => (css(el).boxShadow.match(/[1-9]\d*px [1-9]\d*px 0px/g) || []).length;
    assert(
      card('late') && card('doing') && css(card('late')).backgroundColor !== css(card('doing')).backgroundColor,
      'goal cards tinted by status',
    );
    setView('activities');
    const act = $('#view .acts .card.activity');
    assert(side(act) === 0 && css(act).boxShadow.includes('0px 0px 0px 1px'), 'activities flat, a 1 px edge');
    setView('goals');
    assert(side(card('doing')) === 5, 'goals 5 px of glass');
    // Milk glass: a solid face that glows from within; hovered, it takes more of its colour.
    const face = el =>
      css(el)
        .backgroundColor.match(/[\d.]+/g)
        .map(Number);
    assert(
      (face(card('doing'))[3] ?? 1) === 1 && css(card('doing')).boxShadow.includes('inset'),
      'solid milky face, lit inside',
    );
    const before = css(card('doing')).backgroundColor;
    card('doing').style.setProperty('--wash', '6%');
    assert(css(card('doing')).backgroundColor !== before, 'hover takes more colour');
    card('doing').style.removeProperty('--wash');
    // Grey items still to do take more grey, so they stand out from the page.
    setView('activities');
    const theme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = 'light';
    render();
    const todo = $('#view .acts .card.activity.st-todo'),
      rootCss = css(document.documentElement);
    assert(
      todo &&
        css(todo).getPropertyValue('--glass-tint').trim() === rootCss.getPropertyValue('--glass-tint-quiet').trim() &&
        parseFloat(rootCss.getPropertyValue('--glass-tint-quiet')) >
          parseFloat(rootCss.getPropertyValue('--glass-tint')),
      'to-do activities take more grey by day',
    );
    // And on the map their slab's side too: drawn without the quiet share, it would come out as pale as the rest.
    const q = GLASS.day.quiet,
      quietSide = glassDefs(new Set(['--activity|other']));
    GLASS.day.quiet = 0;
    const plainSide = glassDefs(new Set(['--activity|other']));
    GLASS.day.quiet = q;
    assert(quietSide !== plainSide, 'to-do map boxes take more grey on their side');
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    render();
    setView('goals');
    // A status tag on glass of its own colour stays visible.
    const late = card('late').querySelector('.tag.bad');
    assert(!late || css(late).backgroundColor !== css(card('late')).backgroundColor, 'late tag shows on a late card');
    // Lighter type: nothing heavier than 600, and headings 600.
    const weights = [...document.querySelectorAll('body *')].map(x => +css(x).fontWeight);
    assert(
      Math.max(...weights) <= 600 && css($('.topbar h1')).fontWeight === '600',
      `heaviest weight ${Math.max(...weights)}`,
    );
    setView('dashboard');
  });
  await step('scrollbars: thin everywhere, like the dialogs', () => {
    loadSample();
    const thin = el =>
      getComputedStyle(el).scrollbarWidth === 'thin' &&
      ['transparent', 'rgba(0, 0, 0, 0)'].some(c => getComputedStyle(el).scrollbarColor.endsWith(c));
    const seen = { page: document.documentElement, body: document.body, sidebar: $('.nav') || $('nav') };
    setView('timeline');
    seen.timeline = $('.tl-scroll');
    assert(Object.values(seen).every(Boolean), 'all found: ' + Object.keys(seen).filter(k => !seen[k]));
    const off = Object.keys(seen).filter(k => !thin(seen[k]));
    setView('map');
    if (!thin($('.map-wrap'))) off.push('map');
    assert(!off.length, 'not thin: ' + off);
    deletePlan(plans.current);
  });

  await step('users: phone width – the account section fits 390 px', async () => {
    $('#settingsBtn').click();
    const frame = document.createElement('iframe');
    Object.assign(frame.style, {
      width: '390px',
      height: '900px',
      position: 'fixed',
      left: '-9999px',
      top: '0',
      border: '0',
    });
    frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body style="margin:0"><div class="modal-body" style="padding:0 16px">${$('#syncSection').outerHTML}</div></body>`;
    await new Promise(res => {
      frame.onload = res;
      document.body.append(frame);
    });
    await fontsLoaded(frame.contentDocument);
    const doc = frame.contentDocument;
    const wide = [...doc.querySelectorAll('#syncSection *')]
      .filter(el => el.getBoundingClientRect().right > 390 - 16 + 0.5)
      .map(el => `${el.tagName}.${el.className}:${Math.round(el.getBoundingClientRect().right)}`);
    assert(
      doc.documentElement.scrollWidth <= 390,
      `no sideways scroll: ${doc.documentElement.scrollWidth} ${wide.join(' ')}`,
    );
    [...doc.querySelectorAll('.user-list li, .user-name')].forEach(el =>
      assert(el.getBoundingClientRect().right <= 390 - 16 + 0.5, 'row inside the screen'),
    );
    frame.remove();
    settings.close();
  });
  await step('settings: one page at a time, chosen in the rail; a phone opens each from a list', async () => {
    const tabs = () => [...settings.querySelectorAll('[data-set-page]')].filter(b => !b.hidden);
    const pageShown = () => [...settings.querySelectorAll('.set-pages > .set-group')].filter(s => s.offsetParent);
    $('#settingsBtn').click();
    eq(
      tabs().map(b => b.dataset.setPage),
      ['setPlan', 'setLook', 'setLang', 'syncSection', 'setData', 'setHelpPage'],
      'a tab per area; App only while it can be installed',
    );
    eq(
      pageShown().map(s => s.id),
      ['setPlan'],
      'Plan first, alone',
    );
    eq(settings.querySelector('[aria-current="page"]').dataset.setPage, 'setPlan', 'its tab marked');
    clickEl(settings.querySelector('[data-set-page="setLook"]'));
    eq(
      pageShown().map(s => s.id),
      ['setLook'],
      'a tab shows its page',
    );
    assert(settings.querySelector('[data-setting="tips"]').offsetParent, 'its switches can be used');
    assert(settings.open, 'Settings stays open');
    settings.close();
    $('#settingsBtn').click();
    eq(
      pageShown().map(s => s.id),
      ['setLook'],
      'opens again on the last page',
    );
    settings.close();
    openSettings('syncSection');
    eq(
      pageShown().map(s => s.id),
      ['syncSection'],
      'opening at an area shows its page',
    );
    settings.close();
    openSettings('installSection');
    eq(
      pageShown().map(s => s.id),
      ['setPlan'],
      'a hidden page falls back to Plan',
    );
    settings.close();
    // A phone: the list of areas first; a tap opens one page, the back arrow returns to the list.
    const frame = document.createElement('iframe');
    Object.assign(frame.style, {
      width: '390px',
      height: '700px',
      position: 'fixed',
      left: '-9999px',
      top: '0',
      border: '0',
    });
    frame.srcdoc = `<!doctype html><link rel="stylesheet" href="css/styles.css"><body>${settings.outerHTML}</body>`;
    await new Promise(res => {
      frame.onload = res;
      document.body.append(frame);
    });
    const doc = frame.contentDocument,
      dlg = doc.querySelector('#settings');
    dlg.removeAttribute('data-in-page');
    dlg.showModal();
    const vis = sel => !!doc.querySelector(sel).offsetParent;
    assert(vis('.set-nav') && !vis('.set-pages') && !vis('.set-back'), 'phone: the list, no page, no back arrow');
    dlg.setAttribute('data-in-page', '');
    assert(!vis('.set-nav') && vis('.set-pages') && vis('.set-back'), 'phone: a page with the back arrow');
    assert(doc.documentElement.scrollWidth <= 390, 'phone: no sideways scroll');
    frame.remove();
  });
  await step('settings: Plan shows the open plan and every plan; language and theme as tiles', async () => {
    openSettings('setPlan');
    const body = $('#setPlanBody');
    const open = plans.list.find(p => p.id === plans.current);
    eq(body.querySelector('.plan-hero b').textContent, open.name, 'the open plan on top');
    eq(body.querySelectorAll('.plan-item').length, plans.list.length, 'a row per plan');
    eq(body.querySelector('.plan-item[aria-current="true"]').dataset.planOpen, plans.current, 'the open one marked');
    eq(
      body.querySelector('[data-plan="merge"]').disabled,
      plans.list.length < 2,
      'Merge only with another plan to merge into',
    );
    for (const a of ['rename', 'export', 'delete', 'new', 'import'])
      assert(body.querySelector(`[data-plan="${a}"]`), `${a} is there`);
    // Another plan opened from the list: the page follows, Settings stays open.
    const other = plans.list.find(p => p.id !== plans.current);
    if (other) {
      const was = plans.current;
      clickEl(body.querySelector(`[data-plan-open="${other.id}"]`));
      eq(plans.current, other.id, 'a row opens its plan');
      eq($('#setPlanBody .plan-hero b').textContent, other.name, 'the page shows it');
      assert(settings.open, 'Settings stays open');
      clickEl($(`#setPlanBody [data-plan-open="${was}"]`));
    }
    openSettings('setLang');
    const tile = code => $(`.lang-tiles [data-lang="${code}"]`);
    eq(tile('sl').textContent, 'SLSlovenščina', 'each language in its own name');
    clickEl(tile('sl'));
    eq(tile('sl').getAttribute('aria-pressed'), 'true', 'the chosen one pressed');
    eq(
      $('[data-set-page="setLang"] span').textContent,
      I18N.sl.strings['nav.language'],
      'the page in the new language',
    );
    clickEl(tile('en'));
    openSettings('setLook');
    eq(
      $('#themeSeg [data-theme-set="system"]').querySelectorAll('.theme-mini').length,
      2,
      'System shows light and dark',
    );
    clickEl($('#themeSeg [data-theme-set="dark"]'));
    eq(document.documentElement.dataset.theme, 'dark', 'a tile sets its theme');
    eq($('#themeSeg [aria-pressed="true"]').dataset.themeSet, 'dark', 'and is marked');
    clickEl($('#themeSeg [data-theme-set="system"]'));
    assert(!document.documentElement.dataset.theme, 'System follows the device');
    settings.close();
  });
});
