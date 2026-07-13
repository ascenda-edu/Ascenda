// Pure writer for a StudentProfilePayload → the normalized student_* tables.
//
// Extracted from the `'use server'` saveStudentIntake action so it can run in
// BOTH a request context (the action calls it, then does cookie/revalidate
// side-effects) and a plain script (the student seed calls it with a
// service-role client). This module imports no next/* APIs.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';
import { scoreStudentProfile } from '@/lib/scoring/student_scoring';

type Client = SupabaseClient<Database>;

/**
 * Upserts a full student intake payload for `userId`. Throws on any write error
 * (except score computation, which is best-effort). Does NOT touch cookies or
 * revalidate caches — callers in a request context handle that themselves.
 */
export const writeStudentIntake = async (
  supabase: Client,
  userId: string,
  payload: StudentProfilePayload
): Promise<void> => {
  const { personal_information, academic_input, lifestyle_preference } = payload;

  const fullName = [personal_information.first_name, personal_information.last_name].filter(Boolean).join(' ');
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    full_name: fullName || null,
    country: personal_information.resident_country || null,
    time_zone: personal_information.time_zone || null
  });
  if (profileError) throw new Error(profileError.message);

  const { error: personalError } = await supabase.from('student_personal_information').upsert({
    profile_id: userId,
    first_name: personal_information.first_name,
    last_name: personal_information.last_name,
    email: personal_information.email,
    phone: personal_information.phone,
    nationality: personal_information.nationality,
    age: personal_information.age,
    gender: personal_information.gender,
    resident_country: personal_information.resident_country,
    current_location_city: personal_information.current_location_city,
    time_zone: personal_information.time_zone
  });
  if (personalError) throw new Error(personalError.message);

  const { error: academicError } = await supabase.from('student_academic_input').upsert({
    profile_id: userId,
    // Cast: generated DB types lag the schema (ACT added by migration 20260611120000).
    programme_type: academic_input.programme_type as any,
    school_name: academic_input.school_name,
    school_country: academic_input.school_country,
    school_city: academic_input.school_city,
    school_type: academic_input.school_type,
    language_of_instruction: academic_input.language_of_instruction,
    graduation_year: academic_input.graduation_year,
    desired_start_date: academic_input.desired_start_date,
    intended_clusters: academic_input.intended_clusters,
    secondary_clusters: academic_input.secondary_clusters,
    career_aspiration: academic_input.career_aspiration,
    ib_total_points: academic_input.ib_total_points,
    ib_core_points: academic_input.ib_core_points,
    ib_tok_grade: academic_input.ib_tok_grade,
    ib_ee_grade: academic_input.ib_ee_grade,
    ib_math_pathway: academic_input.ib_math_pathway,
    ee_subject: academic_input.ee_subject,
    ee_title: academic_input.ee_title,
    ee_summary: academic_input.ee_summary,
    a_level_predicted_grades: academic_input.a_level_predicted_grades,
    english_required: academic_input.english_required,
    english_test_type: academic_input.english_test_type,
    english_status: academic_input.english_status,
    english_score_overall: academic_input.english_score_overall
  });
  if (academicError) throw new Error(academicError.message);

  const { error: lifestyleError } = await (supabase as any).from('student_lifestyle_preference').upsert({
    profile_id: userId,
    teaching_style: lifestyle_preference.teaching_style,
    desired_location_type: lifestyle_preference.desired_location_type as any,
    campus_size: lifestyle_preference.campus_size,
    extracurricular_interests: lifestyle_preference.extracurricular_interests,
    other_extracurriculars: lifestyle_preference.other_extracurriculars,
    leadership_roles: lifestyle_preference.leadership_roles,
    commitment_level: lifestyle_preference.commitment_level,
    key_activities: lifestyle_preference.key_activities,
    sat_score: lifestyle_preference.sat_score,
    act_score: lifestyle_preference.act_score,
    intl_experience: lifestyle_preference.intl_experience,
    work_experience: lifestyle_preference.work_experience,
    work_experience_summary: lifestyle_preference.work_experience_summary,
    ambition_statement: lifestyle_preference.ambition_statement,
    epq_subject: (lifestyle_preference as any).epq_subject ?? null,
    epq_title: (lifestyle_preference as any).epq_title ?? null,
  });
  if (lifestyleError) throw new Error(lifestyleError.message);

  // Structured activity entries (delete-then-insert).
  const { error: activitiesDeleteError } = await (supabase as any)
    .from('student_activities').delete().eq('profile_id', userId);
  if (activitiesDeleteError) throw new Error(activitiesDeleteError.message);
  if (payload.activities_list && payload.activities_list.length > 0) {
    const activityRows = payload.activities_list.map((a, i) => ({
      profile_id: userId,
      category: a.category,
      level: a.level ?? null,
      duration: a.duration ?? null,
      highlight: a.highlight ?? null,
      sort_order: a.sort_order ?? i,
    }));
    const { error: activitiesInsertError } = await (supabase as any)
      .from('student_activities').insert(activityRows);
    if (activitiesInsertError) throw new Error(activitiesInsertError.message);
  }

  const { error: subjectDeleteError } = await supabase.from('student_subjects').delete().eq('profile_id', userId);
  if (subjectDeleteError) throw new Error(subjectDeleteError.message);
  if (academic_input.subject_list.length > 0) {
    const subjectRows = academic_input.subject_list.map((subject) => ({
      profile_id: userId,
      subject_name: subject.subject_name,
      // Cast: generated DB types lag the schema (AP added by migration 20260611120000).
      level: subject.level as any,
      grade_value: subject.grade_value === null ? null : String(subject.grade_value)
    }));
    const { error: subjectInsertError } = await supabase.from('student_subjects').insert(subjectRows);
    if (subjectInsertError) throw new Error(subjectInsertError.message);
  }

  const { error: testsDeleteError } = await supabase.from('student_admissions_tests').delete().eq('profile_id', userId);
  if (testsDeleteError) throw new Error(testsDeleteError.message);
  if (academic_input.admissions_tests.length > 0) {
    const testRows = academic_input.admissions_tests.map((test) => ({
      profile_id: userId,
      test_type: test.test_type,
      status: test.status,
      score_numeric: test.score_numeric,
      percentile: test.percentile
    }));
    const { error: testInsertError } = await supabase.from('student_admissions_tests').insert(testRows);
    if (testInsertError) throw new Error(testInsertError.message);
  }

  // Score is best-effort (matches the original action's behavior).
  try {
    const scoring = scoreStudentProfile(payload);
    const { error: scoreError } = await supabase.from('student_scores').upsert({
      profile_id: userId,
      total_score: scoring.total_score,
      student_band: scoring.student_band,
      eligibility_flags: scoring.eligibility_flags,
      readiness_flags: scoring.readiness_flags,
      breakdown: scoring.breakdown
    });
    if (scoreError) throw new Error(scoreError.message);
  } catch (error) {
    console.error('Score computation failed', error);
  }

  // Profile changes must invalidate cached recommendations.
  const { error: matchCacheDeleteError } = await supabase.from('student_matches').delete().eq('profile_id', userId);
  if (matchCacheDeleteError) {
    console.warn('Failed to clear cached matches after profile save', matchCacheDeleteError);
  }
};
