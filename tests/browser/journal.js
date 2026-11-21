/** Page tests: the journal store synced with a fake Drive, kept per user, in the backup, and taken over from another tab. */
suite(async () => {
  const T = '2099-01-01T00:00:00.000Z';
  const fakeDrive = remote => {
    const out = { written: null };
    drive.getToken = async () => 'tok';
    drive.read = async () => ({
      id: 'file1',
      content: remote && parseStore(JSON.stringify(toFile(remote))),
      extra: [],
    });
    drive.write = async (tok, id, content) => {
      out.written = content;
      return id;
    };
    return out;
  };
  const signedIn = async run => {
    currentUser().account = { id: 'acct-journal', email: 'j@example.com' };
    prefs.set('syncedOnce', true);
    try {
      await run();
    } finally {
      currentUser().account = null;
      renderSync();
    }
  };

  await step('journal: goes up with sync, comes down from another device, merged', async () => {
    fresh('Journal');
    applyJournal({ reviews: [], sessions: [], deleted: {} });
    const mine = addReview({ kind: 'week', period: '2026-W47', answers: { q: 'here' } });
    const theirs = { id: 'their-review', kind: 'month', period: '2026-11', answers: {}, updatedAt: T };
    const remote = {
      plans: { list: plans.list, deleted: {} },
      data: Object.fromEntries(plans.list.map(p => [p.id, readPlan(p.id)])),
      visions,
      journal: { reviews: [theirs], sessions: [], deleted: {} },
    };
    const d = fakeDrive(remote);
    await signedIn(() => syncNow(true));
    eq(d.written?.version, 3, 'the file says version 3');
    eq(d.written.journal.reviews.map(r => r.id).sort(), [mine.id, theirs.id].sort(), 'both reviews in the file');
    eq(journal.reviews.map(r => r.id).sort(), [mine.id, theirs.id].sort(), 'and here');
    eq(JSON.parse(localStorage.getItem(userKey(JOURNAL_KEY))).reviews.length, 2, 'stored');

    // A file written before the journal existed gets this device's journal again.
    const old = fakeDrive({ ...remote, journal: undefined });
    await signedIn(() => syncNow(true));
    eq(old.written?.journal.reviews.length, 2, 'uploaded again to a file without one');
  });

  await step('journal: a sync file from a newer version changes nothing here', async () => {
    const before = JSON.stringify(journal);
    drive.getToken = async () => 'tok';
    drive.read = async () => {
      throw new SyncError('update');
    };
    let wrote = false;
    drive.write = async () => (wrote = true);
    await signedIn(() => syncNow(true));
    assert(!wrote && JSON.stringify(journal) === before, 'nothing written, nothing changed');
    eq(syncState.status, 'update', 'asks to update');
  });

  await step("journal: each user has their own; switching back shows one's own again", () => {
    const first = currentUser().id;
    eq(journal.reviews.length, 2, 'this user has two');
    const other = addUser();
    enterUser(other.id);
    eq(journal.reviews.length, 0, 'the other user sees none');
    addReview({ kind: 'year', period: '2026', answers: {} });
    enterUser(first);
    eq(journal.reviews.length, 2, 'the first user sees their own two');
    assert(!journal.reviews.some(r => r.kind === 'year'), "not the other user's");
    removeUserKeys(other, true);
    users.list = users.list.filter(u => u !== other);
    saveUsers();
    assert(!localStorage.getItem('actionplan.u.' + other.id + '.journal'), 'removing a user removes their journal');
  });

  await step('journal: in the backup; restoring merges it, never overwrites', async () => {
    const [file] = await capture(() => $('#backupAllBtn').click());
    eq(file.json.version, 1, 'the backup stays version 1');
    eq(file.json.journal.reviews.length, 2, 'with the journal');
    // The other device's review is dated 2099, after any deletion here, so delete this device's own.
    const keep = journal.reviews.find(r => r.updatedAt === T);
    deleteReview(journal.reviews.find(r => r !== keep).id);
    addSession({ exercise: 'values', date: today(), done: false, answers: {}, made: [] });
    restoreText(JSON.stringify(file.json));
    eq(
      journal.reviews.map(r => r.id),
      [keep.id],
      'a review deleted since stays deleted',
    );
    eq(journal.sessions.length, 1, 'what was added since stays');
  });

  await step('journal: another tab saving it is taken over here', () => {
    const j = clone(journal);
    j.reviews.push({ id: 'from-tab', kind: 'week', period: '2026-W48', answers: {}, updatedAt: T });
    localStorage.setItem(userKey(JOURNAL_KEY), JSON.stringify(j));
    dispatchEvent(new StorageEvent('storage', { key: userKey(JOURNAL_KEY) }));
    assert(
      journal.reviews.some(r => r.id === 'from-tab'),
      'taken over',
    );
  });
});
