/**
 * Student scoring — band assertions plus a printed score breakdown per case.
 *
 * The breakdowns are OFF by default; set VERBOSE_SCORING=1 (or VERBOSE_TESTS=1)
 * to see them. See `__tests__/helpers/report.ts`.
 */
import { scoreStudentProfile } from '@/lib/scoring/student_scoring';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';
import { report } from './helpers/report';

const basePayload: StudentProfilePayload = {
  personal_information: {
    first_name: 'Test',
    last_name: 'Student',
    email: 'test@example.com',
    phone: null,
    nationality: 'British',
    age: 17,
    gender: 'female',
    resident_country: 'United Kingdom',
    current_location_city: 'London',
    time_zone: 'Europe/London'
  },
  academic_input: {
    programme_type: 'IB',
    school_name: 'Sample School',
    school_country: 'United Kingdom',
    school_city: 'London',
    school_type: 'international_school',
    language_of_instruction: 'english',
    graduation_year: 2025,
    desired_start_date: null,
    intended_clusters: ['computer_science'],
    secondary_clusters: [],
    career_aspiration: 'Engineer',
    subject_list: [],
    ib_total_points: null,
    ib_core_points: null,
    ib_tok_grade: null,
    ib_ee_grade: null,
    ib_math_pathway: null,
    ee_subject: null,
    ee_title: null,
    ee_summary: null,
    a_level_predicted_grades: null,
    english_required: true,
    english_test_type: 'IELTS',
    english_status: 'missing',
    english_score_overall: null,
    admissions_tests: []
  },
  lifestyle_preference: {
    teaching_style: 'academic',
    desired_location_type: 'london',
    campus_size: 'medium',
    extracurricular_interests: ['Sports/fitness'],
    other_extracurriculars: null,
    leadership_roles: [],
    commitment_level: null,
    key_activities: [],
    sat_score: null,
    act_score: null,
    intl_experience: [],
    work_experience: null,
    work_experience_summary: null,
    ambition_statement: null,
    epq_subject: null,
    epq_title: null
  },
  activities_list: []
};

describe('student scoring', () => {
  it('scores Sofia (IB medicine) with a very strong band', () => {
    const sofia: StudentProfilePayload = {
      ...basePayload,
      personal_information: {
        ...basePayload.personal_information,
        first_name: 'Sofia',
        nationality: 'Spanish'
      },
      academic_input: {
        ...basePayload.academic_input,
        programme_type: 'IB',
        intended_clusters: ['medicine_dentistry'],
        subject_list: [
          { subject_name: 'Biology', level: 'HL', grade_value: 7 },
          { subject_name: 'Chemistry', level: 'HL', grade_value: 6 },
          { subject_name: 'Mathematics', level: 'HL', grade_value: 6 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 },
          { subject_name: 'Psychology', level: 'SL', grade_value: 6 },
          { subject_name: 'Spanish', level: 'SL', grade_value: 5 }
        ],
        ib_total_points: 42,
        ib_core_points: 2,
        ib_tok_grade: 'B',
        ib_ee_grade: 'A',
        ib_math_pathway: 'AA_HL',
        ee_subject: 'Biology',
        ee_title: 'Cancer cell mutations',
        ee_summary: 'Exploring medicine and genetics in oncology.',
        english_required: true,
        english_test_type: 'IELTS',
        english_status: 'exceptional',
        english_score_overall: 8,
        admissions_tests: [
          { test_type: 'UCAT', status: 'taken', score_numeric: 2900, percentile: 85 }
        ]
      }
    };

    const result = scoreStudentProfile(sofia);
    report('Sofia breakdown', result.breakdown);
    // 164 after the HL-strength recalibration (max 40 → 16): IB 44 still maxes
    // academic_performance (80), but a 85th-pct UCAT keeps Sofia below the
    // 168 'Exceptional' cutoff.
    expect(result.total_score).toBe(164);
    expect(result.student_band).toBe('Very strong');
    expect(result.eligibility_flags.length).toBe(0);
    expect(result.readiness_flags.length).toBe(0);
  });

  it('scores Daniel (A-level law) with a borderline band', () => {
    const daniel: StudentProfilePayload = {
      ...basePayload,
      personal_information: {
        ...basePayload.personal_information,
        first_name: 'Daniel',
        nationality: 'Nigerian'
      },
      academic_input: {
        ...basePayload.academic_input,
        programme_type: 'A_LEVEL',
        intended_clusters: ['law'],
        subject_list: [
          { subject_name: 'History', level: 'A_LEVEL', grade_value: 'A' },
          { subject_name: 'English Literature', level: 'A_LEVEL', grade_value: 'A' },
          { subject_name: 'Politics', level: 'A_LEVEL', grade_value: 'B' },
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'C' }
        ],
        a_level_predicted_grades: {
          History: 'A',
          'English Literature': 'A',
          Politics: 'B',
          Mathematics: 'C'
        },
        ib_total_points: null,
        ib_core_points: null,
        ib_tok_grade: null,
        ib_ee_grade: null,
        ib_math_pathway: null,
        english_required: true,
        english_test_type: 'IELTS',
        english_status: 'met',
        english_score_overall: 7,
        admissions_tests: [
          { test_type: 'LNAT', status: 'taken', score_numeric: 25, percentile: null }
        ]
      }
    };

    const result = scoreStudentProfile(daniel);
    report('Daniel breakdown', result.breakdown);
    expect(result.total_score).toBe(111);
    expect(result.student_band).toBe('Solid');
    expect(result.readiness_flags.length).toBe(0);
  });

  it('scores Lucas (A-level engineering) with a weak band and readiness flag', () => {
    const lucas: StudentProfilePayload = {
      ...basePayload,
      personal_information: {
        ...basePayload.personal_information,
        first_name: 'Lucas',
        nationality: 'Brazilian'
      },
      academic_input: {
        ...basePayload.academic_input,
        programme_type: 'A_LEVEL',
        intended_clusters: ['engineering'],
        subject_list: [
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'C' },
          { subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'D' },
          { subject_name: 'Chemistry', level: 'A_LEVEL', grade_value: 'D' }
        ],
        a_level_predicted_grades: {
          Mathematics: 'C',
          Physics: 'D',
          Chemistry: 'D'
        },
        english_required: true,
        english_test_type: 'IELTS',
        english_status: 'missing',
        english_score_overall: null,
        admissions_tests: []
      }
    };

    const result = scoreStudentProfile(lucas);
    report('Lucas breakdown', result.breakdown);
    expect(result.total_score).toBe(39);
    expect(result.student_band).toBe('Weak');
    expect(result.readiness_flags).toContain('english_test_missing');
  });

  it('handles missing grades without breaking', () => {
    const incomplete: StudentProfilePayload = {
      ...basePayload,
      academic_input: {
        ...basePayload.academic_input,
        programme_type: 'A_LEVEL',
        intended_clusters: ['economics_quant'],
        subject_list: [
          { subject_name: 'Economics', level: 'A_LEVEL', grade_value: '' },
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: '' },
          { subject_name: 'History', level: 'A_LEVEL', grade_value: '' }
        ],
        a_level_predicted_grades: null,
        english_required: null,
        english_status: 'missing',
        english_test_type: 'NONE'
      }
    };

    const result = scoreStudentProfile(incomplete);
    report('Missing grades breakdown', result.breakdown);
    expect(result.total_score).toBeGreaterThanOrEqual(0);
    expect(result.student_band).toBeDefined();
  });

  it('scores English waiver without readiness flags', () => {
    const waiver: StudentProfilePayload = {
      ...basePayload,
      academic_input: {
        ...basePayload.academic_input,
        programme_type: 'A_LEVEL',
        intended_clusters: ['business_non_quant'],
        subject_list: [
          { subject_name: 'Business', level: 'A_LEVEL', grade_value: 'B' },
          { subject_name: 'Economics', level: 'A_LEVEL', grade_value: 'B' },
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'C' }
        ],
        a_level_predicted_grades: {
          Business: 'B',
          Economics: 'B',
          Mathematics: 'C'
        },
        english_required: false,
        english_status: 'met',
        english_test_type: 'WAIVER'
      }
    };

    const result = scoreStudentProfile(waiver);
    report('English waiver breakdown', result.breakdown);
    expect(result.readiness_flags.length).toBe(0);
  });
});
