import { expect, test } from 'vitest';
import { hexRgb } from './glass';

// The production build shortens #ffffff to #fff in the CSS; the map must still read it (else its slabs paint black).
test('hexRgb reads six- and three-digit hex', () => {
  expect(hexRgb('#2e8b57')).toEqual([46, 139, 87]);
  expect(hexRgb(' #fff ')).toEqual([255, 255, 255]);
  expect(hexRgb('#1a2')).toEqual([17, 170, 34]);
});
