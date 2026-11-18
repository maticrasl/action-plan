/** ESLint: recommended rules only (no-undef among them); no style rules. */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import layers from './scripts/lib/eslint-layers.mjs';

export default tseslint.config(
  { ignores: ['dist/', 'dist-test/', 'node_modules/', 'tests/', 'scripts/'] },
  {
    files: ['src/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      // The legacy code names caught errors it ignores and drops fields by destructuring.
      'no-unused-vars': ['error', { caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
    },
  },
  {
    files: ['src/sw.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker, __SW_CACHE__: 'readonly', __SW_SHELL__: 'readonly' } },
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    // As for the legacy code it is moved from.
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none', ignoreRestSiblings: true }],
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      // Named here as well as in the preset: an `any` needs a type, or a comment saying why not.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
    },
  },
  {
    // Stored data goes through store/users.ts, which puts the current user's prefix on each key.
    // The language key is the device's (ui/i18n-dom.ts); index.html's theme script is not linted.
    files: ['src/**/*.{js,ts}'],
    ignores: ['src/store/users.ts', 'src/ui/i18n-dom.ts', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use userStorage from store/users.ts.' },
        { name: 'sessionStorage', message: 'Use userSession from store/users.ts.' },
      ],
    },
  },
  {
    // The layers (scripts/lib/eslint-layers.mjs). A lower layer reaches a higher one only through what main.ts
    // connects: ui/render.ts and connectSync (ui/sync-ui.ts) for the screen parts, onRendered for help mode.
    files: ['src/**/*.ts'],
    plugins: { layers },
    rules: {
      'layers/order': [
        'error',
        {
          // Kept (phase 8): the map, timeline and graphs share the item menu (map/menu), the gestures (map/zoom),
          // the line drawing (map/render, map/layout) and the timeline's drag state. Taking them apart is a redesign.
          allow: [
            'views/graphs/states.ts -> views/timeline/render.ts',
            'views/map/link.ts -> views/timeline/drag.ts',
            'views/map/menu.ts -> views/timeline/drag.ts',
            'views/map/menu.ts -> views/timeline/rows.ts',
            'views/map/zoom.ts -> views/graphs/points.ts',
            'views/map/zoom.ts -> views/timeline/drag.ts',
            'views/map/zoom.ts -> views/timeline/render.ts',
            'views/timeline/drag.ts -> views/map/menu.ts',
            'views/timeline/render.ts -> views/map/layout.ts',
            'views/timeline/render.ts -> views/map/render.ts',
          ],
        },
      ],
    },
  },
);
