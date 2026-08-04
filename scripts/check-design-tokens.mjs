#!/usr/bin/env node
/**
 * Design-system gate — the house rules ESLint cannot express.
 *
 *   npm run lint:tokens                 # check against the committed baseline
 *   node scripts/check-design-tokens.mjs --report          # per-file breakdown
 *   node scripts/check-design-tokens.mjs --update-baseline # re-record (see below)
 *
 * ---------------------------------------------------------------------------
 * RATCHET SEMANTICS — read this before touching the baseline
 * ---------------------------------------------------------------------------
 * docs/audit/09-design-system.md counted 370+ existing violations, overwhelmingly
 * in src/components/landing* (a second, un-migrated design system). A gate that
 * prints 600 errors on day one gets switched off within a week. So:
 *
 *   - scripts/check-design-tokens.baseline.json records TODAY's count per rule.
 *   - The script FAILS only when a rule's count goes UP. Existing debt is frozen,
 *     new debt is blocked.
 *   - When a count goes DOWN the script PASSES but tells you to re-record, so the
 *     ratchet tightens instead of leaving slack behind.
 *   - --update-baseline may only LOWER a number. Raising one requires editing the
 *     JSON by hand, which is exactly the friction a code review should see.
 *
 * KNOWN LIMITATION: the baseline is a per-rule TOTAL, not per-file. Deleting five
 * violations in one file and adding five in another nets to zero and passes. That
 * is the accepted trade for a baseline that does not churn on every refactor.
 * Use --report to see where they actually live. Once a rule reaches 0, delete its
 * baseline entry and it becomes a hard error forever after.
 *
 * Zero dependencies, no build step, plain Node (>= 20 — hand-rolled directory walk
 * rather than fs.globSync, which is Node >= 22).
 *
 * Source: docs/audit/09-design-system.md "Target design system" > "Enforcement".
 * Every rule below was re-verified against the real tree; where the audit's draft
 * over- or under-matched, the deviation is noted on the rule.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_PATH = join(ROOT, 'scripts', 'check-design-tokens.baseline.json');
const SCAN_DIRS = ['src'];

const args = new Set(process.argv.slice(2));
const UPDATE = args.has('--update-baseline');
const REPORT = args.has('--report');

const PALETTES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|' +
  'sky|blue|indigo|violet|purple|fuchsia|pink|rose';

/**
 * Per-rule file exemptions. EVERY entry needs a reason — an exemption without one
 * is indistinguishable from a bug.
 */
const ALLOW = {
  hex: [
    // 34 hex values inside an SVG illustration. Genuinely outside the token system:
    // these are artwork fills, not UI chrome. (09-design-system.md:222)
    'src/components/landing-preview/rocket-art.tsx',
    // 5 hex values, and the same case as rocket-art.tsx above: the mascot's own
    // palette, sampled from public/ascenda-rocket.png for the badge-sized Ascendi in
    // the profile wizard. Artwork fills rather than UI chrome, and they must NOT
    // follow the theme — Ascendi is a character with fixed colours, so a teal hull
    // that inverted in dark mode would be a different character. Deliberately not
    // `currentColor` for the same reason.
    'src/components/profile/wizard/ascendi-mark.tsx',
    // <meta name="theme-color"> must be a literal colour; it cannot read a CSS var.
    // (src/app/layout.tsx:28-29)
    'src/app/layout.tsx',
    // NOT exempt, deliberately: src/components/theme/theme-provider.tsx:136-137
    // holds the same two literals as layout.tsx, and 09-design-system.md:213 shows
    // both are out of sync with --background. Duplicated + wrong should stay
    // visible in the count, not be waved through.
  ],
};

const RULES = [
  {
    id: 'palette-literal',
    re: new RegExp(
      `\\b(?:text|bg|border|ring|from|to|via|fill|stroke|shadow|divide|outline|decoration|accent|caret|placeholder)-(?:${PALETTES})-\\d{2,3}\\b`,
      'g'
    ),
    msg: 'Palette literal. Use a semantic tone token — emerald->success, rose->danger, amber->warning, sky->info, violet->feature (src/lib/theme/categories.ts:104).',
  },
  {
    id: 'hex',
    // Anchored on a non-word char so `--foo-#` style ids and `#1` in prose do not
    // match; requires a full 3/4/6/8-digit hex, which the audit draft did not
    // (its {3,8} matched `#12345`, a value that is not a colour).
    re: /(?<![\w#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F\w])/g,
    msg: 'Raw hex. Colour lives in globals.css custom properties only.',
  },
  {
    id: 'dark-variant',
    // `dark:` on a NON-colour utility (dark:opacity-0, dark:hidden) is legitimate
    // and not what rule 2 bans, so this is narrowed to colour-bearing utilities.
    // The audit draft's /dark:[a-z-]+/ over-counted those.
    re: new RegExp(
      `\\bdark:(?:text|bg|border|ring|ring-offset|from|to|via|fill|stroke|shadow|divide|outline|decoration|accent|caret|placeholder)-(?!\\[)[a-z0-9/.-]+`,
      'g'
    ),
    msg: 'A `dark:` colour utility means a missing token. Add/extend the semantic token so both themes follow one variable (globals.css:38).',
  },
  {
    id: 'raw-z',
    re: /\bz-(?:\[[^\]]+\]|\d+)\b/g,
    msg: 'Use the named z ladder: raised/sticky/nav/docked/panel/overlay/modal/toast (tailwind.config.ts:208).',
  },
  {
    id: 'off-ladder-shadow',
    re: /(?<![\w-])shadow-(?:sm|md|lg|xl|2xl|inner)\b/g,
    msg: 'Use the elevation ladder shadow-e-1..shadow-e-4 (tailwind.config.ts:167).',
  },
  {
    id: 'arbitrary-geometry',
    // radius / spacing / size as a literal pixel value. Covered in part by
    // eslint-plugin-tailwindcss no-arbitrary-value, kept here so the gate stands
    // alone if that rule is not yet enabled.
    re: /\b(?:rounded|w|h|min-w|min-h|max-w|max-h|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|top|right|bottom|left|inset|translate-x|translate-y)-\[\d+(?:\.\d+)?px\]/g,
    msg: 'Geometry is a ladder, never a number. radius -> rounded-lg|xl|2xl|3xl|4xl (all bound to --radius); spacing -> the Tailwind scale.',
  },
  {
    id: 'template-classname',
    re: /className=\{`/g,
    msg: 'Template-literal className bypasses tailwind-merge, so later classes silently lose. Compose with cn() (src/lib/utils.ts).',
  },
  {
    id: 'subfloor-type',
    re: /text-\[0\.(?:5|50|5625|625|65625)rem\]|text-\[(?:[0-9]|10)px\]/g,
    msg: '11px (.text-label) is the type floor (globals.css:288).',
  },
  {
    id: 'named-step-as-arbitrary',
    re: /text-\[0\.6875rem\]|text-\[0\.8125rem\]/g,
    msg: 'Use .text-label / .text-body-sm — the arbitrary value skips tailwind-merge (src/lib/utils.ts:26).',
  },
  {
    id: 'dead-opacity',
    // Tailwind emits NOTHING for an opacity modifier outside the generated scale,
    // so this is a silent invisible-element bug, not a style nit. Verified against
    // tailwind.config.ts:199-205 (extend adds 3/8/15/45/85 to the defaults).
    re: /(?:bg|text|border|ring|ring-offset|from|to|via|shadow|divide|outline|fill|stroke|placeholder|decoration|accent)-[a-z0-9-]+\/(\d{1,3})\b/g,
    test: (m) => !LEGAL_OPACITY.has(Number(m[1])),
    msg: 'Not in the opacity scale — Tailwind emits NOTHING and the utility silently disappears. Add the step to tailwind.config.ts:199.',
  },
];

const LEGAL_OPACITY = new Set([
  0, 3, 5, 8, 10, 15, 20, 25, 30, 40, 45, 50, 60, 70, 75, 80, 85, 90, 95, 100,
]);

// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

/** @type {Record<string, {count: number, byFile: Map<string, number>, hits: string[]}>} */
const found = Object.fromEntries(
  RULES.map((r) => [r.id, { count: 0, byFile: new Map(), hits: [] }])
);

for (const abs of files) {
  const rel = relative(ROOT, abs).split(sep).join('/');
  const lines = readFileSync(abs, 'utf8').split('\n');

  for (const rule of RULES) {
    if (ALLOW[rule.id]?.includes(rel)) continue;
    lines.forEach((line, i) => {
      const t = line.trimStart();
      // Skip line comments and JSDoc continuations — a rule name quoted in a
      // comment is not a violation.
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      for (const m of line.matchAll(rule.re)) {
        if (rule.test && !rule.test(m)) continue;
        const bucket = found[rule.id];
        bucket.count++;
        bucket.byFile.set(rel, (bucket.byFile.get(rel) ?? 0) + 1);
        bucket.hits.push(`${rel}:${i + 1}  ${m[0]}`);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Tailwind `content` coverage — a HARD check, not a ratchet.
//
// Tailwind only emits a utility it has SEEN in a file matched by `content`. A file
// outside every glob keeps compiling, keeps type-checking, keeps passing lint — its
// classes simply do not exist in the stylesheet, and the element falls back to the
// browser default. There is no error anywhere.
//
// That is not hypothetical here: moving the parent slice from
// `src/app/parent/_components/` (matched by `./src/app/**`) to `src/features/parent/ui/`
// (matched by nothing) silently dropped `min-w-[180px]`, `max-w-[75%]`,
// `text-primary-foreground/60`, `focus:ring-ring` and `sm:min-h-[560px]` out of the
// shipped CSS.
//
// So: every source file that actually carries class strings must be matched by at
// least one `content` glob. A hardcoded list of the five lost class names would only
// re-detect that one incident; this detects the NEXT directory somebody adds.

const TAILWIND_CONFIG = join(ROOT, 'tailwind.config.ts');

/** Minimal glob -> RegExp. Supports `**`, `*`, `?`, and `{a,b,c}`. */
function globToRegExp(glob) {
  const g = glob.replace(/^\.\//, '');
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        // `**/` spans zero or more directories; a bare `**` spans anything.
        if (g[i + 2] === '/') { out += '(?:[^/]+/)*'; i += 2; } else { out += '.*'; i += 1; }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') out += '[^/]';
    else if (c === '{') {
      const end = g.indexOf('}', i);
      if (end === -1) { out += '\\{'; continue; }
      out += `(?:${g.slice(i + 1, end).split(',').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

function tailwindContentGlobs() {
  const src = readFileSync(TAILWIND_CONFIG, 'utf8');
  const m = /\n\s*content:\s*\[([\s\S]*?)\n\s*\],/.exec(src);
  if (!m) {
    console.error(
      `Could not find the \`content: [ … ]\` array in ${relative(ROOT, TAILWIND_CONFIG)}.\n` +
        '  This check parses it textually. If the config was restructured, update\n' +
        '  tailwindContentGlobs() in scripts/check-design-tokens.mjs — do not delete the check.'
    );
    process.exit(1);
  }
  // Quoted strings only; the block is comment-heavy and comments never contain quotes
  // that look like a path, but strip them first anyway.
  const body = m[1].replace(/\/\/[^\n]*/g, '');
  const globs = [...body.matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
  if (!globs.length) {
    console.error(`No content globs parsed out of ${relative(ROOT, TAILWIND_CONFIG)}.`);
    process.exit(1);
  }
  return globs;
}

const CONTENT_RES = tailwindContentGlobs().map(globToRegExp);
/** A file "carries classes" if it mentions a className/class attribute or cn(). */
const CLASS_STRING = /className|class(?:Name)?=|\bcn\(|\bcva\(/;

const uncovered = [];
for (const abs of files) {
  const rel = relative(ROOT, abs).split(sep).join('/');
  if (!CLASS_STRING.test(readFileSync(abs, 'utf8'))) continue;
  if (!CONTENT_RES.some((re) => re.test(rel))) uncovered.push(rel);
}

if (uncovered.length) {
  console.error(
    `\nFAIL  tailwind-content-coverage: ${uncovered.length} file(s) carry class strings but are\n` +
      `      matched by NO glob in tailwind.config.ts \`content\`. Their utilities are absent\n` +
      '      from the compiled CSS and the elements silently render unstyled.\n'
  );
  for (const f of uncovered.slice(0, 25)) console.error(`        ${f}`);
  if (uncovered.length > 25) console.error(`        … ${uncovered.length - 25} more`);
  console.error('\n      -> add the directory to `content` in tailwind.config.ts.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------

let baseline = {};
let baselineExists = true;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).counts ?? {};
} catch {
  baselineExists = false;
}

const current = Object.fromEntries(RULES.map((r) => [r.id, found[r.id].count]));

if (UPDATE || !baselineExists) {
  const next = { ...current };
  if (baselineExists) {
    // Never let --update-baseline RAISE a number: that would let the ratchet slip
    // backwards silently. Raising requires a hand edit + a review.
    for (const [id, n] of Object.entries(current)) {
      const prev = baseline[id];
      if (prev !== undefined && n > prev) {
        console.error(
          `refusing to raise baseline for [${id}]: ${prev} -> ${n}.\n` +
            `  Fix the new violations, or edit ${relative(ROOT, BASELINE_PATH)} by hand and justify it in the PR.`
        );
        process.exit(1);
      }
    }
  }
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        _comment:
          'Ratchet baseline for scripts/check-design-tokens.mjs. Counts may only go DOWN. ' +
          'A rule at 0 should be deleted from this file so it becomes a hard error. ' +
          'Regenerate with: node scripts/check-design-tokens.mjs --update-baseline',
        _generated: new Date().toISOString().slice(0, 10),
        counts: next,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    `${baselineExists ? 'Updated' : 'Wrote'} ${relative(ROOT, BASELINE_PATH)} across ${files.length} files:`
  );
  for (const r of RULES) console.log(`  ${String(next[r.id]).padStart(4)}  ${r.id}`);
  process.exit(0);
}

let failed = false;
let loosened = false;
const summary = [];

for (const rule of RULES) {
  const n = current[rule.id];
  const max = baseline[rule.id] ?? 0;
  if (n > max) {
    failed = true;
    summary.push(`  FAIL  ${rule.id}: ${n} (baseline ${max}, +${n - max})`);
    // Show only the newest-looking offenders: everything, capped, so the output
    // stays readable when a whole file regresses.
    for (const hit of found[rule.id].hits.slice(0, 25)) console.error(`        ${hit}`);
    if (found[rule.id].hits.length > 25) {
      console.error(`        ... ${found[rule.id].hits.length - 25} more (run with --report)`);
    }
    console.error(`        -> ${rule.msg}\n`);
  } else if (n < max) {
    loosened = true;
    summary.push(`  ok    ${rule.id}: ${n} (baseline ${max}, -${max - n}) <- ratchet down`);
  } else {
    summary.push(`  ok    ${rule.id}: ${n}`);
  }
}

if (REPORT) {
  for (const rule of RULES) {
    const byFile = [...found[rule.id].byFile.entries()].sort((a, b) => b[1] - a[1]);
    if (!byFile.length) continue;
    console.log(`\n[${rule.id}] ${found[rule.id].count}`);
    for (const [f, n] of byFile) console.log(`  ${String(n).padStart(4)}  ${f}`);
  }
  console.log('');
}

console.log(`Design tokens — ${files.length} files scanned`);
console.log(summary.join('\n'));

if (failed) {
  console.error(
    '\nNew design-system violations. Either fix them, or — if you genuinely must land ' +
      'them — say so explicitly in the PR and hand-edit scripts/check-design-tokens.baseline.json.'
  );
  process.exit(1);
}
if (loosened) {
  console.log(
    '\nSome counts dropped below the baseline. Tighten the ratchet:\n' +
      '  node scripts/check-design-tokens.mjs --update-baseline'
  );
}
process.exit(0);
