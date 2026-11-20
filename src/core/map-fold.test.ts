import { expect, test } from 'vitest';
import { mergeMapFold, readMapFold } from './map-fold';

const at = '2026-11-20T10:00:00.000Z',
  later = '2026-11-20T11:00:00.000Z';

test('readMapFold keeps known kinds once and drops the rest', () => {
  expect(readMapFold({ kinds: ['goal', 'goal', 'x', 3, 'vision'], at })).toEqual({ kinds: ['vision', 'goal'], at });
});

test('readMapFold of missing or bad values is nothing folded', () => {
  for (const raw of [undefined, null, 'goal', 5, { kinds: 'goal' }, { at: 7 }])
    expect(readMapFold(raw)).toEqual({ kinds: [], at: '' });
});

test('mergeMapFold keeps the later change, either side', () => {
  const a = { kinds: ['goal' as const], at },
    b = { kinds: [], at: later };
  expect(mergeMapFold(a, b)).toEqual(b);
  expect(mergeMapFold(b, a)).toEqual(b);
  expect(mergeMapFold(a, undefined)).toEqual(a);
  expect(mergeMapFold(undefined, b)).toEqual(b);
});
