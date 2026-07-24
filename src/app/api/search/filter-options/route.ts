import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

// Distinct filter-chip options for the search hub. The heavy lifting happens
// in the search_filter_options() SQL function (SELECT DISTINCT in the DB);
// this route just caches the result — the options change when the catalogue
// is re-imported, not per request.
export async function GET() {
  const supabase = await createRouteHandlerSupabaseClient();
  const { data, error } = await (supabase as any).rpc('search_filter_options');

  if (error) {
    return NextResponse.json({ error: error.message ?? 'Failed to load filter options' }, { status: 500 });
  }

  return NextResponse.json(data ?? {}, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600'
    }
  });
}
