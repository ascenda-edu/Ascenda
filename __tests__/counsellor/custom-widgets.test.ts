/** @jest-environment ./jest.environment-node.js */
/**
 * `lib/counsellor/custom-widgets.ts` — the whole query language for the
 * counsellor's user-defined analytics widgets: count rows from one source,
 * grouped by one curated dimension.
 *
 * Three things in here are easy to break and impossible to notice:
 *
 *   * **`total` vs `rowTotal`.** They differ only for multi-label dimensions
 *     (risk flags): one student with two flags is ONE row but TWO bucket
 *     increments. The file's own comment says "% of <unit>" displays must divide
 *     by `rowTotal`. Nothing enforced that, and the two numbers agree on every
 *     other dimension — so a swap looks correct until someone has two flags.
 *   * **the "Other" fold.** MAX_BUCKETS is pinned to the chart palette size so a
 *     colour is never reused, and folding must not drop a student: the tail's
 *     students are merged into `Other`, not discarded. It must also NEVER fold
 *     an ordered or label-sorted axis, where the tail is meaningful (the most
 *     recent graduation years) rather than insignificant.
 *   * **`isValidCustomWidgetDef`.** The one validator standing between
 *     localStorage and the aggregator. Definitions are stored per browser and
 *     survive schema changes, so it has to reject a stale one rather than let it
 *     reach `SOURCES[undefined]`.
 */

import {
  CUSTOM_WIDGET_SOURCE_META,
  CUSTOM_WIDGET_VIZ_OPTIONS,
  aggregateCustomWidget,
  describeCustomWidget,
  getCustomWidgetSourceMeta,
  isValidCustomWidgetDef,
  newCustomWidgetId,
  suggestCustomWidgetTitle,
  type CustomWidgetDef,
} from '@/lib/counsellor/custom-widgets';
import { STAGE_LABEL, STAGE_ORDER } from '@/lib/counsellor/stage-colors';
import type { ApplicationStatus, CounsellorStudent, MatchTier } from '@/lib/counsellor/types';

/* ── fixtures ────────────────────────────────────────────────────────────── */

interface Spec {
  id: string;
  nationality?: string;
  completionPct?: number;
  flags?: CounsellorStudent['flags'];
  graduationYear?: number;
  applications?: Array<{ status: ApplicationStatus; university?: string; platform?: any; country?: string }>;
  matches?: Array<{ tier: MatchTier; university?: string; country?: string }>;
  deadlines?: Array<{ type: 'early_decision' | 'regular' | 'scholarship' | 'interview'; university?: string }>;
}

const student = (spec: Spec): CounsellorStudent => ({
  id: spec.id,
  personal: {
    firstName: 'Ada',
    lastName: spec.id,
    nationality: spec.nationality ?? 'British',
    flagEmoji: '🇬🇧',
    school: 'Demo School',
    schoolCity: 'London',
    schoolCountry: 'UK',
    email: `${spec.id}+seed@ascenda.demo`,
  },
  academic: {
    programmeType: 'IB',
    subjects: ['Maths', 'Physics', 'Chemistry', 'History'],
    clusters: [],
    careerAspiration: '',
    englishStatus: 'met',
    admissionsTests: [],
    graduationYear: spec.graduationYear ?? 2027,
  },
  lifestyle: { teachingStyle: 'mixed', locationPreference: 'city', campusSize: 'large', interests: [] },
  profile: { completionPct: spec.completionPct ?? 100, stepsComplete: [] },
  matches: (spec.matches ?? []).map((m) => ({
    university: m.university ?? 'Imperial',
    country: m.country ?? 'UK',
    program: 'CS',
    score: 70,
    tier: m.tier,
  })),
  applications: (spec.applications ?? []).map((a) => ({
    university: a.university ?? 'Imperial',
    program: 'CS',
    status: a.status,
    deadline: '2026-10-15',
    platform: a.platform,
    country: a.country,
  })),
  deadlines: (spec.deadlines ?? []).map((d, i) => ({
    id: `${spec.id}-${i}`,
    university: d.university ?? 'Imperial',
    program: 'CS',
    date: '2026-10-15',
    type: d.type,
    studentId: spec.id,
  })),
  notes: [],
  flags: spec.flags ?? [],
  lastActive: '2026-07-31T00:00:00.000Z',
});

const agg = (source: CustomWidgetDef['source'], dimension: string, students: CounsellorStudent[]) =>
  aggregateCustomWidget({ source, dimension }, students);

const shape = (result: ReturnType<typeof agg>) =>
  result!.buckets.map((b) => [b.label, b.count] as const);

/* ═══════════════════════════════════════════════════════════════════════════
 * The count itself
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('aggregateCustomWidget', () => {
  it('counts one row per student for the students source', () => {
    const result = agg('students', 'nationality', [
      student({ id: 'a', nationality: 'British' }),
      student({ id: 'b', nationality: 'Indian' }),
      student({ id: 'c', nationality: 'British' }),
    ]);
    expect(shape(result)).toEqual([
      ['🇬🇧 British', 2],
      ['🇬🇧 Indian', 1],
    ]);
    expect(result!.total).toBe(3);
    expect(result!.rowTotal).toBe(3);
    expect(result!.unitPlural).toBe('students');
  });

  it('counts one row per APPLICATION for the applications source, not per student', () => {
    const result = agg('applications', 'platform', [
      student({
        id: 'a',
        applications: [
          { status: 'planning', platform: 'UCAS' },
          { status: 'submitted', platform: 'UCAS' },
          { status: 'planning', platform: 'Common App' },
        ],
      }),
    ]);
    expect(shape(result)).toEqual([
      ['UCAS', 2],
      ['Common App', 1],
    ]);
    expect(result!.rowTotal).toBe(3);
    // …and the student appears once per bucket, not once per row.
    expect(result!.buckets[0].students).toHaveLength(1);
    expect(result!.buckets[0].students[0].details).toEqual(['Imperial — CS', 'Imperial — CS']);
  });

  it('returns null for an unknown source or dimension rather than throwing', () => {
    expect(agg('students', 'invented-dimension', [student({ id: 'a' })])).toBeNull();
    expect(aggregateCustomWidget({ source: 'nope' as any, dimension: 'tier' }, [])).toBeNull();
  });

  it('returns an empty-but-valid result for an empty cohort', () => {
    const result = agg('matches', 'country', []);
    expect(result).not.toBeNull();
    expect(result!.buckets).toEqual([]);
    expect(result!.total).toBe(0);
    expect(result!.rowTotal).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * total vs rowTotal
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('total vs rowTotal', () => {
  it('diverge for a multi-label dimension — one row, two buckets', () => {
    const result = agg('students', 'flags', [
      student({ id: 'a', flags: ['profile_incomplete', 'stalled'] }),
      student({ id: 'b', flags: [] }),
    ]);
    expect(result!.rowTotal).toBe(2); // two students
    expect(result!.total).toBe(3); // three bucket increments
    expect(shape(result)).toEqual(
      expect.arrayContaining([
        ['Profile incomplete', 1],
        ['Stalled', 1],
        ['No flags', 1],
      ])
    );
  });

  it('agree on every single-label dimension', () => {
    const cohort = [student({ id: 'a' }), student({ id: 'b' }), student({ id: 'c' })];
    for (const dimension of ['nationality', 'programmeType', 'completion', 'schoolCountry']) {
      const result = agg('students', dimension, cohort);
      expect(result!.total).toBe(result!.rowTotal);
    }
  });

  it('labels a flagless student explicitly instead of dropping them', () => {
    const result = agg('students', 'flags', [student({ id: 'a', flags: [] })]);
    expect(shape(result)).toEqual([['No flags', 1]]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Ordering
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('bucket ordering', () => {
  it('keeps an ordered axis in its declared order, zero counts included', () => {
    const result = agg('students', 'completion', [
      student({ id: 'a', completionPct: 40 }),
      student({ id: 'b', completionPct: 100 }),
    ]);
    expect(shape(result)).toEqual([
      ['100%', 1],
      ['75–99%', 0],
      ['50–74%', 0],
      ['<50%', 1],
    ]);
  });

  it('buckets completion at the documented boundaries', () => {
    const result = agg('students', 'completion', [
      student({ id: 'a', completionPct: 100 }),
      student({ id: 'b', completionPct: 99 }),
      student({ id: 'c', completionPct: 75 }),
      student({ id: 'd', completionPct: 74 }),
      student({ id: 'e', completionPct: 50 }),
      student({ id: 'f', completionPct: 49 }),
    ]);
    expect(shape(result)).toEqual([
      ['100%', 1],
      ['75–99%', 2],
      ['50–74%', 2],
      ['<50%', 1],
    ]);
  });

  it('covers every application stage on the ordered axis, enrolled included', () => {
    // The inline stage table this replaced omitted `enrolled`, so every enrolled
    // application bucketed as "Unknown" and fell off the end of the axis.
    const result = agg(
      'applications',
      'status',
      STAGE_ORDER.map((status, i) => student({ id: `s${i}`, applications: [{ status }] }))
    );
    expect(result!.buckets.map((b) => b.label)).toEqual(STAGE_ORDER.map((s) => STAGE_LABEL[s]));
    expect(result!.buckets.every((b) => b.count === 1)).toBe(true);
    expect(result!.buckets.map((b) => b.label)).toContain('Enrolled');
  });

  it('sorts a label-sorted axis numerically, not lexically', () => {
    // '2030' before '2029' is what a plain string sort gives once the years
    // cross a digit boundary; the axis is a timeline and must read as one.
    const result = agg('students', 'graduationYear', [
      student({ id: 'a', graduationYear: 2030 }),
      student({ id: 'b', graduationYear: 2027 }),
      student({ id: 'c', graduationYear: 2029 }),
    ]);
    expect(result!.buckets.map((b) => b.label)).toEqual(['2027', '2029', '2030']);
  });

  it('sorts an unordered axis by count desc, then by label for a stable tie', () => {
    const result = agg('matches', 'university', [
      student({
        id: 'a',
        matches: [
          { tier: 'Reach', university: 'Zebra' },
          { tier: 'Reach', university: 'Alpha' },
          { tier: 'Reach', university: 'Alpha' },
          { tier: 'Reach', university: 'Beta' },
        ],
      }),
    ]);
    expect(shape(result)).toEqual([
      ['Alpha', 2],
      ['Beta', 1],
      ['Zebra', 1],
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * The "Other" fold
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the "Other" fold', () => {
  const manyUniversities = (n: number) =>
    student({
      id: 'a',
      matches: Array.from({ length: n }, (_, i) => ({
        tier: 'Reach' as const,
        // Descending counts so the fold order is unambiguous: uni-0 appears
        // n times, uni-1 n-1 times, …
        university: `uni-${i}`,
      })),
    });

  const withCounts = (counts: number[]) =>
    student({
      id: 'a',
      matches: counts.flatMap((count, i) =>
        Array.from({ length: count }, () => ({ tier: 'Reach' as const, university: `uni-${i}` }))
      ),
    });

  it('does not fold at or below the palette size', () => {
    const result = agg('matches', 'university', [withCounts([5, 4, 3, 2, 1])]);
    expect(result!.buckets).toHaveLength(5);
    expect(result!.buckets.map((b) => b.key)).not.toContain('__other__');
  });

  it('folds the tail past the palette size so a colour is never reused', () => {
    const result = agg('matches', 'university', [withCounts([6, 5, 4, 3, 2, 1])]);
    expect(result!.buckets).toHaveLength(5);
    expect(shape(result)).toEqual([
      ['uni-0', 6],
      ['uni-1', 5],
      ['uni-2', 4],
      ['uni-3', 3],
      ['Other', 3], // 2 + 1
    ]);
    expect(result!.buckets[4].key).toBe('__other__');
  });

  it('keeps every row and every student when it folds', () => {
    // The fold is cosmetic. Dropping the tail would quietly under-report the
    // total on any dimension with a long tail — university, for instance.
    const cohort = [manyUniversities(12)];
    const result = agg('matches', 'university', cohort);
    expect(result!.total).toBe(12);
    expect(result!.rowTotal).toBe(12);
    const other = result!.buckets.find((b) => b.key === '__other__')!;
    expect(other.students.map((s) => s.student.id)).toEqual(['a']);
    expect(other.students[0].details).toHaveLength(other.count);
  });

  it('merges a student appearing in several folded buckets into one entry', () => {
    const result = agg('matches', 'university', [
      student({
        id: 'a',
        matches: Array.from({ length: 9 }, (_, i) => ({ tier: 'Reach' as const, university: `uni-${i}` })),
      }),
      student({
        id: 'b',
        matches: [{ tier: 'Reach', university: 'uni-8' }],
      }),
    ]);
    const other = result!.buckets.find((b) => b.key === '__other__')!;
    const ids = other.students.map((s) => s.student.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never folds an ordered or label-sorted axis', () => {
    // Past the palette size the tail of an ordered axis is still meaningful —
    // the most recent graduation years, the last pipeline stages — so folding
    // there would hide the very rows the counsellor opened the widget for.
    const years = agg(
      'students',
      'graduationYear',
      Array.from({ length: 9 }, (_, i) => student({ id: `s${i}`, graduationYear: 2025 + i }))
    );
    expect(years!.buckets).toHaveLength(9);
    expect(years!.buckets.map((b) => b.key)).not.toContain('__other__');

    const stages = agg(
      'applications',
      'status',
      STAGE_ORDER.map((status, i) => student({ id: `s${i}`, applications: [{ status }] }))
    );
    expect(stages!.buckets).toHaveLength(STAGE_ORDER.length);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Definitions: validation and labelling
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('isValidCustomWidgetDef', () => {
  const valid: CustomWidgetDef = {
    id: 'custom:abc',
    title: 'Applications by stage',
    source: 'applications',
    dimension: 'status',
    viz: 'bars',
    createdAt: '2026-08-01T00:00:00.000Z',
  };

  it('accepts a well-formed definition', () => {
    expect(isValidCustomWidgetDef(valid)).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'custom:abc'],
    ['an array', []],
    ['a missing id', { ...valid, id: undefined }],
    ['an id without the custom: prefix', { ...valid, id: 'abc' }],
    ['a blank title', { ...valid, title: '   ' }],
    ['an unknown source', { ...valid, source: 'teachers' }],
    ['a dimension that does not belong to the source', { ...valid, dimension: 'nationality' }],
    ['an unknown viz', { ...valid, viz: 'pie' }],
  ])('rejects %s', (_label, input) => {
    expect(isValidCustomWidgetDef(input)).toBe(false);
  });

  it('rejects a definition whose dimension was removed from the registry', () => {
    // Definitions live in the counsellor's localStorage and outlive deploys, so
    // a stale one must be rejected rather than reaching SOURCES[undefined].
    expect(isValidCustomWidgetDef({ ...valid, dimension: 'legacy_dimension' })).toBe(false);
  });
});

describe('the dimension registry and its labels', () => {
  it('exposes exactly the four sources, each with at least one dimension', () => {
    expect(CUSTOM_WIDGET_SOURCE_META.map((m) => m.key)).toEqual([
      'students',
      'applications',
      'matches',
      'deadlines',
    ]);
    for (const meta of CUSTOM_WIDGET_SOURCE_META) {
      expect(meta.dimensions.length).toBeGreaterThan(0);
      expect(new Set(meta.dimensions.map((d) => d.key)).size).toBe(meta.dimensions.length);
    }
  });

  it('every advertised (source, dimension) pair actually aggregates', () => {
    // The registry is what the widget builder offers the counsellor. An entry
    // the aggregator does not know about renders as an empty widget with no
    // error — this is the test that keeps the menu honest.
    const cohort = [
      student({
        id: 'a',
        flags: ['stalled'],
        applications: [{ status: 'planning', platform: 'UCAS', country: 'UK' }],
        matches: [{ tier: 'Match' }],
        deadlines: [{ type: 'regular' }],
      }),
    ];
    for (const meta of CUSTOM_WIDGET_SOURCE_META) {
      for (const dim of meta.dimensions) {
        const result = agg(meta.key, dim.key, cohort);
        expect(result).not.toBeNull();
        expect(result!.unitPlural).toBe(meta.unitPlural);
        expect(isValidCustomWidgetDef({
          id: 'custom:x',
          title: 't',
          source: meta.key,
          dimension: dim.key,
          viz: 'bars',
          createdAt: '',
        })).toBe(true);
      }
    }
  });

  it('falls back to the first source rather than undefined for an unknown key', () => {
    expect(getCustomWidgetSourceMeta('nope' as any)).toBe(CUSTOM_WIDGET_SOURCE_META[0]);
    expect(getCustomWidgetSourceMeta('matches').label).toBe('Matches');
  });

  it('names a widget from its source and dimension, with a safe fallback', () => {
    expect(suggestCustomWidgetTitle('applications', 'status')).toBe('Applications by stage');
    expect(suggestCustomWidgetTitle('applications', 'nope')).toBe('Custom widget');
    expect(describeCustomWidget({ source: 'matches', dimension: 'tier' } as CustomWidgetDef)).toBe(
      'Custom · matches by tier'
    );
    expect(describeCustomWidget({ source: 'matches', dimension: 'nope' } as CustomWidgetDef)).toBe(
      'Custom widget'
    );
  });

  it('offers one viz option per supported renderer', () => {
    expect(CUSTOM_WIDGET_VIZ_OPTIONS.map((v) => v.key)).toEqual(['bars', 'stacked', 'kpi']);
  });

  it('mints unique, prefixed ids', () => {
    const a = newCustomWidgetId();
    const b = newCustomWidgetId();
    expect(a.startsWith('custom:')).toBe(true);
    expect(a).not.toBe(b);
    expect(isValidCustomWidgetDef({
      id: a,
      title: 'x',
      source: 'students',
      dimension: 'nationality',
      viz: 'kpi',
      createdAt: '',
    })).toBe(true);
  });
});
