#!/usr/bin/env node
/**
 * Ratchet: dead code may shrink, never grow.
 *
 *   npm run lint:deadcode                     # verify against the committed baseline
 *   npm run lint:deadcode:report              # knip's own full output, no gate
 *   node scripts/check-deadcode.mjs --update-baseline
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * `lint:deadcode` used to be `knip --no-exit-code`, which ALWAYS exits 0. It was
 * documented as deliberate ("a report, not a gate, until the backlog is burned
 * down") and it was in CI — so it looked like one of the nine gates. It was not:
 * planting a brand-new unreferenced file, `src/lib/audit-dead-file.ts`, produced
 *
 *     Unused files (3)
 *     …
 *     src/lib/audit-dead-file.ts        <- seen, listed, and exit 0
 *
 * and 217 findings rode along unenforced with no way for the list to be observed
 * growing.
 *
 * The burn-down argument was right and the exit code was wrong. So this is the
 * same shape the repo already uses for design tokens and data-layer confinement:
 * knip's counts, per category, frozen in scripts/check-deadcode.baseline.json,
 * failing only on an INCREASE. Existing debt stays visible and unblocking; a new
 * unused file or export is red on the PR that adds it.
 *
 * ---------------------------------------------------------------------------
 * SEMANTICS
 * ---------------------------------------------------------------------------
 *   - Counts are per knip issue TYPE (files, exports, types, devDependencies, …).
 *     Per-type rather than one total, so deleting an unused export cannot pay for
 *     a new unused file.
 *   - --update-baseline may only LOWER a number. Raising one is a hand edit to the
 *     JSON, which is exactly the friction a reviewer should see.
 *   - KNOWN LIMITATION, inherited from the other ratchets: a count is a total, not
 *     a set. Deleting one unused export and adding another nets to zero. The
 *     `files` category is the one where that matters least and where the findings
 *     are actionable today.
 *   - False positives are suppressed in knip.json (see its header — `**\/*.d.ts`
 *     as an entry, the jest.environment-node.js docblock), NOT here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(ROOT, 'scripts', 'check-deadcode.baseline.json');

const args = new Set(process.argv.slice(2));
const UPDATE = args.has('--update-baseline');
const REPORT = args.has('--report');

/** Issue types knip reports per file. Anything new knip adds shows up automatically. */
function runKnip() {
  let raw;
  try {
    raw = execFileSync(
      process.execPath,
      [join(ROOT, 'node_modules', 'knip', 'bin', 'knip.js'), '--reporter', 'json', '--no-exit-code'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }
    );
  } catch (err) {
    console.error('knip failed to run:', err.message);
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch {
    console.error('knip did not emit JSON. Output was:\n' + raw.slice(0, 2000));
    process.exit(1);
  }
}

const { issues } = runKnip();
if (!Array.isArray(issues)) {
  console.error('Unexpected knip JSON shape — no `issues` array. Refusing to report success.');
  process.exit(1);
}

/** @type {Record<string, string[]>} category -> "file: name" */
const found = {};
for (const entry of issues) {
  for (const [type, value] of Object.entries(entry)) {
    if (type === 'file' || !Array.isArray(value) || value.length === 0) continue;
    (found[type] ??= []).push(
      ...value.map((v) => `${entry.file}${v?.name && v.name !== entry.file ? `: ${v.name}` : ''}`)
    );
  }
}

const current = Object.fromEntries(
  Object.entries(found)
    .map(([k, v]) => [k, v.length])
    .sort(([a], [b]) => a.localeCompare(b))
);
const total = Object.values(current).reduce((a, b) => a + b, 0);

if (REPORT) {
  for (const [type, items] of Object.entries(found).sort()) {
    console.log(`\n[${type}] ${items.length}`);
    for (const i of items) console.log(`  ${i}`);
  }
  console.log('');
}

let baseline = null;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).counts ?? {};
} catch {
  /* first run */
}

if (UPDATE || baseline === null) {
  if (baseline) {
    for (const [type, n] of Object.entries(current)) {
      const prev = baseline[type];
      if (prev !== undefined && n > prev) {
        console.error(
          `refusing to raise baseline for [${type}]: ${prev} -> ${n}.\n` +
            `  Delete the dead code, or edit ${relative(ROOT, BASELINE)} by hand and justify it in the PR.`
        );
        process.exit(1);
      }
    }
  }
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment:
          'Ratchet baseline for scripts/check-deadcode.mjs (knip). Counts may only go DOWN. ' +
          'A category at 0 should be deleted from this file so it becomes a hard error. ' +
          'Regenerate with: node scripts/check-deadcode.mjs --update-baseline',
        _generated: new Date().toISOString().slice(0, 10),
        counts: current,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`${baseline ? 'Updated' : 'Wrote'} ${relative(ROOT, BASELINE)} — ${total} findings:`);
  for (const [t, n] of Object.entries(current)) console.log(`  ${String(n).padStart(4)}  ${t}`);
  process.exit(0);
}

let failed = false;
let loosened = false;
const summary = [];
// Union of both key sets: a category that disappears entirely is a ratchet DOWN,
// and a category knip has newly started reporting has an implicit baseline of 0.
for (const type of [...new Set([...Object.keys(baseline), ...Object.keys(current)])].sort()) {
  const n = current[type] ?? 0;
  const max = baseline[type] ?? 0;
  if (n > max) {
    failed = true;
    summary.push(`  FAIL  ${type}: ${n} (baseline ${max}, +${n - max})`);
    for (const item of (found[type] ?? []).slice(0, 25)) console.error(`        ${item}`);
    if ((found[type] ?? []).length > 25) {
      console.error(`        … ${found[type].length - 25} more (run with --report)`);
    }
  } else if (n < max) {
    loosened = true;
    summary.push(`  ok    ${type}: ${n} (baseline ${max}, -${max - n}) <- ratchet down`);
  } else {
    summary.push(`  ok    ${type}: ${n}`);
  }
}

console.log(`Dead code (knip) — ${total} findings`);
console.log(summary.join('\n'));

if (failed) {
  console.error(
    '\nNew dead code. Delete it, wire it up, or — if it is a knip false positive — suppress it in\n' +
      'knip.json WITH A REASON, the way the existing guards in that file are written.'
  );
  process.exit(1);
}
if (loosened) {
  console.log(
    '\nSome counts dropped below the baseline. Tighten the ratchet:\n' +
      '  node scripts/check-deadcode.mjs --update-baseline'
  );
}
process.exit(0);
