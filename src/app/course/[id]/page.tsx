import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Suspense } from 'react';
import { CoursePageClient, type CourseRawData } from './CoursePageClient';
import { PROGRAMS_SELECT } from './_components/programs-select';
import CourseLoading from './loading';

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
