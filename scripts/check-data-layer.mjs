#!/usr/bin/env node
/**
 * Ratchet: direct PostgREST access outside the data layer may shrink, never grow.
 *
 * ── Why a ratchet and not a rule ────────────────────────────────────────────
 * The target is that `.from('table')` appears ONLY inside `src/lib/data/`, so
 * column lists and error dispositions live in one place. Today 198 call sites
 * are spread across 56 files, so a hard `no-restricted-syntax` rule would be red
 * on arrival — and a gate that fails on every PR from day one is a gate somebody
 * deletes in week two.
 *
 * So this counts, compares against a committed baseline, and fails only on an
 * INCREASE. Migrating a file lowers the number; `--update-baseline` then locks
 * the improvement in, and REFUSES to move the number up — same mechanism as
 * scripts/check-design-tokens.mjs. (That last sentence was written before the
 * refusal was implemented, and was untrue for a day: a reviewer moved the
 * baseline 166 -> 167 with exit 0. It is enforced now.)
 *
 * When the count reaches zero, delete this script and replace it with the real
 * ESLint rule — at that point it costs nothing and is stricter.
 *
 * Usage:
 *   node scripts/check-data-layer.mjs                 # verify (CI)
 *   node scripts/check-data-layer.mjs --report        # list every offending file
 *   node scripts/check-data-layer.mjs --update-baseline
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, 'scripts', 'check-data-layer.baseline.json');

/** The data layer itself, plus the one file that legitimately builds clients. */
const EXEMPT = [
  'src/lib/data/',
  // Creates the clients everything else uses; it calls no .from() of its own, but
  // is listed so moving a helper here is never mistaken for a regression.
  'src/lib/supabase/'
];

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
};

// The PostgREST table selector, in every form it is actually written.
//
// This was `/\.from\('/g` — single quotes only — which a reviewer showed missed
// 18 real call sites: double-quoted names, template literals, and the
// `tbl(supabase, name)` / `.from(table)` indirection used in three files. A
// ratchet that cannot see a violation is not a ratchet, so the count it was
// holding (166) was ~18 short of the truth.
//
// `.from(` alone would also match Array.from and framer-motion's `from`, so each
// alternative is anchored on what follows: a quote, a backtick, or an identifier
// that is not immediately a `(`.
const PATTERNS = [
  /\.from\(\s*['"`]/g,           // .from('x')  .from("x")  .from(`x`)
  /\.from\(\s*[A-Za-z_$][\w$]*\s*[),]/g // .from(table)  .from(name, …)
];

const counts = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (EXEMPT.some((prefix) => rel.startsWith(prefix))) continue;
  const text = readFileSync(file, 'utf8');
  const hits = PATTERNS.reduce((sum, re) => sum + (text.match(re) ?? []).length, 0);
  if (hits > 0) counts.push({ file: rel, hits });
}
counts.sort((a, b) => b.hits - a.hits || a.file.localeCompare(b.file));
const total = counts.reduce((sum, c) => sum + c.hits, 0);

if (process.argv.includes('--report')) {
  for (const c of counts) console.log(String(c.hits).padStart(4), c.file);
  console.log('-'.repeat(48));
}

if (process.argv.includes('--update-baseline')) {
  // Refuse to move the baseline UP. The docstring always claimed the count "can
  // never go back up"; the script did not enforce it, and a reviewer moved it
  // 166 -> 167 with exit 0. A ratchet you can quietly loosen is a counter.
  // (scripts/check-design-tokens.mjs already refuses; this now matches it.)
  try {
    const current = JSON.parse(readFileSync(BASELINE, 'utf8'));
    if (typeof current.total === 'number' && total > current.total) {
      console.error(
        `\n✗ Refusing to raise the baseline ${current.total} -> ${total}.\n\n` +
          `  This ratchet only moves down. If the increase is genuinely justified,\n` +
          `  edit ${relative(ROOT, BASELINE)} by hand in the same commit, so the\n` +
          `  reviewer sees the number change alongside the reason.\n`
      );
      process.exit(1);
    }
  } catch {
    // No baseline yet — establishing one for the first time is allowed.
  }
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ _readme: 'Direct .from() call sites outside src/lib/data. May shrink, never grow. See scripts/check-data-layer.mjs.', total, files: counts.length }, null, 2)}\n`
  );
  console.log(`baseline updated: ${total} call sites across ${counts.length} files`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch {
  console.error(`No baseline at ${relative(ROOT, BASELINE)}. Run with --update-baseline.`);
  process.exit(1);
}

if (total > baseline.total) {
  console.error(
    `\n✗ Direct .from() call sites outside src/lib/data rose ${baseline.total} → ${total}.\n\n` +
      `  Add the query to src/lib/data/ instead: put its column list in columns.ts (so it\n` +
      `  cannot diverge from other callers) and pick unwrap or soft from errors.ts (so\n` +
      `  "render empty on failure" is a decision, not an unbound error variable).\n\n` +
      `  Run with --report to see where they are.\n`
  );
  process.exit(1);
}

if (total < baseline.total) {
  console.log(
    `✓ ${total} direct .from() call sites outside src/lib/data — down from ${baseline.total}.\n` +
      `  Run --update-baseline to lock the improvement in.`
  );
  process.exit(0);
}

console.log(`✓ ${total} direct .from() call sites outside src/lib/data (at baseline, ${counts.length} files).`);
