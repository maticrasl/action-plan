import { beforeEach, describe, expect, test } from 'vitest';
import { nameTaken, uniqueName } from './plans';
import { setPlans } from './state';

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
