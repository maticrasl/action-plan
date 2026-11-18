import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createPlan, nameTaken, planKey, save, uniqueName } from './plans';
import { plans, setPlans } from './state';
import { db } from '../core/state';
import { memoryStorage } from './memory-storage';

beforeEach(() =>
  setPlans({
    current: 'a',
    list: [
      { id: 'a', name: 'Sample plan' },
      { id: 'b', name: 'Renamed plan' },
    ],
  }),
);

describe('plan names', () => {
  test('a name is taken ignoring case and spaces around it', () => {
    expect(nameTaken('renamed plan ')).toBe(true);
    expect(nameTaken('  SAMPLE PLAN')).toBe(true);
    expect(nameTaken('Sample plans')).toBe(false);
  });

  test('a plan keeps its own name, a case change included', () => {
    expect(nameTaken('RENAMED PLAN', 'b')).toBe(false);
    expect(nameTaken('Renamed plan', 'a')).toBe(true);
  });

  test('a free name is kept; a taken one gets the first free number', () => {
    expect(uniqueName('Nothing like it')).toBe('Nothing like it');
    expect(uniqueName('Sample plan')).toBe('Sample plan 2');
    setPlans({
      current: 'a',
      list: [
        { id: 'a', name: 'Sample plan' },
        { id: 'c', name: 'Sample plan 2' },
      ],
    });
    expect(uniqueName('SAMPLE PLAN')).toBe('SAMPLE PLAN 3');
  });
});

// Ported from tests/more.js "change tracking: stamps, tombstones, undo and expiry" (its part through the
// app; the rest is in core/merge.test.ts).
describe('saving', () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('save stamps only the items that changed, and stores the plan', () => {
    createPlan('Tracking');
    db.goals.push({ id: 'g1', title: 'One', status: 'active' }, { id: 'g2', title: 'Two', status: 'active' });
    save();
    expect(db.goals.map(g => g.updatedAt)).toEqual(['2026-11-18T10:00:00.000Z', '2026-11-18T10:00:00.000Z']);
    vi.setSystemTime(new Date('2026-11-18T11:00:00Z'));
    db.goals[0].title = 'Changed title';
    save();
    expect(db.goals.map(g => g.updatedAt)).toEqual(['2026-11-18T11:00:00.000Z', '2026-11-18T10:00:00.000Z']);
    expect(JSON.parse(storage.getItem(planKey(plans.current!))!).goals[0].title).toBe('Changed title');
  });
});
