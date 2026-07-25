import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));

// `eslint-config-next@15` only ships legacy (eslintrc) configs, so it has to be
// wrapped in FlatCompat. When it starts exporting native flat configs this can
// collapse to a plain `import`/spread of `eslint-config-next/core-web-vitals`.
const compat = new FlatCompat({ baseDirectory: __dirname });

// Flat config only auto-discovers `**/*.{js,cjs,mjs}`. Every other extension has
// to be named by a `files` entry or it is silently never linted.
const LINTED = ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs', '**/*.ts', '**/*.tsx'];

/**
 * Flat replacement for the old `.eslintrc.json` (`{ extends: ['next/core-web-vitals'] }`)
 * that `next lint` loaded. `next lint` is deprecated in Next 15 and removed in Next 16.
 */
const config = [
  {
    // `next lint` never looked at build output or generated files; neither do we.
    ignores: ['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts'],
  },
  {
    // An `eslint-disable` that no longer suppresses anything is a lie about the
    // code — it hides the fact that the underlying problem is gone (or that the
    // rule was never enabled). Error on them so they get deleted, not accumulated.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  ...compat.extends('next/core-web-vitals').map((entry) => ({
    ...entry,
    files: entry.files ?? LINTED,
  })),
  {
    // `next/core-web-vitals` wires up the TS parser but enables no TS rules at all,
    // so unused variables went uncaught for the life of this project. The plugin is
    // re-registered here because flat config resolves rule prefixes per config
    // object, not globally.
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          // `_`-prefixed names are the conventional "deliberately unused" marker —
          // positional params you must accept, discarded destructuring targets, and
          // `catch (_)` where the error genuinely does not matter.
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // `const { secret, ...safe } = row` is an idiomatic omit, not a mistake.
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];

export default config;
