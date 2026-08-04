import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

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
    // `.claude/worktrees/**` for the same reason `jest.config.ts` ignores it (added
    // in be04bab): agent worktrees are created INSIDE the repo, so each carries a
    // full second checkout plus its own `.next/`. Jest collected the duplicate
    // `__tests__` and reported 684 tests instead of 373; eslint walked the duplicate
    // build output and reported 576 errors in generated `.next/types/**` files that
    // the top-level `.next/**` pattern does not match at that depth. Both are
    // somebody else's build artefacts and neither is ours to lint.
    ignores: [
      '.next/**',
      '**/.next/**',
      '.claude/worktrees/**',
      'out/**',
      'build/**',
      'coverage/**',
      'next-env.d.ts',
    ],
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
  {
    // ── Type-aware rules, scoped to the server-side code ────────────────────
    //
    // These need full type information (`projectService`), which costs real lint
    // time, so they are scoped to where the bugs they catch actually hurt: the
    // data layer, the API surface, middleware and server actions. A floated
    // promise in a component re-renders oddly; a floated promise in a route
    // handler silently drops a database write and still returns 200.
    // NOTE: these are PATH globs, so moving a file OUT of one of these
    // directories silently removes it from these rules. The parent feature-slice
    // pilot hit exactly that — `lib/parent/data.ts` became
    // `features/parent/api/data.ts` and quietly left `no-floating-promises`
    // behind, with every gate still green. Any new server-side directory must be
    // added here in the same commit that creates it.
    //
    // The EXTENSION list has the same property, and had the same hole: every glob
    // below ended in `.ts`, so none of the 303 `.tsx` files in this repo got any
    // of these four rules. `src/**/*.tsx` closes it. That is not scope creep —
    // `no-misused-promises` on `onClick={async …}` is a COMPONENT bug class, and
    // it is where 46 of the 61 violations this glob surfaced actually live: an
    // async handler passed where a void return is expected swallows its own
    // rejection, so a failed save shows the user nothing. Measured cost of the
    // widening: `eslint .` 10.5s -> 22s.
    //
    // Those 61 violations were briefly frozen in a shrink-only debt block below
    // this one. They are all FIXED — every `.tsx` file in `src` is now at
    // 'error' with no exemption list, and there is deliberately nowhere left to
    // add one. A new violation is a build failure, which is the point: these
    // rules failed to cover components at all until 2026-08, and every one of
    // the 61 was a real unreported async failure.
    files: [
      'src/lib/**/*.ts',
      'src/features/**/*.ts',
      'src/app/api/**/*.ts',
      'src/middleware.ts',
      'src/instrumentation.ts',
      'src/app/**/actions.ts',
      'src/**/*.tsx',
    ],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      // An un-awaited promise in a request handler is a write that may never
      // land, with a 200 already sent to the client.
      '@typescript-eslint/no-floating-promises': 'error',
      // `onClick={async () => …}` where a void return is expected, and the
      // `if (somePromise)` class of always-truthy bug.
      '@typescript-eslint/no-misused-promises': 'error',
      // A `switch` over a union that silently stops handling a case when the
      // union grows — exactly how `enrolled` went missing from ApplicationStatus.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // `await` on a non-promise is nearly always a misread of an API's shape.
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    // The generated Supabase types are a database contract, not a domain model.
    // Importing them directly is how row shapes leak into components and drift
    // from the columns actually selected. Confined to the data layer; the rest of
    // the app should consume domain types built on top of it.
    //
    // Scoped as a warning for now — `docs/audit/06-types-validation.md` records
    // the existing call sites this would flag. Promote to 'error' once the
    // shared/data layer (Phase 3) gives them somewhere to go.
    //
    // A `warn` is only a gate because the npm script pins `--max-warnings 2` —
    // ESLint's exit code ignores warnings otherwise, and for a while this rule
    // was decorative: a third leak of a generated DB row type into the component
    // tree left `npm run lint` at exit 0. The 2 is the frozen count of the two
    // known sites (src/components/university-search/shortlist-store.ts:6 and
    // src/hooks/useSupabase.ts:6). Same shrink-only posture as lint:tokens and
    // lint:datalayer: LOWER the number as they are fixed, never raise it. If you
    // add a new `warn`-severity rule here, its findings must fit under the same
    // budget or the number moves in the same reviewed commit.
    // NB: no `{ts,tsx}` brace patterns anywhere in this file. The npm `overrides`
    // pin `brace-expansion@5`, whose export shape minimatch cannot call, so any
    // brace pattern dies with `TypeError: expand is not a function`. Enumerate
    // extensions instead — the same reason `LINTED` above is spelled out longhand.
    files: ['src/components/**/*.ts', 'src/components/**/*.tsx', 'src/hooks/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@/lib/types/database',
              message:
                'Import a domain type instead of the generated DB row type. See docs/audit/06-types-validation.md.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
