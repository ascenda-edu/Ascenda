/**
 * dependency-cruiser — the module-boundary fence.
 *
 * WHY THIS EXISTS
 * The architecture audit (docs/audit/01-architecture.md) measured all 1,350 import
 * edges in src/ and found three properties already true and enforced by nothing:
 *
 *     src/lib        ->  src/app          0 edges
 *     src/lib        ->  src/components   0 edges
 *     src/components ->  src/app          0 edges
 *
 * "Held together entirely by author discipline" (01-architecture.md:225). This config
 * fences TODAY'S SHAPE so it cannot erode. It deliberately does NOT encode the target
 * feature-sliced architecture (rules R1-R14 in 01-architecture.md) — that comes with
 * the file moves. Everything here is green on the current tree.
 *
 * Run: npm run lint:boundaries
 */
module.exports = {
  forbidden: [
    // ---------------------------------------------------------------------
    // Layering — the three properties measured at zero. Direction of import:
    //   app -> components -> lib.  Never backwards.
    // ---------------------------------------------------------------------
    {
      name: 'lib-not-to-app',
      comment:
        'src/lib is the bottom layer: pure logic, data access and types. It must never ' +
        'reach up into a route module. Measured 0 edges — keep it at 0. ' +
        '(01-architecture.md section 2, rule R5/R6.)',
      severity: 'error',
      from: { path: '^src/lib/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'lib-not-to-components',
      comment:
        'src/lib must not import React components. If a lib module needs a type that ' +
        'currently lives in components/, the type belongs in lib/. Measured 0 edges. ' +
        'NOTE: src/hooks IS allowed to do this today (hooks/use-search-results.ts:20 -> ' +
        '@/components/university-search/types) — the one known inversion. It is covered ' +
        'by hooks-not-to-app below, not here.',
      severity: 'error',
      from: { path: '^src/lib/' },
      to: { path: '^src/components/' },
    },
    {
      name: 'components-not-to-app',
      comment:
        'Shared components must not import from a route. A component that needs something ' +
        'from src/app/ is either mis-located or the thing it needs belongs in lib/. ' +
        'Measured 0 edges — keep it at 0.',
      severity: 'error',
      from: { path: '^src/components/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'hooks-not-to-app',
      comment:
        'src/hooks is app-wide by definition; importing a route module would make it ' +
        'route-specific. Measured 0 edges.',
      severity: 'error',
      from: { path: '^src/hooks/' },
      to: { path: '^src/app/' },
    },

    // ---------------------------------------------------------------------
    // Route modules are framework entry points, not libraries.
    // ---------------------------------------------------------------------
    {
      name: 'not-to-route-module',
      comment:
        'WARN (should be ERROR — see below). Nothing may import from page.tsx / layout.tsx / ' +
        'route.ts / error.tsx / loading.tsx / template.tsx / default.tsx. These carry ' +
        "`export const dynamic`, `metadata` and server-only default exports; importing them " +
        'couples a client component to a server route graph. ' +
        'KNOWN VIOLATIONS (3):\n' +
        "  - src/app/counsellor/_components/student-roster.tsx:10    -> '../page'  (type-only)\n" +
        "  - src/app/counsellor/students/_students-page-client.tsx:6 -> '../page'  (type-only, cross-route)\n" +
        "  - src/app/course/[id]/page.tsx:5 -> './loading'  (value import: reuses its own\n" +
        '    skeleton as a Suspense fallback. Benign, but the skeleton should move to a\n' +
        '    _components/ module that BOTH page.tsx and loading.tsx import.)\n' +
        'The two counsellor ones are type-only so they erase at runtime — which is the only ' +
        'reason this rule is warn and not error. ' +
        'TO PROMOTE TO ERROR: move `DashboardFilter` out of ' +
        'src/app/counsellor/_dashboard-client.tsx into a shared model module (e.g. ' +
        'src/lib/counsellor/types.ts, where CounsellorStudent already lives), delete the ' +
        're-export at src/app/counsellor/page.tsx:18, and repoint both importers. ' +
        'That single move also clears the no-circular exception below. ' +
        '(01-architecture.md finding A4, rule R7.)',
      severity: 'warn',
      from: {},
      to: {
        path: '^src/app/.+/(page|layout|route|error|loading|template|default|not-found)\\.(ts|tsx)$',
      },
    },

    // ---------------------------------------------------------------------
    // Feature slices — the target architecture, live on the pilot slice.
    //
    // `src/features/parent/` is the first slice migrated to the shape in
    // docs/audit/SYNTHESIS.md section 6.1 and 01-architecture.md rules R2/R3/R4/R9:
    //
    //     app  ->  features/<slice>/index.ts  ->  shared
    //
    // These four rules are written GENERICALLY over `src/features/<slice>/`, not
    // hardcoded to `parent`. A second slice inherits the whole fence the moment its
    // directory exists — there is nothing to widen. They are already at error
    // severity because the pilot is green on all four; a rule that ships as `warn`
    // never becomes an error.
    //
    // NOT ENCODED YET (deliberate, both need work outside this pilot):
    //   * R5 `shared/** may not import features/**`. src/lib/chat/context.ts imports
    //     `@/features/parent` today — correct as an interim edge (it goes through
    //     index.ts, which feature-internals-are-private below enforces), and it will
    //     become a legal slice->slice edge when chat is migrated. Encoding R5 now
    //     would be red on arrival.
    //   * R10 `import 'server-only'` at the top of every features/*/api/** module.
    //     The `server-only` package is not a dependency and this pass could not run
    //     `npm install`. Until then features/parent/api/ is server-only by convention
    //     and by the barrel constraint documented in features/parent/README.md.
    // ---------------------------------------------------------------------
    {
      name: 'feature-internals-are-private',
      comment:
        'A slice has exactly one public surface: src/features/<slice>/index.ts. Code ' +
        'outside src/features/ (routes, lib, components, hooks) may import that barrel ' +
        'and nothing else — never features/<slice>/{api,model,ui,hooks}/**. This is what ' +
        'makes the slice movable: everything reachable from outside is one file wide, so ' +
        'its internals can be renamed, split or re-layered without a repo-wide sweep. ' +
        'FIX: add the symbol to the slice index.ts (a deliberate, reviewable widening) ' +
        'rather than deep-importing it. (01-architecture.md rule R2.)',
      severity: 'error',
      from: { pathNot: '^src/features/' },
      to: { path: '^src/features/[^/]+/(api|model|ui|hooks)/' },
    },
    {
      name: 'feature-crosses-slice-via-index',
      comment:
        'The same privacy rule between two slices: features/x may reach features/y only ' +
        'through features/y/index.ts. A slice may of course import its OWN internals — ' +
        'that is what the $1 back-reference to the importing slice exempts. ' +
        '(01-architecture.md rule R4.)',
      severity: 'error',
      from: { path: '^src/features/([^/]+)/' },
      to: {
        path: '^src/features/[^/]+/(api|model|ui|hooks)/',
        pathNot: '^src/features/$1/',
      },
    },
    {
      name: 'feature-not-to-app',
      comment:
        'A slice must not import a route module or anything else under src/app/. The ' +
        'dependency runs the other way: app/ is routing, and it consumes the slice. A ' +
        'slice that needs something from app/ has that thing in the wrong place — move it ' +
        'into the slice. (01-architecture.md rules R3/R6.) Measured 0 edges on the parent ' +
        'pilot: everything app/parent/ used to own (_lib/context.ts, _components/, and the ' +
        'four route-local client components) moved INTO the slice, leaving app/parent/ as ' +
        'page.tsx/layout.tsx/loading.tsx/error.tsx only.',
      severity: 'error',
      from: { path: '^src/features/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'feature-model-is-pure',
      comment:
        'features/<slice>/model/** is the pure layer: domain types and total functions, ' +
        'no I/O and no rendering. It may not import the slice\'s own api/ (Supabase, ' +
        'next/headers) or ui/ (React). That purity is what lets model/ be unit-tested ' +
        'with no mocks and imported from both a server and a client module — which the ' +
        'parent slice relies on (model/active-child.ts is read by a server route handler ' +
        'and by a client component). (01-architecture.md rule R9.)',
      severity: 'error',
      from: { path: '^src/features/[^/]+/model/' },
      to: { path: '^src/features/[^/]+/(api|ui|hooks)/' },
    },
    {
      name: 'feature-model-imports-no-framework',
      comment:
        'The runtime half of R9: model/** may not pull in React, next/* or the Supabase ' +
        'client. Enforced separately from feature-model-is-pure because a slice can keep ' +
        'its layers straight and still make model/ un-importable from a client component ' +
        'by reaching for next/headers. Type-only imports are NOT exempt here on purpose — ' +
        'a model type derived from a Supabase row type is the row shape leaking into the ' +
        'domain, which is docs/audit/06-types-validation.md in miniature.',
      severity: 'error',
      from: { path: '^src/features/[^/]+/model/' },
      to: { path: 'node_modules/(react|react-dom|next|@supabase)/' },
    },

    // ---------------------------------------------------------------------
    // Cycles
    // ---------------------------------------------------------------------
    {
      name: 'no-circular',
      comment:
        'Circular imports force the bundler to guess an evaluation order and produce ' +
        'undefined-at-module-init bugs that only appear in one build mode. ' +
        'This is an ERROR everywhere EXCEPT the three modules carved out below.',
      severity: 'error',
      from: {
        // ---------------------------------------------------------------
        // NARROW, TEMPORARY EXCEPTION — one known cycle, three modules.
        //
        //   src/app/counsellor/_components/student-roster.tsx:10
        //     -> import type { DashboardFilter } from '../page'
        //   src/app/counsellor/page.tsx:18
        //     -> export type { DashboardFilter } from './_dashboard-client'
        //   src/app/counsellor/_dashboard-client.tsx:19
        //     -> import { StudentRoster } from './_components/student-roster'
        //   -> back to student-roster.tsx
        //
        // It is type-only, so it erases at runtime today. It is listed here BY EXACT
        // PATH rather than suppressed with a broad glob so that:
        //   (a) every other module in the repo is still protected at severity=error,
        //   (b) a NEW cycle anywhere — including one that merely touches these files
        //       through a different set of modules — cannot hide behind it,
        //   (c) this comment is a visible to-do rather than a silent hole.
        //
        // TO REMOVE THIS EXCEPTION: move `DashboardFilter` to a non-route module and
        // delete the re-export at src/app/counsellor/page.tsx:18. Then delete the
        // pathNot below. Owner: architecture Phase 1. See 01-architecture.md A4.
        //
        // Files under src/ are owned by other agents this phase; this config could not
        // fix the cycle itself.
        // ---------------------------------------------------------------
        pathNot: [
          '^src/app/counsellor/_components/student-roster\\.tsx$',
          '^src/app/counsellor/page\\.tsx$',
          '^src/app/counsellor/_dashboard-client\\.tsx$',
        ],
      },
      to: { circular: true },
    },
    {
      name: 'no-circular-known-exception',
      comment:
        'The counsellor DashboardFilter cycle, kept visible at warn severity so it is ' +
        'reported on every run instead of vanishing. See the block comment on no-circular ' +
        'for the exact fix that deletes both this rule and the exception.',
      severity: 'warn',
      from: {
        path: [
          '^src/app/counsellor/_components/student-roster\\.tsx$',
          '^src/app/counsellor/page\\.tsx$',
          '^src/app/counsellor/_dashboard-client\\.tsx$',
        ],
      },
      to: { circular: true },
    },

    // ---------------------------------------------------------------------
    // Hygiene
    // ---------------------------------------------------------------------
    {
      name: 'no-orphans',
      comment:
        'A module with no dependents AND no dependencies is dead weight. warn, not error. ' +
        'CAVEAT, so nobody mistakes this for a dead-code gate: because node_modules ' +
        'modules are in the graph (required by not-to-dev-dep), any file that so much as ' +
        "imports `react` is not an orphan — so this catches only fully isolated files. " +
        'knip (npm run lint:deadcode) is the authoritative dead-code gate and covers the ' +
        'reachable-but-unused case this cannot see. Entry points, ambient .d.ts and config ' +
        'files are excluded below because they are legitimately unreferenced.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$', // ambient declarations (src/types/papaparse.d.ts, next-env.d.ts)
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$', // dotfiles: .eslintrc.js etc.
          '\\.(json|css|scss)$',
          '^src/middleware\\.ts$', // Next entry point, imported by nothing
          '^src/instrumentation\\.ts$', // ditto
          // Next.js file conventions — the framework is the importer.
          '^src/app/.*/(page|layout|route|error|loading|template|default|not-found|global-error|sitemap|robots|opengraph-image|icon|apple-icon|manifest)\\.(ts|tsx)$',
          '^src/app/(page|layout|error|loading|not-found|global-error|sitemap|robots|manifest)\\.(ts|tsx)$',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-dev-dep',
      comment:
        'Production code (everything under src/) must not import a devDependency — it ' +
        'builds locally and explodes in a production install. Type-only imports are ' +
        'exempt (@types/* are devDeps by design and erase at compile time).',
      severity: 'error',
      from: {
        path: '^src/',
        pathNot: '\\.(spec|test)\\.(js|mjs|cjs|ts|tsx)$',
      },
      to: {
        dependencyTypes: ['npm-dev'],
        dependencyTypesNot: ['type-only'],
        pathNot: ['node_modules/@types/'],
      },
    },
    {
      name: 'no-deprecated-core',
      comment: 'Node core modules that were deprecated years ago.',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['core'], path: '^(punycode|domain|sys|querystring)$' },
    },
  ],

  options: {
    // doNotFollow, NOT exclude: node_modules modules stay IN the graph (so
    // not-to-dev-dep can see them) but their own imports are not traversed.
    // Putting node_modules in `exclude` silently makes every dependencyTypes
    // rule vacuous — verified: it drops all 548 npm edges from the cruise.
    doNotFollow: { path: '(^|/)node_modules/' },
    // Keep first-party scope to src/; boundaries are a src/ concern.
    exclude: { path: '\\.next/|^__tests__/|^scripts/' },
    tsPreCompilationDeps: true, // so `import type` edges are seen (the cycle is type-only)
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
