/**
 * The match-cache upsert and the unique index it infers from must agree.
 *
 * ── The coordination failure this prevents ─────────────────────────────────
 * `src/lib/matching/service.ts` rebuilds the `student_matches` cache with
 *
 *     .upsert(batch, { onConflict: 'profile_id,program_id' })
 *
 * PostgREST does not validate that string. It passes it straight through to
 * `ON CONFLICT (…)`, where Postgres resolves it against a real index. If the
 * columns do not match an index — including if they are merely in a DIFFERENT
 * ORDER — nothing is inferred and the statement fails at **42P10**. That breaks
 * `/matches` for every student, and it fails at runtime in production, not at
 * compile time and not in any test that mocks the client.
 *
 * The index lives in `20260802120000_student_matches_delete_policy_and_uniqueness.sql`
 * (applied 2026-08-03). So the conflict target is stated twice, in two
 * repositories of truth, changed by two different actions — an app edit and a
 * `db:apply`. This is the same failure shape as `portal-flag-agreement.test.ts`
 * and it gets the same treatment: read both, assert they agree.
 *
 * It reads the SQL and the TS as text — no database, and it deliberately does
 * not care WHICH columns are used, only that both sides name the same ones in
 * the same order.
 *
 * WHY THIS IS NOT COVERED BY A UNIT TEST: the Supabase client is a recording
 * double in every other suite, so `.upsert()` succeeds against any `onConflict`
 * string whatsoever. Only the real planner rejects a mismatch, and by then it is
 * in production.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

const migration = readFileSync(
  join(
    ROOT,
    'supabase',
    'migrations',
    '20260802120000_student_matches_delete_policy_and_uniqueness.sql'
  ),
  'utf8'
);
const service = readFileSync(join(ROOT, 'src', 'lib', 'matching', 'service.ts'), 'utf8');

/** The columns of the unique index the upsert infers its target from. */
const indexColumns = (): string[] => {
  // Match the CREATE, not the reversal comment or the verification block: require
  // `create unique index`, and take the parenthesised column list that follows
  // `on student_matches`.
  const match = migration.match(
    /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?student_matches_profile_program_key\s+on\s+student_matches\s*\(([^)]*)\)/i
  );
  if (!match) {
    throw new Error(
      'student_matches_profile_program_key CREATE not found in 20260802120000 — this test is stale'
    );
  }
  return match[1].split(',').map((c) => c.trim());
};

/** The `onConflict` target the cache rebuild sends to PostgREST. */
const onConflictColumns = (): string[] => {
  const matches = [...service.matchAll(/onConflict:\s*'([^']+)'/g)];
  const forMatches = matches.filter((m) => m[1].includes('program_id'));
  if (forMatches.length !== 1) {
    throw new Error(
      `expected exactly one program_id onConflict in matching/service.ts, found ${forMatches.length} — this test is stale`
    );
  }
  return forMatches[0][1].split(',').map((c) => c.trim());
};

describe('the match-cache upsert and its unique index must agree', () => {
  it('names the same columns in the same order as student_matches_profile_program_key', () => {
    // Order matters: ON CONFLICT (program_id, profile_id) infers NO index even
    // though the same two columns are involved, and fails at 42P10.
    expect(onConflictColumns()).toEqual(indexColumns());
  });

  it('the rebuild upserts rather than inserts, so a partial clear converges', () => {
    // Reverting to `.insert(batch)` now raises 23505 against the unique index
    // instead of silently duplicating — the failure 20260802120000 §5b exists to
    // prevent. Pin the shape.
    expect(service).toMatch(
      /\.from\('student_matches'\)\s*\n\s*\.upsert\(batch,\s*\{\s*onConflict:/
    );
  });

  it('the index it depends on is a UNIQUE index — ON CONFLICT cannot infer a non-unique one', () => {
    expect(migration).toMatch(
      /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?student_matches_profile_program_key/i
    );
  });
});
