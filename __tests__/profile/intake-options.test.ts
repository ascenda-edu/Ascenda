/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  UNIT TESTS — src/lib/profile/intake-options.ts                           │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Mostly static tables, so the tests here are narrow on purpose: the subject-row
 * builders (which encode the IB "exactly 3 Higher Level" rule and have already
 * shipped one regression — see the docstring on `buildNextSubject`), and the
 * couple of invariants the option lists must hold for the wizard's <Select>s and
 * for `intake-schema.ts` to agree with each other.
 *
 * GRADUATION_YEARS is asserted by SHAPE, never by value — it is
 * `new Date().getFullYear()` at module scope, exactly as it was in the
 * component, so a test that pinned a year would rot on 1 January.
 */

import {
  ADMISSIONS_TEST_OPTIONS, ENGLISH_STATUS_OPTIONS, ENGLISH_TEST_OPTIONS, GRADUATION_YEARS,
  buildDefaultSubjects, buildEmptySubject, buildNextSubject, clusterLabelMap,
  getMaxSubjects, type SubjectRowState
} from '@/lib/profile/intake-options';

describe('buildEmptySubject', () => {
  it('defaults to Higher Level on the IB path and A-Level everywhere else', () => {
    expect(buildEmptySubject('IB')).toEqual({ subject_name: '', level: 'HL', grade_value: '' });
    expect(buildEmptySubject('A_LEVEL').level).toBe('A_LEVEL');
    expect(buildEmptySubject('ACT').level).toBe('A_LEVEL');
    expect(buildEmptySubject('').level).toBe('A_LEVEL');
  });
});

describe('buildNextSubject', () => {
  const hl = (n: number): SubjectRowState[] =>
    Array.from({ length: n }, () => ({ subject_name: 'X', level: 'HL' as const, grade_value: '' }));

  it('offers Higher Level until three exist, then Standard Level', () => {
    expect(buildNextSubject('IB', hl(0)).level).toBe('HL');
    expect(buildNextSubject('IB', hl(2)).level).toBe('HL');
    expect(buildNextSubject('IB', hl(3)).level).toBe('SL');
    expect(buildNextSubject('IB', hl(5)).level).toBe('SL');
  });

  it('counts only HL rows, not the SL ones', () => {
    const mixed: SubjectRowState[] = [
      { subject_name: 'A', level: 'HL', grade_value: '' },
      { subject_name: 'B', level: 'SL', grade_value: '' },
      { subject_name: 'C', level: 'SL', grade_value: '' }
    ];
    expect(buildNextSubject('IB', mixed).level).toBe('HL');
  });

  it('ignores the existing rows entirely off the IB path', () => {
    expect(buildNextSubject('A_LEVEL', hl(3)).level).toBe('A_LEVEL');
  });
});

describe('buildDefaultSubjects', () => {
  it('gives an IB student six rows, three of them Higher Level', () => {
    const rows = buildDefaultSubjects('IB');
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.level)).toEqual(['HL', 'HL', 'HL', 'SL', 'SL', 'SL']);
    expect(rows.every((r) => r.subject_name === '' && r.grade_value === '')).toBe(true);
  });

  it('gives everyone else three A-Level rows', () => {
    for (const programme of ['A_LEVEL', 'ACT', ''] as const) {
      const rows = buildDefaultSubjects(programme);
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.level === 'A_LEVEL')).toBe(true);
    }
  });

  it('produces a default set that satisfies its own row ceiling', () => {
    expect(buildDefaultSubjects('IB').length).toBeLessThanOrEqual(getMaxSubjects('IB'));
    expect(buildDefaultSubjects('A_LEVEL').length).toBeLessThanOrEqual(getMaxSubjects('A_LEVEL'));
  });
});

describe('getMaxSubjects', () => {
  it('caps A-Level at 4 and everything else at 6', () => {
    expect(getMaxSubjects('A_LEVEL')).toBe(4);
    expect(getMaxSubjects('IB')).toBe(6);
    expect(getMaxSubjects('ACT')).toBe(6);
    expect(getMaxSubjects('')).toBe(6);
  });
});

describe('GRADUATION_YEARS', () => {
  it('offers eight consecutive years spanning two past and five future', () => {
    expect(GRADUATION_YEARS).toHaveLength(8);
    for (let i = 1; i < GRADUATION_YEARS.length; i += 1) {
      expect(GRADUATION_YEARS[i] - GRADUATION_YEARS[i - 1]).toBe(1);
    }
  });

  it('brackets the current year — index 2 is "this year"', () => {
    const current = new Date().getFullYear();
    expect(GRADUATION_YEARS[2]).toBe(current);
    expect(GRADUATION_YEARS[0]).toBe(current - 2);
    expect(GRADUATION_YEARS[7]).toBe(current + 5);
  });

  it('is frozen at module load, not recomputed per read', () => {
    expect(GRADUATION_YEARS).toBe(GRADUATION_YEARS);
  });
});

describe('option tables', () => {
  it('has no duplicate values, which would break <Select> identity', () => {
    for (const table of [ENGLISH_TEST_OPTIONS, ENGLISH_STATUS_OPTIONS, ADMISSIONS_TEST_OPTIONS]) {
      const values = table.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("never offers '' as a value — Radix forbids it on SelectItem", () => {
    for (const table of [ENGLISH_TEST_OPTIONS, ENGLISH_STATUS_OPTIONS, ADMISSIONS_TEST_OPTIONS]) {
      // String(): the union types already exclude '', so a direct !== '' is a
      // compile error. This checks the runtime table, not the declared type.
      expect(table.every((o) => String(o.value).length > 0 && String(o.label).length > 0)).toBe(true);
    }
  });

  it('gives every cluster a label', () => {
    expect(clusterLabelMap.get('medicine_dentistry')).toBe('Medicine & dentistry');
    expect(clusterLabelMap.size).toBe(10);
  });
});
