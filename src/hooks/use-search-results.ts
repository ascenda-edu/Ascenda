'use client';

// ---------------------------------------------------------------------------
// useSearchResults — the data layer behind the unified live university-search
// page (/university-search/search). It owns every Supabase read the results
// grid needs: paginated program rows, a best-effort total count, and the
// drill-down labels for the program/university chips.
//
// The query strategy here was probed against the live DB (2026-07-23). Several
// choices look like they could be "simplified" but each simplification
// reintroduces a statement timeout (Postgres error 57014) that was observed in
// practice. The load-bearing ones are called out with NOTE/WHY comments — do
// not collapse them.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { filterVisiblePrograms, getFlaggedProgramIds } from '@/lib/catalog/visibility';
import { type ProgramSearchResult, tierFromScore } from '@/components/university-search/types';
import type { SearchFilters } from '@/lib/university-search/search-params';

export interface SearchResultsState {
  results: ProgramSearchResult[]; // loaded, in server order (all pages so far)
  isLoading: boolean; // page-0 load in flight (filters changed)
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  totalCount: number | null; // best-effort exact count; null = unknown
  loadMore: () => void;
  /** labels for drill-down chips when filters.programId/universityId set */
  programLabel: string | null;
  universityLabel: string | null;
}

const PAGE_SIZE = 50;
// Ranking sort pages through universities in cohorts of this many unis at a
// time (see the cohort-pagination block for WHY offset ordering can't be used).
const RANK_COHORT_BATCH = 8;

// Very common name-tokens that don't help identify a specific university — kept
// in sync with the legacy /results text-search heuristic we're replacing.
const SKIP_WORDS = new Set(['university', 'college', 'institute', 'school', 'of', 'the', 'and']);

// ---------------------------------------------------------------------------
// Shape of a program row as selected below. Mirrors the legacy results page so
// the row → ProgramSearchResult mapping stays identical.
// ---------------------------------------------------------------------------
type ProgramRow = {
  id: string;
  university_id?: string | null;
  course_name: string;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
  study_level?: string | null;
  level?: string | null;
  duration?: string | null;
  duration_years?: number | null;
  start_date?: string | null;
  intake_months?: string[] | null;
  tuition?: number | null;
  currency?: string | null;
  universities?: {
    id?: string | null;
    name?: string | null;
    country?: string | null;
    city?: string | null;
    region?: string | null;
    acceptance_rate?: number | null;
    requires_test?: boolean | null;
    intl_tuition_low?: number | null;
    intl_tuition_high?: number | null;
    currency?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
};

type UniListRow = {
  id: string;
  name: string;
  country: string | null;
  recognition_score: number | null;
  rank_overall: number | null;
};

// ---------------------------------------------------------------------------
// Module-level cache. The universities list (~2,926 rows) is fetched once for
// the whole session and shared across every mount of the hook — it never
// changes within a session and re-fetching it per filter change was pure waste.
// (The auth user id is deliberately NOT cached here — see loadMatchScores.)
// ---------------------------------------------------------------------------
let universitiesCache: UniListRow[] | null = null;
let universitiesPromise: Promise<UniListRow[]> | null = null;

const loadUniversities = async (
  supabase: ReturnType<typeof getBrowserSupabaseClient>
): Promise<UniListRow[]> => {
  if (universitiesCache) return universitiesCache;
  if (!universitiesPromise) {
    // Deliberately NOT abort-scoped: this is a shared, session-long cache, so a
    // single component unmounting must not poison it for everyone else.
    universitiesPromise = (async () => {
      const { data, error } = await supabase
        .from('universities')
        .select('id, name, country, recognition_score, rank_overall');
      if (error) {
        universitiesPromise = null; // allow a retry on the next call
        throw error;
      }
      const rows = ((data ?? []) as UniListRow[]).filter((u) => u.id && u.name);
      universitiesCache = rows;
      return rows;
    })();
  }
  return universitiesPromise;
};

// ---------------------------------------------------------------------------
// Cursor + request spec. Offset pagination for most sorts; a two-part cursor
// for the ranking cohort walk (see below).
// ---------------------------------------------------------------------------
type Cursor =
  | { kind: 'offset'; page: number }
  | { kind: 'cohort'; uniIndex: number; offsetInCohort: number };

interface RequestSpec {
  filtersKey: string;
  cursor: Cursor;
  isFirstPage: boolean;
}

// Ranking sort uses cohort pagination, everything else uses plain offset — this
// decides which at reset time. Ranking falls back to offset when free-text `q`
// or a drill-down id is active (see NOTE in the fetch body).
const makeInitialCursor = (f: SearchFilters): Cursor =>
  f.sort === 'ranking' && !f.q.trim() && !f.programId && !f.universityId
    ? { kind: 'cohort', uniIndex: 0, offsetInCohort: 0 }
    : { kind: 'offset', page: 0 };

// ---------------------------------------------------------------------------
// Free-text resolution — preserved from the legacy /results heuristic. Matches
// university names in-memory (AND across words), with a single-most-specific
// word fallback, then narrows by leftover course-name words. NEVER builds an
// `.or()` string containing university names (PostgREST parse crash — see
// CLAUDE.md gotcha); constrains by resolved university ids instead.
// ---------------------------------------------------------------------------
interface TextResolution {
  /** resolved university ids (already capped at 100), or null to use the course-name path */
  uniIds: string[] | null;
  /** course-name words to AND-match via ilike */
  courseWords: string[];
}

const sanitizeSearchValue = (value: string) =>
  value.replace(/[(),%_]/g, ' ').replace(/\s+/g, ' ').trim();

const resolveText = (
  unis: UniListRow[],
  rawQuery: string,
  drillActive: boolean
): TextResolution | null => {
  if (drillActive) return null;
  const safe = sanitizeSearchValue(rawQuery);
  if (!safe) return null;

  const normalizedQ = safe.toLowerCase();
  const words = normalizedQ.split(/\s+/).filter((w) => w.length >= 2);

  const lookup = (mustMatch: string[]): string[] =>
    unis
      .filter((u) => mustMatch.every((w) => (u.name?.toLowerCase() ?? '').includes(w)))
      .map((u) => u.id)
      .slice(0, 100);

  let matchedUniIds: string[] = [];
  if (words.length > 0) {
    matchedUniIds = lookup(words);
    if (matchedUniIds.length === 0 && words.length > 1) {
      // Nothing matched all words — try each meaningful word alone and keep the
      // most specific (fewest matches).
      const candidates = words.filter((w) => !SKIP_WORDS.has(w));
      for (const word of candidates) {
        const ids = lookup([word]);
        if (ids.length > 0 && (matchedUniIds.length === 0 || ids.length < matchedUniIds.length)) {
          matchedUniIds = ids;
        }
      }
    }
  }

  if (matchedUniIds.length > 0) {
    // Narrow by course-name words that aren't just re-stating the university
    // name (e.g. "oxford economics" → also ilike course_name for "economics").
    const matchedSet = new Set(matchedUniIds);
    const uniNameWords = unis
      .filter((u) => matchedSet.has(u.id))
      .flatMap((u) => (u.name?.toLowerCase() ?? '').split(/\s+/));
    const extraWords = words.filter((w) => !SKIP_WORDS.has(w) && !uniNameWords.includes(w));
    return { uniIds: matchedUniIds, courseWords: extraWords };
  }

  // No university matched — fall back to course-name search.
  if (words.length > 1) return { uniIds: null, courseWords: words };
  return { uniIds: null, courseWords: [normalizedQ] };
};

// ---------------------------------------------------------------------------
// University-side facet resolution. countries / ranking band / testOptional all
// resolve to a predicate over the in-memory universities list.
// ---------------------------------------------------------------------------
const rankingGteFor = (ranking: SearchFilters['ranking']): number | null =>
  ranking === 'topTier' ? 8 : ranking === 'wellKnown' ? 5 : null;

// ---------------------------------------------------------------------------
// The resolved WHERE context, shared by the data query and the count query so
// they can never disagree.
// ---------------------------------------------------------------------------
type UniConstraint =
  | { kind: 'none' }
  | { kind: 'empty' } // no university can match — short-circuit to zero results
  | { kind: 'in'; ids: string[] }
  | {
      kind: 'embedded';
      countries: string[];
      recognitionGte: number | null;
    };

interface QueryCtx {
  flaggedIds: string[];
  drillProgramId: string | null;
  drillUniversityId: string | null;
  subjects: string[];
  levels: string[];
  tuitionMin: number | null;
  tuitionMax: number | null;
  tuitionNotNull: boolean;
  /** Test-optional: exclude programmes whose admission_test = 'Required'. */
  testOptional: boolean;
  uni: UniConstraint;
  courseWords: string[];
}

// Excludes flagged/demo programs from the query itself (a client-side pass in
// filterVisiblePrograms catches metadata-flagged rows the id list can't).
const applyVisibility = (query: any, flaggedIds: string[]) => {
  if (!flaggedIds.length) return query;
  const formatted = flaggedIds.map((id) => `"${id}"`).join(',');
  return query.not('id', 'in', `(${formatted})`);
};

// Applies every WHERE predicate (no order, no range). Used verbatim by both the
// data query and the count query.
const applyWhere = (query: any, ctx: QueryCtx, includeCourseWords: boolean) => {
  let q = applyVisibility(query, ctx.flaggedIds);

  // Drill-down ids (Suggestion click-through).
  if (ctx.drillProgramId) q = q.eq('id', ctx.drillProgramId);
  if (ctx.drillUniversityId) q = q.eq('university_id', ctx.drillUniversityId);

  // Program-side facets — direct, indexed columns. subjects → field is an exact
  // match (NOT ilike): `field` is indexed and the facet values come straight
  // from /api/search/filter-options, so ilike would only add cost + timeout risk.
  if (ctx.subjects.length) q = q.in('field', ctx.subjects);
  if (ctx.levels.length) q = q.in('study_level', ctx.levels);
  if (ctx.tuitionMin !== null) q = q.gte('yearly_international_tuition_fee_gbp', ctx.tuitionMin);
  if (ctx.tuitionMax !== null) q = q.lte('yearly_international_tuition_fee_gbp', ctx.tuitionMax);
  // tuition-desc guard (see the sort block) — also applied to the count so the
  // two queries describe the same set.
  if (ctx.tuitionNotNull) q = q.not('yearly_international_tuition_fee_gbp', 'is', null);

  // Test-optional — a PROGRAM-side constraint (universities.requires_test is
  // false for every row, so the old uni-side filter was inert). Exclude
  // programmes that REQUIRE a test. Plain `.neq('Required')` alone would also
  // drop rows where admission_test is null, so OR the null case back in. Fixed
  // literals only — never user input in `.or` (PostgREST parse safety).
  if (ctx.testOptional) q = q.or('admission_test.is.null,admission_test.neq.Required');

  // University-side facets.
  switch (ctx.uni.kind) {
    case 'in':
      // Fast bitmap-index path. Only taken when the resolved id set is ≤ 200,
      // otherwise the URL blows past PostgREST's length limit.
      q = q.in('university_id', ctx.uni.ids);
      break;
    case 'embedded':
      // Broad selections (> 200 unis) filter through the embedded !inner join
      // instead of an oversized id list. Verified fast for broad sets.
      if (ctx.uni.countries.length) q = q.in('universities.country', ctx.uni.countries);
      if (ctx.uni.recognitionGte !== null) {
        q = q.gte('universities.recognition_score', ctx.uni.recognitionGte);
      }
      break;
    case 'empty':
    case 'none':
    default:
      break;
  }

  // Free-text leftover course-name words (never applied to the count — count is
  // skipped whenever text search is active because ilike counts time out).
  if (includeCourseWords) {
    ctx.courseWords.forEach((w) => {
      q = q.ilike('course_name', `%${w}%`);
    });
  }

  return q;
};

// Program-row select. The embedded universities block MUST include `metadata`
// (logo extraction) and the fields the card mapping reads. Join type is `!left`
// normally; `!inner` only on the embedded-facet path so the embedded filters
// actually constrain the parent.
const buildSelect = (join: '!left' | '!inner') => `
  id,
  course_name,
  name,
  university_id,
  study_level,
  level,
  duration,
  duration_years,
  start_date,
  intake_months,
  tuition,
  currency,
  metadata,
  universities${join} (
    id,
    name,
    country,
    city,
    region,
    acceptance_rate,
    requires_test,
    intl_tuition_low,
    intl_tuition_high,
    currency,
    metadata
  )
`;

// ---------------------------------------------------------------------------
// Card label normalisation. Raw programs.duration is free-text and frequently
// garbage ("4F or 8P", "1 Years", duplicated fragments) — never render it. The
// helpers below produce clean, display-ready labels or null (no pill).
// ---------------------------------------------------------------------------
const formatYears = (n: number): string => (n === 1 ? '1 year' : `${n} years`);

const normalizeDurationLabel = (
  duration: string | null,
  durationYears: number | null
): string | null => {
  if (
    durationYears !== null &&
    Number.isFinite(durationYears) &&
    durationYears > 0 &&
    durationYears <= 10
  ) {
    return formatYears(durationYears);
  }
  if (duration) {
    const yearMatch = duration.match(/(\d+(?:\.\d+)?)\s*(?:year|yr)/i);
    if (yearMatch) {
      const n = Number.parseFloat(yearMatch[1]);
      if (Number.isFinite(n) && n > 0) return formatYears(n);
    }
    const monthMatch = duration.match(/(\d+)\s*month/i);
    if (monthMatch) {
      const n = Number.parseInt(monthMatch[1], 10);
      if (Number.isFinite(n) && n > 0) return `${n} months`;
    }
  }
  return null;
};

const normalizeLevelLabel = (level: string | null): string | null => {
  if (!level) return null;
  const trimmed = level.trim();
  if (!trimmed) return null;
  // Title-case: capitalise the first letter of each word, lowercase the rest.
  return trimmed.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
};

const currencySymbol = (currency: string | null): string => {
  if (!currency) return '';
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
};

const buildTuitionLabel = (
  tuition: number | null,
  currency: string | null,
  intlLow: number | null,
  intlHigh: number | null
): string | null => {
  if (tuition !== null && Number.isFinite(tuition)) {
    return `${currencySymbol(currency)}${tuition.toLocaleString('en-GB')}/yr`;
  }
  if (
    intlLow !== null &&
    intlHigh !== null &&
    Number.isFinite(intlLow) &&
    Number.isFinite(intlHigh)
  ) {
    const sym = currencySymbol(currency);
    return `≈${sym}${Math.round(intlLow / 1000)}k–${Math.round(intlHigh / 1000)}k/yr`;
  }
  return null;
};

const mapRows = (
  rows: ProgramRow[],
  uniNameById: Map<string, string>,
  scores: Record<string, number>
): ProgramSearchResult[] =>
  rows.map((program) => {
    const uni = program.universities;
    const uniId = (uni?.id ?? program.university_id) ?? undefined;
    const uniName =
      typeof uni?.name === 'string' && uni.name.trim()
        ? uni.name.trim()
        : uniId
          ? uniNameById.get(uniId) ?? null
          : null;
    const uniMetadata =
      uni && typeof uni.metadata === 'object' && uni.metadata !== null
        ? (uni.metadata as Record<string, unknown>)
        : {};
    const logoUrl =
      typeof uniMetadata.logo_url === 'string'
        ? (uniMetadata.logo_url as string)
        : typeof uniMetadata.logoUrl === 'string'
          ? (uniMetadata.logoUrl as string)
          : undefined;
    const location = [uni?.city, uni?.region, uni?.country].filter(Boolean).join(', ');
    const score = scores[program.id];
    const tier = tierFromScore(score);
    const programName = program.course_name ?? program.name ?? 'Program';
    const level = program.study_level ?? program.level ?? null;
    const currency = program.currency ?? uni?.currency ?? null;
    const durationLabel = normalizeDurationLabel(
      program.duration ?? null,
      program.duration_years ?? null
    );
    const levelLabel = normalizeLevelLabel(level);
    const tuitionLabel = buildTuitionLabel(
      program.tuition ?? null,
      currency,
      uni?.intl_tuition_low ?? null,
      uni?.intl_tuition_high ?? null
    );
    return {
      id: program.id,
      universityId: uniId,
      universityName: uniName ?? 'University',
      programName,
      location: location || 'Location unavailable',
      country: uni?.country ?? null,
      logoUrl: logoUrl ?? null,
      fitScore: score ?? null,
      tier: tier ?? null,
      // Legacy consumers read `highlights` — build it from the clean labels so
      // no raw duration/level garbage leaks through.
      highlights: [levelLabel, durationLabel].filter(Boolean) as string[],
      durationLabel,
      levelLabel,
      tuitionLabel,
      acceptanceRate: uni?.acceptance_rate ?? null,
      duration: durationLabel,
      intlTuitionLow: uni?.intl_tuition_low ?? null,
      intlTuitionHigh: uni?.intl_tuition_high ?? null,
      requiresTest: uni?.requires_test ?? null,
      tuition: program.tuition ?? null,
      currency,
      studyLevel: level,
    };
  });

// Orders a fetched page by fit score, descending, with unknown-fit rows last.
//
// Fit is a per-profile number that does not exist in the `programs` table, so
// it CANNOT be an `.order()` — it is resolved after the page arrives (see
// loadMatchScores). Ordering therefore happens here, over the page. The DB
// order stays `id asc` so offset pagination remains stable and non-repeating;
// this only decides how the rows within each page are presented, and appended
// pages are never reshuffled (rows the user has already read stay put).
//
// The `id` tiebreaker keeps the comparator total: `Array.prototype.sort` is
// stable, but tied fit scores are the norm (chance_percent is an integer), and
// a total comparator makes the rendered order reproducible for a given page.
export const sortByFit = (rows: ProgramSearchResult[]): ProgramSearchResult[] =>
  [...rows].sort((a, b) => {
    const av = typeof a.fitScore === 'number' && Number.isFinite(a.fitScore) ? a.fitScore : null;
    const bv = typeof b.fitScore === 'number' && Number.isFinite(b.fitScore) ? b.fitScore : null;
    if (av !== bv) {
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    }
    return a.id.localeCompare(b.id);
  });

const friendlyError = (fetchError: unknown): string => {
  const message =
    fetchError instanceof Error
      ? fetchError.message
      : typeof fetchError === 'object' && fetchError !== null && 'message' in fetchError
        ? String((fetchError as { message?: unknown }).message)
        : null;
  // Supabase errors are plain objects, not Error instances — never render the
  // raw JSON blob to the user.
  return message && !message.startsWith('{') && !message.startsWith('[')
    ? message
    : 'Something went wrong loading results. Please try again.';
};

export function useSearchResults(filters: SearchFilters): SearchResultsState {
  const [results, setResults] = useState<ProgramSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [programLabel, setProgramLabel] = useState<string | null>(null);
  const [universityLabel, setUniversityLabel] = useState<string | null>(null);

  // A stable serialization of every SERVER-relevant filter field. `tiers` is a
  // client-only fit-tier filter over already-loaded rows, so it is deliberately
  // excluded — changing it must NOT trigger a refetch.
  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        q: filters.q.trim(),
        countries: filters.countries,
        subjects: filters.subjects,
        levels: filters.levels,
        tuitionMin: filters.tuitionMin,
        tuitionMax: filters.tuitionMax,
        ranking: filters.ranking,
        testOptional: filters.testOptional,
        sort: filters.sort,
        programId: filters.programId,
        universityId: filters.universityId,
      }),
    [filters]
  );

  // Refs the fetch/loadMore paths read without re-subscribing to renders.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const filtersKeyRef = useRef(filtersKey);
  filtersKeyRef.current = filtersKey;
  const requestSpecRef = useRef<RequestSpec | null>(null);
  const nextCursorRef = useRef<Cursor | null>(null);
  const rankedIdsRef = useRef<string[]>([]); // ranked uni ids for the active cohort walk
  // On-demand fit scores already computed this session (program id → score),
  // keyed by user so an in-tab auth change can't leak another user's scores.
  const onDemandScoresRef = useRef<{ userId: string; scores: Map<string, number> } | null>(null);
  const stateRef = useRef({ isLoading, isLoadingMore, hasMore });
  stateRef.current = { isLoading, isLoadingMore, hasMore };

  // requestId is the fetch trigger. Bumped by the reset effect (filters changed)
  // and by loadMore. 0 = nothing requested yet.
  const [requestId, setRequestId] = useState(0);

  // Reset + fire page 0 whenever the server-relevant filters change.
  useEffect(() => {
    requestSpecRef.current = {
      filtersKey: filtersKeyRef.current,
      cursor: makeInitialCursor(filtersRef.current),
      isFirstPage: true,
    };
    nextCursorRef.current = null;
    rankedIdsRef.current = [];
    setResults([]);
    setHasMore(true);
    setError(null);
    setTotalCount(null);
    setProgramLabel(null);
    setUniversityLabel(null);
    setIsLoading(true);
    setIsLoadingMore(false);
    setRequestId((id) => id + 1);
  }, [filtersKey]);

  // The one fetch effect. Keyed on requestId so both "filters changed" and
  // "load more" flow through the same abortable cycle.
  useEffect(() => {
    if (requestId === 0) return; // reset effect hasn't fired yet
    const spec = requestSpecRef.current;
    if (!spec) return;

    const controller = new AbortController();
    const signal = controller.signal;
    const { cursor, isFirstPage } = spec;

    const run = async () => {
      if (isFirstPage) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const supabase = getBrowserSupabaseClient();
        const f = filtersRef.current;
        const flaggedIds = getFlaggedProgramIds();
        const unis = await loadUniversities(supabase);
        if (signal.aborted) return;

        const uniNameById = new Map(unis.map((u) => [u.id, u.name] as const));

        // Drill-down labels (page 0 only).
        if (isFirstPage) {
          setUniversityLabel(
            f.universityId ? uniNameById.get(f.universityId) ?? null : null
          );
          if (f.programId) {
            const { data: prog } = await supabase
              .from('programs')
              .select('course_name')
              .eq('id', f.programId)
              .abortSignal(signal)
              .maybeSingle();
            if (signal.aborted) return;
            setProgramLabel((prog as { course_name?: string } | null)?.course_name ?? null);
          } else {
            setProgramLabel(null);
          }
        }

        const drillActive = Boolean(f.programId || f.universityId);

        // --- Resolve university-side facets (predicate over the uni list). ----
        const recognitionGte = rankingGteFor(f.ranking);
        const countrySet = new Set(f.countries);
        // testOptional is NO LONGER a university-side facet (it's applied
        // program-side in applyWhere) — it must not narrow the uni set.
        const facetActive = f.countries.length > 0 || recognitionGte !== null;
        const facetPredicate = (u: UniListRow) => {
          if (countrySet.size && !(u.country && countrySet.has(u.country))) return false;
          if (recognitionGte !== null && (u.recognition_score ?? -Infinity) < recognitionGte) {
            return false;
          }
          return true;
        };
        const facetMatched = facetActive ? unis.filter(facetPredicate) : unis;
        const facetMatchedIds = facetMatched.map((u) => u.id);

        // --- Free-text resolution. -------------------------------------------
        const text = resolveText(unis, f.q, drillActive);

        // --- Combine facet + text into a single university constraint. -------
        let uni: UniConstraint = { kind: 'none' };
        if (facetActive && facetMatchedIds.length === 0) {
          uni = { kind: 'empty' };
        } else if (text?.uniIds && text.uniIds.length > 0) {
          // Text pins us to a small set of uni ids. Intersect with the facet
          // predicate in-memory so the two constraints compose into ONE `.in`.
          const candidates = facetActive
            ? text.uniIds.filter((id) => facetMatched.some((u) => u.id === id))
            : text.uniIds;
          uni = candidates.length ? { kind: 'in', ids: candidates } : { kind: 'empty' };
        } else if (facetActive) {
          // No text id constraint — use the facet set directly, choosing the
          // fast bitmap path (≤200) or the embedded-join path (>200).
          uni =
            facetMatchedIds.length <= 200
              ? { kind: 'in', ids: facetMatchedIds }
              : {
                  kind: 'embedded',
                  countries: f.countries,
                  recognitionGte,
                };
        }

        // Short-circuit: nothing can match, so don't hit the DB at all.
        if (uni.kind === 'empty') {
          if (signal.aborted) return;
          setResults([]);
          setHasMore(false);
          setTotalCount(0);
          nextCursorRef.current = null;
          return;
        }

        const courseWords = text?.courseWords ?? [];

        // ------------------------------------------------------------------
        // RANKING SORT — cohort pagination.
        //
        // We can't `.order('universities(rank_overall)')`: the planner handles
        // embedded ordering unreliably on 119k rows and times out. Instead we
        // derive the ranked uni ids (rank_overall asc) in memory, then append
        // the facet-matched UNRANKED unis (recognition_score desc, nulls last,
        // then name asc) as trailing cohorts, and page through programs one
        // small cohort of unis at a time — without ever asking Postgres to sort
        // across the join. Ordering is exact BETWEEN cohorts (cohorts are
        // visited in this derived order); WITHIN a cohort programs are only
        // alphabetical by course_name, not globally rank-ordered.
        //
        // NOTE: only used when there's no free-text `q` and no drill-down. When
        // `q` is active, ranking falls back to fit behaviour (offset, no order)
        // — intersecting ranked ids with text-matched ids per page isn't worth
        // the complexity for the payoff.
        // ------------------------------------------------------------------
        if (cursor.kind === 'cohort') {
          // Ranked cohort is facet-aware: apply the facet predicate first, then
          // rank order. Recomputed per fetch (cheap, in-memory) and cached in a
          // ref so hasMore can compare against its length. Ranked unis lead
          // (rank_overall asc); unranked facet-matched unis follow so a
          // ranking sort never silently drops them — recognition_score desc
          // (nulls last), then name asc.
          const ranked = facetMatched
            .filter((u) => u.rank_overall !== null)
            .sort((a, b) => (a.rank_overall as number) - (b.rank_overall as number));
          const unranked = facetMatched
            .filter((u) => u.rank_overall === null)
            .sort((a, b) => {
              const ra = a.recognition_score ?? -Infinity;
              const rb = b.recognition_score ?? -Infinity;
              if (rb !== ra) return rb - ra;
              return (a.name ?? '').localeCompare(b.name ?? '');
            });
          const rankedIds = [...ranked, ...unranked].map((u) => u.id);
          rankedIdsRef.current = rankedIds;

          const batch = rankedIds.slice(cursor.uniIndex, cursor.uniIndex + RANK_COHORT_BATCH);
          if (batch.length === 0) {
            if (signal.aborted) return;
            if (isFirstPage) setResults([]);
            setHasMore(false);
            setTotalCount(null);
            nextCursorRef.current = null;
            return;
          }

          const ctx: QueryCtx = {
            flaggedIds,
            drillProgramId: null,
            drillUniversityId: null,
            subjects: f.subjects,
            levels: f.levels,
            tuitionMin: f.tuitionMin,
            tuitionMax: f.tuitionMax,
            tuitionNotNull: false,
            testOptional: f.testOptional,
            uni: { kind: 'none' }, // uni set is expressed via the batch `.in` below
            courseWords: [],
          };

          let query = applyWhere(supabase.from('programs').select(buildSelect('!left')), ctx, false);
          query = query
            .in('university_id', batch)
            .order('course_name', { ascending: true })
            // Unique PK tiebreaker: offset pagination WITHIN a cohort without a
            // fully-unique order can skip/duplicate rows across pages when
            // course_name ties. `id` is the PK, so it disambiguates every row.
            .order('id', { ascending: true })
            .range(cursor.offsetInCohort, cursor.offsetInCohort + PAGE_SIZE - 1)
            .abortSignal(signal);

          const { data, error: qErr } = await query;
          if (qErr) throw qErr;
          if (signal.aborted) return;

          const rawRows = (data ?? []) as ProgramRow[];
          const rawCount = rawRows.length;
          const scores = await loadMatchScores(supabase, rawRows, signal);
          if (signal.aborted) return;
          const mapped = mapRows(filterVisiblePrograms(rawRows), uniNameById, scores);

          const full = rawCount === PAGE_SIZE;
          const next: Cursor = full
            ? { kind: 'cohort', uniIndex: cursor.uniIndex, offsetInCohort: cursor.offsetInCohort + PAGE_SIZE }
            : { kind: 'cohort', uniIndex: cursor.uniIndex + RANK_COHORT_BATCH, offsetInCohort: 0 };
          const more = full || next.uniIndex < rankedIds.length;

          commitPage({ mapped, isFirstPage, more, next, signal });
          // Cohort pagination has no single filtered count (the ranked-id
          // restriction would need >200 UUIDs in the URL) — leave totalCount
          // unknown.
          if (isFirstPage && !signal.aborted) setTotalCount(null);
          return;
        }

        // ------------------------------------------------------------------
        // OFFSET PATH — fit / tuition / name (and ranking-with-q fallback).
        // ------------------------------------------------------------------
        const tuitionNotNull = f.sort === 'tuition-desc';
        const ctx: QueryCtx = {
          flaggedIds,
          drillProgramId: f.programId,
          drillUniversityId: f.universityId,
          subjects: f.subjects,
          levels: f.levels,
          tuitionMin: f.tuitionMin,
          tuitionMax: f.tuitionMax,
          tuitionNotNull,
          testOptional: f.testOptional,
          uni,
          courseWords,
        };

        const join = uni.kind === 'embedded' ? '!inner' : '!left';
        let query = applyWhere(supabase.from('programs').select(buildSelect(join)), ctx, true);

        // Sort. `fit` (and the ranking-with-q fallback) add NO DB order: fit is
        // a per-profile score with no column to order on, so the page is
        // fetched in PK order and then ordered by fit in memory (sortByFit,
        // applied after the scores land below).
        switch (f.sort) {
          case 'tuition-asc':
            query = query.order('yearly_international_tuition_fee_gbp', {
              ascending: true,
              nullsFirst: false,
            });
            break;
          case 'tuition-desc':
            // The not-null guard (added via ctx.tuitionNotNull in applyWhere) is
            // REQUIRED: without it the backward index scan can't be used and the
            // query times out. Verified.
            query = query.order('yearly_international_tuition_fee_gbp', {
              ascending: false,
              nullsFirst: false,
            });
            break;
          case 'name':
            query = query.order('course_name', { ascending: true });
            break;
          case 'ranking':
          case 'fit':
          default:
            break;
        }

        // Unique PK tiebreaker for offset pagination. Without a fully-unique
        // order, Postgres OFFSET can skip or duplicate rows between pages when
        // the sort key ties (or, for `fit`, when there's no order at all). `id`
        // is the PK: for `fit`/ranking-fallback it becomes the base order; for
        // tuition/name sorts it's a secondary tiebreaker.
        query = query.order('id', { ascending: true });

        const from = cursor.page * PAGE_SIZE;
        query = query.range(from, from + PAGE_SIZE - 1).abortSignal(signal);

        // Best-effort count, fired in PARALLEL and NEVER combined with the data
        // query (combining count with a filtered+ordered select times out).
        // Skipped when free-text is active (ilike counts time out), for the
        // ranking-with-q fallback, and for the embedded-join path.
        const countEligible =
          isFirstPage && !text && f.sort !== 'ranking' && uni.kind !== 'embedded';
        const countPromise: Promise<number | null> = countEligible
          ? applyWhere(
              supabase.from('programs').select('id', { head: true, count: 'exact' }),
              ctx,
              false
            )
              .abortSignal(signal)
              .then((r: { count: number | null; error: unknown }) => (r.error ? null : r.count))
              .catch(() => null)
          : Promise.resolve(null);

        const { data, error: qErr } = await query;
        if (qErr) throw qErr;
        if (signal.aborted) return;

        const rawRows = (data ?? []) as ProgramRow[];
        const rawCount = rawRows.length;
        const scores = await loadMatchScores(supabase, rawRows, signal);
        if (signal.aborted) return;
        const mappedRows = mapRows(filterVisiblePrograms(rawRows), uniNameById, scores);
        // The default sort is labelled "fit" — make it mean it.
        const mapped = f.sort === 'fit' ? sortByFit(mappedRows) : mappedRows;

        // hasMore is derived from the RAW page size only — never from count.
        const more = rawCount === PAGE_SIZE;
        const next: Cursor = { kind: 'offset', page: cursor.page + 1 };
        commitPage({ mapped, isFirstPage, more, next, signal });

        if (isFirstPage) {
          const cnt = await countPromise;
          if (!signal.aborted) setTotalCount(cnt);
        }
      } catch (fetchError) {
        if (signal.aborted) return; // superseded request — ignore
        console.error('[useSearchResults] fetch error:', fetchError);
        setError(friendlyError(fetchError));
        if (isFirstPage) {
          setResults([]);
          setHasMore(false);
          setTotalCount(null);
        }
        // On a loadMore failure, leave the already-loaded results untouched.
      } finally {
        if (!signal.aborted) {
          if (isFirstPage) setIsLoading(false);
          else setIsLoadingMore(false);
        }
      }
    };

    // Loads per-page fit scores for the signed-in student and returns an
    // id→score map. Best-effort: a failure just yields no scores.
    async function loadMatchScores(
      supabase: ReturnType<typeof getBrowserSupabaseClient>,
      rows: ProgramRow[],
      sig: AbortSignal
    ): Promise<Record<string, number>> {
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return {};
      // Read the identity per fetch from the local session (no network — the
      // session is cached in storage by supabase-js). A module-level cache went
      // stale after an in-tab auth change (sign in/out) and attributed scores to
      // the wrong / a signed-out user.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;
      if (!userId || sig.aborted) return {};
      const { data, error: matchErr } = await supabase
        .from('student_matches')
        .select('program_id, score')
        .eq('profile_id', userId)
        .in('program_id', ids)
        .abortSignal(sig);
      const scores =
        matchErr || !data
          ? {}
          : data.reduce<Record<string, number>>((acc, entry) => {
              const raw = (entry as { program_id: string; score: unknown }).score;
              const numeric =
                typeof raw === 'string'
                  ? Number.parseFloat(raw)
                  : typeof raw === 'number'
                    ? raw
                    : null;
              if (numeric !== null && Number.isFinite(numeric)) {
                acc[(entry as { program_id: string }).program_id] = numeric;
              }
              return acc;
            }, {});

      // student_matches only caches the student's ranked top-N — anything the
      // search surfaces outside that set is scored on demand so every card
      // carries a fit score. Session-cached per user; failures leave the
      // affected ids scoreless rather than failing the page.
      if (onDemandScoresRef.current?.userId !== userId) {
        onDemandScoresRef.current = { userId, scores: new Map() };
      }
      const sessionScores = onDemandScoresRef.current.scores;
      const missing = ids.filter((id) => !(id in scores));
      const uncached = missing.filter((id) => !sessionScores.has(id));
      if (uncached.length > 0 && !sig.aborted) {
        try {
          const response = await fetch('/api/match/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ programIds: uncached }),
            signal: sig
          });
          if (response.ok) {
            const payload = (await response.json()) as { scores?: Record<string, number> };
            for (const [id, value] of Object.entries(payload.scores ?? {})) {
              if (typeof value === 'number' && Number.isFinite(value)) {
                sessionScores.set(id, value);
              }
            }
          }
        } catch {
          // Aborted or transient network failure — best-effort, same as above.
        }
      }
      for (const id of missing) {
        const value = sessionScores.get(id);
        if (value !== undefined) scores[id] = value;
      }
      return scores;
    }

    // Writes a fetched page into state (dedup on append) and records the cursor
    // for the next loadMore. No-op if the request was superseded.
    function commitPage(args: {
      mapped: ProgramSearchResult[];
      isFirstPage: boolean;
      more: boolean;
      next: Cursor;
      signal: AbortSignal;
    }) {
      if (args.signal.aborted) return;
      setResults((prev) => {
        if (args.isFirstPage) return args.mapped;
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...args.mapped.filter((item) => !seen.has(item.id))];
      });
      setHasMore(args.more);
      nextCursorRef.current = args.more ? args.next : null;
    }

    run();
    return () => controller.abort();
  }, [requestId]);

  const loadMore = useCallback(() => {
    const { isLoading: loading, isLoadingMore: loadingMore, hasMore: more } = stateRef.current;
    if (loading || loadingMore || !more) return;
    const next = nextCursorRef.current;
    if (!next) return;
    requestSpecRef.current = {
      filtersKey: filtersKeyRef.current,
      cursor: next,
      isFirstPage: false,
    };
    setRequestId((id) => id + 1);
  }, []);

  return {
    results,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    totalCount,
    loadMore,
    programLabel,
    universityLabel,
  };
}
