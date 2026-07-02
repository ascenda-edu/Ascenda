import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';

type Client = SupabaseClient<Database>;

type PersonalRow = Database['public']['Tables']['student_personal_information']['Row'];
type AcademicRow = Database['public']['Tables']['student_academic_input']['Row'];
type SubjectRow = Database['public']['Tables']['student_subjects']['Row'];
type TestRow = Database['public']['Tables']['student_admissions_tests']['Row'];
type LifestyleRow = Database['public']['Tables']['student_lifestyle_preference']['Row'];

const asNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export interface IntakeRows {
  personal: PersonalRow | null;
  academic: AcademicRow;
  lifestyle: LifestyleRow | null;
  subjects: SubjectRow[];
  admissionsTests: TestRow[];
  activities: StudentProfilePayload['activities_list'];
}

// Single source of truth for DB-row → StudentProfilePayload mapping. Both the
// score loader (fetches rows itself) and the matching service (already has the
// rows in hand) go through this — the two used to maintain drifting copies of
// the same field mapping.
export const mapIntakeRowsToPayload = (rows: IntakeRows): StudentProfilePayload => {
  const { personal, academic, lifestyle } = rows;
  const programmeType = academic.programme_type ?? 'IB';

  const subjectList = rows.subjects.map((subject) => ({
    subject_name: subject.subject_name ?? '',
    level: subject.level ?? (programmeType === 'IB' ? 'HL' : 'A_LEVEL'),
    grade_value:
      programmeType === 'IB' ? asNumber(subject.grade_value) : subject.grade_value ?? null
  }));

  const admissionsTests = rows.admissionsTests.map((test) => ({
    test_type: test.test_type ?? 'NONE',
    status: test.status ?? 'missing',
    score_numeric: test.score_numeric ?? null,
    percentile: test.percentile ?? null
  }));

  return {
    personal_information: {
      first_name: personal?.first_name ?? '',
      last_name: personal?.last_name ?? '',
      email: personal?.email ?? '',
      phone: personal?.phone ?? null,
      nationality: personal?.nationality ?? '',
      age: personal?.age ?? null,
      gender: personal?.gender ?? null,
      resident_country: personal?.resident_country ?? '',
      current_location_city: personal?.current_location_city ?? null,
      time_zone: personal?.time_zone ?? null
    },
    academic_input: {
      programme_type: programmeType,
      school_name: academic.school_name ?? '',
      school_country: academic.school_country ?? '',
      school_city: academic.school_city ?? null,
      school_type: academic.school_type ?? null,
      language_of_instruction: academic.language_of_instruction ?? null,
      graduation_year: academic.graduation_year ?? new Date().getFullYear(),
      desired_start_date: academic.desired_start_date ?? null,
      intended_clusters: (academic.intended_clusters ?? []) as StudentProfilePayload['academic_input']['intended_clusters'],
      secondary_clusters: (academic.secondary_clusters ?? []) as StudentProfilePayload['academic_input']['secondary_clusters'],
      career_aspiration: academic.career_aspiration ?? null,
      subject_list: subjectList,
      ib_total_points: academic.ib_total_points ?? null,
      ib_core_points: academic.ib_core_points ?? null,
      ib_tok_grade: academic.ib_tok_grade ?? null,
      ib_ee_grade: academic.ib_ee_grade ?? null,
      ib_math_pathway: academic.ib_math_pathway ?? null,
      ee_subject: academic.ee_subject ?? null,
      ee_title: academic.ee_title ?? null,
      ee_summary: academic.ee_summary ?? null,
      a_level_predicted_grades: (academic.a_level_predicted_grades ?? null) as StudentProfilePayload['academic_input']['a_level_predicted_grades'],
      english_required: academic.english_required ?? null,
      english_test_type: academic.english_test_type ?? 'NONE',
      english_status: academic.english_status ?? 'missing',
      english_score_overall: academic.english_score_overall ?? null,
      admissions_tests: admissionsTests
    },
    lifestyle_preference: {
      teaching_style: lifestyle?.teaching_style ?? null,
      desired_location_type: lifestyle?.desired_location_type ?? null,
      campus_size: lifestyle?.campus_size ?? null,
      extracurricular_interests: lifestyle?.extracurricular_interests ?? [],
      other_extracurriculars: lifestyle?.other_extracurriculars ?? null,
      leadership_roles: lifestyle?.leadership_roles ?? [],
      commitment_level: lifestyle?.commitment_level ?? null,
      key_activities: lifestyle?.key_activities ?? [],
      sat_score: lifestyle?.sat_score ?? null,
      act_score: lifestyle?.act_score ?? null,
      intl_experience: lifestyle?.intl_experience ?? [],
      work_experience: lifestyle?.work_experience ?? null,
      work_experience_summary: lifestyle?.work_experience_summary ?? null,
      ambition_statement: lifestyle?.ambition_statement ?? null,
      epq_subject: (lifestyle as any)?.epq_subject ?? null,
      epq_title: (lifestyle as any)?.epq_title ?? null,
    },
    activities_list: rows.activities ?? [],
  };
};

export const buildStudentProfilePayload = async (
  supabase: Client,
  profileId: string
): Promise<StudentProfilePayload | null> => {
  const [
    personalResponse,
    academicResponse,
    subjectsResponse,
    testsResponse,
    lifestyleResponse,
    activitiesResponse
  ] = await Promise.all([
    supabase.from('student_personal_information').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('student_academic_input').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('student_subjects').select('*').eq('profile_id', profileId),
    supabase.from('student_admissions_tests').select('*').eq('profile_id', profileId),
    supabase.from('student_lifestyle_preference').select('*').eq('profile_id', profileId).maybeSingle(),
    (supabase as any).from('student_activities').select('*').eq('profile_id', profileId).order('sort_order')
  ]);

  if (personalResponse.error || academicResponse.error || subjectsResponse.error || testsResponse.error || lifestyleResponse.error) {
    throw new Error('Failed to load student intake records');
  }

  const activitiesList = ((activitiesResponse as any)?.data ?? []).map((a: any) => ({
    id: a.id,
    category: a.category ?? '',
    level: a.level ?? null,
    duration: a.duration ?? null,
    highlight: a.highlight ?? null,
    sort_order: a.sort_order ?? 0,
  }));

  const personal = personalResponse.data;
  const academic = academicResponse.data;
  if (!personal || !academic) return null;
  if (!academic.programme_type) return null;

  return mapIntakeRowsToPayload({
    personal,
    academic,
    lifestyle: lifestyleResponse.data ?? null,
    subjects: subjectsResponse.data ?? [],
    admissionsTests: testsResponse.data ?? [],
    activities: activitiesList
  });
};
