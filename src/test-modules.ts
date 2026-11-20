/** Test build only: every module under src, found by Vite at build time, so a new one cannot be left out. */
/// <reference types="vite/client" />
// Vite hoists these imports to the top of this file, so test-bridge.ts imports main.ts before it:
// the modules then load in main.ts's order, as in the app.
export const modules = import.meta.glob<Record<string, unknown>>(
  // The emoji name lists load on demand (ui/plan-name.ts), as in the app; both export EMOJI_NAMES.
  ['./**/*.{ts,js}', '!./main.ts', '!./test-*.ts', '!./sw.js', '!./**/*.test.ts', '!./core/emoji-names.*.ts'],
  { eager: true },
);
