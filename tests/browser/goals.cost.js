/** Page tests: "What will it cost?" in the goal form (feature 30), and the line for many active goals. */
suite(async () => {
  const shown = el => !!el && getComputedStyle(el).display !== 'none';
  const many = () => $('#modalBody .cost-many');

  await step('goals: the cost saves, reopens, and an empty one is no field', () => {
    fresh('Cost');
    openForm('goal');
    $('#f-title').value = 'Run 10 km';
    eq($('#f-cost').maxLength, 500, 'at most 500 characters');
    $('#f-cost').value = '  Two <i>evenings</i> a week  ';
    submitForm();
    const g = db.goals[0];
    eq(g.cost, 'Two <i>evenings</i> a week', 'trimmed, markup kept as typed');
    openForm('goal', g.id);
    eq($('#f-cost').value, g.cost, 'reopens with it');
    $('#f-cost').value = '';
    submitForm();
    assert(!('cost' in g), 'emptied: no field');
  });

  await step('goals: four active goals in all plans: a new goal with no cost says so, until one is typed', () => {
    plans.list.slice().forEach(p => deletePlan(p.id)); // the count is over all plans: start from none
    fresh('Cost other');
    mk('goal');
    save();
    fresh('Cost many');
    mk('goal');
    mk('goal');
    mk('goal', { status: 'paused' });
    save();
    openForm('goal');
    assert(!many(), 'three active goals (one paused): no line');
    modal.close();
    const fourth = mk('goal');
    save();
    openForm('goal');
    assert(shown(many()) && many().textContent.includes('4'), 'four active, counting another plan');
    $('#f-cost').value = 'Saturday mornings';
    assert(!shown(many()), 'gone once something is typed');
    modal.close();
    openForm('goal', fourth.id);
    assert(!many(), 'never when editing a goal');
    modal.close();
  });

  await step('goals: the sample plan does not count toward the line', () => {
    const sample = mk('goal');
    save();
    currentPlan().demo = true;
    openForm('goal');
    assert(!many(), 'goals of a demo plan are left out');
    modal.close();
    delete currentPlan().demo;
    removeEntity('goal', sample.id);
    save();
  });
});
