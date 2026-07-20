import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit, clientIp } from '@/lib/api/rate-limit';

const MIN_QUERY_LENGTH = 2;
const LIMIT = 6;

// Anonymous route — no user id to key on, so throttle per client IP (see
// clientIp) to stop a scripted loop from hammering the catalogue.

// Suggestions are per-query-string public catalogue data — safe to cache per URL
// at the CDN. Mirrors the sibling search/filters + search/filter-options routes.
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

// Words that are almost certainly subject/course terms, not university-identifying words.
const SUBJECT_WORDS = new Set([
  'economics', 'law', 'science', 'sciences', 'engineering', 'business', 'finance',
  'medicine', 'arts', 'technology', 'management', 'computing', 'mathematics', 'maths',
  'physics', 'chemistry', 'biology', 'history', 'psychology', 'philosophy', 'politics',
  'sociology', 'literature', 'english', 'accounting', 'marketing', 'design', 'architecture',
  'education', 'nursing', 'dentistry', 'pharmacy', 'geography', 'languages', 'music',
  'theology', 'classics', 'anthropology', 'linguistics', 'statistics', 'data',
  'computer', 'software', 'electrical', 'mechanical', 'civil', 'chemical', 'biomedical',
  'environmental', 'media', 'journalism', 'communications', 'healthcare', 'social',
  'criminology', 'economics', 'international', 'global', 'development', 'sustainability',
  'neuroscience', 'biochemistry', 'genetics', 'mathematics'
]);

// Stop words that identify nothing on their own.
const STOP_WORDS = new Set(['university', 'college', 'institute', 'school', 'of', 'the', 'and', 'at', 'in', 'for']);

// Common university abbreviations → a distinctive substring of the full name.
const ABBREVIATIONS: Record<string, string> = {
  lse: 'london school of economics',
  mit: 'massachusetts institute of technology',
  ucl: 'university college london',
  nyu: 'new york university',
  ucla: 'los angeles',
  usc: 'southern california',
  cmu: 'carnegie mellon',
  kcl: "king's college",
  ic: 'imperial college',
  ubc: 'british columbia',
  anu: 'australian national',
  eth: 'eidgenössische technische',
  epfl: 'lausanne',
};

export async function GET(request: Request) {
  // Typeahead is chatty: a debounced query fires ~1 request per keystroke pause
  // plus a burst validating recent searches on mount. 120/min/IP absorbs a fast
  // typist and a shared-NAT lab (schools are a core demographic) while still
  // capping abuse. It's a soft limit — the client degrades a 429 to empty.
  if (!checkRateLimit(`suggestions:${clientIp(request)}`, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ programs: [], universities: [] }, {
      status: 429, headers: { 'Cache-Control': 'no-store' }
    });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const trending = url.searchParams.get('trending') === 'true';

  const supabase = createRouteHandlerSupabaseClient();

  if (!trending && query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ programs: [], universities: [] }, {
      status: 200, headers: { 'Cache-Control': 'no-store' }
    });
  }

  const programSelect = 'id,course_name,name,study_level,universities!inner(name,country,city,region)';
  const universitySelect = 'id,name,country,city,region';

  if (trending) {
    const [programsRes, universitiesRes] = await Promise.all([
      supabase.from('programs').select(programSelect).order('course_name', { ascending: true }).limit(LIMIT),
      supabase.from('universities').select(universitySelect).order('name', { ascending: true }).limit(LIMIT)
    ]);
    return NextResponse.json(
      { programs: programsRes.data ?? [], universities: universitiesRes.data ?? [] },
      { headers: CACHE_HEADERS }
    );
  }

  const words = query.split(/\s+/).filter((w) => w.length >= 2).map((w) => w.toLowerCase());
  // Words that could identify a university (not stop words, not pure subject terms)
  const uniWords = words.filter((w) => !STOP_WORDS.has(w) && !SUBJECT_WORDS.has(w));
  // Words that look like subject/course terms
  const subjectWords = words.filter((w) => !STOP_WORDS.has(w) && SUBJECT_WORDS.has(w));

  // ── University suggestions (autocomplete dropdown) ───────────────────────
  // AND-match all non-stop words so "oxford university" finds "University of Oxford".
  const allMeaningful = words.filter((w) => !STOP_WORDS.has(w));
  let universityQuery = supabase.from('universities').select(universitySelect).limit(LIMIT);
  if (allMeaningful.length > 0) {
    allMeaningful.forEach((w) => { universityQuery = universityQuery.ilike('name', `%${w}%`); });
  } else {
    universityQuery = universityQuery.ilike('name', `%${query}%`);
  }

  // ── Program suggestions ──────────────────────────────────────────────────
  // Strategy:
  //  1. If there are uni-identifying words, find well-known universities (recognition_score ≥ 6)
  //     matching those words. Filter programs from those unis, narrowed by subject words.
  //  2. If no high-recognition university found, search course_name using subject words
  //     (or uni words if no subject words exist).
  let programQuery = supabase.from('programs').select(programSelect).limit(LIMIT);

  let matchedUniIds: string[] = [];

  if (uniWords.length > 0) {
    // Try AND-match all uni-identifying words against well-known universities.
    // Known abbreviations (lse, mit, ucl…) are expanded to a distinctive substring.
    const recSelect = 'id,recognition_score';
    let uniLookup = (supabase as any).from('universities').select(recSelect).gte('recognition_score', 5).limit(200);
    uniWords.forEach((w) => {
      const expanded = ABBREVIATIONS[w] ?? w;
      uniLookup = uniLookup.ilike('name', `%${expanded}%`);
    });
    const { data: uniData } = await uniLookup;
    matchedUniIds = ((uniData ?? []) as Array<{ id: string; recognition_score: number }>)
      .sort((a, b) => b.recognition_score - a.recognition_score)
      .map((u) => u.id)
      .slice(0, 20);
  }

  if (matchedUniIds.length > 0) {
    // Found recognizable universities — show programs from them.
    programQuery = programQuery.in('university_id', matchedUniIds);
    // If there are subject words too (e.g. "cambridge economics"), narrow by course name.
    if (subjectWords.length > 0) {
      subjectWords.forEach((w) => { programQuery = programQuery.ilike('course_name', `%${w}%`); });
    }
  } else {
    // No recognizable university matched — search by subject/course terms.
    const courseTerms = subjectWords.length > 0 ? subjectWords : uniWords;
    if (courseTerms.length > 0) {
      // Use OR so single-word subject searches ("economics") are flexible,
      // and multi-word ("computer science") get both terms.
      // Avoid chaining ilike AND on different terms since "computer" AND "science"
      // would miss courses named just "Computer Science" if either word is missing.
      const firstTerm = courseTerms[0];
      programQuery = programQuery.ilike('course_name', `%${firstTerm}%`);
      // For multi-word subject queries, also filter by second term to stay relevant.
      if (courseTerms.length > 1) {
        programQuery = programQuery.ilike('course_name', `%${courseTerms[1]}%`);
      }
    } else {
      programQuery = programQuery.ilike('course_name', `%${query}%`);
    }
  }

  const [programsRes, universitiesRes] = await Promise.all([programQuery, universityQuery]);

  if (programsRes.error || universitiesRes.error) {
    console.error('[suggestions] error:', programsRes.error ?? universitiesRes.error);
    return NextResponse.json({ programs: [], universities: [] }, {
      status: 200, headers: { 'Cache-Control': 'no-store' }
    });
  }

  return NextResponse.json(
    { programs: programsRes.data ?? [], universities: universitiesRes.data ?? [] },
    { headers: CACHE_HEADERS }
  );
}
