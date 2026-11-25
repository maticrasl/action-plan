/** Vitest: the unit tests beside the modules (*.test.ts under src), run in Node on a clock with summer time. */
import { defineConfig } from 'vitest/config';

// Europe/Ljubljana has the two clock-change days the date tests cross; the workers inherit it.
process.env.TZ = 'Europe/Ljubljana';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
    // Node's own localStorage warns when touched; the store tests put a stand-in where the page has it.
    execArgv: ['--no-experimental-webstorage'],
  },
});
