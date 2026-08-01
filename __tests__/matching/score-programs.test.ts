/** @jest-environment ./jest.environment-node.js */
//
// Regression suite for `scoreProgramsForProfile` (src/lib/matching/service.ts).
//
// Two audit findings are pinned here (docs/audit/05-domain-logic.md):
//
//   F-03a  A program with no row in course_scoring_v1 used to be classified
//          against an all-null course record. The classifier's documented
//          defaults (courseScore ?? 40 → tierImpliedMinIb(40) = 25) turned
//          "we know nothing about this program" into 90% for a median student,
//          which the ≥80 tier cut then rendered as a confident *Safe* — i.e.
//          the least-known programs sorted to the top as the safest bets.
//
//   F-03b  `if (error) continue` swallowed failed course_scoring_v1 batches, so
//          a DB timeout produced a page of those same confident Safes with no
//          log line anywhere.
//
// The assertions below are deliberately behavioural (what a caller/renderer
// sees), not implementation-shaped.

import {
  scoreProgramsForProfile,
  CourseScoringUnavailableError
} from '@/lib/matching/service';
import { tierFromScore } from '@/components/university-search/types';
import { getFitScoreVisuals } from '@/lib/theme/fit-score';
import { setLogSink, resetLogSink, type LogEntry } from '@/lib/observability/logger';

/* -------------------------------------------------------------------------- */
/* Supabase double                                                            */
/* -------------------------------------------------------------------------- */

type BatchOutcome = { rows?: Record<string, unknown>[]; error?: unknown };

interface DoubleOptions {
  /** Rows the fake `course_scoring_v1` returns, keyed by course_id. */
  scoringRows?: Record<string, Record<string, unknown>>;
  /** Per-batch override, in call order. `error` fails that batch. */
  batchOutcomes?: BatchOutcome[];
  /** Omit to model "this student has no academic input". */
  academic?: Record<string, unknown> | null;
}

const ACADEMIC_IB_33 = {
  profile_id: 'student-1',
  programme_type: 'IB',
  // 30 subject points + 3 core = the /45 median student the audit traced.
  ib_total_points: 30,
  ib_core_points: 3,
  intended_clusters: ['engineering'],
  secondary_clusters: [],
  graduation_year: 2027
};

/** Minimal thenable query builder: every chained method returns `this`, and
 * awaiting (or `.maybeSingle()`) resolves the configured result. */
const makeBuilder = (result: { data: unknown; error: unknown }) => {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'not', 'order', 'limit', 'range']) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
};

const makeSupabase = (options: DoubleOptions) => {
  const scoringRows = options.scoringRows ?? {};
  const batchOutcomes = options.batchOutcomes ?? [];
  const batchCalls: string[][] = [];

  const client = {
    from(table: string) {
      switch (table) {
        case 'student_academic_input':
          return makeBuilder({
            data: 'academic' in options ? options.academic : ACADEMIC_IB_33,
            error: null
          });
        case 'student_lifestyle_preference':
          return makeBuilder({ data: null, error: null });
        case 'student_subjects':
        case 'student_admissions_tests':
          return makeBuilder({ data: [], error: null });
        case 'programs':
          return makeBuilder({ data: [], error: null });
        case 'course_scoring_v1': {
          // `.in('course_id', batch)` carries the batch; capture it so the
          // per-batch outcome can be resolved in call order.
          const builder: Record<string, unknown> = {};
          let batchIndex = -1;
          builder.select = () => builder;
          builder.in = (_column: string, batch: string[]) => {
            batchIndex = batchCalls.length;
            batchCalls.push(batch);
            return builder;
          };
          const resolve = () => {
            const override = batchOutcomes[batchIndex];
            if (override?.error) return { data: null, error: override.error };
            const rows = override?.rows
              ?? (batchCalls[batchIndex] ?? [])
                .map((id) => scoringRows[id])
                .filter(Boolean);
            return { data: rows, error: null };
          };
          builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(resolve()).then(res, rej);
          return builder;
        }
        default:
          return makeBuilder({ data: null, error: null });
      }
    }
  };

  return { client: client as never, batchCalls };
};

/** A course_scoring_v1 row demanding IB 42 — a genuine reach for the IB-33
 * student, so a real score is unmistakably different from the old 90 fallback. */
const scoringRow = (id: string, minIb: number, totalCourseScore: number) => ({
  course_id: id,
  program_id: id,
  university_id: `uni-${id}`,
  course: `Course ${id}`,
  min_ib_score: minIb,
  university_score: totalCourseScore,
  course_selectivity_score: totalCourseScore,
  total_course_score: totalCourseScore,
  course_tier: 1
});

/* -------------------------------------------------------------------------- */

describe('scoreProgramsForProfile — unknown fit is representable', () => {
  const logs: LogEntry[] = [];

  beforeEach(() => {
    logs.length = 0;
    setLogSink((entry) => logs.push(entry));
  });
  afterEach(() => resetLogSink());

  it('returns null — never a number — for a program missing from course_scoring_v1', async () => {
    const { client } = makeSupabase({ scoringRows: {} });

    const scores = await scoreProgramsForProfile(client, 'student-1', ['p-unscored']);

    expect(Object.keys(scores)).toEqual(['p-unscored']);
    expect(scores['p-unscored']).toBeNull();
    expect(typeof scores['p-unscored']).not.toBe('number');
  });

  it('does not present an unscored program as a confident Safe', async () => {
    const { client } = makeSupabase({ scoringRows: {} });

    const scores = await scoreProgramsForProfile(client, 'student-1', ['p-unscored']);
    const score = scores['p-unscored'];

    // The regression itself: the old all-null-course fallback produced 90 for a
    // median IB student, and >= 80 is the Safe cut.
    expect(score).not.toBe(90);
    expect(tierFromScore(score)).toBeNull();
    expect(getFitScoreVisuals(score).tone).toBe('unknown');
    expect(getFitScoreVisuals(score).value).toBeNull();
  });

  it('still scores programs that ARE in the view', async () => {
    const { client } = makeSupabase({
      scoringRows: { 'p-scored': scoringRow('p-scored', 42, 92) }
    });

    const scores = await scoreProgramsForProfile(client, 'student-1', ['p-scored']);

    expect(typeof scores['p-scored']).toBe('number');
    expect(scores['p-scored']).toBeGreaterThanOrEqual(5);
    expect(scores['p-scored']).toBeLessThanOrEqual(95);
  });

  it('keeps unknown and known apart in the same request', async () => {
    const { client } = makeSupabase({
      scoringRows: { 'p-scored': scoringRow('p-scored', 42, 92) }
    });

    const scores = await scoreProgramsForProfile(client, 'student-1', ['p-scored', 'p-unscored']);

    expect(typeof scores['p-scored']).toBe('number');
    expect(scores['p-unscored']).toBeNull();
  });

  it('returns {} for a student with no academic input (no basis to score)', async () => {
    const { client } = makeSupabase({ academic: null });

    await expect(scoreProgramsForProfile(client, 'student-1', ['p-1'])).resolves.toEqual({});
  });
});

describe('scoreProgramsForProfile — a failed batch is never silent', () => {
  const logs: LogEntry[] = [];

  beforeEach(() => {
    logs.length = 0;
    setLogSink((entry) => logs.push(entry));
  });
  afterEach(() => resetLogSink());

  it('throws rather than returning an empty result when every batch fails', async () => {
    const { client } = makeSupabase({
      batchOutcomes: [{ error: { code: '57014', message: 'canceling statement due to statement timeout' } }]
    });

    // The point: a total scoring-view outage must be distinguishable from
    // "this student has no scorable programmes" — {} would look identical.
    await expect(scoreProgramsForProfile(client, 'student-1', ['p-1', 'p-2'])).rejects.toBeInstanceOf(
      CourseScoringUnavailableError
    );
  });

  it('logs the batch failure at error level with the cause attached', async () => {
    const { client } = makeSupabase({
      batchOutcomes: [{ error: { code: '57014', message: 'canceling statement due to statement timeout' } }]
    });

    await expect(scoreProgramsForProfile(client, 'student-1', ['p-1'])).rejects.toThrow();

    const errors = logs.filter((entry) => entry.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/course_scoring_v1 batch failed/);
    expect(errors[0].error?.message).toMatch(/statement timeout/);
    expect(errors[0].context?.profileId).toBe('student-1');
  });

  it('degrades a partially-failed request to explicit nulls, not to confident scores', async () => {
    // Batches are chunks of 200, so 250 ids ⇒ two batches; fail the second.
    const first = Array.from({ length: 200 }, (_, i) => `p-a-${i}`);
    const second = Array.from({ length: 50 }, (_, i) => `p-b-${i}`);
    const scoringRows: Record<string, Record<string, unknown>> = {};
    for (const id of first) scoringRows[id] = scoringRow(id, 42, 92);
    for (const id of second) scoringRows[id] = scoringRow(id, 42, 92);

    const { client } = makeSupabase({
      scoringRows,
      batchOutcomes: [undefined as unknown as BatchOutcome, { error: { message: 'timeout' } }]
    });

    const scores = await scoreProgramsForProfile(client, 'student-1', [...first, ...second]);

    // The healthy batch keeps its real scores…
    expect(typeof scores[first[0]]).toBe('number');
    // …and the failed one yields unknown, never a fabricated number.
    for (const id of second) {
      expect(scores[id]).toBeNull();
      expect(tierFromScore(scores[id])).toBeNull();
    }

    expect(logs.some((e) => e.level === 'error')).toBe(true);
    expect(logs.some((e) => e.level === 'warn' && /partial fit scores/i.test(e.message))).toBe(true);
  });
});
