/** Page tests: every template as a sound plan in both languages and every view, Exodus 90, the picker. */
suite(async () => {
  await step('templates: every template becomes a sound plan, in both languages, and every view draws it', () => {
    const views = ['dashboard', 'goals', 'activities', 'states', 'map', 'timeline', 'graphs'];
    const made = [];
    let items = 0;
    for (const code of ['en', 'sl']) {
      changeLanguage(code);
      for (const tpl of TEMPLATES) {
        const where = `${code} ${tpl.id}`;
        useTemplate(tpl);
        made.push(plans.current);
        assert(currentPlan().name.startsWith(tplText(tpl.name)), `${where}: plan name`);
        eq(
          [db.goals.length, db.states.length, db.activities.length],
          [tpl.goals.length, tpl.states.length, tpl.activities.length],
          `${where}: counts`,
        );
        items += itemCount();
        assert(
          [...db.goals, ...db.states, ...db.activities].every(x => typeof x.title === 'string' && x.title),
          `${where}: titles`,
        );
        assert(
          db.goals.every(g => g.category === t('tpl.area.' + tpl.area)),
          `${where}: category`,
        );
        // Every link follows the rules, as if added by hand, and survives a merge.
        const all = [...db.relations];
        all.forEach(r => {
          db.relations = all.filter(x => x !== r);
          const err = canRelate(r.from, r.to, r.type);
          assert(
            !err,
            `${where}: ${r.type} ${findEntity(r.from)?.item.title} → ${findEntity(r.to)?.item.title}: ${err}`,
          );
        });
        db.relations = all;
        assert(repairRelations(db).length === all.length, `${where}: merge repair keeps every relation`);
        // Dates make sense: nothing ends before it starts, nothing is late on the first day,
        // sub-activities sit inside their parent, and work starts once what it waits for is due.
        const title = id => findEntity(id).item.title;
        db.goals.forEach(g =>
          assert(g.startDate <= g.deadline && goalState(g) !== 'late', `${where}: goal dates ${g.title}`),
        );
        db.activities.forEach(a => {
          assert(!a.dueDate || a.startDate <= a.dueDate, `${where}: dates ${a.title}`);
          assert(activityState(a) !== 'late', `${where}: late on day one ${a.title}`);
          relsFrom(a.id, 'subactivity').forEach(r => {
            const p = findEntity(r.to).item;
            assert(a.startDate >= p.startDate && a.dueDate <= p.dueDate, `${where}: ${a.title} inside ${p.title}`);
          });
          effectiveDeps(a.id, 'activity').forEach(id => {
            const dep = findEntity(id).item;
            assert(a.startDate >= dep.dueDate, `${where}: ${a.title} starts before ${dep.title} is due`);
          });
          relsFrom(a.id, 'contributes').forEach(r =>
            assert(a.dueDate <= findEntity(r.to).item.deadline, `${where}: ${a.title} due after ${title(r.to)}`),
          );
          // Every activity works toward a goal, directly or through its parent.
          assert(
            [a.id, ...ancestors(a.id, 'subactivity')].some(id => relsFrom(id, 'contributes').length),
            `${where}: ${a.title} serves no goal`,
          );
          if (isRoutine(a)) assert(scheduleText(a) && periodProgress(a).target >= 0, `${where}: routine ${a.title}`);
        });
        db.states.forEach(s =>
          assert(
            relsFrom(s.id, 'measures').length || relsTo(s.id, 'improves').length,
            `${where}: state ${s.title} unlinked`,
          ),
        );
        db.goals
          .filter(byActivities)
          .forEach(g => assert(countedActivities(g).length, `${where}: ${g.title} has activities to count`));
        db.goals.filter(byRoutines).forEach(g => assert(goalRoutines(g).length, `${where}: ${g.title} has routines`));
        assert(!hasProgress(db), `${where}: starts without progress`);
        views.forEach(v => {
          setView(v);
          assert(viewEl.children.length, `${where}: ${v} empty`);
        });
      }
    }
    changeLanguage('en');
    made.forEach(deletePlan);
    setView('dashboard');
    return `${made.length} plans, ${items} items`;
  });
  await step(
    'templates: every template fits the current data model (normalize keeps it, routines, lists, states that add up)',
    () => {
      // Every key the picker and templateData use exists in both languages.
      const keys = [
        'tpl.title',
        'tpl.lead',
        'tpl.areas',
        'tpl.area.all',
        'tpl.use',
        'tpl.inside',
        'tpl.goalList',
        'tpl.stepList',
        'tpl.routineList',
        'tpl.goals',
        'tpl.states',
        'tpl.activities',
        'tpl.routines',
        'tpl.weeks',
        'tpl.months',
        'tpl.years',
        ...TPL_AREAS.map(a => 'tpl.area.' + a),
        'tpl.level.starter',
        'tpl.level.ambitious',
      ];
      TPL_LANGS.forEach(code => keys.forEach(k => assert(I18N[code].strings[k], `${code}: ${k}`)));
      const made = [];
      const counts = { routines: 0, makeUp: 0, lists: 0, routineLists: 0, cumulative: 0, periods: 0 };
      for (const code of TPL_LANGS) {
        changeLanguage(code);
        for (const tpl of TEMPLATES) {
          const where = `${code} ${tpl.id}`;
          let data;
          try {
            data = templateData(tpl);
          } catch (e) {
            assert(false, `${where}: templateData threw ${e.message}`);
          }
          // normalize (what a load or a sync does) changes nothing: no link or field is dropped.
          eq(
            JSON.stringify(normalize(JSON.parse(JSON.stringify(data)))),
            JSON.stringify(data),
            `${where}: normalize keeps it`,
          );
          useTemplate(tpl);
          made.push(plans.current);
          // Every link passes canRelate against the rest, and none waits for a routine.
          const all = [...db.relations];
          all.forEach(r => {
            db.relations = all.filter(x => x !== r);
            const err = canRelate(r.from, r.to, r.type);
            assert(
              !err,
              `${where}: ${r.type} ${findEntity(r.from)?.item.title} → ${findEntity(r.to)?.item.title}: ${err}`,
            );
            assert(REL_TYPES[r.type], `${where}: link type ${r.type}`);
          });
          db.relations = all;
          assert(
            !db.relations.some(r => r.type === 'depends' && isRoutine(findEntity(r.to).item)),
            `${where}: something depends on a routine`,
          );
          db.activities.forEach((a, i) => {
            const src = tpl.activities[i];
            eq(a.title, tplText(src.title), `${where}: activities in template order`);
            if (isRoutine(a)) {
              counts.routines++;
              const now = routineToday(a);
              assert(
                scheduleText(a) &&
                  shortSchedule(a) &&
                  (now === null || (now in TODAY_TAG && now !== 'done' && now !== 'makeUp')),
                `${where}: routine ${a.title} today ${now}`,
              );
              assert(
                periodProgress(a).target >= 0 && routineStreak(a).n === 0 && activityState(a) !== 'late',
                `${where}: routine ${a.title} starts fresh`,
              );
              if (a.repeat.makeUp) {
                counts.makeUp++;
                assert(!isFlexible(a) && makesUp(a), `${where}: ${a.title} makes up only set days`);
              }
            }
            if (a.list) {
              counts[isRoutine(a) ? 'routineLists' : 'lists']++;
              eq(
                a.list.map(i => i.text),
                src.list.map(tplText),
                `${where}: ${a.title} items`,
              );
              assert(
                a.list.every(i => safeId(i.id) && !i.done) && new Set(a.list.map(i => i.id)).size === a.list.length,
                `${where}: ${a.title} item ids`,
              );
              assert(
                isRoutine(a)
                  ? isListRoutine(a) && dayItemsDone(a, today()) === 0
                  : isList(a) && listDone(a) === 0 && a.status !== 'done',
                `${where}: ${a.title} list kind`,
              );
            }
            relsFrom(a.id, 'improves').forEach(r =>
              assert(findEntity(r.to)?.kind === 'state', `${where}: ${a.title} improves a state`),
            );
          });
          db.states.forEach(s => {
            if (isCumulative(s)) {
              counts.cumulative++;
              assert(
                SCALES.includes(s.scale) && Array.isArray(s.entries) && !s.entries.length && stateTotal(s) === 0,
                `${where}: ${s.title} adds up from nothing`,
              );
            } else assert(!('scale' in s) && !('entries' in s), `${where}: ${s.title} plain`);
          });
          db.goals.forEach(g => {
            if (!g.period) return;
            counts.periods++;
            const st = relsTo(g.id, 'measures').map(r => findEntity(r.from).item);
            assert(
              PERIODS.includes(g.period) && st.length && st.every(isCumulative),
              `${where}: ${g.title} counts a period of a state that adds up`,
            );
            assert(
              goalCurrent(g) === Number(g.baseline) && !goalReached(g),
              `${where}: ${g.title} starts at its baseline`,
            );
          });
        }
      }
      changeLanguage('en');
      made.forEach(deletePlan);
      setView('dashboard');
      assert(
        counts.makeUp && counts.lists && counts.routineLists && counts.cumulative && counts.periods,
        `uses the newer features: ${JSON.stringify(counts)}`,
      );
      return Object.entries(counts)
        .map(([k, v]) => `${v / 2} ${k}`)
        .join(', ');
    },
  );
  await step('templates: Exodus 90 is 90 days of prayer, asceticism and fraternity after a week of preparation', () => {
    const tpl = TEMPLATES.find(x => x.id === 'exodus-90');
    assert(tpl && tpl.area === 'faith', 'in the Faith area');
    const made = [];
    for (const code of TPL_LANGS) {
      changeLanguage(code);
      useTemplate(tpl);
      made.push(plans.current);
      const [g] = db.goals;
      const by = en => db.activities.find(a => a.title === tplText(tpl.activities.find(x => x.title[0] === en).title));
      eq(
        [g.category, byRoutines(g), g.deadline],
        [t('tpl.area.faith'), true, addDays(today(), 96)],
        `${code}: goal kept by its routines, day 90 on day 96`,
      );
      const routines = db.activities.filter(isRoutine);
      eq(routines.length, 6, `${code}: six routines`);
      assert(
        routines.every(
          a =>
            a.startDate === addDays(today(), 7) && a.dueDate === g.deadline && addDays(a.startDate, 89) === a.dueDate,
        ),
        `${code}: routines run the 90 days`,
      );
      eq(by('Daily prayer').list.length, 4, `${code}: prayer list`);
      eq(by('Daily disciplines').list.length, 9, `${code}: disciplines list`);
      eq(
        [
          by('Fast and abstain on Wednesday and Friday').repeat.days,
          !!by('Fast and abstain on Wednesday and Friday').repeat.makeUp,
        ],
        [[2, 4], false],
        `${code}: strict Wednesday and Friday fast`,
      );
      assert(
        by('Weekly fraternity meeting').repeat.makeUp && by('Intense exercise 3 times a week').repeat.times === 3,
        `${code}: meeting can move, exercise 3 a week`,
      );
      assert(goalRoutines(g).length === 6, `${code}: the goal counts every routine`);
    }
    changeLanguage('en');
    made.forEach(deletePlan);
    setView('dashboard');
    return 'Faith area, 6 routines over days 7–96, strict fast, movable meeting';
  });
  await step(
    'templates: picker from the empty plan and settings, filtered by area, opens a template as a new plan',
    () => {
      fresh('Template picker');
      setView('goals');
      const offer = viewEl.querySelector('.empty [data-templates]');
      assert(offer, 'an empty plan offers templates');
      offer.click();
      assert(tplDialog.open, 'picker open');
      const cards = () => [...tplDialog.querySelectorAll('.tpl-card')];
      eq(cards().length, TEMPLATES.length, 'all templates listed');
      eq(tplDialog.querySelectorAll('[data-tpl-area]').length, TPL_AREAS.length + 1, 'a chip for each area and all');
      tplDialog.querySelector('[data-tpl-area="money"]').click();
      eq(cards().length, TEMPLATES.filter(x => x.area === 'money').length, 'only money templates');
      eq(
        cards().map(c => c.querySelector('.tpl-level').classList.contains('starter')),
        [true, true, true, false],
        'starter ones first',
      );
      assert(
        tplDialog.querySelector('[data-tpl-area="money"]').getAttribute('aria-pressed') === 'true',
        'chip pressed',
      );
      tplDialog.querySelector('[data-tpl-area=""]').click();
      eq(cards().length, TEMPLATES.length, 'all again');
      const run = tplDialog.querySelector('[data-template="run-5k"]').closest('.tpl-card');
      eq(
        [...run.querySelectorAll('.tpl-meta span')].map(x => x.textContent),
        ['10 weeks', '1 goal', '2 states', '6 activities', '2 routines'],
        'summary line',
      );
      const inside = run.querySelector('.tpl-inside').textContent;
      assert(
        inside.includes('Buy running shoes') && inside.includes('Run 3 times a week') && !inside.includes('Weeks 1–3'),
        'inside: main steps and routines, not sub-steps',
      );
      const before = plans.list.length,
        from = plans.current;
      run.querySelector('[data-template]').click();
      assert(
        !tplDialog.open && plans.list.length === before + 1 && plans.current !== from,
        'a new plan, the empty one kept',
      );
      eq(currentPlan().name, 'Run 5 km', 'named after the template');
      eq(db.activities.length, 8, 'activities');
      assert($('#toast').textContent.includes('Run 5 km'), 'toast');
      const made = plans.current;
      useTemplate(TEMPLATES.find(x => x.id === 'run-5k'));
      eq(currentPlan().name, 'Run 5 km 2', 'a second copy is numbered');
      deletePlan(plans.current);
      // From settings; Esc and the close button both close it.
      $('#settingsBtn').click();
      $('#templatesBtn').click();
      assert(!settings.open && tplDialog.open, 'settings hand over to the picker');
      tplDialog.querySelector('[data-templates-close]').click();
      assert(!tplDialog.open, 'closed');
      changeLanguage('sl');
      openTemplates();
      const sl = tplDialog.textContent;
      assert(
        sl.includes('Za začetek') &&
          sl.includes('Ambiciozno') &&
          sl.includes('10 tednov1 cilj2 stanji6 aktivnosti2 rutini') &&
          sl.includes('Preteči 5 km'),
        'Slovene wording',
      );
      assert(sl.includes('2 leti') && sl.includes('3 leta'), 'years in Slovene');
      tplDialog.close();
      changeLanguage('en');
      deletePlan(made);
      return 'ok';
    },
  );
});
