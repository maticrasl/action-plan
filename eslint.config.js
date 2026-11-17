/** ESLint: recommended rules only (no-undef among them); no style rules. */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'dist-test/', 'node_modules/', 'tests/', 'scripts/'] },
  {
    files: ['src/**/*.js'],
    extends: [js.configs.recommended],
    // google: Google's sign-in script, loaded at run time (drive.js).
    languageOptions: { globals: { ...globals.browser, google: 'readonly' } },
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
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
    },
  },
);
