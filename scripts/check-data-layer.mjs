#!/usr/bin/env node
/**
 * Ratchet: direct PostgREST access outside the data layer may shrink, never grow.
 *
 * ── Why a ratchet and not a rule ────────────────────────────────────────────
 * The target is that `.from('table')` and `.rpc()` appear ONLY inside
 * `src/lib/data/`, so column lists and error dispositions live in one place. Today
 * 183 call sites are spread across 50 files, so a hard `no-restricted-syntax` rule
 * would be red on arrival — and a gate that fails on every PR from day one is a
 * gate somebody deletes in week two.
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

// ── What counts ─────────────────────────────────────────────────────────────
//
// `.from(` and `.rpc(` — every PostgREST entry point, in every form it is written.
//
// History, because each correction moved the number:
//   166  `/\.from\('/g` — single quotes only. Missed 18 real sites: double quotes,
//        template literals, and the `.from(table)` indirection used in three files.
//   198  the two regexes below, anchored on what FOLLOWS the paren. Also wrong,
//        four ways, all four demonstrated with a green gate:
//          - 2 of the 198 were `.from()` inside JSDoc EXAMPLES, so deleting a
//            doc-comment bought you a real new call site at zero cost;
//          - 4 were Supabase *Storage* `.from(bucket)`, which is not PostgREST and
//            has no business in src/lib/data;
//          - `.from(TABLES.programs)` (a member expression) and
//            `.from(String('programs'))` (a call expression) matched NEITHER regex,
//            because the anchor demanded a quote or a bare identifier;
//          - `.rpc('search_filter_options')` was not counted at all, though it is
//            the same "talk to PostgREST outside the data layer" this gate exists for.
//   183  the real figure. 198 − 2 doc-comment examples − 4 Storage `.from(bucket)`
//        − 10 FALSE POSITIVES the old anchor let through (`Array.from(cur)`,
//        `Buffer.from(token)` and friends: a bare identifier followed by `)` is
//        exactly what `Array.from(x)` looks like) + 1 `.rpc(`. So the old 198 was
//        wrong in both directions at once, and the audit's own decomposition
//        (192 real PostgREST) was 10 high for the same reason.
//        Verified per-file against the old script's --report: the ONLY deltas are
//        those 16 removals and the one `.rpc` addition.
//
// So the anchor is inverted: match `.from(` / `.rpc(` unconditionally and reject on
// the RECEIVER instead, which is a closed set (`Array.from`, `Buffer.from`,
// `<typedarray>.from`, and `supabase.storage.from`). An unknown receiver counts —
// a false positive is a visible number to argue about; a false negative is a hole.
//
// KNOWN, DELIBERATE HOLES (a regex cannot close these; do not pretend otherwise):
//   - aliasing the method: `const f = supabase.from.bind(supabase); f('programs')`
//   - building the call dynamically: `supabase[m]('programs')`
// Both are contrived. Neither appears in this tree. If one ever does, this script
// has to become an AST pass — which is the point at which it should just be the
// ESLint `no-restricted-syntax` rule the docstring above promises.
const CALL_RE = /\.\s*(from|rpc)\s*\(/g;

/** Receivers whose `.from(` is not PostgREST. Checked against the text before the dot. */
const NOT_POSTGREST = /(?:\bArray|\bBuffer|\b(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array|\bFloat(?:32|64)Array|\bBigInt64Array|\bBigUint64Array|\bstorage)\s*$/;

/**
 * Blank out comment lines, preserving line count and offsets.
 *
 * Line-oriented, matching scripts/check-design-tokens.mjs — a JSDoc `@example` that
 * shows the very call this gate bans is documentation, not a call site, and counting
 * it made the doc-comment a currency you could spend on a real one.
 */
function stripComments(text) {
  return text
    .split('\n')
    .map((line) => {
      const t = line.trimStart();
      return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') ? '' : line;
    })
    .join('\n');
}

const counts = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (EXEMPT.some((prefix) => rel.startsWith(prefix))) continue;
  const text = stripComments(readFileSync(file, 'utf8'));
  let hits = 0;
  const where = [];
  for (const m of text.matchAll(CALL_RE)) {
    // `supabase.storage\n  .from(bucket)` is real: look back across whitespace.
    if (NOT_POSTGREST.test(text.slice(Math.max(0, m.index - 64), m.index).trimEnd())) continue;
    hits++;
    where.push(`${text.slice(0, m.index).split('\n').length}  .${m[1]}(`);
  }
  if (hits > 0) counts.push({ file: rel, hits, where });
}
counts.sort((a, b) => b.hits - a.hits || a.file.localeCompare(b.file));
const total = counts.reduce((sum, c) => sum + c.hits, 0);

if (process.argv.includes('--report')) {
  for (const c of counts) {
    console.log(String(c.hits).padStart(4), c.file);
    if (process.argv.includes('--lines')) for (const w of c.where) console.log(`        ${w}`);
  }
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
    `${JSON.stringify({ _readme: 'Direct PostgREST call sites (.from / .rpc) outside src/lib/data, comments stripped and Supabase Storage excluded. May shrink, never grow. See scripts/check-data-layer.mjs.', total, files: counts.length }, null, 2)}\n`
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
    `\n✗ Direct PostgREST call sites (.from / .rpc) outside src/lib/data rose ${baseline.total} → ${total}.\n\n` +
      `  Add the query to src/lib/data/ instead: put its column list in columns.ts (so it\n` +
      `  cannot diverge from other callers) and pick unwrap or soft from errors.ts (so\n` +
      `  "render empty on failure" is a decision, not an unbound error variable).\n\n` +
      `  Run with --report to see where they are.\n`
  );
  process.exit(1);
}

if (total < baseline.total) {
  console.log(
    `✓ ${total} direct PostgREST call sites (.from / .rpc) outside src/lib/data — down from ${baseline.total}.\n` +
      `  Run --update-baseline to lock the improvement in.`
  );
  process.exit(0);
}

console.log(`✓ ${total} direct PostgREST call sites (.from / .rpc) outside src/lib/data (at baseline, ${counts.length} files).`);
