/**
 * @jest-environment ./jest.environment-node.js
 *
 * POST /api/profile/preview — the live feedback the wizard shows while it is being
 * filled in.
 *
 * What matters here is mostly what it does when things go WRONG, because this
 * endpoint is a nicety attached to a form that must keep working without it:
 *   - it authenticates before parsing, like every other write path;
 *   - it validates with the SAME schema as the save, so it can never encourage a
 *     student with numbers for a payload the real submit would reject;
 *   - a scoring throw degrades to "no band", not a 500 — the engine is being handed
 *     a half-filled profile, which is not what it was written for;
 *   - a failed count reports `null` ("we cannot say"), never `0` ("there is
 *     nothing for you"), which is the difference between a quiet gap and a lie.
 */

import { NextRequest } from 'next/server';

// ── Seams ────────────────────────────────────────────────────────────────────

const getUser = jest.fn();
const countQuery = { data: null as unknown, count: null as number | null, error: null as unknown };
const notFn = jest.fn(() => Promise.resolve(countQuery));
const inFn = jest.fn(() => ({ not: notFn, then: (r: (v: unknown) => unknown) => Promise.resolve(countQuery).then(r) }));
const selectFn = jest.fn(() => ({ in: inFn }));
const fromFn = jest.fn(() => ({ select: selectFn }));

jest.mock('@/lib/supabase/server', () => ({
  createRouteHandlerSupabaseClient: async () => ({
    auth: { getUser },
    from: fromFn
  })
}));

const scoreStudentProfile = jest.fn();
jest.mock('@/lib/scoring/student_scoring', () => ({
  scoreStudentProfile: (payload: unknown) => scoreStudentProfile(payload)
}));

const resolveTargetFields = jest.fn();
jest.mock('@/lib/matching/matching_engine', () => ({
  resolveTargetFields: (clusters: unknown) => resolveTargetFields(clusters)
}));

jest.mock('@/lib/catalog/visibility', () => ({ getFlaggedProgramIds: () => [] }));

import { POST } from '@/app/api/profile/preview/route';

// ── Fixture ──────────────────────────────────────────────────────────────────

const VALID = {
  personal_information: {
    first_name: 'Amara', last_name: 'Okonkwo', email: 'amara@school.example',
    phone: null, nationality: 'Nigeria', age: 17, gender: null,
    resident_country: 'Thailand', current_location_city: null, time_zone: 'Asia/Bangkok'
  },
  academic_input: {
    programme_type: 'IB', school_name: 'S', school_country: 'Thailand', school_city: null,
    school_type: null, language_of_instruction: null, graduation_year: 2027,
    desired_start_date: null, intended_clusters: ['economics_quant'], secondary_clusters: [],
    career_aspiration: null,
    subject_list: [{ subject_name: 'Mathematics', level: 'HL', grade_value: 7 }],
    ib_total_points: 7, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null,
    ib_math_pathway: 'AA_HL', ee_subject: null, ee_title: null, ee_summary: null,
    a_level_predicted_grades: null, english_required: false, english_test_type: 'WAIVER',
    english_status: 'met', english_score_overall: null, admissions_tests: []
  },
  lifestyle_preference: {
    teaching_style: null, desired_location_type: null, campus_size: null,
    extracurricular_interests: [], other_extracurriculars: null, leadership_roles: [],
    commitment_level: null, key_activities: [], sat_score: null, act_score: null,
    intl_experience: [], work_experience: false, work_experience_summary: null,
    ambition_statement: null, epq_subject: null, epq_title: null
  },
  activities_list: []
};

const post = (body: unknown, raw?: string) =>
  POST(new NextRequest('http://localhost/api/profile/preview', {
    method: 'POST',
    body: raw ?? JSON.stringify(body)
  }));

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  scoreStudentProfile.mockReturnValue({
    total_score: 72.4, student_band: 'Strong', breakdown: {}, eligibility_flags: [], readiness_flags: []
  });
  resolveTargetFields.mockReturnValue(new Set(['Economics', 'Business & Management']));
  countQuery.count = 1240;
  countQuery.error = null;
});

// ═════════════════════════════════════════════════════════════════════════════

describe('auth and input', () => {
  it('401s an anonymous caller before reading the body', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await post(VALID);
    expect(response.status).toBe(401);
    // Nothing was parsed, scored or queried.
    expect(scoreStudentProfile).not.toHaveBeenCalled();
    expect(fromFn).not.toHaveBeenCalled();
  });

  it('400s unparseable JSON', async () => {
    const response = await post(null, '{ not json');
    expect(response.status).toBe(400);
  });

  it('400s a payload the real submit would reject', async () => {
    // The same schema as `saveStudentIntake`. A preview that accepted more than the
    // save would show encouraging numbers for data that cannot be persisted.
    const bad = JSON.parse(JSON.stringify(VALID));
    bad.personal_information.first_name = 'A'.repeat(250); // schema caps at 200
    const response = await post(bad);
    expect(response.status).toBe(400);
    expect(scoreStudentProfile).not.toHaveBeenCalled();
  });
});

describe('what it returns', () => {
  it('reports the band and the field count for a valid payload', async () => {
    const response = await post(VALID);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      band: 'Strong',
      totalScore: 72,
      fieldProgrammeCount: 1240,
      fieldCount: 2
    });
  });

  it('counts against the resolved FIELDS, not the clusters', async () => {
    await post(VALID);
    expect(resolveTargetFields).toHaveBeenCalledWith(['economics_quant']);
    expect(inFn).toHaveBeenCalledWith('field', ['Economics', 'Business & Management']);
    // An index probe: `head: true` transfers no rows.
    expect(selectFn).toHaveBeenCalledWith('id', { count: 'exact', head: true });
  });

  it('omits the count when the clusters resolve to no field', async () => {
    resolveTargetFields.mockReturnValue(null);
    const response = await post(VALID);
    const body = await response.json();
    expect(body.fieldProgrammeCount).toBeNull();
    expect(body.fieldCount).toBe(0);
    expect(fromFn).not.toHaveBeenCalled(); // and does not query for nothing
  });
});

describe('degrading, rather than failing', () => {
  it('a scoring throw becomes "no band", not a 500', async () => {
    // The engine is handed a half-filled profile — not what it was written for.
    scoreStudentProfile.mockImplementation(() => { throw new Error('boom'); });
    const response = await post(VALID);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.band).toBeNull();
    expect(body.totalScore).toBeNull();
    // The count still works — one failure does not take the other down.
    expect(body.fieldProgrammeCount).toBe(1240);
  });

  it('a non-finite score becomes "no band"', async () => {
    scoreStudentProfile.mockReturnValue({
      total_score: NaN, student_band: 'Weak', breakdown: {}, eligibility_flags: [], readiness_flags: []
    });
    const body = await (await post(VALID)).json();
    expect(body.band).toBeNull();
  });

  it('a failed count is null — "we cannot say", never zero', async () => {
    // The distinction matters: 0 tells a student there is nothing for them, which
    // a statement timeout has not earned the right to say.
    countQuery.error = { message: 'canceling statement due to statement timeout' };
    countQuery.count = null;
    const body = await (await post(VALID)).json();
    expect(body.fieldProgrammeCount).toBeNull();
    // The band survives.
    expect(body.band).toBe('Strong');
  });
});
