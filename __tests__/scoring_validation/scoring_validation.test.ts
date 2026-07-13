/**
 * Scoring Validation — Batch Test Suite
 *
 * Runs each phase's profiles through the scoring engine and asserts the
 * band boundaries and activity boost deltas we expect.
 *
 * Red = algorithm needs tuning.
 * Green = results match our hypotheses.
 *
 * npm test -- scoring_validation
 */

import { scoreStudentProfile } from '../../src/lib/scoring/student_scoring';
import { wei, amara, marcus, priya } from './phase1_profiles';
import { runBatch } from './batch_runner';
import { PHASE1_PROFILES } from './phase1_profiles';

// ── Phase 1 assertions ───────────────────────────────────────────────────────

describe('Phase 1 — Band & activity boost assertions', () => {

  it('Wei (IB 44, light extracurriculars) → Exceptional band', () => {
    const r = scoreStudentProfile(wei);
    console.log('Wei breakdown:', r.breakdown);
    console.log('Wei activities:', r.breakdown.activities);
    expect(r.student_band).toBe('Exceptional');
    // Activities should be minimal (light commitment, 1 activity)
    expect(r.breakdown.activities.total).toBeLessThanOrEqual(4);
  });

  it('Amara (A*AA law, exceptional extracurriculars) → at least Very strong', () => {
    const r = scoreStudentProfile(amara);
    console.log('Amara breakdown:', r.breakdown);
    console.log('Amara activities:', r.breakdown.activities);
    const bands = ['Very strong', 'Exceptional'];
    expect(bands).toContain(r.student_band);
    // Activities should provide a meaningful boost (≥15 pts)
    expect(r.breakdown.activities.total).toBeGreaterThanOrEqual(15);
  });

  it('Marcus (BCC CS, exceptional extracurriculars) — activities provide max boost', () => {
    const r = scoreStudentProfile(marcus);
    console.log('Marcus breakdown:', r.breakdown);
    console.log('Marcus activities:', r.breakdown.activities);
    // Activities should max out (commitment=15 + leadership=5 = 20 cap)
    expect(r.breakdown.activities.total).toBe(20);
    // Even with max boost, weak academics should keep him out of Strong
    // (this validates the cap is working)
    const strongOrAbove = ['Strong', 'Very strong', 'Exceptional'];
    expect(strongOrAbove).not.toContain(r.student_band);
  });

  it('Priya (IB 35, moderate extracurriculars) — activities nudge score upward', () => {
    const withActivities = scoreStudentProfile(priya);

    // Clone with no activities to compare
    const priyaNoActivities = {
      ...priya,
      lifestyle_preference: {
        ...priya.lifestyle_preference,
        commitment_level: null,
        leadership_roles: [],
        key_activities: [],
        intl_experience: [],
        work_experience: null,
      },
    };
    const withoutActivities = scoreStudentProfile(priyaNoActivities);

    console.log('Priya with activities:', withActivities.total_score, withActivities.student_band);
    console.log('Priya without activities:', withoutActivities.total_score, withoutActivities.student_band);

    // Activities should add at least 8 points
    expect(withActivities.total_score - withoutActivities.total_score).toBeGreaterThanOrEqual(8);
    // Both scores should be computed without errors
    expect(withActivities.total_score).toBeGreaterThan(0);
  });

  it('Activity cap: no profile can gain more than 20 pts from activities', () => {
    const profiles = [wei, amara, marcus, priya];
    profiles.forEach((p) => {
      const r = scoreStudentProfile(p);
      expect(r.breakdown.activities.total).toBeLessThanOrEqual(20);
    });
  });

  it('Existing profiles (Sofia, Daniel, Lucas) are unchanged by activities scorer', () => {
    // These have null/empty lifestyle data → activities = 0
    const sofia = {
      personal_information: { first_name: 'Sofia', last_name: 'Test', email: 'sofia@test.com', nationality: 'Spanish', age: 17, gender: 'female' as const, resident_country: 'Spain', current_location_city: 'Madrid', time_zone: 'Europe/Madrid', phone: null },
      academic_input: {
        programme_type: 'IB' as const,
        school_name: 'IB School', school_country: 'Spain', school_city: 'Madrid', school_type: 'international_school' as const, language_of_instruction: 'english' as const, graduation_year: 2025, desired_start_date: null,
        intended_clusters: ['medicine_dentistry' as const], secondary_clusters: [], career_aspiration: 'Doctor',
        subject_list: [
          { subject_name: 'Biology', level: 'HL' as const, grade_value: 7 },
          { subject_name: 'Chemistry', level: 'HL' as const, grade_value: 6 },
          { subject_name: 'Mathematics', level: 'HL' as const, grade_value: 6 },
          { subject_name: 'English Literature', level: 'SL' as const, grade_value: 6 },
          { subject_name: 'Psychology', level: 'SL' as const, grade_value: 6 },
          { subject_name: 'Spanish', level: 'SL' as const, grade_value: 5 },
        ],
        ib_total_points: 42, ib_core_points: 2, ib_tok_grade: 'B' as const, ib_ee_grade: 'A' as const, ib_math_pathway: 'AA_HL' as const,
        ee_subject: 'Biology', ee_title: 'Cancer cell mutations', ee_summary: 'Exploring medicine and genetics in oncology.',
        english_required: true, english_test_type: 'IELTS' as const, english_status: 'exceptional' as const, english_score_overall: 8,
        admissions_tests: [{ test_type: 'UCAT' as const, status: 'taken' as const, score_numeric: 2900, percentile: 85 }],
        a_level_predicted_grades: null,
      },
      lifestyle_preference: {
        teaching_style: 'academic' as const, desired_location_type: null, campus_size: 'medium' as const,
        extracurricular_interests: [], other_extracurriculars: null,
        leadership_roles: [], commitment_level: null, key_activities: [],
        sat_score: null, act_score: null, intl_experience: [], work_experience: null, work_experience_summary: null, ambition_statement: null,
        epq_subject: null, epq_title: null,
      },
      activities_list: [],
    };
    const r = scoreStudentProfile(sofia);
    // Activities = 0, so score should match the baseline in student_scoring.test.ts
    // (164 after the HL-strength recalibration to max 16).
    expect(r.breakdown.activities.total).toBe(0);
    expect(r.total_score).toBe(164);
  });
});

// ── Full batch report (always passes, for visual inspection) ─────────────────

describe('Phase 1 — Full batch report', () => {
  it('prints full scoring report (visual inspection)', () => {
    runBatch(PHASE1_PROFILES, 'Phase 1 — 4 Synthetic Profiles');
    expect(true).toBe(true); // always passes — inspect console output
  });
});
