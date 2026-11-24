/** Page tests: one user per Google account: logins, switching, logging out, removing, tokens, other tabs. */
suite(async () => {
  // A fake Google: each token belongs to the account picked in the "popup", and each account has its
  // own Drive file. A write with one account's token can only land in that account's file.
  const G = {
    accounts: {
      A: { id: 'perm-A', email: 'ana@example.com', name: 'Ana Novak' },
      B: { id: 'perm-B', email: 'bor@example.com', name: 'Bor' },
      C: { id: 'perm-C', email: 'cene@example.com', name: '' },
    },
    files: {},
    tokens: {},
    pick: 'A',
    requests: [],
    n: 0,
    reads: 0,
  };
  const fakeGoogle = () => {
    Object.assign(drive, REAL_DRIVE);
    drive.request = async (hint, prompt) => {
      G.requests.push({ hint, prompt });
      const value = `tok${++G.n}`;
      G.tokens[value] = G.accounts[G.pick].id;
      return { value, expires: Date.now() + 3600e3 };
    };
    drive.whoami = async value => ({ ...Object.values(G.accounts).find(a => a.id === G.tokens[value]) });
    drive.read = async value => {
      G.reads++;
      const f = G.files[G.tokens[value]];
      return { id: f ? 'file-' + G.tokens[value] : null, content: f ? parseStore(JSON.stringify(f)) : null, extra: [] };
    };
    drive.write = async (value, id, content) => {
      const acct = G.tokens[value];
      if (!acct || (id && id !== 'file-' + acct)) throw new Error('write to a file of another account');
      G.files[acct] = JSON.parse(JSON.stringify(content));
      return 'file-' + acct;
    };
    drive.remove = async () => {};
  };
  const realPrompt = window.prompt,
    realOffer = offerWelcome;
  let prompts = [],
    offers = 0,
    nameAnswer = null;
  window.prompt = (msg, def) => {
    prompts.push([msg, def]);
    return nameAnswer ?? def;
  };
  offerWelcome = () => offers++;
  const SECRET = { A: 'SECRET-ana-goal', B: 'SECRET-bor-goal', G: 'SECRET-guest-goal', C: 'SECRET-cene-goal' };
  const fileText = acct => JSON.stringify(G.files[acct] || null);
  const keysText = u =>
    userKeys(u)
      .sort()
      .map(k => `${k}=${localStorage.getItem(k)}`)
      .join('\n');
  const memText = () =>
    JSON.stringify({ db, plans, visions, other: allPlansData().map(p => p.data) }) +
    document.querySelector('.app').innerHTML;
  const byAcct = key => users.list.find(u => u.account?.id === G.accounts[key].id);
  const addSecret = title => {
    setView('goals');
    mk('goal', { title });
    visions.list.push({ id: uid(), title: title + '-vision', parents: [] });
    save();
    saveVisions();
    render();
  };
  const noLeak = (text, keys, where) =>
    keys.forEach(k => assert(!text.includes(SECRET[k]), `${where} holds ${SECRET[k]}`));
  const settle = async () => {
    for (let i = 0; i < 5; i++) await tick();
    clearTimeout(syncState.timer);
    syncState.timer = null;
  };
  await step("users: the first Google login takes this device's data to that account", async () => {
    fakeGoogle();
    clearTimeout(syncState.timer);
    Object.assign(syncState, { busy: false, again: false, timer: null });
    fresh('Ana plan');
    addSecret(SECRET.A);
    theme = 'dark';
    prefs.set('theme', 'dark');
    applyTheme();
    prefs.set('view', 'goals');
    G.pick = 'A';
    prompts = [];
    nameAnswer = 'Ana';
    await logIn();
    await settle();
    const me = currentUser();
    assert(users.list.length === 1 && me.id === 'local', 'still the one user');
    eq(me.account, { id: 'perm-A', email: 'ana@example.com' }, 'linked to the account');
    eq(
      prompts.map(p => p[1]),
      ['Ana Novak'],
      'asked for a name once, suggesting the Google name',
    );
    assert(me.name === 'Ana' && JSON.parse(localStorage.getItem(USERS_KEY)).list[0].name === 'Ana', 'name kept');
    eq(G.requests.at(-1), { hint: '', prompt: 'select_account' }, 'Google lets the user pick the account');
    assert(
      fileText('perm-A').includes(SECRET.A) && fileText('perm-A').includes('Ana plan'),
      'everything synced to that account',
    );
    assert(syncState.status === 'synced' && !$('#syncBtn').hidden, 'synced, cloud shown');
    assert(
      G.tokens[JSON.parse(localStorage.getItem('actionplan.syncAuth')).value] === 'perm-A',
      'token kept for this user',
    );
    assert(!offers, 'no first-visit welcome: the data is the same');
  });
  await step(
    'users: another account on a device already logged in gets an empty user, as on a first visit',
    async () => {
      const aFile = fileText('perm-A');
      G.pick = 'B';
      prompts = [];
      nameAnswer = null;
      await logIn();
      await settle();
      const bor = currentUser();
      assert(
        users.list.length === 2 && bor.id !== 'local' && bor.ns === `u.${bor.id}.`,
        'a second user on their own prefix',
      );
      eq(bor.account, { id: 'perm-B', email: 'bor@example.com' }, 'linked to the new account');
      eq(bor.name, 'Bor', 'name prompted (Google name taken as given)');
      assert(
        plans.list.length === 1 &&
          plans.list[0].name === t('plan.defaultName') &&
          itemCount() === 0 &&
          !visions.list.length,
        'one empty starter plan, no visions',
      );
      assert(
        ui.view === 'dashboard' && theme === 'system' && !document.documentElement.dataset.theme,
        "default view and theme, not Ana's",
      );
      eq(offers, 1, 'the first-visit language picker and welcome are offered');
      noLeak(memText(), ['A'], "Bor's screen and memory");
      noLeak(fileText('perm-B'), ['A'], "Bor's Drive");
      noLeak(keysText(bor), ['A'], "Bor's stored keys");
      assert(fileText('perm-A') === aFile, "Ana's Drive untouched");
      assert(
        G.tokens[JSON.parse(localStorage.getItem(`actionplan.u.${bor.id}.syncAuth`)).value] === 'perm-B',
        "Bor's own token, under his prefix",
      );
      assert(
        G.tokens[JSON.parse(localStorage.getItem('actionplan.syncAuth')).value] === 'perm-A',
        "Ana's token stays hers",
      );
      // The real offer: a new user has not seen the tour nor Getting started, so the language picker opens.
      realOffer();
      await tick();
      await tick();
      assert($('.lang-pick'), 'language picker shown');
      $('.lang-pick [data-lang-done]').click();
      assert($('.welcome'), 'then the welcome card');
      $('.welcome [data-begin="own"]').click();
      assert(!$('.welcome') && getWalk().state === 'on' && plans.list.length === 1, 'Getting started on, no extra plan');
      addSecret(SECRET.B);
      await syncNow(true);
      await settle();
      assert(fileText('perm-B').includes(SECRET.B), "Bor's edits sync to Bor's Drive");
      assert(fileText('perm-A') === aFile, "and not to Ana's");
    },
  );
  await step("users: switching back opens that user's own data, as they left it", async () => {
    renderSync();
    const ana = byAcct('A');
    const row = [...$('#syncSection .user-list').children].find(li => li.textContent.includes('Ana'));
    assert(row && row.textContent.includes('ana@example.com'), 'Ana listed under others, with her email');
    G.pick = 'A';
    prompts = [];
    row.querySelector('[data-sync="switch"]').click();
    await settle();
    await settle();
    assert(currentUser() === ana && !prompts.length, 'Ana again, no name asked');
    eq(G.requests.at(-1), { hint: 'ana@example.com', prompt: 'select_account' }, 'Google is told which account');
    assert(theme === 'dark' && ui.view === 'goals', 'her theme and view');
    assert(
      db.goals.some(g => g.title === SECRET.A) ||
        allPlansData().some(p => p.data.goals.some(g => g.title === SECRET.A)),
      'her goal',
    );
    noLeak(memText(), ['B'], "Ana's screen and memory");
    noLeak(keysText(ana), ['B'], "Ana's stored keys");
    noLeak(keysText(byAcct('B')), ['A'], "Bor's stored keys");
    noLeak(fileText('perm-A'), ['B'], "Ana's Drive");
    assert($('#toast').textContent === t('user.switched', { name: 'Ana' }), 'toast says who');
  });
  await step("users: a renewed token for someone else's account is refused", async () => {
    const aFile = fileText('perm-A'),
      bFile = fileText('perm-B');
    drive.forget();
    G.pick = 'B'; // the popup picked Bor's account while Ana renews
    await syncNow(true);
    await settle();
    eq(syncState.status, 'account', 'status says it was another account');
    assert($('#syncBtn').title === t('sync.status.account', { email: 'ana@example.com' }), 'and which to choose');
    assert(!localStorage.getItem('actionplan.syncAuth') && !drive.token, 'the wrong token is not kept');
    assert(fileText('perm-A') === aFile && fileText('perm-B') === bFile, 'neither Drive touched');
    G.pick = 'A';
    await syncNow(true);
    await settle();
    eq(syncState.status, 'synced', 'the right account syncs again');
    eq(G.requests.at(-1), { hint: 'ana@example.com', prompt: '' }, "renewal hints Ana's account");
  });
  await step('users: a sync on its way when another user takes over stops, both ways', async () => {
    const ana = currentUser(),
      bFile = fileText('perm-B');
    let release;
    const slow = drive.read;
    drive.read = value =>
      new Promise(r => {
        release = () => r(slow(value));
      });
    addSecret(SECRET.A + '-2');
    clearTimeout(syncState.timer);
    const running = syncNow(false);
    await tick();
    G.pick = 'B';
    const switching = logIn('bor@example.com', byAcct('B'));
    await settle();
    assert(currentUser() === byAcct('B'), 'Bor took over');
    const reads = G.reads;
    drive.read = slow;
    release();
    await running;
    await switching;
    await settle();
    noLeak(memText(), ['A'], "Bor's screen after Ana's late answer");
    noLeak(keysText(currentUser()), ['A'], "Bor's keys after Ana's late answer");
    assert(!fileText('perm-A').includes(SECRET.A + '-2'), "Ana's stopped sync wrote nothing");
    assert(fileText('perm-B') === bFile, "nor into Bor's Drive");
    assert(!syncState.busy, 'not stuck');
    await syncNow(true);
    await settle();
    noLeak(fileText('perm-B'), ['A'], "Bor's next sync");
    assert(G.reads > reads, 'Bor syncs normally');
    // Back to Ana: her unsynced edit is still hers and goes up now.
    G.pick = 'A';
    await logIn('ana@example.com', ana);
    await settle();
    assert(fileText('perm-A').includes(SECRET.A + '-2'), "Ana's edit synced once she is back");
    noLeak(fileText('perm-A'), ['B'], "Ana's Drive");
  });
  await step("users: log out leaves an empty guest; a guest's login keeps the guest's data", async () => {
    const before = users.list.length,
      ana = currentUser();
    $('#settingsBtn').click();
    $('#syncSection [data-sync="logout"]').click();
    const guest = currentUser();
    assert(
      users.list.length === before + 1 && !guest.account && guest.ns === `u.${guest.id}.`,
      'a new guest on their own prefix',
    );
    assert(
      $('#syncBtn').hidden && !drive.token && !localStorage.getItem('actionplan.syncAuth'),
      "signed out, Ana's token gone",
    );
    assert(plans.list.length === 1 && itemCount() === 0 && !visions.list.length, 'an empty start');
    noLeak(memText(), ['A', 'B'], "the guest's screen and memory");
    assert($('#toast').textContent === t('user.loggedOut', { name: 'Ana' }), 'toast');
    const names = [...$('#syncSection .user-list').querySelectorAll('b')].map(b => b.textContent);
    eq(names, ['Ana', 'Bor'], 'everyone signed in here is listed');
    assert(
      [...document.querySelectorAll('#syncSection .user-list [data-sync="switch"]')].every(
        b => b.textContent === t('user.logIn'),
      ),
      'each with Log in',
    );
    assert(keysText(ana).includes(SECRET.A), "Ana's data stays on the device");
    settings.close();
    addSecret(SECRET.G);
    G.pick = 'C';
    prompts = [];
    await logIn();
    await settle();
    assert(currentUser() === guest && users.list.length === before + 1, "the guest becomes the new account's user");
    eq(guest.name, 'cene', "no Google name: the email's name is suggested");
    assert(fileText('perm-C').includes(SECRET.G), "the guest's data synced to it");
    noLeak(fileText('perm-C'), ['A', 'B'], "Cene's Drive");
    // Logging out again makes a new guest; a known account from there opens its user and leaves the guest be.
    logOut();
    const guest2 = currentUser();
    assert(guest2 !== guest && !guest2.account && users.list.length === before + 2, 'a new guest');
    addSecret('guest-two-goal');
    G.pick = 'B';
    await logIn();
    await settle();
    assert(
      currentUser() === byAcct('B') && users.list.includes(guest2) && !guest2.account,
      'Bor opened, guest kept as it was',
    );
    noLeak(memText(), ['A', 'C', 'G'], "Bor's screen");
    assert(
      !memText().includes('guest-two-goal') && keysText(guest2).includes('guest-two-goal'),
      "the guest's goal stays the guest's",
    );
    logOut();
    assert(
      currentUser() === guest2 && db.goals.some(g => g.title === 'guest-two-goal'),
      'logging out returns to that one guest',
    );
  });
  await step('users: no item of one user is stored under another, in storage or session', () => {
    const owner = { A: byAcct('A'), B: byAcct('B'), G: byAcct('C') }; // the first guest's data became Cene's
    Object.entries(owner).forEach(([k, u]) => {
      assert(keysText(u).includes(SECRET[k]), `${k} still has their own`);
      users.list
        .filter(o => o !== u)
        .forEach(o => assert(!keysText(o).includes(SECRET[k]), `${SECRET[k]} found under ${o.name || o.id}`));
    });
    users.list.forEach(u => {
      const tok = userKeys(u, sessionStorage)
        .map(k => JSON.parse(sessionStorage.getItem(k))?.value)
        .filter(Boolean);
      tok.forEach(v => assert(G.tokens[v] === u.account?.id, `${u.name}: a token of ${G.tokens[v]}`));
    });
    // Every stored key belongs to exactly one user (or the device: the user list and the language).
    const owners = {};
    for (let i = 0; i < localStorage.length; i++) owners[localStorage.key(i)] = 0;
    users.list.forEach(u => userKeys(u).forEach(k => owners[k]++));
    const odd = Object.entries(owners).filter(([k, n]) => n !== 1 && k !== USERS_KEY && k !== LANG_KEY);
    assert(!odd.length, 'keys with no single owner: ' + odd.map(o => o.join(':')));
    eq(
      Object.values(G.files).map(f => f.format),
      ['actionplan-sync', 'actionplan-sync', 'actionplan-sync'],
      'one file per account',
    );
    return `${users.list.length} users`;
  });
  await step('users: name on the first login, changed in Settings, escaped', async () => {
    G.pick = 'A';
    await logIn('ana@example.com', byAcct('A'));
    await settle();
    openSettings('syncSection'); // the name field is on the Account page
    const input = $('#syncSection [data-user-name]');
    assert(
      input.value === 'Ana' &&
        $('#syncSection').textContent.includes(t('user.signedInAs', { email: 'ana@example.com' })),
      'name and account shown',
    );
    input.focus();
    setSyncStatus('syncing');
    assert(
      document.activeElement === input && $('#syncSection .sync-status').dataset.status === 'syncing',
      'a status change keeps the field in focus',
    );
    input.value = '  <img src=x onerror=alert(1)> Ana  ';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    renderSync();
    eq(currentUser().name, '<img src=x onerror=alert(1)> Ana', 'renamed, trimmed');
    eq(
      JSON.parse(localStorage.getItem(USERS_KEY)).list.find(u => u.id === currentUser().id).name,
      currentUser().name,
      'stored',
    );
    eq(byAcct('B').name, 'Bor', 'others keep their names');
    G.pick = 'B';
    await logIn('bor@example.com', byAcct('B'));
    await settle();
    renderSync();
    assert(!$('#syncSection img') && $('#syncSection .user-list').textContent.includes('<img src=x'), 'shown as text');
    $('#syncSection [data-user-name]').value = '';
    $('#syncSection [data-user-name]').dispatchEvent(new Event('change', { bubbles: true }));
    renderSync();
    assert($('#syncSection [data-user-name]').placeholder === 'bor@example.com', 'an empty name shows the email');
    byAcct('B').name = 'Bor';
    saveUsers();
    changeLanguage('sl');
    assert(
      $('#syncSection').textContent.includes(I18N.sl.strings['user.logOut']) &&
        $('#syncSection h3').textContent === I18N.sl.strings['sync.title'],
      'Slovenian',
    );
    changeLanguage('en');
    settings.close();
  });
  await step('users: a device linked before users existed learns its account on the next sync', async () => {
    const bor = currentUser();
    bor.account = { id: '', email: '' };
    drive.forget();
    G.pick = 'B';
    await syncNow(true);
    await settle();
    eq(bor.account, { id: 'perm-B', email: 'bor@example.com' }, 'account learnt');
    eq(syncState.status, 'synced', 'and synced');
    // Picked from the list while its account is not known yet: that user, not a new one.
    bor.account = { id: '', email: '' };
    saveUsers();
    const count = users.list.length;
    logOut();
    await logIn('', bor);
    await settle();
    assert(currentUser() === bor && users.list.length === count && bor.account.id === 'perm-B', 'the picked user');
  });
  await step('users: failed or cancelled Google sign-in changes nothing', async () => {
    const me = currentUser(),
      count = users.list.length,
      file = fileText('perm-B');
    drive.request = async () => {
      throw new SyncError('auth');
    };
    await logIn();
    assert(
      currentUser() === me && users.list.length === count && $('#toast').textContent === t('sync.connectFailed'),
      'same user, toast',
    );
    fakeGoogle();
    drive.whoami = async () => {
      throw new SyncError('offline');
    };
    await logIn();
    assert(
      currentUser() === me && users.list.length === count && fileText('perm-B') === file,
      'identity unknown: nothing changes',
    );
    fakeGoogle();
  });
  await step(
    'users: removing a user deletes only their data here; logging in again brings back what synced',
    async () => {
      const ana = byAcct('A'),
        bor = currentUser(),
        cene = byAcct('C');
      const allKeys = area => Object.keys(area);
      const nsKeys = (u, area = localStorage) => allKeys(area).filter(k => k.startsWith(KEY_ROOT + u.ns));
      const anaKeys = keysText(ana),
        borKeys = keysText(bor),
        lang = localStorage.getItem(LANG_KEY);
      assert(bor === byAcct('B'), 'Bor is on');
      renderSync();
      const removeBtn = u => $(`#syncSection [data-sync="remove"][data-user="${u.id}"]`);
      // Cancelled: nothing changes.
      window.confirm = () => false;
      removeBtn(cene).click();
      assert(users.list.includes(cene) && keysText(cene).includes(SECRET.G), 'cancel keeps everything');
      window.confirm = () => true;
      removeBtn(cene).click();
      assert(
        !users.list.includes(cene) && !JSON.parse(localStorage.getItem(USERS_KEY)).list.some(u => u.id === cene.id),
        'gone from the list, stored too',
      );
      assert(!nsKeys(cene).length && !nsKeys(cene, sessionStorage).length, 'every key of theirs deleted');
      assert(
        keysText(ana) === anaKeys &&
          keysText(bor) === borKeys &&
          localStorage.getItem(LANG_KEY) === lang &&
          currentUser() === bor,
        'the others and the device untouched, still Bor',
      );
      eq($('#toast').textContent, t('user.removed', { name: 'cene' }), 'toast');
      assert(!removeBtn(cene), 'no longer listed');
      // Logging in again makes a new user with what had synced to their Drive.
      G.pick = 'C';
      await logIn();
      await settle();
      const back = currentUser();
      assert(
        back !== cene &&
          back.account.id === 'perm-C' &&
          JSON.stringify(allPlansData().map(p => p.data)).includes(SECRET.G),
        'their synced data is back',
      );
      // Removing the user you are: the guest opens, nobody else is touched.
      const guest = users.list.find(u => !u.account);
      renderSync();
      removeBtn(back).click();
      assert(
        currentUser() === guest &&
          !users.list.includes(back) &&
          !nsKeys(back).length &&
          !nsKeys(back, sessionStorage).length,
        'the guest opens, their keys are gone',
      );
      assert(!drive.token && $('#syncBtn').hidden, 'signed out');
      noLeak(memText(), ['A', 'B', 'G'], "the guest's screen");
      // The first user, on the plain keys: only theirs go (the device's language and the user list stay).
      const borKeys2 = keysText(bor);
      removeUser(ana.id);
      const plain = allKeys(localStorage).filter(
        k => !users.list.some(u => u.ns && k.startsWith(KEY_ROOT + u.ns)) && k !== USERS_KEY && k !== LANG_KEY,
      );
      assert(!users.list.includes(ana) && !plain.length, 'no plain keys left: ' + plain);
      assert(!localStorage.getItem('actionplan.syncAuth'), 'nor her token');
      assert(keysText(bor) === borKeys2 && localStorage.getItem(LANG_KEY) === lang, 'Bor and the language untouched');
      eq(
        readUsers().list.map(u => u.id),
        users.list.map(u => u.id),
        'stored list matches',
      );
      // A guest is never offered for removal.
      assert(!removeBtn(guest), 'no remove for the guest');
    },
  );
  await step(
    "users: linked before users existed – learnt from a token still valid, never another user's account",
    async () => {
      fakeGoogle();
      const legacy = addUser();
      legacy.account = { id: '', email: '' };
      saveUsers();
      enterUser(legacy.id);
      G.pick = 'C';
      drive.keep(await drive.request('', '')); // a token from before the update
      const reqs = G.requests.length;
      await syncNow(false);
      await settle();
      eq(legacy.account, { id: 'perm-C', email: 'cene@example.com' }, 'learnt from the token, without a popup');
      assert(G.requests.length === reqs && syncState.status === 'synced', 'no popup, synced');
      // Another such user whose token is for Bor, who has a user here: refused, the token dropped, Bor's Drive untouched.
      const twin = addUser();
      twin.account = { id: '', email: '' };
      saveUsers();
      enterUser(twin.id);
      G.pick = 'B';
      drive.keep(await drive.request('', ''));
      const bFile = fileText('perm-B');
      await syncNow(false);
      await settle();
      eq(syncState.status, 'account', 'refused');
      eq($('#syncBtn').title, t('sync.status.accountTaken'), "says the account is someone else's here");
      assert(
        !twin.account.id &&
          !drive.token &&
          !localStorage.getItem(userKey('actionplan.syncAuth')) &&
          fileText('perm-B') === bFile,
        'not taken, token dropped, nothing synced',
      );
      await syncNow(true);
      await settle();
      eq(G.requests.at(-1), { hint: '', prompt: 'select_account' }, 'renewing lets them choose the account');
      eq(syncState.status, 'account', 'Bor again: still refused');
      eq(users.list.filter(u => u.account?.id === 'perm-B').length, 1, 'one user per account');
      removeUser(twin.id);
      removeUser(legacy.id);
      assert(!users.list.includes(twin) && !users.list.includes(legacy), 'cleaned up');
    },
  );
  await step('users: a login whose user list cannot be stored changes nothing', async () => {
    const me = currentUser(),
      count = users.list.length,
      stored = localStorage.getItem(USERS_KEY);
    assert(!me.account, 'from the guest');
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === USERS_KEY) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
    G.pick = 'C';
    try {
      await logIn();
      await settle();
    } finally {
      Storage.prototype.setItem = set;
    }
    assert(
      currentUser().id === me.id && !currentUser().account && users.list.length === count,
      'the guest stays a guest, no user added',
    );
    assert(
      !users.list.some(u => u.account?.id === 'perm-C') && localStorage.getItem(USERS_KEY) === stored,
      "the account is nobody's here",
    );
    assert(!drive.token && $('#syncBtn').hidden, 'its token not kept, not signed in');
    eq($('#toast').textContent, t('err.storage'), 'says storage is full');
  });
  await step('users: another tab changing the user list is taken over, never written back old', async () => {
    const me = currentUser();
    const other = JSON.parse(localStorage.getItem(USERS_KEY));
    other.list.find(u => u.account?.id === 'perm-B').name = 'Bor from tab 2';
    other.list.push({
      id: 'tab2user',
      ns: 'u.tab2user.',
      name: 'Dana',
      account: { id: 'perm-D', email: 'dana@example.com' },
    });
    other.current = 'tab2user';
    localStorage.setItem(USERS_KEY, JSON.stringify(other));
    dispatchEvent(new StorageEvent('storage', { key: USERS_KEY }));
    assert(currentUser().id === me.id, 'this tab stays with its user');
    assert(
      users.list.some(u => u.id === 'tab2user') && byAcct('B').name === 'Bor from tab 2',
      'the new list is taken over',
    );
    saveUsers();
    assert(
      JSON.parse(localStorage.getItem(USERS_KEY)).list.some(u => u.id === 'tab2user'),
      'saving here keeps what the other tab added',
    );
    // The other tab removes the user open here: this tab drops their token and opens the guest.
    G.pick = 'B';
    await logIn('bor@example.com', byAcct('B'));
    await settle();
    const bor = currentUser(),
      tokenKey = `actionplan.${bor.ns}syncAuth`;
    assert(localStorage.getItem(tokenKey), 'Bor signed in here');
    const after = JSON.parse(localStorage.getItem(USERS_KEY));
    after.list = after.list.filter(u => u.id !== bor.id);
    localStorage.setItem(USERS_KEY, JSON.stringify(after));
    dispatchEvent(new StorageEvent('storage', { key: USERS_KEY }));
    assert(!currentUser().account && !users.list.some(u => u.id === bor.id), 'the guest opens');
    assert(!localStorage.getItem(tokenKey) && !drive.token, "Bor's token gone from this tab");
    noLeak(memText(), ['B'], "the guest's screen");
    // Put Bor back (his data is still stored) for what follows.
    users.list.push(bor);
    users.list = users.list.filter(u => u.id !== 'tab2user');
    saveUsers();
  });
  await step('users: a new user whose account already has plans in Drive gets no first-visit welcome', async () => {
    G.accounts.D = { id: 'perm-D', email: 'dana@example.com', name: 'Dana' };
    G.files['perm-D'] = JSON.parse(fileText('perm-B'));
    G.pick = 'B';
    await logIn('bor@example.com', byAcct('B'));
    await settle();
    const before = offers;
    G.pick = 'D';
    await logIn();
    await settle();
    const dana = currentUser();
    assert(dana.account.id === 'perm-D' && dana !== byAcct('B'), 'a new user for Dana');
    assert(
      SYNC_COLLS.some(c => allPlansData().some(p => p.data[c].length)),
      'her plans came down',
    );
    eq(offers, before, 'no welcome offered');
    removeUser(dana.id);
  });
});
