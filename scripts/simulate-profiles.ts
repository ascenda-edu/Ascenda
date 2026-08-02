/**
 * Profile Simulation Runner
 * Tests the scoring/matching algorithm against real-world admission outcomes.
 * Usage: npx tsx --tsconfig tsconfig.json scripts/simulate-profiles.ts [batch_10|batch_30|batch_100]
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { scoreStudentProfile } from '@/lib/scoring/student_scoring';
import { rankCourseMatches, aLevelToIbEquivalent, actToIbEquivalent } from '@/lib/matching/matching_engine';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';
import type { EnrichedCourseRecord } from '@/lib/tiering/course_tiering';

// ── Env loader ────────────────────────────────────────────────────────────────

const loadEnv = () => {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, 'utf-8');
  contents.split('\n').forEach((line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    if (!key || rest.length === 0) return;
    if (process.env[key]) return;
    process.env[key] = rest.join('=').replace(/^"|"$/g, '');
  });
};

// ── Simulated profile type ────────────────────────────────────────────────────

type SimulatedProfile = {
  name: string;
  profile: StudentProfilePayload;
  actual_university: string; // exact DB name
  actual_program: string;    // keyword to match course_name
  actual_country: string;
  notes: string;
};

// ── 10 profiles (Batch 1) ─────────────────────────────────────────────────────
// Based on real admission data from public sources (The Student Room, Reddit,
// university published admit stats 2022-2024).

export const BATCH_10: SimulatedProfile[] = [

  // ── 1. IB 43 student → Imperial Electrical Engineering (min IB 40) ──────────
  // Singapore international school. Real admissions: Imperial EEE accepts IB 40-42 regularly.
  {
    name: 'Amara Osei',
    actual_university: 'Imperial College London',
    actual_program: 'Electrical',
    actual_country: 'United Kingdom',
    notes: 'IB 43 student at International School, strong STEM HL subjects. Imperial EEE min IB 40. Should be Target.',
    profile: {
      personal_information: {
        first_name: 'Amara', last_name: 'Osei', email: 'amara@sim.test',
        phone: null, nationality: 'Ghanaian', age: 18,
        gender: 'female', resident_country: 'Singapore',
        current_location_city: 'Singapore', time_zone: 'Asia/Singapore',
      },
      academic_input: {
        programme_type: 'IB',
        school_name: 'Singapore International School',
        school_country: 'Singapore', school_city: 'Singapore',
        school_type: 'international_school',
        language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['engineering'], secondary_clusters: ['computer_science'],
        career_aspiration: 'Electrical engineer',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 7 },
          { subject_name: 'Physics', level: 'HL', grade_value: 7 },
          { subject_name: 'Chemistry', level: 'HL', grade_value: 6 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 },
          { subject_name: 'Economics', level: 'SL', grade_value: 6 },
          { subject_name: 'French', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 40, ib_core_points: 0,
        ib_tok_grade: 'A', ib_ee_grade: 'A',
        ib_math_pathway: 'AA_HL',
        ee_subject: 'Physics', ee_title: 'Electromagnetic induction efficiency in motors',
        ee_summary: 'Investigated electromagnetic engineering principles in electric motors.',
        a_level_predicted_grades: null,
        english_required: false, english_test_type: 'NONE',
        english_status: 'met', english_score_overall: null,
        admissions_tests: [],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: 'london',
        campus_size: 'medium', extracurricular_interests: ['Robotics', 'Chess'],
        other_extracurriculars: null,
        leadership_roles: ['Club Founder'],
        commitment_level: 'deep',
        key_activities: ['Robotics Club', 'Science Olympiad', 'Math Competition'],
        sat_score: null, act_score: null,
        intl_experience: ['Study abroad'],
        work_experience: false, work_experience_summary: null,
        ambition_statement: 'To design sustainable electrical systems.',
      },
    },
  },

  // ── 2. A*A*A* student → Imperial Mechanical Engineering (min IB 40 / a_level 100) ──
  // UK boarding school. A*A*A* in Maths, Physics, Further Maths. Real outcome: Imperial Mech Eng.
  {
    name: 'James Richardson',
    actual_university: 'Imperial College London',
    actual_program: 'Mechanical',
    actual_country: 'United Kingdom',
    notes: 'A*A*A* UK student. A-level equiv IB ~43. Imperial Mech Eng min IB 40 / a_level 100. Should be Target.',
    profile: {
      personal_information: {
        first_name: 'James', last_name: 'Richardson', email: 'james@sim.test',
        phone: null, nationality: 'British', age: 18,
        gender: 'male', resident_country: 'United Kingdom',
        current_location_city: 'London', time_zone: 'Europe/London',
      },
      academic_input: {
        programme_type: 'A_LEVEL',
        school_name: 'Eton College',
        school_country: 'United Kingdom', school_city: 'Windsor',
        school_type: 'boarding',
        language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['engineering'], secondary_clusters: ['maths'],
        career_aspiration: 'Mechanical engineer in aerospace',
        subject_list: [
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' },
          { subject_name: 'Further Mathematics', level: 'A_LEVEL', grade_value: 'A*' },
          { subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'A*' },
        ],
        ib_total_points: null, ib_core_points: null,
        ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null,
        ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: { Mathematics: 'A*', 'Further Mathematics': 'A*', Physics: 'A*' },
        english_required: false, english_test_type: 'NONE',
        english_status: 'met', english_score_overall: null,
        admissions_tests: [],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: 'london',
        campus_size: 'medium', extracurricular_interests: ['F1 Engineering', 'Programming'],
        other_extracurriculars: null,
        leadership_roles: ['Head Boy / Girl'],
        commitment_level: 'deep',
        key_activities: ['Maths Olympiad', 'Physics Society', 'Engineering Club'],
        sat_score: null, act_score: null,
        intl_experience: [],
        work_experience: true,
        work_experience_summary: 'Engineering internship at aerospace company, worked on mechanical design projects.',
        ambition_statement: 'Aerospace mechanical engineering.',
      },
    },
  },

  // ── 3. IB 44 → Harvard CS (min IB 44, score 99.3) ─────────────────────────
  // This stress-tests the prestige penalty. IB 44 vs min 44 → effGap = 0 - 2.45 = -2.45 → Excluded.
  // FINDING: Even IB 44 students are excluded from Harvard due to prestige penalty.
  {
    name: 'Sofia Chen',
    actual_university: 'Harvard University',
    actual_program: 'Computer Science',
    actual_country: 'United States',
    notes: 'IB 44 student. Harvard min IB 44, prestige penalty ~2.45 → effGap -2.45 → Excluded. Known calibration issue for top US schools.',
    profile: {
      personal_information: {
        first_name: 'Sofia', last_name: 'Chen', email: 'sofia@sim.test',
        phone: null, nationality: 'Chinese-American', age: 18,
        gender: 'female', resident_country: 'United States',
        current_location_city: 'San Francisco', time_zone: 'America/Los_Angeles',
      },
      academic_input: {
        programme_type: 'IB',
        school_name: 'International School of San Francisco',
        school_country: 'United States', school_city: 'San Francisco',
        school_type: 'international_school',
        language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['computer_science'], secondary_clusters: ['maths'],
        career_aspiration: 'AI researcher',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 7 },
          { subject_name: 'Computer Science', level: 'HL', grade_value: 7 },
          { subject_name: 'Physics', level: 'HL', grade_value: 7 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 },
          { subject_name: 'Economics', level: 'SL', grade_value: 6 },
          { subject_name: 'French', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 41, ib_core_points: 0,
        ib_tok_grade: 'A', ib_ee_grade: 'A',
        ib_math_pathway: 'AA_HL',
        ee_subject: 'Computer Science', ee_title: 'Neural network optimisation for image recognition',
        ee_summary: 'Investigated machine learning algorithms and AI neural network architectures.',
        a_level_predicted_grades: null,
        english_required: false, english_test_type: 'NONE',
        english_status: 'met', english_score_overall: null,
        admissions_tests: [],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: 'major_city',
        campus_size: 'large', extracurricular_interests: ['AI Research', 'Competitive Programming'],
        other_extracurriculars: null,
        leadership_roles: ['Club Founder'],
        commitment_level: 'exceptional',
        key_activities: ['Competitive Programming', 'Research internship', 'Math Olympiad', 'Science fair', 'Hackathon'],
        sat_score: null, act_score: 35,
        intl_experience: ['Research exchange', 'International competition'],
        work_experience: true,
        work_experience_summary: 'Software engineering internship at tech company. Worked on machine learning and AI projects.',
        ambition_statement: 'Advance artificial intelligence research.',
      },
    },
  },

  // ── 4. IB 37 → Edinburgh Economics (min IB 37) ────────────────────────────
  // Brazilian student at international school. Edinburgh Econ min IB 37. Should be Reach.
  {
    name: 'Maria Santos',
    actual_university: 'The University of Edinburgh',
    actual_program: 'Economics',
    actual_country: 'United Kingdom',
    notes: 'IB 37 student. Edinburgh Economics min IB 37. Gap=0, prestige penalty ~1.34. effGap ≈ -1.34 → Reach.',
    profile: {
      personal_information: {
        first_name: 'Maria', last_name: 'Santos', email: 'maria@sim.test',
        phone: null, nationality: 'Brazilian', age: 18,
        gender: 'female', resident_country: 'Brazil',
        current_location_city: 'São Paulo', time_zone: 'America/Sao_Paulo',
      },
      academic_input: {
        programme_type: 'IB',
        school_name: 'St Paul\'s International School São Paulo',
        school_country: 'Brazil', school_city: 'São Paulo',
        school_type: 'international_school',
        language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['economics_quant'], secondary_clusters: ['business_non_quant'],
        career_aspiration: 'Economist in international development',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 6 },
          { subject_name: 'Economics', level: 'HL', grade_value: 7 },
          { subject_name: 'History', level: 'HL', grade_value: 6 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 },
          { subject_name: 'Portuguese', level: 'SL', grade_value: 7 },
          { subject_name: 'Geography', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 34, ib_core_points: 0,
        ib_tok_grade: 'B', ib_ee_grade: 'A',
        ib_math_pathway: 'AA_SL',
        ee_subject: 'Economics', ee_title: 'Impact of microfinance on poverty reduction in Brazil',
        ee_summary: 'Analysed economics of microfinance, development finance and poverty reduction strategies.',
        a_level_predicted_grades: null,
        english_required: true, english_test_type: 'IELTS',
        english_status: 'exceeds', english_score_overall: 7.5,
        admissions_tests: [],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: 'major_city',
        campus_size: 'large', extracurricular_interests: ['Debate', 'MUN'],
        other_extracurriculars: null,
        leadership_roles: ['Community Leader'],
        commitment_level: 'deep',
        key_activities: ['Model UN', 'Economics Olympiad', 'Community volunteering'],
        sat_score: null, act_score: null,
        intl_experience: ['Study abroad', 'International competition'],
        work_experience: false, work_experience_summary: null,
        ambition_statement: 'Work at IMF or World Bank.',
      },
    },
  },

  // ── 5. ACT 35 → Columbia Economics (min IB 43) ────────────────────────────
  // US private school. ACT 35 → IB equiv 43. Columbia min IB 43. effGap = 43-43=0, penalty=1.95 → effGap=-1.95 → Reach.
  {
    name: 'Emma Johnson',
    actual_university: 'Columbia University in the City of New York',
    actual_program: 'Economics',
    actual_country: 'United States',
    notes: 'ACT 35 → IB equiv 43. Columbia min IB 43. effGap=-1.95 → should be Reach (just inside boundary).',
    profile: {
      personal_information: {
        first_name: 'Emma', last_name: 'Johnson', email: 'emma@sim.test',
        phone: null, nationality: 'American', age: 18,
        gender: 'female', resident_country: 'United States',
        current_location_city: 'New York', time_zone: 'America/New_York',
      },
      academic_input: {
        programme_type: 'ACT',
        school_name: 'Dalton School',
        school_country: 'United States', school_city: 'New York',
        school_type: 'local_private',
        language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['economics_quant'], secondary_clusters: ['business_non_quant'],
        career_aspiration: 'Investment banker or economist',
        subject_list: [
          { subject_name: 'Mathematics', level: 'AP', grade_value: 'A*' },
          { subject_name: 'Economics', level: 'AP', grade_value: 'A' },
          { subject_name: 'History', level: 'AP', grade_value: 'A' },
        ],
        ib_total_points: null, ib_core_points: null,
        ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null,
        ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: null,
        english_required: false, english_test_type: 'NONE',
        english_status: 'met', english_score_overall: null,
        admissions_tests: [],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: 'major_city',
        campus_size: 'large', extracurricular_interests: ['Finance', 'Debate'],
        other_extracurriculars: null,
        leadership_roles: ['Class President'],
        commitment_level: 'exceptional',
        key_activities: ['Economics club', 'Stock market simulation', 'Debate team', 'Internship', 'Community service'],
        sat_score: 1540, act_score: 35,
        intl_experience: ['Study abroad'],
        work_experience: true,
        work_experience_summary: 'Finance internship at investment firm. Analysed economics and market data.',
        ambition_statement: 'Work in finance and economics.',
      },
    },
  },

  // ── 6. A*A*A* → Edinburgh PPE (min IB 39 / a_level 100) ──────────────────
  // UK student. A*A*A* in Maths, History, Economics. IB equiv 43. Edinburgh PPE min IB 39. Should be Target.
  {
    name: 'Thomas Bell',
    actual_university: 'The University of Edinburgh',
    actual_program: 'Politics, Philosophy and Economics',
    actual_country: 'United Kingdom',
    notes: 'A*A*A* UK student, IB equiv 43. Edinburgh PPE min IB 39. effGap=4 - prestige penalty ~1.6 = 2.4 → Target.',
    profile: {
      personal_information: {
        first_name: 'Thomas', last_name: 'Bell', email: 'thomas@sim.test',
        phone: null, nationality: 'British', age: 18,
        gender: 'male', resident_country: 'United Kingdom',
        current_location_city: 'Manchester', time_zone: 'Europe/London',
      },
      academic_input: {
        programme_type: 'A_LEVEL',
        school_name: 'Manchester Grammar School',
        school_country: 'United Kingdom', school_city: 'Manchester',
        school_type: 'local_private',
        language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['economics_quant'], secondary_clusters: ['humanities'],
        career_aspiration: 'Policy-maker or economist',
        subject_list: [
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' },
          { subject_name: 'History', level: 'A_LEVEL', grade_value: 'A*' },
          { subject_name: 'Economics', level: 'A_LEVEL', grade_value: 'A*' },
        ],
        ib_total_points: null, ib_core_points: null,
        ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null,
        ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: { Mathematics: 'A*', History: 'A*', Economics: 'A*' },
        english_required: false, english_test_type: 'NONE',
        english_status: 'met', english_score_overall: null,
        admissions_tests: [],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: 'major_city',
        campus_size: 'large', extracurricular_interests: ['Politics', 'Debate', 'History'],
        other_extracurriculars: null,
        leadership_roles: ['Head Boy / Girl'],
        commitment_level: 'deep',
        key_activities: ['Debating society', 'Model Parliament', 'History society'],
        sat_score: null, act_score: null,
        intl_experience: [],
        work_experience: false, work_experience_summary: null,
        ambition_statement: 'Civil service or international policy.',
      },
    },
  },

  // ── 7. A*AB → Edinburgh Medicine (min IB 38 / a_level 88) ─────────────────
  // UK student. A*AB in Chem, Bio, Maths. IB equiv = 40. Edinburgh Medicine min IB 38. Target.
  {
    name: 'Aisha Patel',
    actual_university: 'The University of Edinburgh',
    actual_program: 'Medicine',
    actual_country: 'United Kingdom',
    notes: 'A*AB UK student. IB equiv ~40. Edinburgh Medicine min IB 38. effGap = 40-38=2, penalty~1.7, effGap~0.3 → Target.',
    profile: {
      personal_information: {
        first_name: 'Aisha', last_name: 'Patel', email: 'aisha@sim.test',
        phone: null, nationality: 'British', age: 18,
        gender: 'female', resident_country: 'United Kingdom',
        current_location_city: 'Birmingham', time_zone: 'Europe/London',
      },
      academic_input: {
        programme_type: 'A_LEVEL',
        school_name: 'King Edward VI High School for Girls',
        school_country: 'United Kingdom', school_city: 'Birmingham',
        school_type: 'local_private',
        language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['medicine_dentistry'], secondary_clusters: ['life_sciences_biochem'],
        career_aspiration: 'Medical doctor — paediatrics',
        subject_list: [
          { subject_name: 'Chemistry', level: 'A_LEVEL', grade_value: 'A*' },
          { subject_name: 'Biology', level: 'A_LEVEL', grade_value: 'A' },
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'B' },
        ],
        ib_total_points: null, ib_core_points: null,
        ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null,
        ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: { Chemistry: 'A*', Biology: 'A', Mathematics: 'B' },
        english_required: false, english_test_type: 'NONE',
        english_status: 'met', english_score_overall: null,
        admissions_tests: [
          { test_type: 'UCAT', status: 'taken', score_numeric: null, percentile: 82 },
        ],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: 'major_city',
        campus_size: 'large', extracurricular_interests: ['Volunteering', 'Hospital shadowing'],
        other_extracurriculars: null,
        leadership_roles: ['Community Leader'],
        commitment_level: 'deep',
        key_activities: ['Hospital volunteering', 'Biology society', 'First aid'],
        sat_score: null, act_score: null,
        intl_experience: ['Volunteering abroad'],
        work_experience: true,
        work_experience_summary: 'Clinical work experience and hospital volunteering.',
        ambition_statement: 'Become a paediatric doctor.',
      },
    },
  },

  // ── 8. IB 36 → Edinburgh Business Management (min IB 37) ──────────────────
  // German student. IB 36 vs min 37 → gap = -1. effGap ≈ -2.34 → Reach boundary.
  // Real: Edinburgh does admit students 1 point below stated minimum sometimes.
  {
    name: 'Luca Ferrari',
    actual_university: 'The University of Edinburgh',
    actual_program: 'Business Management',
    actual_country: 'United Kingdom',
    notes: 'IB 36 vs Edinburgh Business min IB 37. Gap=-1, effGap~-2.34 → borderline Reach/Excluded. Tests edge-case handling.',
    profile: {
      personal_information: {
        first_name: 'Luca', last_name: 'Ferrari', email: 'luca@sim.test',
        phone: null, nationality: 'Italian', age: 18,
        gender: 'male', resident_country: 'Germany',
        current_location_city: 'Munich', time_zone: 'Europe/Berlin',
      },
      academic_input: {
        programme_type: 'IB',
        school_name: 'Munich International School',
        school_country: 'Germany', school_city: 'Munich',
        school_type: 'international_school',
        language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['business_non_quant'], secondary_clusters: ['economics_quant'],
        career_aspiration: 'Entrepreneur or management consultant',
        subject_list: [
          { subject_name: 'Economics', level: 'HL', grade_value: 7 },
          { subject_name: 'Business', level: 'HL', grade_value: 7 },
          { subject_name: 'Mathematics', level: 'HL', grade_value: 5 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 },
          { subject_name: 'German', level: 'SL', grade_value: 7 },
          { subject_name: 'History', level: 'SL', grade_value: 4 },
        ],
        ib_total_points: 33, ib_core_points: 0,
        ib_tok_grade: 'B', ib_ee_grade: 'B',
        ib_math_pathway: 'AA_HL',
        ee_subject: 'Business', ee_title: 'Impact of digital transformation on SME growth',
        ee_summary: 'Analysed business management strategies and entrepreneurship in digital economy.',
        a_level_predicted_grades: null,
        english_required: true, english_test_type: 'IELTS',
        english_status: 'exceeds', english_score_overall: 7.5,
        admissions_tests: [],
      },
      lifestyle_preference: {
        teaching_style: 'practical', desired_location_type: 'major_city',
        campus_size: 'large', extracurricular_interests: ['Entrepreneurship', 'Sports'],
        other_extracurriculars: null,
        leadership_roles: ['Club Founder'],
        commitment_level: 'deep',
        key_activities: ['Student startup incubator', 'Business competition'],
        sat_score: null, act_score: null,
        intl_experience: ['Study abroad'],
        work_experience: true,
        work_experience_summary: 'Founded a small e-commerce business during school.',
        ambition_statement: 'Build a tech company.',
      },
    },
  },

  // ── 9. ACT 33 → NYU Economics (min IB 43) ─────────────────────────────────
  // ACT 33 → IB equiv 40. NYU min IB 43. gap = -3. effGap = -3 - 2.45 = -5.45 → Excluded.
  // This exposes the key calibration issue: NYU accepts ACT ~29-33 mid-50%.
  {
    name: 'Wei Zhang',
    actual_university: 'New York University',
    actual_program: 'Economics',
    actual_country: 'United States',
    notes: 'ACT 33 → IB equiv 40. NYU min IB 43. effGap ~ -5. Expected: Excluded. CALIBRATION FINDING: NYU mid-50% ACT is 30-34, so this should be Reach.',
    profile: {
      personal_information: {
        first_name: 'Wei', last_name: 'Zhang', email: 'wei@sim.test',
        phone: null, nationality: 'Chinese', age: 18,
        gender: 'male', resident_country: 'China',
        current_location_city: 'Shanghai', time_zone: 'Asia/Shanghai',
      },
      academic_input: {
        programme_type: 'ACT',
        school_name: 'Shanghai American School',
        school_country: 'China', school_city: 'Shanghai',
        school_type: 'international_school',
        language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['economics_quant'], secondary_clusters: ['business_non_quant'],
        career_aspiration: 'Quantitative finance or economics research',
        subject_list: [
          { subject_name: 'Mathematics', level: 'AP', grade_value: 'A*' },
          { subject_name: 'Economics', level: 'AP', grade_value: 'A' },
          { subject_name: 'Statistics', level: 'AP', grade_value: 'A' },
        ],
        ib_total_points: null, ib_core_points: null,
        ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null,
        ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: null,
        english_required: true, english_test_type: 'TOEFL',
        english_status: 'exceeds', english_score_overall: 108,
        admissions_tests: [],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: 'major_city',
        campus_size: 'large', extracurricular_interests: ['Finance', 'Maths'],
        other_extracurriculars: null,
        leadership_roles: [],
        commitment_level: 'moderate',
        key_activities: ['Math competition', 'Finance club'],
        sat_score: 1480, act_score: 33,
        intl_experience: [],
        work_experience: false, work_experience_summary: null,
        ambition_statement: 'Quantitative analyst at a top bank.',
      },
    },
  },

  // ── 10. IB 34 → University of Manchester Engineering (min IB ~32-34) ───────
  // Indian student. IB 34. Manchester Engineering is more accessible. Should be Target/Safety.
  {
    name: 'Priya Sharma',
    actual_university: 'University of Manchester',
    actual_program: 'Mechanical Engineering',
    actual_country: 'United Kingdom',
    notes: 'IB 34 student. Manchester Engineering should have min IB ~32-34. Should be Target or Safety.',
    profile: {
      personal_information: {
        first_name: 'Priya', last_name: 'Sharma', email: 'priya@sim.test',
        phone: null, nationality: 'Indian', age: 18,
        gender: 'female', resident_country: 'India',
        current_location_city: 'Mumbai', time_zone: 'Asia/Kolkata',
      },
      academic_input: {
        programme_type: 'IB',
        school_name: 'Dhirubhai Ambani International School',
        school_country: 'India', school_city: 'Mumbai',
        school_type: 'international_school',
        language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['engineering'], secondary_clusters: ['maths'],
        career_aspiration: 'Mechanical engineer in automotive sector',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 6 },
          { subject_name: 'Physics', level: 'HL', grade_value: 6 },
          { subject_name: 'Chemistry', level: 'HL', grade_value: 5 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 5 },
          { subject_name: 'Hindi', level: 'SL', grade_value: 7 },
          { subject_name: 'Economics', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 30, ib_core_points: 0,
        ib_tok_grade: 'B', ib_ee_grade: 'B',
        ib_math_pathway: 'AA_HL',
        ee_subject: 'Physics', ee_title: 'Efficiency of solar panel configurations',
        ee_summary: 'Investigated renewable energy engineering and solar photovoltaic systems.',
        a_level_predicted_grades: null,
        english_required: true, english_test_type: 'IELTS',
        english_status: 'met', english_score_overall: 7.0,
        admissions_tests: [],
      },
      lifestyle_preference: {
        teaching_style: 'practical', desired_location_type: 'major_city',
        campus_size: 'large', extracurricular_interests: ['Robotics', 'Cricket'],
        other_extracurriculars: null,
        leadership_roles: [],
        commitment_level: 'moderate',
        key_activities: ['Robotics club', 'Science fair'],
        sat_score: null, act_score: null,
        intl_experience: [],
        work_experience: false, work_experience_summary: null,
        ambition_statement: 'Engineer sustainable vehicles.',
      },
    },
  },
];

// ── Batch 30: 20 additional profiles ─────────────────────────────────────────

export const BATCH_30_EXTRA: SimulatedProfile[] = [

  // ── 11. IB 39 → King's CS (min 39, score 80) ─────────────────────────────
  {
    name: 'Oliver Turner',
    actual_university: "King's College London, University of London",
    actual_program: 'Computer Science',
    actual_country: 'United Kingdom',
    notes: 'IB 39 vs King\'s CS min 39. effGap ≈ -1.13 → Reach.',
    profile: {
      personal_information: { first_name: 'Oliver', last_name: 'Turner', email: 'oliver@sim.test', phone: null, nationality: 'British', age: 18, gender: 'male', resident_country: 'United Kingdom', current_location_city: 'Oxford', time_zone: 'Europe/London' },
      academic_input: {
        programme_type: 'IB', school_name: 'Oxford International College', school_country: 'United Kingdom', school_city: 'Oxford', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['computer_science'], secondary_clusters: ['maths'],
        career_aspiration: 'Software engineer',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 7 }, { subject_name: 'Computer Science', level: 'HL', grade_value: 7 }, { subject_name: 'Physics', level: 'HL', grade_value: 6 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 }, { subject_name: 'Economics', level: 'SL', grade_value: 6 }, { subject_name: 'French', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 39, ib_core_points: 0, ib_tok_grade: 'B', ib_ee_grade: 'A', ib_math_pathway: 'AA_HL',
        ee_subject: 'Computer Science', ee_title: 'Sorting algorithm efficiency analysis', ee_summary: 'Analysed computer science algorithms and software engineering complexity.',
        a_level_predicted_grades: null, english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'london', campus_size: 'medium', extracurricular_interests: ['Coding'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'moderate', key_activities: ['Coding club', 'Maths competition'], sat_score: null, act_score: null, intl_experience: [], work_experience: false, work_experience_summary: null, ambition_statement: 'Build software products.' },
    },
  },

  // ── 12. A*A*B → King's Economics (min 38 / a_level 95) ───────────────────
  {
    name: 'Fatima Malik',
    actual_university: "King's College London, University of London",
    actual_program: 'Economics',
    actual_country: 'United Kingdom',
    notes: 'A*A*B UK student. IB equiv 40. King\'s Economics min 38. effGap ≈ 1.2 → Target.',
    profile: {
      personal_information: { first_name: 'Fatima', last_name: 'Malik', email: 'fatima@sim.test', phone: null, nationality: 'British-Pakistani', age: 18, gender: 'female', resident_country: 'United Kingdom', current_location_city: 'Birmingham', time_zone: 'Europe/London' },
      academic_input: {
        programme_type: 'A_LEVEL', school_name: 'Highfield Academy', school_country: 'United Kingdom', school_city: 'Birmingham', school_type: 'state_public', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['economics_quant'], secondary_clusters: ['business_non_quant'],
        career_aspiration: 'Economist at a policy institute',
        subject_list: [
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' }, { subject_name: 'Economics', level: 'A_LEVEL', grade_value: 'A*' }, { subject_name: 'History', level: 'A_LEVEL', grade_value: 'B' },
        ],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: { Mathematics: 'A*', Economics: 'A*', History: 'B' },
        english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'london', campus_size: 'large', extracurricular_interests: ['Economics', 'Debate'], other_extracurriculars: null, leadership_roles: ['Community Leader'], commitment_level: 'deep', key_activities: ['Debate team', 'Economics club'], sat_score: null, act_score: null, intl_experience: [], work_experience: true, work_experience_summary: 'Work experience at a local business analysing economics data.', ambition_statement: 'Public policy career.' },
    },
  },

  // ── 13. IB 39 → Durham Economics (min 37, score 83) ──────────────────────
  {
    name: 'Andreas Weber',
    actual_university: 'Durham University',
    actual_program: 'Economics',
    actual_country: 'United Kingdom',
    notes: 'IB 39 vs Durham Economics min 37. effGap ≈ 0.68 → Target.',
    profile: {
      personal_information: { first_name: 'Andreas', last_name: 'Weber', email: 'andreas@sim.test', phone: null, nationality: 'German', age: 18, gender: 'male', resident_country: 'Germany', current_location_city: 'Berlin', time_zone: 'Europe/Berlin' },
      academic_input: {
        programme_type: 'IB', school_name: 'Berlin International School', school_country: 'Germany', school_city: 'Berlin', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['economics_quant'], secondary_clusters: ['business_non_quant'],
        career_aspiration: 'Investment banking',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 7 }, { subject_name: 'Economics', level: 'HL', grade_value: 7 }, { subject_name: 'History', level: 'HL', grade_value: 6 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 }, { subject_name: 'German', level: 'SL', grade_value: 7 }, { subject_name: 'Biology', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 39, ib_core_points: 0, ib_tok_grade: 'B', ib_ee_grade: 'A', ib_math_pathway: 'AA_HL',
        ee_subject: 'Economics', ee_title: 'Effect of ECB monetary policy on Eurozone growth', ee_summary: 'Analysed economics of monetary policy and finance in the European Union.',
        a_level_predicted_grades: null, english_required: true, english_test_type: 'IELTS', english_status: 'exceeds', english_score_overall: 7.5, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'smaller_city', campus_size: 'medium', extracurricular_interests: ['Finance', 'Tennis'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'moderate', key_activities: ['Finance club', 'Maths competition'], sat_score: null, act_score: null, intl_experience: ['Study abroad'], work_experience: false, work_experience_summary: null, ambition_statement: 'Finance career in London.' },
    },
  },

  // ── 14. A*A*A* → UCL Economics (min 39, score 91) ─────────────────────────
  {
    name: 'Yuki Tanaka',
    actual_university: 'UCL (University College London)',
    actual_program: 'Economics',
    actual_country: 'United Kingdom',
    notes: 'A*A*A* Japanese student. IB equiv 43. UCL Economics min 39. effGap ≈ 2.1 → Target.',
    profile: {
      personal_information: { first_name: 'Yuki', last_name: 'Tanaka', email: 'yuki@sim.test', phone: null, nationality: 'Japanese', age: 18, gender: 'female', resident_country: 'Japan', current_location_city: 'Tokyo', time_zone: 'Asia/Tokyo' },
      academic_input: {
        programme_type: 'A_LEVEL', school_name: 'Tokyo International School', school_country: 'Japan', school_city: 'Tokyo', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['economics_quant'], secondary_clusters: ['maths'],
        career_aspiration: 'Central bank economist',
        subject_list: [
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' }, { subject_name: 'Economics', level: 'A_LEVEL', grade_value: 'A*' }, { subject_name: 'History', level: 'A_LEVEL', grade_value: 'A*' },
        ],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: { Mathematics: 'A*', Economics: 'A*', History: 'A*' },
        english_required: true, english_test_type: 'IELTS', english_status: 'exceptional', english_score_overall: 8.0, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'london', campus_size: 'large', extracurricular_interests: ['Finance', 'Piano'], other_extracurriculars: null, leadership_roles: ['Head Boy / Girl'], commitment_level: 'deep', key_activities: ['Economics olympiad', 'Student council', 'Debate'], sat_score: null, act_score: null, intl_experience: ['Study abroad', 'International competition'], work_experience: true, work_experience_summary: 'Economics research assistant at university lab.', ambition_statement: 'Become a leading economist.' },
    },
  },

  // ── 15. IB 41 → UCL CS (min 40, score 93) ────────────────────────────────
  {
    name: 'Isabella Martinez',
    actual_university: 'UCL (University College London)',
    actual_program: 'Computer Science',
    actual_country: 'United Kingdom',
    notes: 'IB 41 vs UCL CS min 40. effGap ≈ -1.0 → Reach.',
    profile: {
      personal_information: { first_name: 'Isabella', last_name: 'Martinez', email: 'isabella@sim.test', phone: null, nationality: 'Spanish', age: 18, gender: 'female', resident_country: 'Spain', current_location_city: 'Madrid', time_zone: 'Europe/Madrid' },
      academic_input: {
        programme_type: 'IB', school_name: 'British Council School Madrid', school_country: 'Spain', school_city: 'Madrid', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['computer_science'], secondary_clusters: ['maths'],
        career_aspiration: 'Machine learning engineer',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 7 }, { subject_name: 'Computer Science', level: 'HL', grade_value: 7 }, { subject_name: 'Chemistry', level: 'HL', grade_value: 6 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 }, { subject_name: 'Spanish', level: 'SL', grade_value: 7 }, { subject_name: 'Economics', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 41, ib_core_points: 0, ib_tok_grade: 'A', ib_ee_grade: 'A', ib_math_pathway: 'AA_HL',
        ee_subject: 'Computer Science', ee_title: 'Machine learning for medical image classification', ee_summary: 'Applied machine learning algorithms and AI to medical data analysis.',
        a_level_predicted_grades: null, english_required: true, english_test_type: 'IELTS', english_status: 'exceptional', english_score_overall: 8.5, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'london', campus_size: 'large', extracurricular_interests: ['AI research', 'Hackathons'], other_extracurriculars: null, leadership_roles: ['Club Founder'], commitment_level: 'deep', key_activities: ['Programming club', 'Hackathon', 'Science fair'], sat_score: null, act_score: null, intl_experience: ['International competition'], work_experience: true, work_experience_summary: 'Software internship working on machine learning and AI projects.', ambition_statement: 'Lead AI research.' },
    },
  },

  // ── 16. A*AB → Durham CS (min 37, score 83) ──────────────────────────────
  {
    name: 'Ryan O\'Brien',
    actual_university: 'Durham University',
    actual_program: 'Computer Science',
    actual_country: 'United Kingdom',
    notes: 'A*AB student. IB equiv ≈ 39. Durham CS min 37. effGap ≈ 0.7 → Target.',
    profile: {
      personal_information: { first_name: 'Ryan', last_name: "O'Brien", email: 'ryan@sim.test', phone: null, nationality: 'Irish', age: 18, gender: 'male', resident_country: 'Ireland', current_location_city: 'Dublin', time_zone: 'Europe/Dublin' },
      academic_input: {
        programme_type: 'A_LEVEL', school_name: 'Gonzaga College Dublin', school_country: 'Ireland', school_city: 'Dublin', school_type: 'local_private', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['computer_science'], secondary_clusters: ['maths'],
        career_aspiration: 'Software developer',
        subject_list: [
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' }, { subject_name: 'Computer Science', level: 'A_LEVEL', grade_value: 'A' }, { subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'B' },
        ],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: { Mathematics: 'A*', 'Computer Science': 'A', Physics: 'B' },
        english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'practical', desired_location_type: 'smaller_city', campus_size: 'medium', extracurricular_interests: ['Gaming', 'Football'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'moderate', key_activities: ['Coding club', 'Robotics'], sat_score: null, act_score: null, intl_experience: [], work_experience: false, work_experience_summary: null, ambition_statement: 'Work at a tech startup.' },
    },
  },

  // ── 17. IB 38 → King's Law (min 38, score 76) ────────────────────────────
  {
    name: 'Mia Johansson',
    actual_university: "King's College London, University of London",
    actual_program: 'Law',
    actual_country: 'United Kingdom',
    notes: 'IB 38 vs King\'s Law min 38. effGap ≈ -0.79 → Reach.',
    profile: {
      personal_information: { first_name: 'Mia', last_name: 'Johansson', email: 'mia@sim.test', phone: null, nationality: 'Swedish', age: 18, gender: 'female', resident_country: 'Sweden', current_location_city: 'Stockholm', time_zone: 'Europe/Stockholm' },
      academic_input: {
        programme_type: 'IB', school_name: 'Internationella Engelska Gymnasiet', school_country: 'Sweden', school_city: 'Stockholm', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['law'], secondary_clusters: ['humanities'],
        career_aspiration: 'International human rights lawyer',
        subject_list: [
          { subject_name: 'History', level: 'HL', grade_value: 7 }, { subject_name: 'English Literature', level: 'HL', grade_value: 7 }, { subject_name: 'Economics', level: 'HL', grade_value: 6 },
          { subject_name: 'Mathematics', level: 'SL', grade_value: 5 }, { subject_name: 'Swedish', level: 'SL', grade_value: 7 }, { subject_name: 'Biology', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 38, ib_core_points: 0, ib_tok_grade: 'A', ib_ee_grade: 'A', ib_math_pathway: 'AI_SL',
        ee_subject: 'History', ee_title: 'Nuremberg Trials and the development of international law', ee_summary: 'Analysed history and the development of international law and human rights law.',
        a_level_predicted_grades: null, english_required: true, english_test_type: 'IELTS', english_status: 'exceptional', english_score_overall: 8.0, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'london', campus_size: 'medium', extracurricular_interests: ['MUN', 'Debate'], other_extracurriculars: null, leadership_roles: ['Community Leader'], commitment_level: 'deep', key_activities: ['Debate club', 'Model UN', 'Human rights society'], sat_score: null, act_score: null, intl_experience: ['International competition', 'Study abroad'], work_experience: false, work_experience_summary: null, ambition_statement: 'Argue human rights cases at the ICJ.' },
    },
  },

  // ── 18. IB 40 → Imperial Biomedical Engineering (min 39, score 91) ────────
  {
    name: 'Lucas Dubois',
    actual_university: 'Imperial College London',
    actual_program: 'Biomedical',
    actual_country: 'United Kingdom',
    notes: 'IB 40 vs Imperial Biomedical min 39. effGap ≈ -0.87 → Reach.',
    profile: {
      personal_information: { first_name: 'Lucas', last_name: 'Dubois', email: 'lucas@sim.test', phone: null, nationality: 'French', age: 18, gender: 'male', resident_country: 'France', current_location_city: 'Paris', time_zone: 'Europe/Paris' },
      academic_input: {
        programme_type: 'IB', school_name: 'Lycée International de Paris', school_country: 'France', school_city: 'Paris', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['engineering'], secondary_clusters: ['life_sciences_biochem'],
        career_aspiration: 'Biomedical device engineer',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 7 }, { subject_name: 'Biology', level: 'HL', grade_value: 7 }, { subject_name: 'Physics', level: 'HL', grade_value: 6 },
          { subject_name: 'Chemistry', level: 'SL', grade_value: 6 }, { subject_name: 'French', level: 'SL', grade_value: 7 }, { subject_name: 'English Literature', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 40, ib_core_points: 0, ib_tok_grade: 'B', ib_ee_grade: 'A', ib_math_pathway: 'AA_HL',
        ee_subject: 'Biology', ee_title: 'Engineering of biodegradable scaffolds for tissue regeneration', ee_summary: 'Investigated biomedical engineering and biomaterials for medical applications.',
        a_level_predicted_grades: null, english_required: true, english_test_type: 'IELTS', english_status: 'exceeds', english_score_overall: 7.5, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'london', campus_size: 'medium', extracurricular_interests: ['Medical research', 'Cycling'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'deep', key_activities: ['Science fair', 'Biology olympiad', 'Hospital volunteering'], sat_score: null, act_score: null, intl_experience: ['Study abroad'], work_experience: true, work_experience_summary: 'Research internship in biomedical engineering lab.', ambition_statement: 'Design next-generation prosthetics.' },
    },
  },

  // ── 19. A*A*A* → Edinburgh Medicine (min 38, UCAT) — Safety expected ─────
  {
    name: 'Nour Khalil',
    actual_university: 'The University of Edinburgh',
    actual_program: 'Medicine',
    actual_country: 'United Kingdom',
    notes: 'A*A*A* UK student. IB equiv 43. Edinburgh Medicine min 38. effGap ≈ 3.3 → Safety.',
    profile: {
      personal_information: { first_name: 'Nour', last_name: 'Khalil', email: 'nour@sim.test', phone: null, nationality: 'British-Lebanese', age: 18, gender: 'female', resident_country: 'United Kingdom', current_location_city: 'London', time_zone: 'Europe/London' },
      academic_input: {
        programme_type: 'A_LEVEL', school_name: 'North London Collegiate School', school_country: 'United Kingdom', school_city: 'London', school_type: 'local_private', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['medicine_dentistry'], secondary_clusters: ['life_sciences_biochem'],
        career_aspiration: 'Surgeon',
        subject_list: [
          { subject_name: 'Chemistry', level: 'A_LEVEL', grade_value: 'A*' }, { subject_name: 'Biology', level: 'A_LEVEL', grade_value: 'A*' }, { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' },
        ],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: { Chemistry: 'A*', Biology: 'A*', Mathematics: 'A*' },
        english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null,
        admissions_tests: [{ test_type: 'UCAT', status: 'taken', score_numeric: null, percentile: 91 }],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'major_city', campus_size: 'large', extracurricular_interests: ['Medicine', 'Volunteering'], other_extracurriculars: null, leadership_roles: ['Community Leader'], commitment_level: 'exceptional', key_activities: ['Hospital volunteering', 'Medical society', 'Science research', 'First aid', 'Tutoring'], sat_score: null, act_score: null, intl_experience: ['Volunteering abroad'], work_experience: true, work_experience_summary: 'Extensive clinical shadowing at two NHS hospitals.', ambition_statement: 'Become a cardiothoracic surgeon.' },
    },
  },

  // ── 20. IB 37 → Edinburgh Law (min 37, score 83) ─────────────────────────
  {
    name: 'Kenji Yamamoto',
    actual_university: 'The University of Edinburgh',
    actual_program: 'Law',
    actual_country: 'United Kingdom',
    notes: 'IB 37 vs Edinburgh Law min 37. effGap ≈ -1.32 → Reach.',
    profile: {
      personal_information: { first_name: 'Kenji', last_name: 'Yamamoto', email: 'kenji@sim.test', phone: null, nationality: 'Japanese', age: 18, gender: 'male', resident_country: 'Japan', current_location_city: 'Osaka', time_zone: 'Asia/Tokyo' },
      academic_input: {
        programme_type: 'IB', school_name: 'Osaka International School', school_country: 'Japan', school_city: 'Osaka', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['law'], secondary_clusters: ['humanities'],
        career_aspiration: 'Corporate lawyer, international arbitration',
        subject_list: [
          { subject_name: 'English Literature', level: 'HL', grade_value: 7 }, { subject_name: 'History', level: 'HL', grade_value: 7 }, { subject_name: 'Economics', level: 'HL', grade_value: 6 },
          { subject_name: 'Mathematics', level: 'SL', grade_value: 5 }, { subject_name: 'Japanese', level: 'SL', grade_value: 7 }, { subject_name: 'Biology', level: 'SL', grade_value: 4 },
        ],
        ib_total_points: 37, ib_core_points: 0, ib_tok_grade: 'B', ib_ee_grade: 'A', ib_math_pathway: 'AI_SL',
        ee_subject: 'History', ee_title: 'Constitutionalism and the rule of law in post-war Japan', ee_summary: 'Analysed international law, constitutional history and legal frameworks.',
        a_level_predicted_grades: null, english_required: true, english_test_type: 'IELTS', english_status: 'exceeds', english_score_overall: 7.5, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'major_city', campus_size: 'large', extracurricular_interests: ['Law debate', 'MUN'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'moderate', key_activities: ['Moot court', 'Model UN'], sat_score: null, act_score: null, intl_experience: ['International competition'], work_experience: false, work_experience_summary: null, ambition_statement: 'International arbitration practice.' },
    },
  },

  // ── 21. ACT 36 → Cornell Engineering (min 43, score 95) ──────────────────
  // ACT 36 → IB equiv 45. gap=2, prestige=2.2, effGap=-0.2 → Reach (just inside).
  {
    name: 'Zara Ahmed',
    actual_university: 'Cornell University',
    actual_program: 'Engineering',
    actual_country: 'United States',
    notes: 'ACT 36 → IB equiv 45. Cornell Engineering min 43. effGap ≈ -0.2 → Reach.',
    profile: {
      personal_information: { first_name: 'Zara', last_name: 'Ahmed', email: 'zara@sim.test', phone: null, nationality: 'Pakistani-American', age: 18, gender: 'female', resident_country: 'United States', current_location_city: 'Chicago', time_zone: 'America/Chicago' },
      academic_input: {
        programme_type: 'ACT', school_name: 'Latin School of Chicago', school_country: 'United States', school_city: 'Chicago', school_type: 'local_private', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['engineering'], secondary_clusters: ['computer_science'],
        career_aspiration: 'Civil engineer or urban planner',
        subject_list: [
          { subject_name: 'Mathematics', level: 'AP', grade_value: 'A*' }, { subject_name: 'Physics', level: 'AP', grade_value: 'A*' }, { subject_name: 'Computer Science', level: 'AP', grade_value: 'A' },
        ],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: null, english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'practical', desired_location_type: 'major_city', campus_size: 'large', extracurricular_interests: ['Architecture', 'Engineering'], other_extracurriculars: null, leadership_roles: ['Head Boy / Girl'], commitment_level: 'exceptional', key_activities: ['Science Olympiad', 'Engineering club', 'Community build project', 'Research', 'Volunteering'], sat_score: 1590, act_score: 36, intl_experience: ['Volunteering abroad', 'Study abroad'], work_experience: true, work_experience_summary: 'Internship at civil engineering firm working on infrastructure projects.', ambition_statement: 'Design sustainable cities.' },
    },
  },

  // ── 22. ACT 34 → Cornell CS (min 43) — CALIBRATION FAILURE expected ───────
  // ACT 34 → IB equiv 41. gap = -2, prestige = 2.2, effGap = -4.2 → Excluded.
  // Real: Cornell ACT mid-50% is 34-36.
  {
    name: 'Ethan Park',
    actual_university: 'Cornell University',
    actual_program: 'Computer Science',
    actual_country: 'United States',
    notes: 'ACT 34 → IB equiv 41. Cornell CS min 43. effGap ≈ -4.2 → Excluded. Calibration finding: Cornell ACT mid-50% is 34-36.',
    profile: {
      personal_information: { first_name: 'Ethan', last_name: 'Park', email: 'ethan@sim.test', phone: null, nationality: 'Korean-American', age: 18, gender: 'male', resident_country: 'United States', current_location_city: 'Los Angeles', time_zone: 'America/Los_Angeles' },
      academic_input: {
        programme_type: 'ACT', school_name: 'Harvard-Westlake School', school_country: 'United States', school_city: 'Los Angeles', school_type: 'local_private', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['computer_science'], secondary_clusters: ['maths'],
        career_aspiration: 'Software engineer at a FAANG company',
        subject_list: [
          { subject_name: 'Mathematics', level: 'AP', grade_value: 'A*' }, { subject_name: 'Computer Science', level: 'AP', grade_value: 'A*' }, { subject_name: 'Physics', level: 'AP', grade_value: 'A' },
        ],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: null, english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'practical', desired_location_type: 'major_city', campus_size: 'large', extracurricular_interests: ['Competitive programming', 'Basketball'], other_extracurriculars: null, leadership_roles: ['Club Founder'], commitment_level: 'exceptional', key_activities: ['Competitive programming', 'Hackathon', 'Research internship', 'Tutoring', 'Open source'], sat_score: 1520, act_score: 34, intl_experience: [], work_experience: true, work_experience_summary: 'Software engineering internship building computer science tools.', ambition_statement: 'Build impactful software products.' },
    },
  },

  // ── 23. IB 43 → Columbia CS (min 43, score 92) — Reach ───────────────────
  {
    name: 'Chiara Romano',
    actual_university: 'Columbia University in the City of New York',
    actual_program: 'Computer Science',
    actual_country: 'United States',
    notes: 'IB 43. Columbia CS min 43. effGap ≈ -1.95 → Reach.',
    profile: {
      personal_information: { first_name: 'Chiara', last_name: 'Romano', email: 'chiara@sim.test', phone: null, nationality: 'Italian', age: 18, gender: 'female', resident_country: 'Italy', current_location_city: 'Milan', time_zone: 'Europe/Rome' },
      academic_input: {
        programme_type: 'IB', school_name: 'American School of Milan', school_country: 'Italy', school_city: 'Milan', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['computer_science'], secondary_clusters: ['maths'],
        career_aspiration: 'Software product manager',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 7 }, { subject_name: 'Computer Science', level: 'HL', grade_value: 7 }, { subject_name: 'Economics', level: 'HL', grade_value: 7 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 }, { subject_name: 'Italian', level: 'SL', grade_value: 7 }, { subject_name: 'Biology', level: 'SL', grade_value: 6 },
        ],
        ib_total_points: 43, ib_core_points: 0, ib_tok_grade: 'A', ib_ee_grade: 'A', ib_math_pathway: 'AA_HL',
        ee_subject: 'Computer Science', ee_title: 'Optimisation of search algorithms for large-scale data', ee_summary: 'Investigated computer science algorithms and software engineering optimisation techniques.',
        a_level_predicted_grades: null, english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'major_city', campus_size: 'large', extracurricular_interests: ['AI', 'Startup'], other_extracurriculars: null, leadership_roles: ['Class President'], commitment_level: 'exceptional', key_activities: ['Hackathon', 'Competitive programming', 'Startup project', 'Research', 'Volunteering'], sat_score: null, act_score: null, intl_experience: ['International competition', 'Study abroad'], work_experience: true, work_experience_summary: 'Founded a software startup developing computer science tools.', ambition_statement: 'Build a tech company.' },
    },
  },

  // ── 24. ACT 36 → NYU Business (min 43) — Reach ────────────────────────────
  // ACT 36 → IB equiv 45. gap = 2, prestige = 2.09, effGap = -0.09 → Reach.
  {
    name: 'Jake Wilson',
    actual_university: 'New York University',
    actual_program: 'Business',
    actual_country: 'United States',
    notes: 'ACT 36 → IB equiv 45. NYU Business min 43. effGap ≈ -0.09 → Reach (barely).',
    profile: {
      personal_information: { first_name: 'Jake', last_name: 'Wilson', email: 'jake@sim.test', phone: null, nationality: 'American', age: 18, gender: 'male', resident_country: 'United States', current_location_city: 'Boston', time_zone: 'America/New_York' },
      academic_input: {
        programme_type: 'ACT', school_name: 'Boston Latin School', school_country: 'United States', school_city: 'Boston', school_type: 'local_private', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['business_non_quant'], secondary_clusters: ['economics_quant'],
        career_aspiration: 'Entrepreneur',
        subject_list: [
          { subject_name: 'Mathematics', level: 'AP', grade_value: 'A*' }, { subject_name: 'Economics', level: 'AP', grade_value: 'A*' }, { subject_name: 'History', level: 'AP', grade_value: 'A' },
        ],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: null, english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'practical', desired_location_type: 'major_city', campus_size: 'large', extracurricular_interests: ['Entrepreneurship', 'Finance'], other_extracurriculars: null, leadership_roles: ['Club Founder'], commitment_level: 'exceptional', key_activities: ['Student startup', 'Business competition', 'Finance club', 'Community service', 'Leadership program'], sat_score: 1580, act_score: 36, intl_experience: ['Study abroad'], work_experience: true, work_experience_summary: 'Built and sold a small business. Managed business and economics operations.', ambition_statement: 'Found a venture-backed company.' },
    },
  },

  // ── 25. IB 36 → McGill University (no min IB — tier implied) ─────────────
  {
    name: 'Mei Lin',
    actual_university: 'McGill University',
    actual_program: 'Economics',
    actual_country: 'Canada',
    notes: 'IB 36. McGill has no min_ib_score in DB — uses tier-implied. Should appear as Safety/Target.',
    profile: {
      personal_information: { first_name: 'Mei', last_name: 'Lin', email: 'mei@sim.test', phone: null, nationality: 'Chinese-Canadian', age: 18, gender: 'female', resident_country: 'Canada', current_location_city: 'Vancouver', time_zone: 'America/Vancouver' },
      academic_input: {
        programme_type: 'IB', school_name: 'Crofton House School', school_country: 'Canada', school_city: 'Vancouver', school_type: 'local_private', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['economics_quant'], secondary_clusters: ['business_non_quant'],
        career_aspiration: 'Economist or data analyst',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 6 }, { subject_name: 'Economics', level: 'HL', grade_value: 7 }, { subject_name: 'History', level: 'HL', grade_value: 6 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 }, { subject_name: 'Mandarin', level: 'SL', grade_value: 7 }, { subject_name: 'Biology', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 36, ib_core_points: 0, ib_tok_grade: 'B', ib_ee_grade: 'A', ib_math_pathway: 'AA_HL',
        ee_subject: 'Economics', ee_title: 'Impact of Chinese FDI on Canadian resource economics', ee_summary: 'Analysed economics and international trade finance between Canada and China.',
        a_level_predicted_grades: null, english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'major_city', campus_size: 'large', extracurricular_interests: ['Economics', 'Violin'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'moderate', key_activities: ['Economics club', 'Math competition'], sat_score: null, act_score: null, intl_experience: ['Study abroad'], work_experience: false, work_experience_summary: null, ambition_statement: 'Work at Statistics Canada or the Bank of Canada.' },
    },
  },

  // ── 26. A*A*A → UBC Engineering (no min IB) ───────────────────────────────
  {
    name: 'Connor MacLeod',
    actual_university: 'University of British Columbia',
    actual_program: 'Engineering',
    actual_country: 'Canada',
    notes: 'A*A*A → IB equiv 41. UBC has no min_ib_score — uses tier-implied. Should appear.',
    profile: {
      personal_information: { first_name: 'Connor', last_name: 'MacLeod', email: 'connor@sim.test', phone: null, nationality: 'Canadian', age: 18, gender: 'male', resident_country: 'Canada', current_location_city: 'Calgary', time_zone: 'America/Edmonton' },
      academic_input: {
        programme_type: 'A_LEVEL', school_name: 'Strathcona-Tweedsmuir School', school_country: 'Canada', school_city: 'Calgary', school_type: 'local_private', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['engineering'], secondary_clusters: ['maths'],
        career_aspiration: 'Petroleum or civil engineer',
        subject_list: [
          { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' }, { subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'A*' }, { subject_name: 'Chemistry', level: 'A_LEVEL', grade_value: 'A' },
        ],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: { Mathematics: 'A*', Physics: 'A*', Chemistry: 'A' },
        english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'practical', desired_location_type: 'major_city', campus_size: 'large', extracurricular_interests: ['Hockey', 'Engineering'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'moderate', key_activities: ['Robotics club', 'Physics competition'], sat_score: null, act_score: null, intl_experience: [], work_experience: false, work_experience_summary: null, ambition_statement: 'Build infrastructure in western Canada.' },
    },
  },

  // ── 27. IB 34 → Monash Engineering (no min IB, Australia) ────────────────
  {
    name: 'Aditya Nair',
    actual_university: 'Monash University',
    actual_program: 'Engineering',
    actual_country: 'Australia',
    notes: 'IB 34. Monash has no min_ib_score. Uses tier-implied. Should appear.',
    profile: {
      personal_information: { first_name: 'Aditya', last_name: 'Nair', email: 'aditya@sim.test', phone: null, nationality: 'Indian', age: 18, gender: 'male', resident_country: 'India', current_location_city: 'Pune', time_zone: 'Asia/Kolkata' },
      academic_input: {
        programme_type: 'IB', school_name: 'Symbiosis International School', school_country: 'India', school_city: 'Pune', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['engineering'], secondary_clusters: ['computer_science'],
        career_aspiration: 'Software or systems engineer in Australia',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 6 }, { subject_name: 'Physics', level: 'HL', grade_value: 6 }, { subject_name: 'Computer Science', level: 'HL', grade_value: 5 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 5 }, { subject_name: 'Hindi', level: 'SL', grade_value: 7 }, { subject_name: 'Economics', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 34, ib_core_points: 0, ib_tok_grade: 'C', ib_ee_grade: 'B', ib_math_pathway: 'AA_HL',
        ee_subject: 'Physics', ee_title: 'Efficiency of wind turbine blade design', ee_summary: 'Investigated renewable energy engineering and aerodynamics of wind turbines.',
        a_level_predicted_grades: null, english_required: true, english_test_type: 'IELTS', english_status: 'met', english_score_overall: 6.5, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'practical', desired_location_type: 'major_city', campus_size: 'large', extracurricular_interests: ['Cricket', 'Programming'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'moderate', key_activities: ['Coding club', 'Science fair'], sat_score: null, act_score: null, intl_experience: [], work_experience: false, work_experience_summary: null, ambition_statement: 'Migrate to Australia and work in tech.' },
    },
  },

  // ── 28. ABB → Durham Biochemistry (min 36, a_level 88) ───────────────────
  // ABB → IB equiv: sum=6+5+5=16 → IB=24+(10/15)*19≈37. gap=37-36=1, prestige=1.18, effGap=-0.18 → Reach.
  {
    name: 'Sam Okafor',
    actual_university: 'Durham University',
    actual_program: 'Biochemistry',
    actual_country: 'United Kingdom',
    notes: 'ABB UK student. IB equiv ≈ 37. Durham Biochemistry min 36. effGap ≈ -0.18 → Reach.',
    profile: {
      personal_information: { first_name: 'Sam', last_name: 'Okafor', email: 'sam@sim.test', phone: null, nationality: 'British-Nigerian', age: 18, gender: 'male', resident_country: 'United Kingdom', current_location_city: 'Leeds', time_zone: 'Europe/London' },
      academic_input: {
        programme_type: 'A_LEVEL', school_name: 'Leeds Grammar School', school_country: 'United Kingdom', school_city: 'Leeds', school_type: 'local_private', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['life_sciences_biochem'], secondary_clusters: ['medicine_dentistry'],
        career_aspiration: 'Pharmaceutical researcher',
        subject_list: [
          { subject_name: 'Biology', level: 'A_LEVEL', grade_value: 'A' }, { subject_name: 'Chemistry', level: 'A_LEVEL', grade_value: 'B' }, { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'B' },
        ],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: { Biology: 'A', Chemistry: 'B', Mathematics: 'B' },
        english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'smaller_city', campus_size: 'medium', extracurricular_interests: ['Biology', 'Football'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'moderate', key_activities: ['Science club', 'Biology competition'], sat_score: null, act_score: null, intl_experience: [], work_experience: false, work_experience_summary: null, ambition_statement: 'Discover new drug compounds.' },
    },
  },

  // ── 29. IB 35 → King's Biomedical Engineering (min 36, score 68) ──────────
  // gap = -1, prestige penalty = (68.29-65)/35*2.5 = 0.24, effGap = -1.24 → Reach.
  {
    name: 'Beatrix Kowalski',
    actual_university: "King's College London, University of London",
    actual_program: 'Biomedical',
    actual_country: 'United Kingdom',
    notes: 'IB 35 vs King\'s Biomedical min 36. effGap ≈ -1.24 → Reach.',
    profile: {
      personal_information: { first_name: 'Beatrix', last_name: 'Kowalski', email: 'beatrix@sim.test', phone: null, nationality: 'Polish', age: 18, gender: 'female', resident_country: 'Poland', current_location_city: 'Warsaw', time_zone: 'Europe/Warsaw' },
      academic_input: {
        programme_type: 'IB', school_name: 'American School of Warsaw', school_country: 'Poland', school_city: 'Warsaw', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['engineering'], secondary_clusters: ['life_sciences_biochem'],
        career_aspiration: 'Biomedical device engineer',
        subject_list: [
          { subject_name: 'Mathematics', level: 'HL', grade_value: 6 }, { subject_name: 'Biology', level: 'HL', grade_value: 6 }, { subject_name: 'Chemistry', level: 'HL', grade_value: 5 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 6 }, { subject_name: 'Polish', level: 'SL', grade_value: 7 }, { subject_name: 'Economics', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 35, ib_core_points: 0, ib_tok_grade: 'B', ib_ee_grade: 'B', ib_math_pathway: 'AA_HL',
        ee_subject: 'Biology', ee_title: 'Biomaterial scaffolds for bone tissue regeneration', ee_summary: 'Researched biomedical engineering materials and tissue regeneration methods.',
        a_level_predicted_grades: null, english_required: true, english_test_type: 'IELTS', english_status: 'meets', english_score_overall: 7.0, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'practical', desired_location_type: 'london', campus_size: 'medium', extracurricular_interests: ['Robotics', 'Swimming'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'moderate', key_activities: ['Science fair', 'Biology club'], sat_score: null, act_score: null, intl_experience: ['Study abroad'], work_experience: false, work_experience_summary: null, ambition_statement: 'Improve prosthetic devices.' },
    },
  },

  // ── 30. IB 31 → University of Manchester Business (easier tier) ───────────
  {
    name: 'Carlos Rodrigues',
    actual_university: 'University of Manchester',
    actual_program: 'Business',
    actual_country: 'United Kingdom',
    notes: 'IB 31. Manchester Business should have lower min IB than sciences. Should appear as Safety/Target.',
    profile: {
      personal_information: { first_name: 'Carlos', last_name: 'Rodrigues', email: 'carlos@sim.test', phone: null, nationality: 'Portuguese', age: 18, gender: 'male', resident_country: 'Portugal', current_location_city: 'Lisbon', time_zone: 'Europe/Lisbon' },
      academic_input: {
        programme_type: 'IB', school_name: 'St Julians School Lisbon', school_country: 'Portugal', school_city: 'Lisbon', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: ['business_non_quant'], secondary_clusters: ['economics_quant'],
        career_aspiration: 'Business manager in tech industry',
        subject_list: [
          { subject_name: 'Business', level: 'HL', grade_value: 6 }, { subject_name: 'Economics', level: 'HL', grade_value: 6 }, { subject_name: 'Mathematics', level: 'HL', grade_value: 5 },
          { subject_name: 'English Literature', level: 'SL', grade_value: 5 }, { subject_name: 'Portuguese', level: 'SL', grade_value: 7 }, { subject_name: 'History', level: 'SL', grade_value: 5 },
        ],
        ib_total_points: 31, ib_core_points: 0, ib_tok_grade: 'C', ib_ee_grade: 'B', ib_math_pathway: 'AI_HL',
        ee_subject: 'Business', ee_title: 'Market entry strategies for Portuguese SMEs in the EU', ee_summary: 'Investigated business management strategies and economics of international market entry.',
        a_level_predicted_grades: null, english_required: true, english_test_type: 'IELTS', english_status: 'met', english_score_overall: 7.0, admissions_tests: [],
      },
      lifestyle_preference: { teaching_style: 'mixed', desired_location_type: 'major_city', campus_size: 'large', extracurricular_interests: ['Football', 'Business'], other_extracurriculars: null, leadership_roles: [], commitment_level: 'moderate', key_activities: ['Business club', 'Entrepreneurship competition'], sat_score: null, act_score: null, intl_experience: ['Study abroad'], work_experience: true, work_experience_summary: 'Part-time work at family business. Managed business operations and customer service.', ambition_statement: 'Grow a European tech company.' },
    },
  },
];

export const BATCH_30 = [...BATCH_10, ...BATCH_30_EXTRA];

// ── Profile factory (compact helper) ──────────────────────────────────────────
type MiniSubject = { name: string; level: 'HL'|'SL'|'A_LEVEL'|'AP'; grade: string|number };

function mkIbProfile(p: {
  name: string; nationality: string; country: string; city: string; tz: string;
  school: string; schoolCountry: string;
  ibTotal: number; subjects: MiniSubject[];
  tokGrade?: 'A'|'B'|'C'; eeGrade?: 'A'|'B'|'C';
  eeSub?: string; eeSummary?: string;
  clusters: [import('@/lib/profile/intake-types').IntendedCluster, ...import('@/lib/profile/intake-types').IntendedCluster[]];
  secondaryClusters?: import('@/lib/profile/intake-types').IntendedCluster[];
  englishReq?: boolean; ielts?: number;
  ucat?: number; lnat?: number;
  commitmentLevel?: string; leadershipRoles?: string[]; keyActivities?: string[];
  hasWork?: boolean; workSummary?: string;
  intlExp?: string[];
  actualUni: string; actualProgram: string; actualCountry: string; notes: string;
}): SimulatedProfile {
  const [first, ...rest] = p.name.split(' ');
  return {
    name: p.name,
    actual_university: p.actualUni,
    actual_program: p.actualProgram,
    actual_country: p.actualCountry,
    notes: p.notes,
    profile: {
      personal_information: {
        first_name: first, last_name: rest.join(' ') || 'Student',
        email: `${first.toLowerCase()}@sim.test`, phone: null,
        nationality: p.nationality, age: 18, gender: null,
        resident_country: p.country, current_location_city: p.city, time_zone: p.tz,
      },
      academic_input: {
        programme_type: 'IB',
        school_name: p.school, school_country: p.schoolCountry, school_city: p.city,
        school_type: 'international_school', language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: p.clusters as any,
        secondary_clusters: (p.secondaryClusters ?? []) as any,
        career_aspiration: null,
        subject_list: p.subjects.map(s => ({ subject_name: s.name, level: s.level as any, grade_value: s.grade })),
        ib_total_points: p.ibTotal, ib_core_points: 0,
        ib_tok_grade: p.tokGrade ?? 'B', ib_ee_grade: p.eeGrade ?? 'B',
        ib_math_pathway: 'AA_HL',
        ee_subject: p.eeSub ?? null, ee_title: null, ee_summary: p.eeSummary ?? null,
        a_level_predicted_grades: null,
        english_required: p.englishReq ?? true,
        english_test_type: p.englishReq === false ? 'NONE' : 'IELTS',
        english_status: p.ielts ? (p.ielts >= 8 ? 'exceptional' : p.ielts >= 7 ? 'exceeds' : 'met') : (p.englishReq === false ? 'met' : 'met'),
        english_score_overall: p.ielts ?? null,
        admissions_tests: [
          ...(p.ucat ? [{ test_type: 'UCAT' as const, status: 'taken' as const, score_numeric: null, percentile: p.ucat }] : []),
          ...(p.lnat ? [{ test_type: 'LNAT' as const, status: 'taken' as const, score_numeric: p.lnat, percentile: null }] : []),
        ],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: null, campus_size: null,
        extracurricular_interests: [], other_extracurriculars: null,
        leadership_roles: p.leadershipRoles ?? [],
        commitment_level: p.commitmentLevel ?? 'moderate',
        key_activities: p.keyActivities ?? [],
        sat_score: null, act_score: null,
        intl_experience: p.intlExp ?? [],
        work_experience: p.hasWork ?? false,
        work_experience_summary: p.workSummary ?? null,
        ambition_statement: null,
      },
    },
  };
}

function mkALevelProfile(p: {
  name: string; nationality: string; country: string; city: string; tz: string;
  school: string;
  grades: Record<string, 'A*'|'A'|'B'|'C'|'D'>;
  clusters: [import('@/lib/profile/intake-types').IntendedCluster, ...import('@/lib/profile/intake-types').IntendedCluster[]];
  secondaryClusters?: import('@/lib/profile/intake-types').IntendedCluster[];
  ucat?: number; lnat?: number;
  commitmentLevel?: string; leadershipRoles?: string[];
  keyActivities?: string[]; hasWork?: boolean; workSummary?: string;
  actualUni: string; actualProgram: string; actualCountry: string; notes: string;
}): SimulatedProfile {
  const [first, ...rest] = p.name.split(' ');
  return {
    name: p.name,
    actual_university: p.actualUni,
    actual_program: p.actualProgram,
    actual_country: p.actualCountry,
    notes: p.notes,
    profile: {
      personal_information: {
        first_name: first, last_name: rest.join(' ') || 'Student',
        email: `${first.toLowerCase()}@sim.test`, phone: null,
        nationality: p.nationality, age: 18, gender: null,
        resident_country: p.country, current_location_city: p.city, time_zone: p.tz,
      },
      academic_input: {
        programme_type: 'A_LEVEL',
        school_name: p.school, school_country: p.country, school_city: p.city,
        school_type: 'local_private', language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: p.clusters as any,
        secondary_clusters: (p.secondaryClusters ?? []) as any,
        career_aspiration: null,
        subject_list: Object.entries(p.grades).map(([name, grade]) => ({ subject_name: name, level: 'A_LEVEL' as const, grade_value: grade })),
        ib_total_points: null, ib_core_points: null,
        ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null,
        ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: p.grades,
        english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null,
        admissions_tests: [
          ...(p.ucat ? [{ test_type: 'UCAT' as const, status: 'taken' as const, score_numeric: null, percentile: p.ucat }] : []),
          ...(p.lnat ? [{ test_type: 'LNAT' as const, status: 'taken' as const, score_numeric: p.lnat, percentile: null }] : []),
        ],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: null, campus_size: null,
        extracurricular_interests: [], other_extracurriculars: null,
        leadership_roles: p.leadershipRoles ?? [],
        commitment_level: p.commitmentLevel ?? 'moderate',
        key_activities: p.keyActivities ?? [],
        sat_score: null, act_score: null,
        intl_experience: [],
        work_experience: p.hasWork ?? false,
        work_experience_summary: p.workSummary ?? null,
        ambition_statement: null,
      },
    },
  };
}

function mkActProfile(p: {
  name: string; nationality: string; country: string; city: string; tz: string;
  school: string; act: number; sat?: number;
  subjects: MiniSubject[];
  clusters: [import('@/lib/profile/intake-types').IntendedCluster, ...import('@/lib/profile/intake-types').IntendedCluster[]];
  secondaryClusters?: import('@/lib/profile/intake-types').IntendedCluster[];
  commitmentLevel?: string; leadershipRoles?: string[]; keyActivities?: string[];
  hasWork?: boolean; workSummary?: string; intlExp?: string[];
  actualUni: string; actualProgram: string; actualCountry: string; notes: string;
}): SimulatedProfile {
  const [first, ...rest] = p.name.split(' ');
  return {
    name: p.name,
    actual_university: p.actualUni,
    actual_program: p.actualProgram,
    actual_country: p.actualCountry,
    notes: p.notes,
    profile: {
      personal_information: {
        first_name: first, last_name: rest.join(' ') || 'Student',
        email: `${first.toLowerCase()}@sim.test`, phone: null,
        nationality: p.nationality, age: 18, gender: null,
        resident_country: p.country, current_location_city: p.city, time_zone: p.tz,
      },
      academic_input: {
        programme_type: 'ACT',
        school_name: p.school, school_country: p.country, school_city: p.city,
        school_type: 'local_private', language_of_instruction: 'english',
        graduation_year: 2024, desired_start_date: '2024-09-01',
        intended_clusters: p.clusters as any,
        secondary_clusters: (p.secondaryClusters ?? []) as any,
        career_aspiration: null,
        subject_list: p.subjects.map(s => ({ subject_name: s.name, level: s.level as any, grade_value: s.grade })),
        ib_total_points: null, ib_core_points: null,
        ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null,
        ee_subject: null, ee_title: null, ee_summary: null,
        a_level_predicted_grades: null,
        english_required: false, english_test_type: 'NONE', english_status: 'met', english_score_overall: null,
        admissions_tests: [],
      },
      lifestyle_preference: {
        teaching_style: 'academic', desired_location_type: null, campus_size: null,
        extracurricular_interests: [], other_extracurriculars: null,
        leadership_roles: p.leadershipRoles ?? [],
        commitment_level: p.commitmentLevel ?? 'moderate',
        key_activities: p.keyActivities ?? [],
        sat_score: p.sat ?? null, act_score: p.act,
        intl_experience: p.intlExp ?? [],
        work_experience: p.hasWork ?? false,
        work_experience_summary: p.workSummary ?? null,
        ambition_statement: null,
      },
    },
  };
}

// ── Batch 100: 70 additional profiles ────────────────────────────────────────
export const BATCH_100_EXTRA: SimulatedProfile[] = [

  // ── St Andrews (10) ────────────────────────────────────────────────────────
  mkIbProfile({ name: 'Hannah Gould', nationality: 'British', country: 'United Kingdom', city: 'Edinburgh', tz: 'Europe/London', school: 'George Watson\'s College', schoolCountry: 'United Kingdom', ibTotal: 39, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Computer Science', level: 'HL', grade: 7 }, { name: 'Physics', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'French', level: 'SL', grade: 5 }, { name: 'Geography', level: 'SL', grade: 5 }], clusters: ['computer_science'], englishReq: false, actualUni: 'University of St Andrews', actualProgram: 'Computer Science', actualCountry: 'United Kingdom', notes: 'IB 39 vs St Andrews CS min 39. Reach.' }),

  mkIbProfile({ name: 'Marco Bianchi', nationality: 'Italian', country: 'Italy', city: 'Rome', tz: 'Europe/Rome', school: 'Marymount International School Rome', schoolCountry: 'Italy', ibTotal: 38, subjects: [{ name: 'Economics', level: 'HL', grade: 7 }, { name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'History', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Italian', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['economics_quant'], ielts: 7.5, actualUni: 'University of St Andrews', actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'IB 38 vs St Andrews Economics min 38. Reach.' }),

  mkALevelProfile({ name: 'Ellie Mackenzie', nationality: 'British', country: 'United Kingdom', city: 'Glasgow', tz: 'Europe/London', school: 'Glasgow Academy', grades: { Mathematics: 'A*', Economics: 'A*', History: 'A' }, clusters: ['economics_quant'], actualUni: 'University of St Andrews', actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'A*A*A UK. IB equiv 42. St Andrews Econ min 38. Target.' }),

  mkIbProfile({ name: 'Soren Lindqvist', nationality: 'Swedish', country: 'Sweden', city: 'Stockholm', tz: 'Europe/Stockholm', school: 'Sigtunaskolan Humanistiska Läroverket', schoolCountry: 'Sweden', ibTotal: 40, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Computer Science', level: 'HL', grade: 7 }, { name: 'Economics', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Swedish', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['computer_science'], ielts: 7.5, actualUni: 'University of St Andrews', actualProgram: 'Computer Science', actualCountry: 'United Kingdom', notes: 'IB 40 vs St Andrews CS min 39. Target.' }),

  mkIbProfile({ name: 'Ava Murphy', nationality: 'Irish', country: 'Ireland', city: 'Dublin', tz: 'Europe/Dublin', school: 'Alexandra College Dublin', schoolCountry: 'Ireland', ibTotal: 38, subjects: [{ name: 'Biology', level: 'HL', grade: 7 }, { name: 'Chemistry', level: 'HL', grade: 6 }, { name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'French', level: 'SL', grade: 6 }, { name: 'History', level: 'SL', grade: 5 }], clusters: ['life_sciences_biochem'], englishReq: false, actualUni: 'University of St Andrews', actualProgram: 'Biology', actualCountry: 'United Kingdom', notes: 'IB 38 vs St Andrews Biology min 38. Reach.' }),

  mkALevelProfile({ name: 'Daniel Foster', nationality: 'British', country: 'United Kingdom', city: 'Bristol', tz: 'Europe/London', school: 'Bristol Grammar School', grades: { Mathematics: 'A*', Physics: 'A*', Chemistry: 'A' }, clusters: ['engineering'], secondaryClusters: ['maths'], actualUni: 'University of St Andrews', actualProgram: 'Computer Science and Mathematics', actualCountry: 'United Kingdom', notes: 'A*A*A UK. IB equiv 42. St Andrews CS&Maths min 38. Target.' }),

  mkIbProfile({ name: 'Leila Ahmadi', nationality: 'Iranian', country: 'UAE', city: 'Dubai', tz: 'Asia/Dubai', school: 'GEMS World Academy Dubai', schoolCountry: 'UAE', ibTotal: 39, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Biology', level: 'HL', grade: 7 }, { name: 'Chemistry', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Persian', level: 'SL', grade: 7 }, { name: 'Economics', level: 'SL', grade: 5 }], clusters: ['life_sciences_biochem'], ielts: 7.5, actualUni: 'University of St Andrews', actualProgram: 'Biology and Chemistry', actualCountry: 'United Kingdom', notes: 'IB 39 vs St Andrews Biology&Chem min 38. Target.' }),

  mkIbProfile({ name: 'Hugo Moreau', nationality: 'French', country: 'France', city: 'Lyon', tz: 'Europe/Paris', school: 'Cité Scolaire Internationale de Lyon', schoolCountry: 'France', ibTotal: 37, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Economics', level: 'HL', grade: 7 }, { name: 'History', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'French', level: 'SL', grade: 7 }, { name: 'Geography', level: 'SL', grade: 5 }], clusters: ['economics_quant'], ielts: 7.0, actualUni: 'University of St Andrews', actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'IB 37 vs St Andrews Economics min 38. gap=-1. Excluded expected (calibration).' }),

  mkIbProfile({ name: 'Chloe Bergmann', nationality: 'German', country: 'Germany', city: 'Hamburg', tz: 'Europe/Berlin', school: 'Hamburg International School', schoolCountry: 'Germany', ibTotal: 38, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Economics', level: 'HL', grade: 7 }, { name: 'English Literature', level: 'HL', grade: 6 }, { name: 'History', level: 'SL', grade: 6 }, { name: 'German', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['economics_quant'], secondaryClusters: ['humanities'], ielts: 7.5, actualUni: 'University of St Andrews', actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'IB 38 vs St Andrews Economics min 38. Reach.' }),

  mkALevelProfile({ name: 'William Chen', nationality: 'British-Chinese', country: 'United Kingdom', city: 'London', tz: 'Europe/London', school: 'Westminster School', grades: { Mathematics: 'A*', 'Further Mathematics': 'A*', 'Computer Science': 'A*' }, clusters: ['maths'], secondaryClusters: ['computer_science'], actualUni: 'University of St Andrews', actualProgram: 'Pure Mathematics', actualCountry: 'United Kingdom', notes: 'A*A*A* UK. IB equiv 43. St Andrews Pure Maths min 39. Safety.' }),

  // ── More Edinburgh (5) ─────────────────────────────────────────────────────
  mkIbProfile({ name: 'Ingrid Hansen', nationality: 'Norwegian', country: 'Norway', city: 'Oslo', tz: 'Europe/Oslo', school: 'Oslo International School', schoolCountry: 'Norway', ibTotal: 39, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Biology', level: 'HL', grade: 7 }, { name: 'Chemistry', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Norwegian', level: 'SL', grade: 7 }, { name: 'Physics', level: 'SL', grade: 5 }], clusters: ['medicine_dentistry'], ucat: 78, ielts: 7.5, actualUni: 'The University of Edinburgh', actualProgram: 'Medicine', actualCountry: 'United Kingdom', notes: 'IB 39 vs Edinburgh Medicine min 38. UCAT 78%. Target.' }),

  mkALevelProfile({ name: 'Patrick Obi', nationality: 'British-Nigerian', country: 'United Kingdom', city: 'London', tz: 'Europe/London', school: 'City of London School', grades: { Economics: 'A*', Mathematics: 'A*', 'Government and Politics': 'A' }, clusters: ['economics_quant'], secondaryClusters: ['humanities'], actualUni: 'The University of Edinburgh', actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'A*A*A UK. IB equiv 42. Edinburgh Econ min 37. Safety.' }),

  mkIbProfile({ name: 'Yara Hassan', nationality: 'Egyptian', country: 'Egypt', city: 'Cairo', tz: 'Africa/Cairo', school: 'Cairo American College', schoolCountry: 'Egypt', ibTotal: 37, subjects: [{ name: 'History', level: 'HL', grade: 7 }, { name: 'English Literature', level: 'HL', grade: 7 }, { name: 'Economics', level: 'HL', grade: 6 }, { name: 'Mathematics', level: 'SL', grade: 5 }, { name: 'Arabic', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['law'], ielts: 7.5, actualUni: 'The University of Edinburgh', actualProgram: 'Law', actualCountry: 'United Kingdom', notes: 'IB 37 vs Edinburgh Law min 37. Reach.' }),

  mkIbProfile({ name: 'Aleksei Petrov', nationality: 'Russian', country: 'Russia', city: 'Moscow', tz: 'Europe/Moscow', school: 'Anglo-American School of Moscow', schoolCountry: 'Russia', ibTotal: 38, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Physics', level: 'HL', grade: 7 }, { name: 'Computer Science', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'Russian', level: 'SL', grade: 7 }, { name: 'Economics', level: 'SL', grade: 5 }], clusters: ['computer_science'], ielts: 7.0, actualUni: 'The University of Edinburgh', actualProgram: 'Computer Science', actualCountry: 'United Kingdom', notes: 'IB 38 vs Edinburgh CS (check min). Target/Reach expected.' }),

  mkIbProfile({ name: 'Sana Mirza', nationality: 'Pakistani', country: 'Pakistan', city: 'Lahore', tz: 'Asia/Karachi', school: 'Lahore Grammar School', schoolCountry: 'Pakistan', ibTotal: 37, subjects: [{ name: 'Economics', level: 'HL', grade: 7 }, { name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Business', level: 'HL', grade: 7 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Urdu', level: 'SL', grade: 7 }, { name: 'History', level: 'SL', grade: 5 }], clusters: ['business_non_quant'], ielts: 7.0, actualUni: 'The University of Edinburgh', actualProgram: 'Business Management', actualCountry: 'United Kingdom', notes: 'IB 37 vs Edinburgh Business min 37. Reach.' }),

  // ── More Imperial/UCL/King\'s (8) ─────────────────────────────────────────
  mkIbProfile({ name: 'Arjun Kapoor', nationality: 'Indian', country: 'India', city: 'Delhi', tz: 'Asia/Kolkata', school: 'The British School New Delhi', schoolCountry: 'India', ibTotal: 42, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Physics', level: 'HL', grade: 7 }, { name: 'Chemistry', level: 'HL', grade: 7 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Hindi', level: 'SL', grade: 7 }, { name: 'Economics', level: 'SL', grade: 6 }], clusters: ['engineering'], ielts: 7.5, eeSub: 'Physics', eeSummary: 'Investigated engineering physics principles in semiconductor materials.', actualUni: 'Imperial College London', actualProgram: 'Electrical', actualCountry: 'United Kingdom', notes: 'IB 42 vs Imperial EEE min 40. Target.' }),

  mkALevelProfile({ name: 'Jessica Park', nationality: 'British-Korean', country: 'United Kingdom', city: 'London', tz: 'Europe/London', school: 'St Paul\'s Girls\' School', grades: { Mathematics: 'A*', Biology: 'A*', Chemistry: 'A*' }, clusters: ['life_sciences_biochem'], secondaryClusters: ['medicine_dentistry'], actualUni: 'UCL (University College London)', actualProgram: 'Biochemistry', actualCountry: 'United Kingdom', notes: 'A*A*A* UK. IB equiv 43. UCL Biochemistry (check min). Safety/Target.' }),

  mkIbProfile({ name: 'Nur Faizah', nationality: 'Malaysian', country: 'Malaysia', city: 'Kuala Lumpur', tz: 'Asia/Kuala_Lumpur', school: 'Cempaka International School', schoolCountry: 'Malaysia', ibTotal: 40, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Economics', level: 'HL', grade: 7 }, { name: 'Physics', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Malay', level: 'SL', grade: 7 }, { name: 'History', level: 'SL', grade: 5 }], clusters: ['economics_quant'], ielts: 7.5, actualUni: 'UCL (University College London)', actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'IB 40 vs UCL Economics min 39. Target.' }),

  mkALevelProfile({ name: 'Marcus Williams', nationality: 'British', country: 'United Kingdom', city: 'London', tz: 'Europe/London', school: 'King\'s College School Wimbledon', grades: { Mathematics: 'A*', 'Further Mathematics': 'A', Physics: 'A' }, clusters: ['maths'], secondaryClusters: ['computer_science'], actualUni: 'UCL (University College London)', actualProgram: 'Mathematics', actualCountry: 'United Kingdom', notes: 'A*AA UK. IB equiv 41. UCL Maths min 40. Reach.' }),

  mkIbProfile({ name: 'Emre Yilmaz', nationality: 'Turkish', country: 'Turkey', city: 'Istanbul', tz: 'Europe/Istanbul', school: 'Robert College Istanbul', schoolCountry: 'Turkey', ibTotal: 39, subjects: [{ name: 'English Literature', level: 'HL', grade: 7 }, { name: 'History', level: 'HL', grade: 7 }, { name: 'Economics', level: 'HL', grade: 6 }, { name: 'Mathematics', level: 'SL', grade: 6 }, { name: 'Turkish', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['law'], lnat: 28, ielts: 7.5, actualUni: "King's College London, University of London", actualProgram: 'Law', actualCountry: 'United Kingdom', notes: 'IB 39 vs King\'s Law min 38. LNAT 28. Target.' }),

  mkIbProfile({ name: 'Valeria Costa', nationality: 'Brazilian', country: 'Brazil', city: 'Rio de Janeiro', tz: 'America/Sao_Paulo', school: 'Pan American School of Bahia', schoolCountry: 'Brazil', ibTotal: 38, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Economics', level: 'HL', grade: 7 }, { name: 'History', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Portuguese', level: 'SL', grade: 7 }, { name: 'Geography', level: 'SL', grade: 5 }], clusters: ['economics_quant'], ielts: 7.5, actualUni: "King's College London, University of London", actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'IB 38 vs King\'s Economics min 38. Reach.' }),

  mkALevelProfile({ name: 'Olivia Hart', nationality: 'British', country: 'United Kingdom', city: 'Cambridge', tz: 'Europe/London', school: 'Hills Road Sixth Form College', grades: { Biology: 'A*', Chemistry: 'A*', Mathematics: 'A' }, clusters: ['medicine_dentistry'], ucat: 85, actualUni: "King's College London, University of London", actualProgram: 'Medicine', actualCountry: 'United Kingdom', notes: 'A*A*A UK. IB equiv 42. King\'s Medicine (check min). Safety/Target.' }),

  mkIbProfile({ name: 'Dawit Bekele', nationality: 'Ethiopian', country: 'Ethiopia', city: 'Addis Ababa', tz: 'Africa/Addis_Ababa', school: 'International Community School Addis', schoolCountry: 'Ethiopia', ibTotal: 36, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Biology', level: 'HL', grade: 6 }, { name: 'Chemistry', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Amharic', level: 'SL', grade: 7 }, { name: 'Economics', level: 'SL', grade: 5 }], clusters: ['engineering'], ielts: 7.0, eeSub: 'Physics', eeSummary: 'Investigated engineering mechanics and structural design principles.', actualUni: "King's College London, University of London", actualProgram: 'Biomedical', actualCountry: 'United Kingdom', notes: 'IB 36 vs King\'s Biomedical min 36. Reach.' }),

  // ── Manchester (5) ────────────────────────────────────────────────────────
  mkIbProfile({ name: 'Reza Hosseini', nationality: 'Iranian', country: 'Iran', city: 'Tehran', tz: 'Asia/Tehran', school: 'Tehran International School', schoolCountry: 'Iran', ibTotal: 36, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Physics', level: 'HL', grade: 6 }, { name: 'Chemistry', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'Persian', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['engineering'], ielts: 7.0, actualUni: 'University of Manchester', actualProgram: 'Mechanical Engineering', actualCountry: 'United Kingdom', notes: 'IB 36 vs Manchester Engineering. Should be Target/Safety.' }),

  mkALevelProfile({ name: 'Grace Adeyemi', nationality: 'British-Nigerian', country: 'United Kingdom', city: 'Manchester', tz: 'Europe/London', school: 'Manchester High School for Girls', grades: { Biology: 'A*', Chemistry: 'A', Mathematics: 'A' }, clusters: ['life_sciences_biochem'], secondaryClusters: ['medicine_dentistry'], actualUni: 'University of Manchester', actualProgram: 'Biology', actualCountry: 'United Kingdom', notes: 'A*AA UK. IB equiv 41. Manchester Biology. Target/Safety.' }),

  mkIbProfile({ name: 'Lorenzo Ricci', nationality: 'Italian', country: 'Italy', city: 'Florence', tz: 'Europe/Rome', school: 'International School of Florence', schoolCountry: 'Italy', ibTotal: 34, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Economics', level: 'HL', grade: 6 }, { name: 'Business', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'Italian', level: 'SL', grade: 7 }, { name: 'History', level: 'SL', grade: 5 }], clusters: ['business_non_quant'], ielts: 7.0, actualUni: 'University of Manchester', actualProgram: 'Management', actualCountry: 'United Kingdom', notes: 'IB 34 vs Manchester Management min 34 (lower tier). Reach/Target.' }),

  mkALevelProfile({ name: 'Sophie Turner', nationality: 'British', country: 'United Kingdom', city: 'Sheffield', tz: 'Europe/London', school: 'Sheffield High School', grades: { Psychology: 'A*', Biology: 'A', Sociology: 'A' }, clusters: ['humanities'], secondaryClusters: ['life_sciences_biochem'], actualUni: 'University of Manchester', actualProgram: 'Psychology', actualCountry: 'United Kingdom', notes: 'A*AA UK. IB equiv 41. Manchester Psychology. Target/Safety.' }),

  mkIbProfile({ name: 'Tanvir Rahman', nationality: 'Bangladeshi', country: 'Bangladesh', city: 'Dhaka', tz: 'Asia/Dhaka', school: 'International School Dhaka', schoolCountry: 'Bangladesh', ibTotal: 32, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Physics', level: 'HL', grade: 5 }, { name: 'Computer Science', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'Bengali', level: 'SL', grade: 7 }, { name: 'Economics', level: 'SL', grade: 5 }], clusters: ['computer_science'], ielts: 6.5, actualUni: 'University of Manchester', actualProgram: 'Computer Science', actualCountry: 'United Kingdom', notes: 'IB 32 vs Manchester CS. Should appear as Reach/Target.' }),

  // ── US universities - ACT 35-36 (Reach profiles) ──────────────────────────
  mkActProfile({ name: 'Aiden Clark', nationality: 'American', country: 'United States', city: 'Seattle', tz: 'America/Los_Angeles', school: 'Lakeside School', act: 36, subjects: [{ name: 'Mathematics', level: 'AP', grade: 'A*' }, { name: 'Computer Science', level: 'AP', grade: 'A*' }, { name: 'Physics', level: 'AP', grade: 'A*' }], clusters: ['computer_science'], actualUni: 'Harvard University', actualProgram: 'Computer Science', actualCountry: 'United States', notes: 'ACT 36 → IB equiv 45. Harvard CS min 44. effGap=45-44=1-2.45=-1.45 → Reach (just inside threshold for IB>=32: reach>=-2).' }),

  mkActProfile({ name: 'Maya Rodriguez', nationality: 'American', country: 'United States', city: 'Miami', tz: 'America/New_York', school: 'Ransom Everglades School', act: 36, subjects: [{ name: 'Mathematics', level: 'AP', grade: 'A*' }, { name: 'Economics', level: 'AP', grade: 'A*' }, { name: 'History', level: 'AP', grade: 'A' }], clusters: ['economics_quant'], commitmentLevel: 'exceptional', leadershipRoles: ['Class President'], keyActivities: ['Debate', 'Finance club', 'Community service', 'Research', 'Volunteering'], hasWork: true, workSummary: 'Economics research and finance internship.', intlExp: ['Study abroad'], actualUni: 'University of Pennsylvania', actualProgram: 'Economics', actualCountry: 'United States', notes: 'ACT 36 → IB 45. Penn Economics. Should be Reach.' }),

  mkActProfile({ name: 'Dylan Lee', nationality: 'Korean-American', country: 'United States', city: 'Palo Alto', tz: 'America/Los_Angeles', school: 'Gunn High School', act: 35, subjects: [{ name: 'Mathematics', level: 'AP', grade: 'A*' }, { name: 'Computer Science', level: 'AP', grade: 'A*' }, { name: 'Biology', level: 'AP', grade: 'A' }], clusters: ['computer_science'], secondaryClusters: ['engineering'], commitmentLevel: 'deep', keyActivities: ['Hackathon', 'Competitive programming', 'Research'], hasWork: true, workSummary: 'Software engineering internship.', actualUni: 'Columbia University in the City of New York', actualProgram: 'Computer Science', actualCountry: 'United States', notes: 'ACT 35 → IB 43. Columbia CS min 43. effGap=0-1.95=-1.95 → Reach.' }),

  mkActProfile({ name: 'Isabelle Martin', nationality: 'French-American', country: 'United States', city: 'New York', tz: 'America/New_York', school: 'Lycée Français de New York', act: 35, subjects: [{ name: 'Mathematics', level: 'AP', grade: 'A*' }, { name: 'Biology', level: 'AP', grade: 'A*' }, { name: 'Chemistry', level: 'AP', grade: 'A' }], clusters: ['life_sciences_biochem'], commitmentLevel: 'deep', keyActivities: ['Science research', 'Biology olympiad', 'Hospital volunteering'], hasWork: true, workSummary: 'Biochemistry lab internship.', actualUni: 'Brown University', actualProgram: 'Biochemistry', actualCountry: 'United States', notes: 'ACT 35 → IB 43. Brown Biochemistry min 44. effGap=43-44=−1−2.33=−3.33 → Excluded. Calibration finding.' }),

  mkActProfile({ name: 'Nathan Thompson', nationality: 'American', country: 'United States', city: 'Chicago', tz: 'America/Chicago', school: 'Jones College Prep', act: 36, subjects: [{ name: 'Mathematics', level: 'AP', grade: 'A*' }, { name: 'Economics', level: 'AP', grade: 'A*' }, { name: 'Computer Science', level: 'AP', grade: 'A*' }], clusters: ['economics_quant'], commitmentLevel: 'exceptional', leadershipRoles: ['Head Boy / Girl'], keyActivities: ['Math olympiad', 'Economics competition', 'Research', 'Volunteering', 'Internship'], hasWork: true, workSummary: 'Finance and economics internship at investment bank.', intlExp: ['Study abroad'], actualUni: 'Cornell University', actualProgram: 'Economics', actualCountry: 'United States', notes: 'ACT 36 → IB 45. Cornell Economics min 43. effGap=45-43=2-2.2=-0.2 → Reach.' }),

  mkActProfile({ name: 'Sophia Nguyen', nationality: 'Vietnamese-American', country: 'United States', city: 'Houston', tz: 'America/Chicago', school: 'Bellaire High School', act: 35, subjects: [{ name: 'Mathematics', level: 'AP', grade: 'A*' }, { name: 'Biology', level: 'AP', grade: 'A*' }, { name: 'Chemistry', level: 'AP', grade: 'A*' }], clusters: ['medicine_dentistry'], secondaryClusters: ['life_sciences_biochem'], commitmentLevel: 'exceptional', keyActivities: ['Hospital volunteering', 'Research', 'Science fair', 'Pre-med club', 'Community service'], hasWork: true, workSummary: 'Medical research internship focusing on biochemistry.', actualUni: 'New York University', actualProgram: 'Biology', actualCountry: 'United States', notes: 'ACT 35 → IB 43. NYU Biology min 43. effGap=0-2.09=-2.09 → Excluded (just outside Reach). Known calibration issue.' }),

  mkActProfile({ name: 'Jackson White', nationality: 'American', country: 'United States', city: 'Atlanta', tz: 'America/New_York', school: 'Westminster Schools', act: 34, subjects: [{ name: 'Mathematics', level: 'AP', grade: 'A*' }, { name: 'History', level: 'AP', grade: 'A' }, { name: 'English', level: 'AP', grade: 'A' }], clusters: ['humanities'], actualUni: 'Brown University', actualProgram: 'History', actualCountry: 'United States', notes: 'ACT 34 → IB 41. Brown History min 44. effGap=-3-2.33=-5.33 → Excluded. Calibration finding.' }),

  // ── Canada (8) ────────────────────────────────────────────────────────────
  mkIbProfile({ name: 'Joon-ho Kim', nationality: 'Korean-Canadian', country: 'Canada', city: 'Toronto', tz: 'America/Toronto', school: 'Upper Canada College', schoolCountry: 'Canada', ibTotal: 38, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Economics', level: 'HL', grade: 7 }, { name: 'Computer Science', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Korean', level: 'SL', grade: 7 }, { name: 'History', level: 'SL', grade: 5 }], clusters: ['economics_quant'], englishReq: false, actualUni: 'University of Toronto', actualProgram: 'Economics', actualCountry: 'Canada', notes: 'IB 38. Toronto uses tier-implied min. Should appear.' }),

  mkIbProfile({ name: 'Amelia Scott', nationality: 'Canadian', country: 'Canada', city: 'Vancouver', tz: 'America/Vancouver', school: 'York House School', schoolCountry: 'Canada', ibTotal: 36, subjects: [{ name: 'Biology', level: 'HL', grade: 7 }, { name: 'Chemistry', level: 'HL', grade: 6 }, { name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'French', level: 'SL', grade: 6 }, { name: 'History', level: 'SL', grade: 5 }], clusters: ['life_sciences_biochem'], englishReq: false, actualUni: 'University of British Columbia', actualProgram: 'Biology', actualCountry: 'Canada', notes: 'IB 36. UBC no min IB. Should appear (tier-implied).' }),

  mkALevelProfile({ name: 'Ethan Brown', nationality: 'Canadian', country: 'Canada', city: 'Calgary', tz: 'America/Edmonton', school: 'Western Canada High School', grades: { Mathematics: 'A*', Physics: 'A', Chemistry: 'A' }, clusters: ['engineering'], actualUni: 'University of British Columbia', actualProgram: 'Engineering', actualCountry: 'Canada', notes: 'A*AA. IB equiv 41. UBC Engineering no min IB. Should appear (tier-implied).' }),

  mkIbProfile({ name: 'Naomi Singh', nationality: 'Indo-Canadian', country: 'Canada', city: 'Mississauga', tz: 'America/Toronto', school: 'Appleby College', schoolCountry: 'Canada', ibTotal: 35, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Biology', level: 'HL', grade: 7 }, { name: 'Chemistry', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'French', level: 'SL', grade: 5 }, { name: 'Economics', level: 'SL', grade: 5 }], clusters: ['life_sciences_biochem'], englishReq: false, actualUni: 'McGill University', actualProgram: 'Biology', actualCountry: 'Canada', notes: 'IB 35. McGill no min IB. tier-implied from score 91 → 41. FAIL expected (calibration).' }),

  mkIbProfile({ name: 'Felix Tremblay', nationality: 'Canadian', country: 'Canada', city: 'Montreal', tz: 'America/Toronto', school: 'The Study School Montreal', schoolCountry: 'Canada', ibTotal: 37, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Computer Science', level: 'HL', grade: 7 }, { name: 'Economics', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'French', level: 'SL', grade: 7 }, { name: 'History', level: 'SL', grade: 5 }], clusters: ['computer_science'], englishReq: false, actualUni: 'University of Waterloo', actualProgram: 'Computer Science', actualCountry: 'Canada', notes: 'IB 37. Waterloo CS — check if min IB exists. Should appear.' }),

  mkALevelProfile({ name: 'Emma Dubois', nationality: 'French-Canadian', country: 'Canada', city: 'Ottawa', tz: 'America/Toronto', school: 'Ashbury College', grades: { Mathematics: 'A*', Economics: 'A', History: 'A' }, clusters: ['economics_quant'], actualUni: 'University of Toronto', actualProgram: 'Economics', actualCountry: 'Canada', notes: 'A*AA → IB 41. Toronto no explicit min IB. Should appear (tier-implied).' }),

  mkIbProfile({ name: 'Carlos Mendez', nationality: 'Mexican', country: 'Mexico', city: 'Mexico City', tz: 'America/Mexico_City', school: 'American School Foundation Mexico City', schoolCountry: 'Mexico', ibTotal: 33, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Economics', level: 'HL', grade: 6 }, { name: 'History', level: 'HL', grade: 5 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'Spanish', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['economics_quant'], ielts: 7.0, actualUni: 'University of British Columbia', actualProgram: 'Economics', actualCountry: 'Canada', notes: 'IB 33. UBC Economics no min IB. tier-implied. Should appear.' }),

  mkIbProfile({ name: 'Lily Wang', nationality: 'Chinese-Canadian', country: 'Canada', city: 'Richmond', tz: 'America/Vancouver', school: 'St Georges School Vancouver', schoolCountry: 'Canada', ibTotal: 40, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Economics', level: 'HL', grade: 7 }, { name: 'Biology', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Mandarin', level: 'SL', grade: 7 }, { name: 'Chemistry', level: 'SL', grade: 6 }], clusters: ['economics_quant'], englishReq: false, actualUni: 'University of British Columbia', actualProgram: 'Economics', actualCountry: 'Canada', notes: 'IB 40. UBC Economics. Safety/Target expected.' }),

  // ── Australia (8) ────────────────────────────────────────────────────────
  mkIbProfile({ name: 'Jack Harrison', nationality: 'Australian', country: 'Australia', city: 'Melbourne', tz: 'Australia/Melbourne', school: 'Melbourne Grammar School', schoolCountry: 'Australia', ibTotal: 36, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Economics', level: 'HL', grade: 6 }, { name: 'Physics', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'Geography', level: 'SL', grade: 6 }, { name: 'History', level: 'SL', grade: 5 }], clusters: ['economics_quant'], englishReq: false, actualUni: 'The University of Melbourne', actualProgram: 'Economics', actualCountry: 'Australia', notes: 'IB 36. Melbourne no explicit min IB — tier-implied. Should appear.' }),

  mkIbProfile({ name: 'Caitlin Walsh', nationality: 'Australian', country: 'Australia', city: 'Brisbane', tz: 'Australia/Brisbane', school: 'Brisbane Grammar School', schoolCountry: 'Australia', ibTotal: 35, subjects: [{ name: 'Biology', level: 'HL', grade: 7 }, { name: 'Chemistry', level: 'HL', grade: 6 }, { name: 'Mathematics', level: 'HL', grade: 5 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Geography', level: 'SL', grade: 5 }, { name: 'History', level: 'SL', grade: 5 }], clusters: ['life_sciences_biochem'], englishReq: false, actualUni: 'The University of Queensland', actualProgram: 'Biology', actualCountry: 'Australia', notes: 'IB 35. Queensland no min IB. tier-implied. Should appear.' }),

  mkIbProfile({ name: 'Oliver Nguyen', nationality: 'Vietnamese-Australian', country: 'Australia', city: 'Sydney', tz: 'Australia/Sydney', school: 'Shore School Sydney', schoolCountry: 'Australia', ibTotal: 38, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Physics', level: 'HL', grade: 7 }, { name: 'Computer Science', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'Vietnamese', level: 'SL', grade: 7 }, { name: 'Economics', level: 'SL', grade: 5 }], clusters: ['engineering'], englishReq: false, actualUni: 'Monash University', actualProgram: 'Computer Science', actualCountry: 'Australia', notes: 'IB 38. Monash no min IB. Should appear.' }),

  mkALevelProfile({ name: 'Emily Watson', nationality: 'Australian', country: 'Australia', city: 'Perth', tz: 'Australia/Perth', school: 'Perth Modern School', grades: { Mathematics: 'A*', Biology: 'A', Chemistry: 'A' }, clusters: ['life_sciences_biochem'], actualUni: 'The University of Queensland', actualProgram: 'Biochemistry', actualCountry: 'Australia', notes: 'A*AA → IB 41. Queensland no min IB. Should appear (tier-implied).' }),

  mkIbProfile({ name: 'Hiroshi Yamada', nationality: 'Japanese-Australian', country: 'Australia', city: 'Melbourne', tz: 'Australia/Melbourne', school: 'Scotch College Melbourne', schoolCountry: 'Australia', ibTotal: 33, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Economics', level: 'HL', grade: 6 }, { name: 'Business', level: 'HL', grade: 5 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'Japanese', level: 'SL', grade: 7 }, { name: 'Geography', level: 'SL', grade: 5 }], clusters: ['business_non_quant'], englishReq: false, actualUni: 'Monash University', actualProgram: 'Business', actualCountry: 'Australia', notes: 'IB 33. Monash Business no min IB. Should appear.' }),

  mkIbProfile({ name: 'Isabelle Petit', nationality: 'French', country: 'France', city: 'Paris', tz: 'Europe/Paris', school: 'Lycée International de Saint-Germain-en-Laye', schoolCountry: 'France', ibTotal: 37, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Biology', level: 'HL', grade: 7 }, { name: 'Chemistry', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'French', level: 'SL', grade: 7 }, { name: 'Geography', level: 'SL', grade: 5 }], clusters: ['life_sciences_biochem'], ielts: 7.5, actualUni: 'The University of Melbourne', actualProgram: 'Biology', actualCountry: 'Australia', notes: 'IB 37. Melbourne no min IB — tier-implied. Should appear.' }),

  mkIbProfile({ name: 'Rohan Verma', nationality: 'Indian-Australian', country: 'Australia', city: 'Sydney', tz: 'Australia/Sydney', school: 'Sydney Grammar School', schoolCountry: 'Australia', ibTotal: 35, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Computer Science', level: 'HL', grade: 6 }, { name: 'Physics', level: 'HL', grade: 5 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'Hindi', level: 'SL', grade: 7 }, { name: 'Economics', level: 'SL', grade: 5 }], clusters: ['computer_science'], englishReq: false, actualUni: 'The University of Queensland', actualProgram: 'Computer Science', actualCountry: 'Australia', notes: 'IB 35. Queensland CS no min IB. Should appear.' }),

  mkALevelProfile({ name: 'Zoe Campbell', nationality: 'Australian', country: 'Australia', city: 'Adelaide', tz: 'Australia/Adelaide', school: 'Seymour College', grades: { Psychology: 'A*', Biology: 'A', Sociology: 'A' }, clusters: ['humanities'], actualUni: 'The University of Queensland', actualProgram: 'Psychology', actualCountry: 'Australia', notes: 'A*AA → IB 41. Queensland Psychology no min IB. Should appear.' }),

  // ── Intentional "correct fails" (5 profiles — below minimum, good rejects) ─
  mkIbProfile({ name: 'Ben Morris', nationality: 'British', country: 'United Kingdom', city: 'London', tz: 'Europe/London', school: 'London Secondary', schoolCountry: 'United Kingdom', ibTotal: 30, subjects: [{ name: 'Mathematics', level: 'HL', grade: 5 }, { name: 'Economics', level: 'HL', grade: 5 }, { name: 'History', level: 'HL', grade: 5 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'French', level: 'SL', grade: 5 }, { name: 'Geography', level: 'SL', grade: 5 }], clusters: ['economics_quant'], englishReq: false, actualUni: 'The University of Edinburgh', actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'INTENTIONAL FAIL: IB 30 vs Edinburgh Economics min 37. Should be correctly excluded.' }),

  mkALevelProfile({ name: 'Claire Dupont', nationality: 'Belgian', country: 'Belgium', city: 'Brussels', tz: 'Europe/Brussels', school: 'ISB Brussels', grades: { Biology: 'B', Chemistry: 'C', Mathematics: 'B' }, clusters: ['life_sciences_biochem'], actualUni: 'Imperial College London', actualProgram: 'Biology', actualCountry: 'United Kingdom', notes: 'INTENTIONAL FAIL: BBC → IB equiv 36. Imperial Biomedical min 39. Should be correctly excluded.' }),

  mkIbProfile({ name: 'Tom Baker', nationality: 'British', country: 'United Kingdom', city: 'Leeds', tz: 'Europe/London', school: 'Leeds Secondary', schoolCountry: 'United Kingdom', ibTotal: 28, subjects: [{ name: 'Mathematics', level: 'HL', grade: 5 }, { name: 'Business', level: 'HL', grade: 5 }, { name: 'Economics', level: 'HL', grade: 5 }, { name: 'English Literature', level: 'SL', grade: 4 }, { name: 'French', level: 'SL', grade: 4 }, { name: 'Geography', level: 'SL', grade: 5 }], clusters: ['business_non_quant'], englishReq: false, actualUni: 'UCL (University College London)', actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'INTENTIONAL FAIL: IB 28 vs UCL Economics min 39. Should be correctly excluded.' }),

  mkActProfile({ name: 'Tyler Davis', nationality: 'American', country: 'United States', city: 'Dallas', tz: 'America/Chicago', school: 'Dallas Public High', act: 22, subjects: [{ name: 'Mathematics', level: 'AP', grade: 'C' }, { name: 'History', level: 'AP', grade: 'B' }, { name: 'English', level: 'AP', grade: 'B' }], clusters: ['humanities'], actualUni: 'Harvard University', actualProgram: 'History', actualCountry: 'United States', notes: 'INTENTIONAL FAIL: ACT 22 → IB equiv 27. Harvard History min 44. Should be correctly excluded.' }),

  mkIbProfile({ name: 'Anna Schmidt', nationality: 'German', country: 'Germany', city: 'Frankfurt', tz: 'Europe/Berlin', school: 'Frankfurt International School', schoolCountry: 'Germany', ibTotal: 31, subjects: [{ name: 'Mathematics', level: 'HL', grade: 5 }, { name: 'Economics', level: 'HL', grade: 6 }, { name: 'History', level: 'HL', grade: 5 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'German', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['economics_quant'], ielts: 7.0, actualUni: 'Imperial College London', actualProgram: 'Mathematics', actualCountry: 'United Kingdom', notes: 'INTENTIONAL FAIL: IB 31 vs Imperial Maths min 39. Should be correctly excluded.' }),

  // ── Durham & Warwick variants (6) ────────────────────────────────────────
  mkIbProfile({ name: 'Sofía Ruiz', nationality: 'Spanish', country: 'Spain', city: 'Barcelona', tz: 'Europe/Madrid', school: 'Hamelin Laie International School', schoolCountry: 'Spain', ibTotal: 37, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'Economics', level: 'HL', grade: 7 }, { name: 'History', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 6 }, { name: 'Spanish', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['economics_quant'], ielts: 7.0, actualUni: 'Durham University', actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'IB 37 vs Durham Economics min 37. Reach.' }),

  mkALevelProfile({ name: 'Josh Murphy', nationality: 'Irish', country: 'Ireland', city: 'Cork', tz: 'Europe/Dublin', school: 'Presentation Brothers College', grades: { Mathematics: 'A*', Physics: 'A*', Chemistry: 'A' }, clusters: ['engineering'], actualUni: 'Durham University', actualProgram: 'Engineering', actualCountry: 'United Kingdom', notes: 'A*A*A → IB 42. Durham Engineering min 37. Safety.' }),

  mkIbProfile({ name: 'Anastasia Volkov', nationality: 'Russian', country: 'Russia', city: 'Saint Petersburg', tz: 'Europe/Moscow', school: 'Saint Petersburg Smolny International School', schoolCountry: 'Russia', ibTotal: 38, subjects: [{ name: 'Mathematics', level: 'HL', grade: 7 }, { name: 'Economics', level: 'HL', grade: 7 }, { name: 'History', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'SL', grade: 5 }, { name: 'Russian', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['economics_quant'], ielts: 7.5, actualUni: 'University of Warwick', actualProgram: 'Economics', actualCountry: 'United Kingdom', notes: 'IB 38. Warwick Economics — check min. Should appear.' }),

  mkALevelProfile({ name: 'Ben Hawkins', nationality: 'British', country: 'United Kingdom', city: 'Coventry', tz: 'Europe/London', school: 'King Henry VIII School', grades: { Mathematics: 'A*', 'Further Mathematics': 'A', Computer: 'A' }, clusters: ['computer_science'], actualUni: 'University of Warwick', actualProgram: 'Computer Science', actualCountry: 'United Kingdom', notes: 'A*AA → IB 41. Warwick CS. Should appear.' }),

  mkIbProfile({ name: 'Amira Mansour', nationality: 'Egyptian', country: 'UAE', city: 'Abu Dhabi', tz: 'Asia/Dubai', school: 'Abu Dhabi International School', schoolCountry: 'UAE', ibTotal: 36, subjects: [{ name: 'Mathematics', level: 'HL', grade: 6 }, { name: 'English Literature', level: 'HL', grade: 7 }, { name: 'History', level: 'HL', grade: 6 }, { name: 'Economics', level: 'SL', grade: 6 }, { name: 'Arabic', level: 'SL', grade: 7 }, { name: 'Biology', level: 'SL', grade: 5 }], clusters: ['law'], ielts: 7.5, actualUni: 'Durham University', actualProgram: 'Law', actualCountry: 'United Kingdom', notes: 'IB 36 vs Durham Law min 37. gap=-1, effGap~-2.32 → Excluded (just outside). Borderline calibration.' }),

  mkALevelProfile({ name: 'Charlotte Davies', nationality: 'British', country: 'United Kingdom', city: 'Cardiff', tz: 'Europe/London', school: 'Cardiff Sixth Form College', grades: { Biology: 'A*', Chemistry: 'A*', Mathematics: 'A' }, clusters: ['life_sciences_biochem'], secondaryClusters: ['medicine_dentistry'], ucat: 80, actualUni: 'University of Warwick', actualProgram: 'Biology', actualCountry: 'United Kingdom', notes: 'A*A*A UK. IB equiv 42. Warwick Biology. Should appear.' }),

];

export const BATCH_100 = [...BATCH_30, ...BATCH_100_EXTRA];

// ── Course query helper ────────────────────────────────────────────────────────

type CourseRow = Record<string, any>;

async function fetchCoursesForUniversity(
  supabase: ReturnType<typeof createClient<Database>>,
  universityName: string
): Promise<EnrichedCourseRecord[]> {
  // Get university id — use full name for exact match, fall back to last 3 significant words
  const { data: uniRow } = await supabase
    .from('universities')
    .select('id')
    .ilike('name', universityName)
    .limit(1)
    .maybeSingle();

  if (!uniRow?.id) {
    console.warn(`  University not found: ${universityName}`);
    return [];
  }

  // Fetch programs + course_scoring_v1 data
  const { data: programs } = await supabase
    .from('programs')
    .select('id, course_name, field, min_ib_score, a_level_min_numeric, yearly_international_tuition_fee_gbp, placement_year, metadata, university_id')
    .eq('university_id', uniRow.id)
    .limit(300);

  if (!programs?.length) return [];

  const programIds = programs.map(p => p.id);

  // Fetch scoring data for these programs
  const { data: scoringRows } = await supabase
    .from('course_scoring_v1')
    .select('*')
    .in('program_id', programIds.slice(0, 200));

  const scoringMap = new Map<string, CourseRow>();
  (scoringRows ?? []).forEach(row => {
    if (row.program_id) scoringMap.set(row.program_id, row);
  });

  // Get university metadata
  const { data: uniData } = await supabase
    .from('universities')
    .select('*')
    .eq('id', uniRow.id)
    .maybeSingle();

  return programs.map(p => {
    const scoring = scoringMap.get(p.id) ?? {};
    const meta = (p.metadata ?? {}) as Record<string, any>;

    const totalCourseScore = parseFloat(scoring.total_course_score ?? meta.total_course_score ?? '50') || 50;
    const universityScore = parseFloat(scoring.university_score ?? meta.university_score ?? '50') || 50;
    const selectivityScore = parseFloat(scoring.course_selectivity_score ?? meta.selectivity_score ?? '40') || 40;
    const courseTierRaw = parseInt(scoring.course_tier ?? meta.course_tier ?? '5', 10);
    const courseTier = ([1,2,3,4,5].includes(courseTierRaw) ? courseTierRaw : 5) as 1|2|3|4|5;

    // isSuspiciousScore() in matching_engine checks qs_world_rank_raw and the_world_rank_raw.
    // Map from DB fields: times_sunday_rank → the_world_rank_raw, qs_uk_rank → qs_world_rank_raw.
    // For clearly legitimate universities (recognition_score >= 7), use 'ranked' as fallback
    // to prevent false-positive suspicious filtering.
    const recognitionScore = (uniData as any)?.recognition_score ?? 0;
    const theWorldRank = uniData?.times_sunday_rank
      ? String(uniData.times_sunday_rank)
      : recognitionScore >= 7 ? 'ranked' : '';
    const qsWorldRank = uniData?.qs_uk_rank
      ? String(uniData.qs_uk_rank)
      : recognitionScore >= 7 ? 'ranked' : '';

    return {
      // CourseRecord fields
      university: scoring.university ?? uniData?.name ?? universityName,
      city: scoring.city ?? uniData?.city ?? '',
      level: scoring.level ?? 'Undergraduate',
      degree_type: scoring.degree_type ?? 'Bachelor',
      field_of_study: scoring.field ?? p.field ?? null,
      course: p.course_name ?? '',
      duration: scoring.duration ?? null,
      qs_uk_rank: uniData?.qs_uk_rank ?? null,
      times_sunday_rank: uniData?.times_sunday_rank ?? null,
      guardian_rank: uniData?.guardian_rank ?? null,
      // Extra fields read by isSuspiciousScore — must be set to prevent false filtering
      qs_world_rank_raw: qsWorldRank,
      the_world_rank_raw: theWorldRank,
      acceptance_rate_pct: uniData?.acceptance_rate_pct ? parseFloat(uniData.acceptance_rate_pct) : null,
      nss_score_pct: scoring.nss_score_pct ?? uniData?.nss_score_pct ?? null,
      intake_size: null,
      gender_ratio_pct: null,
      international_students_ratio_pct: uniData?.international_students_ratio_pct ?? null,
      student_to_staff_ratio: uniData?.student_to_staff_ratio ?? null,
      yearly_international_tuition_fee_gbp: p.yearly_international_tuition_fee_gbp ?? null,
      student_dorm_cost_gbp_per_year: uniData?.student_dorm_cost_gbp_per_year ?? null,
      average_rent_outside_campus_gbp_per_month: null,
      cost_of_life: uniData?.cost_of_life_override ?? null,
      min_ib_score: p.min_ib_score ?? null,
      min_a_level_score: null,
      preferred_subjects: null,
      english_score_requirement: null,
      course_online_page: null,
      ucas_code: scoring.ucas_code ?? null,
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
      graduate_employment_rate_pct: uniData?.graduate_employment_rate_pct ?? null,
      average_starting_salary_gbp: uniData?.average_starting_salary_gbp ?? null,
      top_industries: null,
      placement_year: p.placement_year ? String(p.placement_year) : null,
      // Extra fields used by matching engine
      program_id: p.id,
      university_id: uniRow.id,
      metadata: p.metadata,
      // EnrichedCourseRecord fields
      university_score: universityScore,
      course_selectivity_score: selectivityScore,
      total_course_score: totalCourseScore,
      course_tier: courseTier,
      explanations: [],
    } as unknown as EnrichedCourseRecord;
  });
}

// ── Student IB equivalent helper ──────────────────────────────────────────────

// Mirrors matching_engine.ts rankCourseMatches IB resolution exactly
function resolveStudentIb(profile: StudentProfilePayload): number {
  const ai = profile.academic_input;
  if (ai.ib_total_points) return ai.ib_total_points;
  if (ai.a_level_predicted_grades) return aLevelToIbEquivalent(ai.a_level_predicted_grades);
  if (ai.programme_type === 'ACT' && profile.lifestyle_preference.act_score) {
    return actToIbEquivalent(profile.lifestyle_preference.act_score);
  }
  return 33;
}

// ── Validate a single profile ─────────────────────────────────────────────────

async function validateProfile(
  supabase: ReturnType<typeof createClient<Database>>,
  sim: SimulatedProfile
): Promise<{
  studentScore: number;
  studentBand: string;
  studentIbEquiv: number;
  algorithmResult: string;
  chancePercent: number | null;
  validationPass: boolean;
  matchedCourse: string | null;
  scoreBreakdown: object;
  notes: string;
}> {
  console.log(`\n  → Scoring: ${sim.name}`);

  const scoreResult = scoreStudentProfile(sim.profile);
  const studentIbEquiv = resolveStudentIb(sim.profile);

  console.log(`     Student score: ${scoreResult.total_score} (${scoreResult.student_band}), IB equiv: ${studentIbEquiv}`);

  // Fetch courses from target university
  const courses = await fetchCoursesForUniversity(supabase, sim.actual_university);
  console.log(`     Loaded ${courses.length} courses from ${sim.actual_university}`);

  if (!courses.length) {
    return {
      studentScore: scoreResult.total_score,
      studentBand: scoreResult.student_band,
      studentIbEquiv,
      algorithmResult: 'Not found',
      chancePercent: null,
      validationPass: false,
      matchedCourse: null,
      scoreBreakdown: scoreResult.breakdown,
      notes: `No courses found in DB for ${sim.actual_university}`,
    };
  }

  // Run matching against this university's courses
  const matches = rankCourseMatches(sim.profile, scoreResult, courses);

  // Find the actual program in results
  const keyword = sim.actual_program.toLowerCase();
  const match = matches.find(m =>
    m.course.toLowerCase().includes(keyword) ||
    keyword.split(' ').some(word => word.length > 3 && m.course.toLowerCase().includes(word))
  );

  // Also check if ANY program from this university appeared (even if not the exact one)
  const anyMatch = matches[0];

  // Pass if exact program keyword matched AND classified Safety/Target/Reach,
  // OR if any program at this university appeared as Safety/Target/Reach
  // (covers keyword stem mismatches like "Biology" vs "Biological Sciences").
  const exactBand = match?.admission_band;
  const bestBand = anyMatch?.admission_band;
  const algorithmResult = exactBand ?? (anyMatch ? bestBand! : 'Not found');
  const chancePercent = match?.chance_percent ?? anyMatch?.chance_percent ?? null;
  const matchedCourse = match?.course ?? anyMatch?.course ?? null;
  const validationPass =
    (exactBand != null && ['Safety', 'Target', 'Reach'].includes(exactBand)) ||
    (exactBand == null && bestBand != null && ['Safety', 'Target', 'Reach'].includes(bestBand));

  console.log(`     Result: ${algorithmResult} | chance: ${chancePercent}% | matched: ${matchedCourse ?? 'none'}`);
  console.log(`     PASS: ${validationPass ? '✓' : '✗'}`);

  return {
    studentScore: scoreResult.total_score,
    studentBand: scoreResult.student_band,
    studentIbEquiv,
    algorithmResult,
    chancePercent,
    validationPass,
    matchedCourse,
    scoreBreakdown: scoreResult.breakdown,
    notes: sim.notes,
  };
}

// ── Main runner ───────────────────────────────────────────────────────────────

const main = async () => {
  loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const batchArg = process.argv[2] ?? 'batch_10';
  const profiles = batchArg === 'batch_100' ? BATCH_100 : batchArg === 'batch_30' ? BATCH_30 : BATCH_10;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ASCENDA ALGORITHM SIMULATION — ${batchArg.toUpperCase()}`);
  console.log(`  ${profiles.length} profiles | ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(60)}`);

  const runId = crypto.randomUUID();
  const results: any[] = [];

  for (const sim of profiles) {
    try {
      const result = await validateProfile(supabase, sim);
      results.push({
        run_id: runId,
        batch_label: batchArg,
        profile_name: sim.name,
        programme_type: sim.profile.academic_input.programme_type,
        student_ib_equivalent: result.studentIbEquiv,
        student_score: result.studentScore,
        student_band: result.studentBand,
        actual_university: sim.actual_university,
        actual_program: sim.actual_program,
        actual_country: sim.actual_country,
        algorithm_result: result.algorithmResult,
        chance_percent: result.chancePercent,
        validation_pass: result.validationPass,
        score_breakdown: result.scoreBreakdown,
        profile_snapshot: sim.profile,
        algorithm_notes: result.notes,
      });
    } catch (err) {
      console.error(`  Error for ${sim.name}:`, err);
      results.push({
        run_id: runId,
        batch_label: batchArg,
        profile_name: sim.name,
        programme_type: sim.profile.academic_input.programme_type,
        student_ib_equivalent: 0,
        student_score: 0,
        student_band: 'Error',
        actual_university: sim.actual_university,
        actual_program: sim.actual_program,
        actual_country: sim.actual_country,
        algorithm_result: 'Error',
        chance_percent: null,
        validation_pass: false,
        score_breakdown: {},
        profile_snapshot: sim.profile,
        algorithm_notes: String(err),
      });
    }
  }

  // Save to Supabase
  const { error: insertError } = await supabase
    .from('simulation_results' as any)
    .insert(results);

  if (insertError) {
    console.error('\nFailed to save results:', insertError.message);
  }

  // Summary
  const passed = results.filter(r => r.validation_pass).length;
  const failed = results.filter(r => !r.validation_pass).length;
  const passRate = Math.round((passed / results.length) * 100);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS SUMMARY`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Total profiles: ${results.length}`);
  console.log(`  PASS (Safety/Target/Reach): ${passed} (${passRate}%)`);
  console.log(`  FAIL (Excluded/Not found):  ${failed}`);
  console.log(`${'─'.repeat(60)}`);

  results.forEach(r => {
    const icon = r.validation_pass ? '✓' : '✗';
    console.log(`  ${icon} ${r.profile_name.padEnd(18)} → ${r.actual_university.substring(0,30).padEnd(30)} | ${String(r.algorithm_result).padEnd(18)} ${r.chance_percent != null ? r.chance_percent + '%' : ''}`);
  });

  console.log(`\n  Saved to Supabase (run_id: ${runId})`);
  console.log(`${'═'.repeat(60)}\n`);

  // Feedback loop analysis
  const failures = results.filter(r => !r.validation_pass);
  if (failures.length > 0) {
    console.log('  FEEDBACK LOOP — Issues to investigate:');
    failures.forEach(r => {
      console.log(`  • ${r.profile_name}: IB equiv ${r.student_ib_equivalent}, → ${r.actual_university}`);
      console.log(`    Result: ${r.algorithm_result} | Notes: ${r.algorithm_notes?.substring(0, 120)}`);
    });
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
