import { enrichCourseRecords, type CourseRecord } from '@/lib/tiering/course_tiering';
import { rankCourseMatches, type PreferencesFilters } from '@/lib/matching/matching_engine';
import { scoreStudentProfile } from '@/lib/scoring/student_scoring';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';

const baseCourse: CourseRecord = {
  university: 'Example University',
  city: 'London',
  level: 'Undergraduate',
  degree_type: 'BSc (Hons)',
  field_of_study: 'Computer Science',
  course: 'Computer Science',
  duration: '3 years',
  qs_uk_rank: null,
  times_sunday_rank: null,
  guardian_rank: null,
  acceptance_rate_pct: null,
  nss_score_pct: null,
  intake_size: null,
  gender_ratio_pct: null,
  international_students_ratio_pct: null,
  student_to_staff_ratio: null,
  yearly_international_tuition_fee_gbp: null,
  student_dorm_cost_gbp_per_year: null,
  average_rent_outside_campus_gbp_per_month: null,
  cost_of_life: null,
  min_ib_score: null,
  min_a_level_score: null,
  preferred_subjects: null,
  english_score_requirement: null,
  course_online_page: null,
  ucas_code: null,
  ucas_deadline: null,
  admission_test: null,
  interview: null,
  university_life: null,
  number_of_students: null,
  transport_accessibility: null,
  cultural_social_environment: null,
  city_life: null,
  climate: null,
  safety_index: null,
  study_abroad_option: null,
  graduate_employment_rate_pct: null,
  average_starting_salary_gbp: null,
  top_industries: null,
  placement_year: null
};

const sampleCourses: CourseRecord[] = [
  {
    ...baseCourse,
    university: 'Imperial College London',
    city: 'London',
    course: 'Medicine',
    field_of_study: 'Medicine',
    qs_uk_rank: 2,
    times_sunday_rank: 4,
    guardian_rank: 6,
    min_ib_score: 40,
    min_a_level_score: 'A*AA',
    admission_test: 'UCAT',
    english_score_requirement: 'IELTS 7.5',
    yearly_international_tuition_fee_gbp: 38000
  },
  {
    ...baseCourse,
    university: 'University of Oxford',
    city: 'Oxford',
    course: 'Law',
    field_of_study: 'Law',
    qs_uk_rank: 1,
    times_sunday_rank: 1,
    guardian_rank: 1,
    min_ib_score: 39,
    min_a_level_score: 'AAA',
    admission_test: 'LNAT',
    english_score_requirement: 'IELTS 7.0',
    yearly_international_tuition_fee_gbp: 35000
  },
  {
    ...baseCourse,
    university: 'University of Warwick',
    city: 'Coventry',
    course: 'Economics',
    field_of_study: 'Economics',
    qs_uk_rank: 15,
    times_sunday_rank: 10,
    guardian_rank: 12,
    min_ib_score: 36,
    min_a_level_score: 'AAB',
    admission_test: 'TMUA',
    english_score_requirement: 'IELTS 6.5',
    yearly_international_tuition_fee_gbp: 28500
  },
  {
    ...baseCourse,
    university: 'University of Manchester',
    city: 'Manchester',
    course: 'Mechanical Engineering',
    field_of_study: 'Engineering',
    qs_uk_rank: 25,
    times_sunday_rank: 28,
    guardian_rank: 30,
    min_ib_score: 34,
    min_a_level_score: 'ABB',
    admission_test: 'None',
    english_score_requirement: 'IELTS 6.5',
    yearly_international_tuition_fee_gbp: 25000
  },
  {
    ...baseCourse,
    university: 'University of Bristol',
    city: 'Bristol',
    course: 'Computer Science',
    field_of_study: 'Computer Science',
    qs_uk_rank: 30,
    times_sunday_rank: 26,
    guardian_rank: 40,
    min_ib_score: 32,
    min_a_level_score: 'BBB',
    admission_test: 'None',
    yearly_international_tuition_fee_gbp: 24000
  },
  {
    ...baseCourse,
    university: 'University of Birmingham',
    city: 'Birmingham',
    course: 'Biomedical Sciences',
    field_of_study: 'Life Sciences',
    qs_uk_rank: 45,
    times_sunday_rank: 38,
    guardian_rank: 55,
    min_ib_score: 30,
    min_a_level_score: 'BBC',
    admission_test: 'None',
    yearly_international_tuition_fee_gbp: 22000
  },
  {
    ...baseCourse,
    university: 'University of Leeds',
    city: 'Leeds',
    course: 'Law',
    field_of_study: 'Law',
    qs_uk_rank: 60,
    times_sunday_rank: 62,
    guardian_rank: 70,
    min_ib_score: 28,
    min_a_level_score: 'BCC',
    admission_test: 'LNAT',
    english_score_requirement: 'IELTS 6.5',
    yearly_international_tuition_fee_gbp: 21000
  },
  {
    ...baseCourse,
    university: 'University of Sussex',
    city: 'Brighton',
    course: 'Politics',
    field_of_study: 'Humanities',
    qs_uk_rank: 78,
    times_sunday_rank: 85,
    guardian_rank: 90,
    min_ib_score: 27,
    min_a_level_score: 'CCC',
    admission_test: 'None',
    yearly_international_tuition_fee_gbp: 19500
  },
  {
    ...baseCourse,
    university: 'University of Reading',
    city: 'Reading',
    course: 'Business Management',
    field_of_study: 'Business',
    qs_uk_rank: 95,
    times_sunday_rank: 105,
    guardian_rank: 120,
    min_ib_score: 26,
    min_a_level_score: 'CCD',
    admission_test: 'None',
    yearly_international_tuition_fee_gbp: 19000
  },
  {
    ...baseCourse,
    university: 'Smaller Regional University',
    city: 'Exeter',
    course: 'Creative Arts',
    field_of_study: 'Creative',
    qs_uk_rank: 140,
    times_sunday_rank: 130,
    guardian_rank: 150,
    min_ib_score: null,
    min_a_level_score: null,
    admission_test: 'None',
    yearly_international_tuition_fee_gbp: 17000
  },
  {
    ...baseCourse,
    university: 'University of Glasgow',
    city: 'Glasgow',
    course: 'Dentistry',
    field_of_study: 'Medicine',
    qs_uk_rank: 20,
    times_sunday_rank: 22,
    guardian_rank: 18,
    min_ib_score: 38,
    min_a_level_score: 'AAA',
    admission_test: 'UCAT',
    english_score_requirement: 'IELTS 7.0',
    yearly_international_tuition_fee_gbp: 36000
  },
  {
    ...baseCourse,
    university: 'Queen Mary University of London',
    city: 'London',
    course: 'Engineering',
    field_of_study: 'Engineering',
    qs_uk_rank: 38,
    times_sunday_rank: 45,
    guardian_rank: 52,
    min_ib_score: 32,
    min_a_level_score: 'BBB',
    admission_test: 'None',
    yearly_international_tuition_fee_gbp: 23000
  },
  {
    ...baseCourse,
    university: 'University of Nottingham',
    city: 'Nottingham',
    course: 'Medicine',
    field_of_study: 'Medicine',
    qs_uk_rank: 42,
    times_sunday_rank: 40,
    guardian_rank: 48,
    min_ib_score: 36,
    min_a_level_score: 'AAB',
    admission_test: 'UCAT',
    english_score_requirement: 'IELTS 7.0',
    yearly_international_tuition_fee_gbp: 34000
  },
  {
    ...baseCourse,
    university: 'King\'s College London',
    city: 'London',
    course: 'Law',
    field_of_study: 'Law',
    qs_uk_rank: 10,
    times_sunday_rank: 15,
    guardian_rank: 20,
    min_ib_score: 38,
    min_a_level_score: 'AAA',
    admission_test: 'LNAT',
    english_score_requirement: 'IELTS 7.0',
    yearly_international_tuition_fee_gbp: 32000
  },
  {
    ...baseCourse,
    university: 'University of Sheffield',
    city: 'Sheffield',
    course: 'Computer Science',
    field_of_study: 'Computer Science',
    qs_uk_rank: 50,
    times_sunday_rank: 55,
    guardian_rank: 60,
    min_ib_score: 31,
    min_a_level_score: 'BBB',
    admission_test: 'None',
    yearly_international_tuition_fee_gbp: 21000
  }
];

const baseStudent: StudentProfilePayload = {
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
    other_extracurriculars: null
  }
};

const sofia: StudentProfilePayload = {
  ...baseStudent,
  personal_information: { ...baseStudent.personal_information, first_name: 'Sofia', nationality: 'Spanish' },
  academic_input: {
    ...baseStudent.academic_input,
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
    admissions_tests: [{ test_type: 'UCAT', status: 'taken', score_numeric: 2900, percentile: 85 }]
  }
};

const daniel: StudentProfilePayload = {
  ...baseStudent,
  personal_information: { ...baseStudent.personal_information, first_name: 'Daniel', nationality: 'Nigerian' },
  academic_input: {
    ...baseStudent.academic_input,
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
    admissions_tests: [{ test_type: 'LNAT', status: 'taken', score_numeric: 25, percentile: null }]
  }
};

const lucas: StudentProfilePayload = {
  ...baseStudent,
  personal_information: { ...baseStudent.personal_information, first_name: 'Lucas', nationality: 'Brazilian' },
  academic_input: {
    ...baseStudent.academic_input,
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

const filters: PreferencesFilters = {
  max_yearly_fee_gbp: 36000
};

const enrichedCourses = enrichCourseRecords(sampleCourses);

const runDemo = (student: StudentProfilePayload, label: string) => {
  const score = scoreStudentProfile(student);
  const matches = rankCourseMatches(student, score, enrichedCourses, filters).slice(0, 10);
  console.log(`\nTop matches for ${label} (${score.student_band})`);
  matches.forEach((match, index) => {
    console.log(
      `${index + 1}. ${match.university} • ${match.course} -> ${match.chance_percent}% (${match.admission_band})${match.excluded ? ' [Excluded]' : ''}`
    );
  });
};

runDemo(sofia, 'Sofia');
runDemo(daniel, 'Daniel');
runDemo(lucas, 'Lucas');
