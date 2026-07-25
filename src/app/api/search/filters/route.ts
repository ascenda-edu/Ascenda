import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { filterVisiblePrograms, getFlaggedProgramIds } from '@/lib/catalog/visibility';

const applyProgramVisibilityFilters = (query: any) => {
  const flagged = getFlaggedProgramIds();
  if (!flagged.length) return query;
  const formatted = flagged.map((id) => `"${id}"`).join(',');
  return query.not('id', 'in', `(${formatted})`);
};

export async function GET() {
  const supabase = await createRouteHandlerSupabaseClient();

  const flaggedIds = getFlaggedProgramIds();

  const [programsResponse, universitiesResponse] = await Promise.all([
    applyProgramVisibilityFilters(
      supabase
        .from('programs')
        .select('id,course_name,name,university_id,metadata')
        .limit(1200)
    ),
    supabase.from('universities').select('id,name').order('name', { ascending: true })
  ]);

  if (programsResponse.error || universitiesResponse.error) {
    const error = programsResponse.error ?? universitiesResponse.error;
    return NextResponse.json({ error: error?.message ?? 'Failed to load filters' }, { status: 500 });
  }

  const normalizedPrograms = filterVisiblePrograms((programsResponse.data ?? []).map((program: any) => ({
    id: program.id,
    metadata: program.metadata ?? null
  }))).map((program) => program.id);
  const visibleIds = new Set(normalizedPrograms);

  const filterOptions = (programsResponse.data ?? [])
    .filter((program: any) => {
      if (flaggedIds.length && flaggedIds.includes(program.id.toLowerCase())) return false;
      return visibleIds.has(program.id);
    })
    .map((program: any) => ({
      programName: program.course_name ?? program.name ?? 'Program',
      universityId: program.university_id
    }));

  const uniqueProgramOptions = Array.from(
    filterOptions.reduce((acc: any, option: any) => {
      const key = `${option.universityId ?? 'unknown'}|${option.programName}`;
      if (!acc.has(key)) {
        acc.set(key, option);
      }
      return acc;
    }, new Map<string, typeof filterOptions[number]>()).values()
  );

  const universities =
    (universitiesResponse.data ?? []).map((uni) => ({ id: uni.id, name: uni.name })).filter((uni) => !!uni.name);

  return NextResponse.json(
    {
      programs: uniqueProgramOptions,
      universities
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300'
      }
    }
  );
}
