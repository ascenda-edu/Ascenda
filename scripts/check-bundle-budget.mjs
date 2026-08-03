#!/usr/bin/env node
/**
 * Bundle budget — fails when a route's First Load JS grows past its budget.
 *
 *   npm run build && npm run check:bundle
 *   node scripts/check-bundle-budget.mjs --report   # full table, every route
 *   node scripts/check-bundle-budget.mjs --suggest  # paste-ready budget block
 *
 * ---------------------------------------------------------------------------
 * REQUIRES A PRODUCTION BUILD FIRST.
 * ---------------------------------------------------------------------------
 * This reads .next/app-build-manifest.json, which only `next build` writes.
 * `next dev` does not produce it, and a stale .next reports stale numbers. In CI
 * this step must run AFTER `npm run build` in the same job.
 *
 * The script now REFUSES rather than reporting a number it cannot stand behind:
 * a missing chunk, a manifest from a build that failed part-way, a `next dev`
 * .next, or a build older than the source it was built from are each a non-zero
 * exit. See assertUsableBuild() / assertNoMissingChunks() below for what each one
 * looked like when it silently passed.
 *
 * ---------------------------------------------------------------------------
 * HOW THE NUMBER IS COMPUTED
 * ---------------------------------------------------------------------------
 * .next/app-build-manifest.json maps every app route to the full list of client
 * chunks it loads, shared chunks included. First Load JS = the gzipped size of
 * that set, deduplicated, which is the same quantity `next build` prints in its
 * route table.
 *
 * Our numbers land ~2-3% BELOW the ones in the build log (this script measured
 * /assistant at 328 kB where the build table said 336 kB) because Next adds a
 * small per-route constant the manifest does not describe. That offset is stable,
 * so the budgets below are set against THIS script's measure, not against the
 * build log. Do not copy numbers from the build output into the table below.
 *
 * ---------------------------------------------------------------------------
 * BUDGETS
 * ---------------------------------------------------------------------------
 * Set at the measured value + ~15 kB of headroom (rounded up to 5 kB), so the gate
 * is green today and trips on a real regression rather than on noise. Re-measured
 * 2026-08-02 on branch security/phase0-contain, for ALL 47 routes; cross-checks
 * against docs/audit/08-performance.md, which ranks the routes identically.
 *
 * These are a CEILING, not a target. docs/audit/08-performance.md lists the actual
 * fixes (framer-motion in 40/47 routes, @supabase/* in 26/47, react-markdown on the
 * three assistant routes). When one lands, LOWER the budget in the same PR — that
 * instruction has been here since the file was written and was ignored once already
 * (see the `/` note on the table below), which is how 21 of 47 budgets ended up
 * unable to trip.
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NEXT_DIR = join(ROOT, '.next');
const MANIFEST = join(NEXT_DIR, 'app-build-manifest.json');
const BUILD_ID = join(NEXT_DIR, 'BUILD_ID');

const args = new Set(process.argv.slice(2));
const REPORT = args.has('--report');
const SUGGEST = args.has('--suggest');

/**
 * Gzipped kB per route: measured + ~15 kB, rounded up to 5. Regenerate the whole
 * block with `node scripts/check-bundle-budget.mjs --suggest` after a build.
 *
 * EVERY route is listed, deliberately. The previous table listed only the 19
 * heaviest and let the other 28 fall through to a 250 kB default, which meant
 * 32 of 47 routes carried more than 25 kB of headroom and 21 carried more than
 * 50 kB: `/shortlist` measured 101 against 250 — it could have tripled in silence.
 * A budget with 149 kB of slack is not a budget.
 *
 * `/` is the specific lesson. Phase 4 (`f4f36c1`) cut it 255 -> 197 kB and left the
 * budget at 270, against this file's own instruction two paragraphs up. 58 kB of
 * hard-won headroom went straight back into the ceiling. If you make a route
 * lighter, re-run --suggest in the SAME PR.
 *
 * Non-determinism: the build is not byte-identical run to run (+/-1 kB observed
 * across machines). 15 kB of headroom is an order of magnitude above that.
 */
const ROUTE_BUDGETS = {
  // route                                budget   measured 2026-08-03
  '/assistant': 345, //   326  react-markdown + micromark (~33 kB, 3 routes only)
  '/counsellor/assistant': 325, //   307
  '/parent/assistant': 325, //   307
  '/scholarships': 295, //   280
  '/appointment': 295, //   276
  '/university-search/search': 285, //   268
  '/counsellor/universities': 280, //   265
  '/counsellor': 280, //   262
  '/dashboard': 270, //   254
  '/matches': 270, //   253
  '/applications/documents': 270, //   253
  '/counsellor/students/[id]': 270, //   252
  '/university-search/shortlist': 265, //   248
  '/profile': 265, //   246
  '/counsellor/students': 265, //   246
  '/course/[id]': 260, //   244
  '/inbox': 260, //   241
  '/applications': 255, //   240
  '/profile/wizard': 245, //   230
  '/university-search/quests': 245, //   227
  '/toolbox/chances': 240, //   225
  '/counsellor/documents': 240, //   223
  '/counsellor/inbox': 235, //   218
  '/role-select': 225, //   209
  '/parent': 220, //   205
  '/admin': 220, //   204
  '/': 220, //   202  public landing: Lenis + the scrollytelling chapters
  '/applications/tasks': 220, //   202
  '/parent/finances': 220, //   202
  '/parent/messages': 220, //   202
  '/parent/progress': 220, //   202
  '/parent/deadlines': 220, //   202
  '/counsellor/analytics': 215, //   199
  '/toolbox/timeline': 215, //   196
  '/login': 210, //   192
  '/university-search/university/[id]': 195, //   178
  '/counsellor/applications': 180, //   164
  '/counsellor/deadlines': 180, //   162
  '/counsellor/outcomes': 175, //   159
  '/admin/simulation': 175, //   157
  '/toolbox/requirements': 175, //   157
  '/toolbox': 175, //   156
  '/toolbox/essay-workshop': 125, //   109
  '/_not-found': 120, //   101  server-only page: the shared bundle and nothing else
  '/shortlist': 120, //   101
  '/university-search/results': 120, //   101
  '/university-search': 120, //   101
};

/**
 * Fallback for a route with no entry above — i.e. a NEW route. Set just above the
 * shared bundle on purpose: a new page heavier than this must add its own line to
 * the table, which is a one-line diff a reviewer can see and question. It is not a
 * "sensible size for a page"; it is the point at which the author has to say what
 * the page costs. (Every route that exists today is listed, so this only ever
 * applies to something being added.)
 */
const DEFAULT_BUDGET_KB = 150;

/**
 * The chunk set every single route loads. Measured 100 kB across 4 chunks
 * (webpack + React 19/Next runtime + main-app). Every kB added here is multiplied
 * by 47 routes, so it gets its own, tighter budget.
 */
const SHARED_BUDGET_KB = 110;

// ---------------------------------------------------------------------------

// ── Is this manifest the output of a COMPLETE, CURRENT build? ───────────────
//
// existsSync(MANIFEST) was the only check, and it is not enough — twice observed:
//
//   1. A `npm run build` that exited 1 ("Failed to compile.", a type error) still
//      left app-build-manifest.json behind from its compile phase. The very next
//      `npm run check:bundle` printed all 47 routes and "All routes within budget",
//      exit 0. A gate that greens off a FAILED build is worse than no gate.
//   2. A `next dev` .next was on disk from an earlier session and `/course/[id]`
//      reported 27 kB / 255 kB — PASS — with its entire page chunk absent.
//
// Two conditions, both cheap:
//   - COMPLETE: .next/BUILD_ID exists, is not the dev sentinel, and is at least as
//     new as the manifest. Next writes BUILD_ID as part of finishing a production
//     build, so a build that died mid-way leaves an older one (or none).
//   - CURRENT: nothing under src/, and none of the build-shaping config files, has
//     been modified since the manifest was written.
function newestSourceMtime() {
  let newest = 0;
  let newestFile = '';
  const consider = (p) => {
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.mtimeMs > newest) { newest = st.mtimeMs; newestFile = relative(ROOT, p); }
  };
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else consider(full);
    }
  };
  walk(join(ROOT, 'src'));
  walk(join(ROOT, 'public'));
  for (const f of ['next.config.mjs', 'package.json', 'package-lock.json', 'tailwind.config.ts', 'postcss.config.js', 'tsconfig.json']) {
    consider(join(ROOT, f));
  }
  return { newest, newestFile };
}

function assertUsableBuild() {
  if (!existsSync(MANIFEST)) {
    console.error(
      `Bundle budget: ${relative(ROOT, MANIFEST)} not found.\n\n` +
        '  This gate reads the output of a PRODUCTION build. Run:\n' +
        '      npm run build && npm run check:bundle\n\n' +
        '  (`next dev` does not write app-build-manifest.json.)'
    );
    process.exit(1);
  }

  const manifestMtime = statSync(MANIFEST).mtimeMs;

  if (!existsSync(BUILD_ID)) {
    console.error(
      'Bundle budget: .next/app-build-manifest.json exists but .next/BUILD_ID does not.\n' +
        '  That is what a build which did not run to completion leaves behind.\n' +
        '  Re-run: npm run build && npm run check:bundle'
    );
    process.exit(1);
  }
  const buildId = readFileSync(BUILD_ID, 'utf8').trim();
  if (buildId === 'development') {
    console.error(
      'Bundle budget: .next/BUILD_ID says "development" — this .next was written by `next dev`.\n' +
        '  Dev chunks are unminified and incomplete; any number measured from them is fiction.\n' +
        '  Re-run: npm run build && npm run check:bundle'
    );
    process.exit(1);
  }
  const buildIdMtime = statSync(BUILD_ID).mtimeMs;
  // 2s of slack: these are written seconds apart by the same build, and some
  // filesystems keep coarse timestamps.
  if (buildIdMtime + 2000 < manifestMtime) {
    console.error(
      'Bundle budget: .next/BUILD_ID is OLDER than app-build-manifest.json.\n' +
        `  BUILD_ID  ${new Date(buildIdMtime).toISOString()}\n` +
        `  manifest  ${new Date(manifestMtime).toISOString()}\n` +
        '  The last build wrote a manifest and then did not finish — i.e. it FAILED.\n' +
        '  Refusing to report a budget result off it. Re-run: npm run build'
    );
    process.exit(1);
  }

  const { newest, newestFile } = newestSourceMtime();
  if (newest > manifestMtime) {
    console.error(
      'Bundle budget: the build is STALE — source has changed since it was produced.\n' +
        `  newest source  ${new Date(newest).toISOString()}  ${newestFile}\n` +
        `  manifest       ${new Date(manifestMtime).toISOString()}\n` +
        '  Re-run: npm run build && npm run check:bundle'
    );
    process.exit(1);
  }
}

assertUsableBuild();

const gzipCache = new Map();
/** Chunks named in the manifest that are not on disk. A hard failure, never a 0. */
const missingChunks = [];
function gzKB(file) {
  if (!gzipCache.has(file)) {
    let bytes = 0;
    try {
      bytes = gzipSync(readFileSync(join(NEXT_DIR, file)), { level: 9 }).length;
    } catch {
      // Was: warn and treat as 0 bytes. Hiding ONE 46 kB shared chunk made every
      // route report ~45 kB lighter and the gate still exited 0 — the gate's answer
      // to "I cannot read the thing I am measuring" was a smaller number.
      missingChunks.push(file);
    }
    gzipCache.set(file, bytes);
  }
  return gzipCache.get(file);
}

function assertNoMissingChunks() {
  if (!missingChunks.length) return;
  console.error(
    `\nBundle budget: ${missingChunks.length} chunk(s) named in the manifest are missing from .next.\n` +
      '  Every route that loads them is being under-measured, so a green result here would\n' +
      '  be meaningless. This is an incomplete or mismatched .next — re-run `npm run build`.\n'
  );
  for (const f of missingChunks.slice(0, 20)) console.error(`  ${f}`);
  if (missingChunks.length > 20) console.error(`  … ${missingChunks.length - 20} more`);
  process.exit(1);
}

/** '/(auth)/login/page' -> '/login';  '/toolbox/(shell)/page' -> '/toolbox' */
function toRoute(manifestKey) {
  const path = manifestKey
    .replace(/\/page$/, '')
    .split('/')
    .filter((seg) => !/^\(.*\)$/.test(seg))
    .join('/');
  return path === '' ? '/' : path;
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const chunkSets = [];
const routes = [];

for (const [key, files] of Object.entries(manifest.pages ?? {})) {
  // Route handlers (`/api/**/route`) ship no client JS; only pages have a
  // First Load JS figure.
  if (!key.endsWith('/page')) continue;
  const set = new Set(files);
  chunkSets.push(set);
  let bytes = 0;
  for (const f of set) bytes += gzKB(f);
  routes.push({ route: toRoute(key), kb: Math.round(bytes / 1024), chunks: set.size });
}

if (!routes.length) {
  console.error('Bundle budget: manifest contained no page routes. Is the build complete?');
  process.exit(1);
}

routes.sort((a, b) => b.kb - a.kb);

const sharedChunks = [...chunkSets[0]].filter((f) => chunkSets.every((s) => s.has(f)));
const sharedKB = Math.round(sharedChunks.reduce((a, f) => a + gzKB(f), 0) / 1024);

// Every chunk has now been read. If any was absent, every number above is too
// small — fail rather than report them.
assertNoMissingChunks();

if (SUGGEST) {
  console.log('const ROUTE_BUDGETS = {');
  // EVERY route, not just the heavy ones. Skipping the light ones is how 32 of 47
  // routes ended up on the 250 kB default with >25 kB of headroom — /shortlist
  // measured 101 against 250, i.e. it could have grown 2.5x in silence.
  for (const r of routes) {
    const budget = Math.ceil((r.kb + 15) / 5) * 5;
    console.log(`  '${r.route}': ${budget}, // ${String(r.kb).padStart(5)}`);
  }
  console.log('};');
  console.log(`const SHARED_BUDGET_KB = ${Math.ceil((sharedKB + 10) / 5) * 5}; // ${sharedKB}`);
  process.exit(0);
}

const failures = [];
if (sharedKB > SHARED_BUDGET_KB) {
  failures.push({
    route: '(shared by all routes)',
    kb: sharedKB,
    budget: SHARED_BUDGET_KB,
  });
}
for (const r of routes) {
  const listed = Object.prototype.hasOwnProperty.call(ROUTE_BUDGETS, r.route);
  const budget = listed ? ROUTE_BUDGETS[r.route] : DEFAULT_BUDGET_KB;
  r.budget = budget;
  if (r.kb > budget) failures.push({ route: r.route, kb: r.kb, budget, listed });
}

const shown = REPORT ? routes : routes.slice(0, 12);
console.log(`First Load JS (gzip) — ${routes.length} page routes`);
console.log(`  ${String(sharedKB).padStart(4)} kB / ${SHARED_BUDGET_KB} kB   (shared by all)`);
for (const r of shown) {
  const slack = r.budget - r.kb;
  const flag = slack < 0 ? 'OVER' : slack <= 5 ? 'tight' : '';
  console.log(
    `  ${String(r.kb).padStart(4)} kB / ${String(r.budget).padStart(3)} kB   ${r.route}${flag ? '   ' + flag : ''}`
  );
}
if (!REPORT && routes.length > shown.length) {
  console.log(`  … ${routes.length - shown.length} lighter routes (--report for all)`);
}

if (failures.length) {
  console.error('\nBundle budget exceeded:');
  for (const f of failures) {
    console.error(
      `  ${f.route}: ${f.kb} kB > ${f.budget} kB (+${f.kb - f.budget} kB)` +
        (f.listed === false ? '   [no budget entry — this route fell through to the default]' : '')
    );
  }
  console.error(
    '\nEither trim the route (see docs/audit/08-performance.md for what is heavy and why),\n' +
      'or raise the budget in scripts/check-bundle-budget.mjs and justify it in the PR.\n' +
      'Raising a budget should be a deliberate, reviewed act — that is the whole point.'
  );
  process.exit(1);
}

console.log('\nAll routes within budget.');
process.exit(0);
