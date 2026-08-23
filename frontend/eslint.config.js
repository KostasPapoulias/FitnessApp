// @ts-check
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * ESLint for the frontend.
 *
 * There was none. `npm run lint` ran, resolved the `.eslintrc.cjs` at the REPO
 * ROOT — which belongs to the abandoned MUI/Redux prototype and has no
 * TypeScript parser — and failed on every single `.ts`/`.tsx` file with
 * `Parsing error: The keyword 'interface' is reserved`. Seventy-two errors,
 * none of them real, so the script had never once linted this codebase.
 *
 * Flat config specifically, rather than another `.eslintrc`. Flat config does
 * not walk up the directory tree looking for parent configs, so the dead
 * prototype's file at the root can no longer be picked up by accident — which
 * makes this a fix for the cause and not just for the symptom.
 */
export default tseslint.config(
  {
    // `dist` is build output and `dev-dist` is Vite's. Linting either is
    // thousands of errors about generated code.
    ignores: ['dist', 'dev-dist', 'node_modules'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // An unused variable is usually a leftover, but an unused *argument* is
      // often required by a signature. The underscore convention says "I know,
      // and I mean it" — the same convention `noUnusedParameters` uses on the
      // backend.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // `any` is a warning rather than an error here deliberately. Turning it on
      // as an error against an existing codebase produces a wall of failures
      // that get silenced with a blanket disable, which is worse than seeing
      // them. It is a list to work through, not a gate.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // The service worker is plain JS, runs in a worker scope with no DOM, and
    // is copied verbatim by Vite. Without this it fails on `self`, `caches` and
    // `clients` as undefined globals.
    files: ['public/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
    },
  },
)
