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
 * is green today and trips on a real regression rather than on noise. Baseline
 * measured 2026-08-01 on branch security/phase0-contain; cross-checks against
 * docs/audit/08-performance.md, which ranks the routes identically.
 *
 * These are a CEILING, not a target. docs/audit/08-performance.md lists the actual
 * fixes (framer-motion in 40/47 routes, @supabase/* in 26/47, react-markdown on the
 * three assistant routes). When one lands, LOWER the budget in the same PR.
 */
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NEXT_DIR = join(ROOT, '.next');
const MANIFEST = join(NEXT_DIR, 'app-build-manifest.json');

const args = new Set(process.argv.slice(2));
const REPORT = args.has('--report');
const SUGGEST = args.has('--suggest');

/** Gzipped kB. Every route not listed here gets DEFAULT_BUDGET_KB. */
const ROUTE_BUDGETS = {
  // route                          budget   measured 2026-08-01
  '/assistant': 345, //   328  react-markdown + micromark (~33 kB, 3 routes only)
  '/counsellor/assistant': 315, //   300
  '/parent/assistant': 315, //   300
  '/scholarships': 300, //   285
  '/appointment': 300, //   281
  '/university-search/search': 280, //   264
  '/counsellor': 280, //   262
  '/dashboard': 275, //   260
  '/matches': 275, //   259
  '/': 270, //   255  public landing: Lenis + the scrollytelling chapters
  '/counsellor/universities': 270, //   254
  '/profile': 265, //   250
  '/applications/documents': 265, //   249
  '/inbox': 265, //   247
  '/counsellor/students/[id]': 265, //   247
  '/university-search/shortlist': 260, //   243
  '/counsellor/students': 260, //   241
  '/course/[id]': 255, //   240
};

/** Any route without an explicit budget. Highest unlisted today: /applications 235. */
const DEFAULT_BUDGET_KB = 250;

/**
 * The chunk set every single route loads. Measured 100 kB across 4 chunks
 * (webpack + React 19/Next runtime + main-app). Every kB added here is multiplied
 * by 47 routes, so it gets its own, tighter budget.
 */
const SHARED_BUDGET_KB = 110;

// ---------------------------------------------------------------------------

if (!existsSync(MANIFEST)) {
  console.error(
    `Bundle budget: ${relative(ROOT, MANIFEST)} not found.\n\n` +
      '  This gate reads the output of a PRODUCTION build. Run:\n' +
      '      npm run build && npm run check:bundle\n\n' +
      '  (`next dev` does not write app-build-manifest.json.)'
  );
  process.exit(1);
}

const gzipCache = new Map();
function gzKB(file) {
  if (!gzipCache.has(file)) {
    let bytes = 0;
    try {
      bytes = gzipSync(readFileSync(join(NEXT_DIR, file)), { level: 9 }).length;
    } catch {
      console.error(`  warning: chunk missing from .next, treated as 0 bytes: ${file}`);
    }
    gzipCache.set(file, bytes);
  }
  return gzipCache.get(file);
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

if (SUGGEST) {
  console.log('const ROUTE_BUDGETS = {');
  for (const r of routes) {
    if (r.kb < DEFAULT_BUDGET_KB - 15) continue;
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
  const budget = ROUTE_BUDGETS[r.route] ?? DEFAULT_BUDGET_KB;
  r.budget = budget;
  if (r.kb > budget) failures.push({ route: r.route, kb: r.kb, budget });
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
    console.error(`  ${f.route}: ${f.kb} kB > ${f.budget} kB (+${f.kb - f.budget} kB)`);
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
