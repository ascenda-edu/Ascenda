import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Suspense } from 'react';
import { CoursePageClient, type CourseRawData } from './CoursePageClient';
import CourseLoading from './loading';

const PROGRAMS_SELECT = `
  id,
  course_name,
  course_summary,
  study_level,
  duration,
  campus,
  ucas_code,
  start_date,
  modules,
  assessment_methods,
  provider_course_url,
  provider_apply_url,
  min_alevel,
  min_ib,
  ucas_points,
  subject_requirements,
  entry_requirements_overview,
  additional_entry_requirements,
  subsequent_year_entry_requirements,
  english_requirements,
  contextual_admissions,
  tuition_fees_international,
  tuition_fees_home,
  additional_fee_info,
  student_satisfaction,
  employment_after_course,
  student_outcomes,
  average_salary_after_15m,
  historic_entry_grades,
  open_days,
  cost_of_life_override,
  placement_year,
  placement_year_detail,
  top_industries,
  average_starting_salary_gbp_override,
  student_dorm_cost_gbp_per_year_override,
  average_rent_outside_campus_gbp_per_month_override,
  study_abroad_option,
  metadata,
  yearly_international_tuition_fee_gbp,
  tuition,
  currency,
  universities (
    name,
    city,
    region,
    country,
    metadata,
    university_life,
    cultural_social_environment,
    city_life,
    climate,
    safety_index,
    transport_accessibility,
    number_of_students,
    student_to_staff_ratio,
    nss_score_pct,
    international_students_ratio_pct,
    graduate_employment_rate_pct,
    average_starting_salary_gbp,
    intl_tuition_low,
    intl_tuition_high,
    currency
  )
`;

export const revalidate = 3600;

export default async function CoursePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let initialData: CourseRawData | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('programs')
      .select(PROGRAMS_SELECT)
      .eq('id', params.id)
      .maybeSingle();

    if (error) {
      console.error('[CoursePage SSR] supabase error:', error);
    } else if (data) {
      const raw = data as Record<string, any>;
      initialData = {
        programData: raw,
        universityData: raw.universities ?? {},
      };
    }
  } catch (e) {
    console.error('[CoursePage SSR] exception:', e);
  }

  return (
    <Suspense fallback={<CourseLoading />}>
      <CoursePageClient params={params} initialData={initialData} />
    </Suspense>
  );
}
