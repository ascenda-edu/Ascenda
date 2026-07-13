/**
 * Phase 1 — 4 synthetic profiles for initial algorithm validation
 *
 * Each profile is chosen to expose a specific scoring behaviour.
 * Run via:  npx ts-node --project tsconfig.json __tests__/scoring_validation/batch_runner.ts
 * or:       npm test -- scoring_validation
 *
 * Archetype coverage:
 *  1. Wei     — exceptional academics, near-zero extracurriculars  → ceiling check
 *  2. Amara   — solid A-level law profile + exceptional extracurriculars
 *  3. Marcus  — weak academics, nationally-recognised extracurriculars
 *  4. Priya   — borderline IB business profile with moderate activities
 */

import type { StudentProfilePayload } from '../../src/lib/profile/intake-types';

// ─── Shared skeleton ──────────────────────────────────────────────────────────

const baseLifestyle: StudentProfilePayload['lifestyle_preference'] = {
  teaching_style: null,
  desired_location_type: null,
  campus_size: null,
  extracurricular_interests: [],
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
  epq_title: null,
};

// ─── Profile 1 — Wei (IB · Medicine) ─────────────────────────────────────────
// The "pure academic" ceiling check.
// Expected result: Exceptional score stays where it is — activities = 0,
// total should not be inflated beyond academic merit.

export const wei: StudentProfilePayload = {
  personal_information: {
    first_name: 'Wei', last_name: 'Zhang',
    email: 'wei@test.com', phone: null,
    nationality: 'Chinese', age: 18, gender: 'male',
    resident_country: 'China', current_location_city: 'Shanghai',
    time_zone: 'Asia/Shanghai',
  },
  academic_input: {
    programme_type: 'IB',
    school_name: 'Shanghai American School', school_country: 'China',
    school_city: 'Shanghai', school_type: 'international_school',
    language_of_instruction: 'english', graduation_year: 2024,
    desired_start_date: null,
    intended_clusters: ['medicine_dentistry'], secondary_clusters: [],
    career_aspiration: 'Surgeon',
    subject_list: [
      { subject_name: 'Biology', level: 'HL', grade_value: 7 },
      { subject_name: 'Chemistry', level: 'HL', grade_value: 7 },
      { subject_name: 'Mathematics', level: 'HL', grade_value: 7 },
      { subject_name: 'Physics', level: 'SL', grade_value: 6 },
      { subject_name: 'English Literature', level: 'SL', grade_value: 6 },
      { subject_name: 'Chinese', level: 'SL', grade_value: 6 },
    ],
    ib_total_points: 44, ib_core_points: 3,
    ib_tok_grade: 'A', ib_ee_grade: 'A', ib_math_pathway: 'AA_HL',
    ee_subject: 'Biology',
    ee_title: 'Efficacy of CRISPR-Cas9 in correcting sickle-cell mutations',
    ee_summary: 'Investigates CRISPR gene-editing as a treatment for sickle-cell disease — directly relevant to medicine and clinical biology.',
    a_level_predicted_grades: null,
    english_required: true, english_test_type: 'IELTS',
    english_status: 'exceptional', english_score_overall: 8.5,
    admissions_tests: [
      { test_type: 'UCAT', status: 'taken', score_numeric: 3000, percentile: 93 },
    ],
  },
  lifestyle_preference: {
    ...baseLifestyle,
    // Minimal extracurriculars — just school science club
    commitment_level: 'light',
    key_activities: ['Science competition'],
    leadership_roles: [],
    intl_experience: [],
    work_experience: false,
  },
  activities_list: [],
};

// ─── Profile 2 — Amara (A-levels · Law) ──────────────────────────────────────
// "Rounded high achiever" — tests whether strong extracurriculars push a
// Very-strong-border profile up towards Exceptional.

export const amara: StudentProfilePayload = {
  personal_information: {
    first_name: 'Amara', last_name: 'Diallo',
    email: 'amara@test.com', phone: null,
    nationality: 'Ghanaian', age: 18, gender: 'female',
    resident_country: 'Ghana', current_location_city: 'Accra',
    time_zone: 'Africa/Accra',
  },
  academic_input: {
    programme_type: 'A_LEVEL',
    school_name: 'Lincoln Community School', school_country: 'Ghana',
    school_city: 'Accra', school_type: 'international_school',
    language_of_instruction: 'english', graduation_year: 2024,
    desired_start_date: null,
    intended_clusters: ['law'], secondary_clusters: ['humanities'],
    career_aspiration: 'International human rights lawyer',
    subject_list: [
      { subject_name: 'History', level: 'A_LEVEL', grade_value: 'A*' },
      { subject_name: 'English Literature', level: 'A_LEVEL', grade_value: 'A' },
      { subject_name: 'Government & Politics', level: 'A_LEVEL', grade_value: 'A' },
    ],
    a_level_predicted_grades: { History: 'A*', 'English Literature': 'A', 'Government & Politics': 'A' },
    ib_total_points: null, ib_core_points: null,
    ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null,
    ee_subject: null, ee_title: null, ee_summary: null,
    english_required: true, english_test_type: 'IELTS',
    english_status: 'exceptional', english_score_overall: 8.0,
    admissions_tests: [
      { test_type: 'LNAT', status: 'taken', score_numeric: 30, percentile: null },
    ],
  },
  lifestyle_preference: {
    ...baseLifestyle,
    // Exceptional extracurriculars — the boost should matter here
    commitment_level: 'exceptional',
    leadership_roles: ['Head Boy / Girl', 'Student Council'],
    key_activities: ['Debate / Model UN', 'Writing / journalism', 'Community service', 'Drama / theatre', 'Research project'],
    intl_experience: ['International competition'],
    work_experience: true,
    work_experience_summary: 'Legal aid clinic volunteer, 6 months',
  },
  activities_list: [],
};

// ─── Profile 3 — Marcus (A-levels · Computer Science) ────────────────────────
// "Code but barely passing" — weak academics, nationally-recognised
// extracurriculars. Tests the floor behaviour: can activities alone
// lift a Weak student to Borderline?

export const marcus: StudentProfilePayload = {
  personal_information: {
    first_name: 'Marcus', last_name: 'Oliveira',
    email: 'marcus@test.com', phone: null,
    nationality: 'Brazilian', age: 18, gender: 'male',
    resident_country: 'Brazil', current_location_city: 'São Paulo',
    time_zone: 'America/Sao_Paulo',
  },
  academic_input: {
    programme_type: 'A_LEVEL',
    school_name: 'St Paul\'s School São Paulo', school_country: 'Brazil',
    school_city: 'São Paulo', school_type: 'international_school',
    language_of_instruction: 'english', graduation_year: 2024,
    desired_start_date: null,
    intended_clusters: ['computer_science'], secondary_clusters: [],
    career_aspiration: 'Startup founder / AI engineer',
    subject_list: [
      { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'C' },
      { subject_name: 'Computer Science', level: 'A_LEVEL', grade_value: 'B' },
      { subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'B' },
    ],
    a_level_predicted_grades: { Mathematics: 'C', 'Computer Science': 'B', Physics: 'B' },
    ib_total_points: null, ib_core_points: null,
    ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null,
    ee_subject: null, ee_title: null, ee_summary: null,
    english_required: true, english_test_type: 'IELTS',
    english_status: 'met', english_score_overall: 7.0,
    admissions_tests: [],
  },
  lifestyle_preference: {
    ...baseLifestyle,
    // Nationally-recognised extracurriculars — built and deployed a real product
    commitment_level: 'exceptional',
    leadership_roles: ['Club Founder'],          // founded school's coding society
    key_activities: ['Coding / hackathons', 'Research project', 'Entrepreneurship', 'Science competition', 'Writing / journalism'],
    intl_experience: ['International competition'],  // won regional hackathon, represented Brazil
    work_experience: true,
    work_experience_summary: 'Freelance mobile app developer — 2 apps published on App Store',
  },
  activities_list: [],
};

// ─── Profile 4 — Priya (IB · Business) ───────────────────────────────────────
// "Borderline boost" — sitting right at the Borderline/Solid threshold.
// Tests whether moderate activities meaningfully shift the band at the margin.

export const priya: StudentProfilePayload = {
  personal_information: {
    first_name: 'Priya', last_name: 'Nair',
    email: 'priya@test.com', phone: null,
    nationality: 'Indian', age: 17, gender: 'female',
    resident_country: 'India', current_location_city: 'Mumbai',
    time_zone: 'Asia/Kolkata',
  },
  academic_input: {
    programme_type: 'IB',
    school_name: 'Dhirubhai Ambani International School', school_country: 'India',
    school_city: 'Mumbai', school_type: 'international_school',
    language_of_instruction: 'english', graduation_year: 2025,
    desired_start_date: null,
    intended_clusters: ['business_non_quant'], secondary_clusters: ['economics_quant'],
    career_aspiration: 'Management consultant',
    subject_list: [
      { subject_name: 'Business', level: 'HL', grade_value: 6 },
      { subject_name: 'Economics', level: 'HL', grade_value: 5 },
      { subject_name: 'Psychology', level: 'HL', grade_value: 4 },
      { subject_name: 'Mathematics', level: 'SL', grade_value: 5 },
      { subject_name: 'English Literature', level: 'SL', grade_value: 5 },
      { subject_name: 'Hindi', level: 'SL', grade_value: 4 },
    ],
    ib_total_points: 35, ib_core_points: 1,
    ib_tok_grade: 'B', ib_ee_grade: 'C', ib_math_pathway: 'AI_SL',
    ee_subject: 'Business', ee_title: 'Family business succession planning in SMEs',
    ee_summary: 'Analyses succession challenges in Indian family-owned SMEs.',
    a_level_predicted_grades: null,
    english_required: true, english_test_type: 'IELTS',
    english_status: 'met', english_score_overall: 7.0,
    admissions_tests: [],
  },
  lifestyle_preference: {
    ...baseLifestyle,
    // Moderate activities — prefect, sports captain, some volunteering
    commitment_level: 'moderate',
    leadership_roles: ['Prefect'],
    key_activities: ['Sport (competitive)', 'Community service', 'Entrepreneurship'],
    intl_experience: ['Study abroad'],
    work_experience: false,
  },
  activities_list: [],
};

// ─── Export as ordered batch ──────────────────────────────────────────────────

export const PHASE1_PROFILES = [
  { label: 'Wei — IB Medicine (pure academic ceiling)', profile: wei },
  { label: 'Amara — A-level Law (rounded achiever)', profile: amara },
  { label: 'Marcus — A-level CS (weak grades, exceptional extracurriculars)', profile: marcus },
  { label: 'Priya — IB Business (borderline boost test)', profile: priya },
];
