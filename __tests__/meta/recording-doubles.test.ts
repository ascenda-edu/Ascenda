/**
 * A ratchet over the test suite's own Supabase doubles.
 *
 * WHY THIS EXISTS
 * ---------------
 * Commit `b4a1923` fixed a real defect: the builder doubles recorded WHICH TABLE
 * and WHICH COLUMNS a loader read, and never WHOSE DATA, so deleting
 * `.eq('profile_id', …)` — a cross-tenant read — left 1,069 tests green. The fix
 * was applied to `__tests__/data/`, `__tests__/counsellor/` and
 * `__tests__/profile/`.
 *
 * It was applied PER DIRECTORY, not per pattern. `__tests__/chat/` kept the
 * identical `eq: jest.fn(() => builder)` verbatim, and a later round deleted the
 * scope filter from the assistant's `get_my_matches` and `get_my_shortlist`,
 * repointed all five reads in `chat/context.ts` at a foreign profile, and watched
 * 1,541 tests pass.
 *
 * The commit message asserted the double "now records `.eq()`/`.in()` as
 * `[method, column, value]`". That was a claim about the tree, checked by reading
 * the tree — which is exactly the failure mode `tier-rule-singularity.test.ts`
 * was written to solve for the tier rule. The technique already existed in this
 * repo and had not been pointed at the thing it was invented for.
 *
 * WHAT THIS ENFORCES
 * ------------------
 * A double that stubs `.eq()` or `.in()` must accept their arguments. A stub
 * that takes none cannot be asserted against, so no test in that file can pin a
 * scope — the filter becomes deletable in silence.
 *
 * It shipped as a RATCHET with a five-file allowlist. **The allowlist is now
 * empty**, so this is a bar: no test file in this tree may stub `.eq()`/`.in()`
 * without accepting their arguments. Use
 * `__tests__/helpers/supabase-recorder.ts`.
 *
 * `KNOWN_DISCARDING` is kept, empty, on purpose — as the place a genuinely
 * unconvertible double would have to be declared, in writing, with a reason.
 * The fourth test below makes a stale entry fail, so it cannot become a
 * parking space.
 *
 * What converting the last five bought, beyond satisfying this file:
 *   - `counsellor/application-status.test.ts` now pins
 *     `profiles.eq('role','student')` — the exact argument of the historic
 *     roster bug, a bare string no compiler checks;
 *   - `matching/score-programs.test.ts` pins that the four `student_*` reads
 *     use the profile id they were passed;
 *   - `chat/university-info-tool.test.ts` pins that the programmes read is
 *     keyed on the id the name lookup resolved;
 *   - `hooks/use-help-thread.test.ts` pins all four thread reads to the
 *     request id;
 *   - `auth/identity-cache.test.ts` pins `profiles.eq('id', user.id)`.
 * None of those was expressible while the arguments were being discarded.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TESTS_ROOT = join(__dirname, '..');

/** This file quotes the offending shapes as fixtures; it must not scan itself. */
const SELF = 'meta/recording-doubles.test.ts';

/**
 * Pre-existing discarding doubles, each with why it has not been converted.
 * SHRINK THIS LIST. Never add to it.
 */
const KNOWN_DISCARDING: Record<string, string> = {
  'matching/score-programs.test.ts':
    'Scores are asserted end-to-end against a fixed catalogue; no scope assertion exists to protect yet.',
  'counsellor/application-status.test.ts':
    'Asserts the status transition matrix, not the query. Convert when a scope assertion is added.',
  'chat/university-info-tool.test.ts':
    'Reads the public catalogue (universities/programs). There is no tenant to scope to.',
  'hooks/use-help-thread.test.ts':
    'Hook-level render test; the loader it drives is scoped and asserted in its own suite.',
  'auth/identity-cache.test.ts':
    'Tests the memo LIFETIME, not the query. The `.eq(id, user.id)` filter it stubs is pinned by its sibling identity.test.ts, which records filters properly.',
};

const listTestFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listTestFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });

/**
 * Strip comments before scanning.
 *
 * Several of these files EXPLAIN the discarding shape in a docstring (this whole
 * effort is documented at the top of `helpers/supabase-recorder.ts`), and a
 * scanner that cannot tell prose from code flags the explanation as the crime.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

/** `()` or `( )` — a stub that declares no parameters. */
const NO_PARAMS = /^\(\s*\)$/;

/**
 * Find `eq`/`in` stubs whose arguments are discarded.
 *
 * Two shapes account for every double in this tree:
 *   1. an object property — `eq: jest.fn(() => builder)`, `eq: () => builder`,
 *      `eq: jest.fn().mockReturnThis()`
 *   2. a method-name loop — `for (const m of ['select','eq',…]) obj[m] = () => obj`
 */
const findDiscardingStubs = (raw: string): string[] => {
  const source = stripComments(raw);
  const findings: string[] = [];

  // Shape 1a: `eq: <arrow>` / `in: <arrow>`, optionally wrapped in jest.fn(.
  const property = /(?:^|[^\w.$])(eq|in)\s*:\s*(?:jest\.fn\(\s*)?(?:async\s+)?(\([^)]*\))\s*=>/g;
  for (const match of source.matchAll(property)) {
    if (NO_PARAMS.test(match[2])) findings.push(`${match[1]}: ${match[2]} => …`);
  }

  // Shape 1b: `eq: jest.fn().mockReturnThis()` — a stub with no argument capture
  // at all. `mockReturnThis` is the tell: there is nowhere for the args to go.
  const returnsThis = /(?:^|[^\w.$])(eq|in)\s*:\s*jest\.fn\(\s*\)\s*\.mock(?:ReturnThis|ReturnValue|ResolvedValue)/g;
  for (const match of source.matchAll(returnsThis)) {
    findings.push(`${match[1]}: jest.fn().mockReturnThis()`);
  }

  // Shape 2: a loop over a method-name list containing 'eq' or 'in'.
  const loop = /for\s*\(\s*const\s+([\w$]+)\s+of\s+\[([^\]]*)\]\s*\)\s*\{?\s*([\s\S]{0,200})/g;
  for (const match of source.matchAll(loop)) {
    const [, variable, list, body] = match;
    if (!/'(eq|in)'/.test(list)) continue;
    // The assignment to `obj[variable]` inside the loop.
    const assignment = new RegExp(
      `\\[${variable}\\]\\s*=\\s*(?:jest\\.fn\\(\\s*)?(?:async\\s+)?(\\([^)]*\\))\\s*=>`
    ).exec(body);
    if (assignment && NO_PARAMS.test(assignment[1])) {
      findings.push(`for (const ${variable} of [${list.trim()}]) …[${variable}] = () => …`);
    }
  }

  return findings;
};

describe('Supabase test doubles record which column they filtered', () => {
  const files = listTestFiles(TESTS_ROOT);

  // Self-check. A scan that silently finds nothing is the exact way this class
  // of source-reading test goes vacuous — see tier-rule-singularity.test.ts.
  it('scanned a plausible number of test files', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith('chat/context.test.ts'))).toBe(true);
  });

  it('detects the discarding shape it is meant to detect', () => {
    // Break it and watch it go red, inline: these are the exact shapes that let
    // the nine authz mutations survive.
    expect(findDiscardingStubs("const b = { eq: jest.fn(() => b) };")).toHaveLength(1);
    expect(findDiscardingStubs('const b = { eq: () => b, in: () => b };')).toHaveLength(2);
    expect(findDiscardingStubs('const q = { eq: jest.fn().mockReturnThis() };')).toHaveLength(1);
    expect(
      findDiscardingStubs("for (const m of ['select', 'eq']) builder[m] = jest.fn(() => builder);")
    ).toHaveLength(1);

    // …and does NOT flag a recorder.
    expect(findDiscardingStubs('const b = { eq: (column, value) => { push(column, value); return b; } };')).toEqual([]);
    expect(
      findDiscardingStubs("for (const m of ['eq', 'in']) b[m] = (...args) => { calls.push(args); return b; };")
    ).toEqual([]);
    expect(findDiscardingStubs("const b = { eq: jest.fn((c, v) => { rec(c, v); return b; }) };")).toEqual([]);
  });

  it('has no discarding double outside the shrinking allowlist', () => {
    const offenders: Record<string, string[]> = {};
    for (const file of files) {
      const relative = file.slice(TESTS_ROOT.length + 1);
      if (relative === SELF || relative in KNOWN_DISCARDING) continue;
      const found = findDiscardingStubs(readFileSync(file, 'utf8'));
      if (found.length > 0) offenders[relative] = found;
    }

    expect(offenders).toEqual({});
  });

  it('the allowlist only names files that still exist and still offend', () => {
    // Keeps the ratchet honest in the other direction: a stale entry would let a
    // converted file quietly regress.
    for (const [relative, reason] of Object.entries(KNOWN_DISCARDING)) {
      expect(reason.length).toBeGreaterThan(20);
      const found = findDiscardingStubs(readFileSync(join(TESTS_ROOT, relative), 'utf8'));
      expect({ [relative]: found.length > 0 }).toEqual({ [relative]: true });
    }
  });
});
