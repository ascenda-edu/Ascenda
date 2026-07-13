import { scoreStudentProfile } from '../src/lib/scoring/student_scoring';
import { rankCourseMatches } from '../src/lib/matching/matching_engine';
import type { StudentProfilePayload } from '../src/lib/profile/intake-types';
import type { EnrichedCourseRecord } from '../src/lib/tiering/course_tiering';

const sampleCourses: Partial<EnrichedCourseRecord>[] = [
    {
        university: 'University of Oxford',
        course: 'Medicine',
        ucas_code: 'A100',
        course_tier: 1,
        min_ib_score: 39,
        min_a_level_score: 'A*AA',
        admission_test: 'UCAT',
        english_score_requirement: '7.5',
        total_course_score: 98,
        university_score: 99,
        yearly_international_tuition_fee_gbp: 48000
    },
    {
        university: 'Imperial College London',
        course: 'Medicine',
        ucas_code: 'A100',
        course_tier: 1,
        min_ib_score: 38,
        min_a_level_score: 'A*AA',
        admission_test: 'UCAT',
        english_score_requirement: '7.0',
        total_course_score: 95,
        university_score: 97,
        yearly_international_tuition_fee_gbp: 45000
    },
    {
        university: 'UCL',
        course: 'Law',
        ucas_code: 'M100',
        course_tier: 1,
        min_ib_score: 38,
        min_a_level_score: 'A*AA',
        admission_test: 'LNAT',
        english_score_requirement: '7.5',
        total_course_score: 94,
        university_score: 96,
        yearly_international_tuition_fee_gbp: 30000
    },
    {
        university: 'University of Manchester',
        course: 'Medicine',
        ucas_code: 'A106',
        course_tier: 2,
        min_ib_score: 37,
        min_a_level_score: 'AAA',
        admission_test: 'UCAT',
        english_score_requirement: '7.0',
        total_course_score: 88,
        university_score: 90,
        yearly_international_tuition_fee_gbp: 38000
    },
    {
        university: 'University of Bristol',
        course: 'Law',
        ucas_code: 'M100',
        course_tier: 2,
        min_ib_score: 36,
        min_a_level_score: 'AAA',
        admission_test: 'LNAT',
        english_score_requirement: '7.0',
        total_course_score: 85,
        university_score: 88,
        yearly_international_tuition_fee_gbp: 22000
    },
    {
        university: 'University of Nottingham',
        course: 'Engineering',
        ucas_code: 'H100',
        course_tier: 3,
        min_ib_score: 34,
        min_a_level_score: 'AAB',
        admission_test: null,
        english_score_requirement: '6.5',
        total_course_score: 78,
        university_score: 82,
        yearly_international_tuition_fee_gbp: 26000
    },
    {
        university: 'University of Leeds',
        course: 'Law',
        ucas_code: 'M100',
        course_tier: 3,
        min_ib_score: 35,
        min_a_level_score: 'AAA',
        admission_test: 'LNAT',
        english_score_requirement: '6.5',
        total_course_score: 80,
        university_score: 84,
        yearly_international_tuition_fee_gbp: 21000
    },
    {
        university: 'Queen Mary University',
        course: 'Engineering',
        ucas_code: 'H100',
        course_tier: 3,
        min_ib_score: 32,
        min_a_level_score: 'ABB',
        admission_test: null,
        english_score_requirement: '6.5',
        total_course_score: 75,
        university_score: 78,
        yearly_international_tuition_fee_gbp: 24000
    },
    {
        university: 'University of Liverpool',
        course: 'Engineering',
        ucas_code: 'H100',
        course_tier: 4,
        min_ib_score: 30,
        min_a_level_score: 'BBB',
        admission_test: null,
        english_score_requirement: '6.0',
        total_course_score: 70,
        university_score: 75,
        yearly_international_tuition_fee_gbp: 23000
    },
    {
        university: 'University of Reading',
        course: 'Law',
        ucas_code: 'M100',
        course_tier: 4,
        min_ib_score: 30,
        min_a_level_score: 'BBB',
        admission_test: null,
        english_score_requirement: '6.5',
        total_course_score: 68,
        university_score: 72,
        yearly_international_tuition_fee_gbp: 19000
    },
    {
        university: 'Coventry University',
        course: 'Engineering',
        ucas_code: 'H100',
        course_tier: 5,
        min_ib_score: 28,
        min_a_level_score: 'BBC',
        admission_test: null,
        english_score_requirement: '6.0',
        total_course_score: 60,
        university_score: 65,
        yearly_international_tuition_fee_gbp: 18000
    },
    {
        university: 'Kingston University',
        course: 'Law',
        ucas_code: 'M100',
        course_tier: 5,
        min_ib_score: 26,
        min_a_level_score: 'BCC',
        admission_test: null,
        english_score_requirement: '6.0',
        total_course_score: 55,
        university_score: 60,
        yearly_international_tuition_fee_gbp: 16000
    }
];

const sofia: StudentProfilePayload = {
    personal_information: { first_name: 'Sofia', last_name: 'Test', email: 'sofia@test.com', nationality: 'Spanish', age: 17, gender: 'female', resident_country: 'Spain', current_location_city: 'Madrid', time_zone: 'Europe/Madrid', phone: null },
    academic_input: {
        programme_type: 'IB',
        school_name: 'IB School', school_country: 'Spain', school_city: 'Madrid', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2025, desired_start_date: null,
        intended_clusters: ['medicine_dentistry'], secondary_clusters: [], career_aspiration: 'Doctor',
        subject_list: [
            { subject_name: 'Biology', level: 'HL', grade_value: 7 },
            { subject_name: 'Chemistry', level: 'HL', grade_value: 6 },
            { subject_name: 'Mathematics', level: 'HL', grade_value: 6 },
            { subject_name: 'English Literature', level: 'SL', grade_value: 6 },
            { subject_name: 'Psychology', level: 'SL', grade_value: 6 },
            { subject_name: 'Spanish', level: 'SL', grade_value: 5 }
        ],
        ib_total_points: 42, ib_core_points: 2, ib_tok_grade: 'B', ib_ee_grade: 'A', ib_math_pathway: 'AA_HL',
        ee_subject: 'Biology', ee_title: 'Cancer cell mutations', ee_summary: 'Exploring medicine and genetics in oncology.',
        english_required: true, english_test_type: 'IELTS', english_status: 'exceptional', english_score_overall: 8,
        admissions_tests: [{ test_type: 'UCAT', status: 'taken', score_numeric: 2900, percentile: 85 }],
        a_level_predicted_grades: null
    },
    lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'london', campus_size: 'medium', extracurricular_interests: [], other_extracurriculars: null, leadership_roles: [], commitment_level: null, key_activities: [], sat_score: null, act_score: null, intl_experience: [], work_experience: null, work_experience_summary: null, ambition_statement: null, epq_subject: null, epq_title: null },
    activities_list: []
};

const daniel: StudentProfilePayload = {
    personal_information: { first_name: 'Daniel', last_name: 'Test', email: 'daniel@test.com', nationality: 'Nigerian', age: 18, gender: 'male', resident_country: 'Nigeria', current_location_city: 'Lagos', time_zone: 'Africa/Lagos', phone: null },
    academic_input: {
        programme_type: 'A_LEVEL',
        school_name: 'A-level School', school_country: 'Nigeria', school_city: 'Lagos', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2025, desired_start_date: null,
        intended_clusters: ['law'], secondary_clusters: [], career_aspiration: 'Lawyer',
        subject_list: [
            { subject_name: 'History', level: 'A_LEVEL', grade_value: 'A' },
            { subject_name: 'English Literature', level: 'A_LEVEL', grade_value: 'A' },
            { subject_name: 'Politics', level: 'A_LEVEL', grade_value: 'B' }
        ],
        a_level_predicted_grades: { History: 'A', 'English Literature': 'A', Politics: 'B' },
        english_required: true, english_test_type: 'IELTS', english_status: 'met', english_score_overall: 7,
        admissions_tests: [{ test_type: 'LNAT', status: 'taken', score_numeric: 25, percentile: null }],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null
    },
    lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'london', campus_size: 'medium', extracurricular_interests: [], other_extracurriculars: null, leadership_roles: [], commitment_level: null, key_activities: [], sat_score: null, act_score: null, intl_experience: [], work_experience: null, work_experience_summary: null, ambition_statement: null, epq_subject: null, epq_title: null },
    activities_list: []
};

const lucas: StudentProfilePayload = {
    personal_information: { first_name: 'Lucas', last_name: 'Test', email: 'lucas@test.com', nationality: 'Brazilian', age: 17, gender: 'male', resident_country: 'Brazil', current_location_city: 'Sao Paulo', time_zone: 'America/Sao_Paulo', phone: null },
    academic_input: {
        programme_type: 'A_LEVEL',
        school_name: 'A-level School', school_country: 'Brazil', school_city: 'Sao Paulo', school_type: 'international_school', language_of_instruction: 'english', graduation_year: 2025, desired_start_date: null,
        intended_clusters: ['engineering'], secondary_clusters: [], career_aspiration: 'Engineer',
        subject_list: [
            { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'C' },
            { subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'D' },
            { subject_name: 'Chemistry', level: 'A_LEVEL', grade_value: 'D' }
        ],
        a_level_predicted_grades: { Mathematics: 'C', Physics: 'D', Chemistry: 'D' },
        english_required: true, english_test_type: 'IELTS', english_status: 'missing', english_score_overall: null,
        admissions_tests: [],
        ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null, ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null
    },
    lifestyle_preference: { teaching_style: 'academic', desired_location_type: 'london', campus_size: 'medium', extracurricular_interests: [], other_extracurriculars: null, leadership_roles: [], commitment_level: null, key_activities: [], sat_score: null, act_score: null, intl_experience: [], work_experience: null, work_experience_summary: null, ambition_statement: null, epq_subject: null, epq_title: null },
    activities_list: []
};

function runDemo() {
    const students = [sofia, daniel, lucas];

    students.forEach(student => {
        const score = scoreStudentProfile(student);
        const matches = rankCourseMatches(student, score, sampleCourses as EnrichedCourseRecord[]);

        console.log(`\n========================================`);
        console.log(`MATCHES FOR ${student.personal_information.first_name.toUpperCase()}`);
        console.log(`Band: ${score.student_band} (Score: ${score.total_score})`);
        console.log(`========================================`);

        matches.slice(0, 10).forEach((match, i) => {
            console.log(`${i + 1}. ${match.university} - ${match.course}`);
            console.log(`   Tier: ${match.course_tier} | Fit: ${match.tier_fit}`);
            console.log(`   Chance: ${match.chance_percent}% (${match.chance_category})`);
            if (match.excluded) console.log(`   EXCLUDED`);
            if (match.reasons.length) console.log(`   Reasons: ${match.reasons.join(', ')}`);
            console.log(`----------------------------------------`);
        });
    });
}

runDemo();

test('matching demo runs without throwing', () => {
  expect(() => runDemo()).not.toThrow();
});
