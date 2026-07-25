import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';

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
    // eslintrc defaulted this to "off"; flat config defaults it to "warn". Keep the
    // old behaviour so the migration is a no-op. Flipping this to 'warn' surfaces
    // three dead `eslint-disable-next-line` comments that are safe to delete.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  ...compat.extends('next/core-web-vitals').map((entry) => ({
    ...entry,
    files: entry.files ?? LINTED,
  })),
];

export default config;
