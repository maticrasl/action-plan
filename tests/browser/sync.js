/** Page tests: sync with a fake Drive, starter plans, offline/paused/error states, an empty merged store. */
suite(async () => {
  await step('sync with a fake Drive', async () => {
    let written = null;
    const remotePlan = emptyDb();
    remotePlan.goals.push({ id: 'remote-goal', title: 'From another device', updatedAt: '2099-01-01T00:00:00.000Z' });
    const remote = {
      plans: { list: [{ id: 'remote-plan', name: 'Remote plan' }], deleted: {} },
      data: { 'remote-plan': remotePlan },
    };
    drive.getToken = async () => 'tok';
    drive.read = async () => ({ id: 'file1', content: parseStore(JSON.stringify(toFile(remote))), extra: [] });
    drive.write = async (tok, id, content) => {
      written = content;
      return id;
    };
    currentUser().account = { id: 'acct-test', email: 'test@example.com' }; // signed in
    prefs.set('syncedOnce', true);
    await syncNow(true);
    assert(written && written.format === 'actionplan-sync', 'written');
    assert(
      plans.list.some(p => p.id === 'remote-plan'),
      'remote plan merged in',
    );
    const status = syncState.status,
      btn = !$('#syncBtn').hidden;
    currentUser().account = null;
    renderSync(); // back to a device nobody signed in on
    return `status=${status} btnShown=${btn} plans=${written.plans.list.length} after=${syncState.status}`;
  });

  const plansBefore = plans.list.map(p => p.id);
  await step('sync file: parsing and starter plans', () => {
    // Parsing the file is tested in src/sync/drive.test.ts.
    const withGoal = { ...emptyDb(), goals: [{ id: 'g' }] },
      withTomb = { ...emptyDb(), deleted: { q: '2099-01-01' } };
    const local = {
      plans: {
        list: [
          { id: '1', name: I18N.en.strings['plan.defaultName'] },
          { id: '2', name: I18N.sl.strings['plan.defaultName'] },
          { id: '3', name: I18N.en.strings['plan.defaultName'] },
          { id: '4', name: 'Other' },
          { id: '5', name: I18N.en.strings['plan.defaultName'] },
        ],
      },
      data: { 1: emptyDb(), 2: emptyDb(), 3: withGoal, 4: emptyDb(), 5: withTomb },
    };
    eq(
      dropStarterPlans(local).plans.list.map(p => p.id),
      ['3', '4', '5'],
      'only empty starter plans dropped',
    );
  });
  await step('sync states: offline, paused, error, retry, unchanged file', async () => {
    const reset = () => {
      currentUser().account = { id: 'acct-test', email: 'test@example.com' };
      syncState.busy = false;
      syncState.again = false;
    };
    const out = {};
    currentUser().account = null;
    setSyncStatus('idle');
    let called = false;
    drive.getToken = async () => {
      called = true;
      return 'tok';
    };
    await syncNow(true);
    assert(!called && syncState.status === 'idle', 'not connected: nothing happens');

    reset();
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
    await syncNow(true);
    out.offline = syncState.status;
    delete navigator.onLine;

    drive.getToken = async () => {
      throw new SyncError('auth');
    };
    await syncNow(false);
    out.auth = syncState.status;
    const err = console.error;
    console.error = () => {};
    drive.getToken = async () => {
      throw new Error('boom');
    };
    await syncNow(false);
    out.crash = syncState.status;
    console.error = err;
    eq(out, { offline: 'offline', auth: 'paused', crash: 'error' }, 'statuses');
    assert(
      $('#syncBtn').dataset.status === 'error' && $('#syncBtn').title === t('sync.status.error'),
      'button shows the status',
    );

    // A sync asked for while one is running is queued, not run in parallel.
    let release,
      runs = 0;
    drive.getToken = () => {
      runs++;
      return new Promise(r => {
        release = r;
      });
    };
    drive.read = async () => {
      throw new SyncError('offline');
    };
    const first = syncNow(false);
    await tick();
    await syncNow(false);
    assert(runs === 1 && syncState.again, 'second sync queued');
    release('tok');
    await first;
    assert(!syncState.again && syncState.timer, 'queued sync rescheduled');
    clearTimeout(syncState.timer);

    // Second sync with nothing new: the Drive file is not rewritten; stray duplicate files are removed.
    let file = null,
      writes = 0;
    const removed = [];
    drive.getToken = async () => 'tok';
    drive.read = async () => ({
      id: 'f',
      content: file && parseStore(JSON.stringify(file)),
      extra: file ? ['dup1'] : [],
    });
    drive.write = async (tok, id, content) => {
      writes++;
      file = content;
      return 'f';
    };
    drive.remove = async (tok, id) => removed.push(id);
    await syncNow(true);
    drive.read = async () => ({ id: 'f', content: parseStore(JSON.stringify(file)), extra: [] });
    await syncNow(true);
    assert(writes === 1 && syncState.status === 'synced', 'unchanged: no write');
    drive.read = async () => ({ id: 'f', content: parseStore(JSON.stringify(file)), extra: ['dup1'] });
    await syncNow(true);
    eq(removed, ['dup1'], 'duplicates removed');

    // During the tour sync leaves Drive alone (no retry loop); ending the tour syncs once.
    let reads = 0;
    drive.read = async () => {
      reads++;
      return { id: 'f', content: parseStore(JSON.stringify(file)), extra: [] };
    };
    clearTimeout(syncState.timer);
    syncState.timer = null;
    startTour();
    await syncNow(false);
    await syncNow(true);
    assert(!reads && !syncState.again && !syncState.busy, 'no Drive calls during the tour');
    endTour(false);
    clearTimeout(syncState.timer);
    await syncNow(false);
    assert(reads === 1 && syncState.status === 'synced', 'syncs after the tour');
    currentUser().account = null;
    renderSync();
    assert($('#syncBtn').hidden, 'signed out: no cloud button');
    return `${Object.values(out).join(',')} writes=${writes}`;
  });
  await step('sync: an empty merged store still leaves one plan', () => {
    applyStore({ plans: { list: [], deleted: {} }, data: {} });
    assert(
      plans.list.length === 1 && plans.list[0].name === t('plan.defaultName') && itemCount() === 0,
      'one empty plan',
    );
    const leftover = plansBefore.filter(id => localStorage.getItem(planKey(id)));
    assert(!leftover.length, 'old plans removed from storage');
  });
});
