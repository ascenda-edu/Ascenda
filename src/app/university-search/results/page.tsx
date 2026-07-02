'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { MatchTier } from '@/lib/matching/match-tier';
import { UniversityCard } from '@/components/university-card';
import { UniversityCardSkeleton } from '@/components/university-card-skeleton';
import { FilterBar } from '@/components/university-search/FilterBar';
import { cn } from '@/lib/utils';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { ProgramSearchResult, tierFromScore } from '@/components/university-search/types';
import { Suggestion } from '@/components/university-search/IntelligentSearchBar';
import { filterVisiblePrograms } from '@/lib/catalog/visibility';
import {
  buildSearchHubUrl,
  buildSearchResultsUrl,
  buildSuggestionResultsUrl,
  groupFiltersByKey,
  readFiltersFromParams
} from '@/lib/university-search/search-params';
import type { Database } from '@/lib/types/database';

import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';

type StudentMatchRow = Database['public']['Tables']['student_matches']['Row'];

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

type FilterOption = {
  programName: string;
  universityName: string;
};

const PROGRAM_FILTER_LIMIT = 2000;

const getFlaggedProgramIds = () => {
  const fromEnv =
    process.env.NEXT_PUBLIC_FLAGGED_PROGRAM_IDS ??
    process.env.NEXT_PUBLIC_DEMO_PROGRAM_IDS ??
    process.env.DEMO_PROGRAM_IDS ??
    '';
  return fromEnv
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

const applyProgramVisibilityFilters = (
  query: any,
  flaggedIds: string[]
) => {
  if (!flaggedIds.length) return query;
  const formatted = flaggedIds.map((id) => `"${id}"`).join(',');
  return query.not('id', 'in', `(${formatted})`);
};

export default function UniversitySearchResultsPage() {
  const PAGE_SIZE = 50;
  const router = useRouter();
  const searchParams = useSearchParams();
  const programId = searchParams.get('programId');
  const universityId = searchParams.get('universityId');

  const initialQuery = searchParams.get('q')?.trim() ?? '';
  const chipFilters = useMemo(
    () => groupFiltersByKey(readFiltersFromParams(searchParams)),
    [searchParams]
  );

  // State
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  // Debounced copy drives the Supabase query — firing a full catalogue query
  // (with a count over 119k rows) per keystroke hammers the DB and lets stale
  // responses overwrite newer ones. The raw query still filters loaded
  // results instantly client-side.
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);
  const [selectedTiers, setSelectedTiers] = useState<MatchTier[]>(['Reach', 'Match', 'Safe']);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedUniversities, setSelectedUniversities] = useState<string[]>([]);
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);
  const [areFiltersLoading, setAreFiltersLoading] = useState(true);
  // Store all unique universities directly from the DB to ensure the filter list is complete
  const [allUniversities, setAllUniversities] = useState<{ id: string; name: string }[]>([]);
  // Ref mirror so the fetch effect can read the list without depending on it —
  // the filters arriving used to re-fire the whole first-page fetch.
  const allUniversitiesRef = useRef<{ id: string; name: string }[]>([]);
  const [results, setResults] = useState<ProgramSearchResult[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setResults([]);
    setPage(0);
    setHasMore(true);
  }, [programId, universityId]);

  // Load available filter options directly from Supabase
  useEffect(() => {
    let isActive = true;

    const fetchFilters = async () => {
      try {
        // (Caching happens via the route's Cache-Control header — fetch
        // options like next.revalidate are server-only and no-ops here.)
        const response = await fetch('/api/search/filters');
        if (!response.ok) {
          throw new Error(`Failed to load filters (${response.status})`);
        }
        const body: { programs: { programName: string; universityId?: string | null }[]; universities: { id: string; name: string }[] } = await response.json();

        if (!isActive) return;

        const universities = (body.universities ?? []).filter((u) => u.name);
        allUniversitiesRef.current = universities;
        setAllUniversities(universities);

        const mapped: FilterOption[] = (body.programs ?? [])
          .filter((entry) => entry.programName && entry.universityId)
          .map((entry) => {
            const universityName =
              universities.find((u) => u.id === entry.universityId)?.name ?? 'University';
            return { universityName, programName: entry.programName };
          });

        const uniqueMap = new Map<string, FilterOption>();
        mapped.forEach((item) => {
          const key = `${item.universityName}|${item.programName}`;
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, item);
          }
        });

        const dedupedListeners = Array.from(uniqueMap.values());

        setFilterOptions(dedupedListeners);
      } catch (err) {
        console.error('Failed to fetch filters:', err);
      } finally {
        if (isActive) {
          setAreFiltersLoading(false);
        }
      }
    };

    fetchFilters();

    return () => {
      isActive = false;
    };
  }, []);

  // Fallback: if filter options failed to load, derive from loaded results
  useEffect(() => {
    if (!areFiltersLoading && filterOptions.length === 0 && results.length > 0) {
      const derived = results.map((result) => ({
        programName: result.programName,
        universityName: result.universityName
      }));
      setFilterOptions(derived);
    }
  }, [areFiltersLoading, filterOptions.length, results]);
  // Load catalog results from Supabase
  // Reset pagination when filters change
  useEffect(() => {
    setResults([]);
    setPage(0);
    setHasMore(true);
  }, [programId, universityId, selectedUniversities, selectedPrograms, debouncedQuery, chipFilters]);

  // If all filters and search are cleared, remove any lingering URL params so we fetch full results.
  useEffect(() => {
    const noSelections =
      selectedPrograms.length === 0 &&
      selectedUniversities.length === 0;
    const noSearch = searchQuery.trim() === '';
    const hasUrlFilters = programId || universityId || searchParams.get('q');

    if (noSelections && noSearch && hasUrlFilters) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('programId');
      params.delete('universityId');
      params.delete('q');
      const next = params.toString();
      router.replace(next ? `/university-search/results?${next}` : '/university-search/results');
    }
  }, [
    programId,
    universityId,
    searchParams,
    selectedPrograms.length,
    selectedUniversities.length,
    searchQuery,
    router
  ]);

  // Load catalog results from Supabase
  useEffect(() => {
    // Abort on cleanup so a superseded request can't overwrite newer results.
    const controller = new AbortController();
    const fetchResults = async () => {
      const isFirstPage = page === 0;
      if (isFirstPage) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }
      try {
        const supabase = getBrowserSupabaseClient();
        const flaggedIds = getFlaggedProgramIds();
        const allUniversitiesList = allUniversitiesRef.current;

        // Base query
        // We always use the 'universities' inner join to get location/tuition details
        // and to allow filtering by university name.
        let query = applyProgramVisibilityFilters(
          supabase
            .from('programs')
            .select(
              `
            id,
            course_name,
            name,
            university_id,
            study_level,
            level,
            duration,
            duration_years,
            start_date,
            tuition,
            currency,
            metadata,
            universities!left (
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
          `,
              // Counting 119k rows is expensive — do it once per filter
              // change (page 0), not on every infinite-scroll page.
              { count: isFirstPage ? 'exact' : undefined }
            ),
          flaggedIds
        );

        // 1. URL ID Filters (Initial Load priority, but often synced to state)
        // If we have selectedUniversities/Programs state, that takes precedence over raw IDs
        // because the state is initialized from IDs anyway.
        // So we strictly use the STATE for filtering if populated, or fallback to IDs if state is empty (rare delay).

        const activeUniFilters = selectedUniversities.length > 0 ? selectedUniversities : [];
        const activeProgFilters = selectedPrograms.length > 0 ? selectedPrograms : [];

        if (activeUniFilters.length > 0) {
          const selectedUniIds = activeUniFilters
            .map((name) => allUniversitiesList.find((u) => u.name === name)?.id)
            .filter((id): id is string => Boolean(id));

          if (selectedUniIds.length > 0) {
            query = query.in('university_id', selectedUniIds);
          } else {
            // Fallback to name-based filter if IDs are not yet available.
            query = query.in('universities.name', activeUniFilters);
          }
        } else if (universityId && activeUniFilters.length === 0) {
          // Fallback to ID if state not yet synced/empty
          query = query.eq('university_id', universityId);
        }

        if (activeProgFilters.length > 0) {
          query = query.in('course_name', activeProgFilters);
        } else if (programId && activeProgFilters.length === 0) {
          query = query.eq('id', programId);
        }

        // 1b. Filter chips from search hub (country / subject / fit focus).
        // Lifestyle chips are advisory only and don't hard-filter results.
        const chipCountries = chipFilters.country;
        if (chipCountries.length > 0) {
          // Look up university ids whose country matches one of the chosen chips.
          const { data: countryUniRows } = await supabase
            .from('universities')
            .select('id')
            .in('country', chipCountries);
          const ids = (countryUniRows ?? [])
            .map((row) => row.id)
            .filter((id): id is string => Boolean(id));
          if (ids.length === 0) {
            // No university in the cohort matches those countries — bail with empty result.
            query = query.eq('id', '__no_match__');
          } else {
            query = query.in('university_id', ids);
          }
        }

        const chipSubjects = chipFilters.subject;
        if (chipSubjects.length > 0) {
          // Build an OR clause matching subject across field / study_level / level.
          const escape = (value: string) => value.replace(/[(),%_]/g, ' ').trim();
          const orParts = chipSubjects.flatMap((value) => {
            const escaped = escape(value);
            if (!escaped) return [];
            return [
              `field.ilike.%${escaped}%`,
              `study_level.ilike.%${escaped}%`,
              `level.ilike.%${escaped}%`,
              `course_name.ilike.%${escaped}%`
            ];
          });
          if (orParts.length > 0) {
            query = query.or(orParts.join(','));
          }
        }

        const chipFitFocus = chipFilters.fitFocus;
        if (chipFitFocus.length > 0) {
          query = query.in('mode', chipFitFocus);
        }

        // 2. Text Search
        // Only apply fuzzy text search if we haven't already selected a specific item via ID
        // (If provided by ID, the text query is likely the name of that item, which might not match 'course_name')
        const sanitizeSearchValue = (value: string) =>
          value.replace(/[(),%_]/g, ' ').replace(/\s+/g, ' ').trim();

        const safeSearchQuery = sanitizeSearchValue(debouncedQuery);

        if (safeSearchQuery && !programId && !universityId) {
          const normalizedQ = safeSearchQuery.toLowerCase();
          const words = normalizedQ.split(/\s+/).filter((w) => w.length >= 2);

          // Helper: find university IDs where every given word appears in the name.
          const lookupUniIds = async (mustMatchWords: string[]): Promise<string[]> => {
            if (allUniversitiesList.length > 0) {
              return allUniversitiesList
                .filter((u) => mustMatchWords.every((w) => (u.name?.toLowerCase() ?? '').includes(w)))
                .map((u) => u.id)
                .slice(0, 100);
            }
            let q = supabase.from('universities').select('id').limit(100);
            mustMatchWords.forEach((w) => { q = q.ilike('name', `%${w}%`); });
            const { data } = await q.abortSignal(controller.signal);
            return (data ?? []).map((u) => u.id);
          };

          // For multi-word queries, try AND-matching all words against university names first.
          // If that yields nothing, fall back to the most specific single word (shortest,
          // least likely to be a common word like "university" or "of").
          let matchedUniIds: string[] = [];
          if (words.length > 0) {
            matchedUniIds = await lookupUniIds(words);
            if (matchedUniIds.length === 0 && words.length > 1) {
              // Try each word individually, pick the one returning the fewest universities
              // (most specific). Skip very common words.
              const skip = new Set(['university', 'college', 'institute', 'school', 'of', 'the', 'and']);
              const candidates = words.filter((w) => !skip.has(w));
              // The per-word lookups are independent — run them concurrently.
              const perWordIds = await Promise.all(candidates.map((word) => lookupUniIds([word])));
              for (const ids of perWordIds) {
                if (ids.length > 0 && (matchedUniIds.length === 0 || ids.length < matchedUniIds.length)) {
                  matchedUniIds = ids;
                }
              }
            }
          }

          if (matchedUniIds.length > 0) {
            // Filter by university IDs directly — avoids .or() with spaces in ilike values
            // which causes PostgREST parse errors.
            query = query.in('university_id', matchedUniIds);
            // If there are also non-university words (e.g. "oxford economics"), narrow by course name too.
            const skip = new Set(['university', 'college', 'institute', 'school', 'of', 'the', 'and']);
            const courseWords = words.filter((w) => !skip.has(w) && !matchedUniIds.length);
            // Narrow by course name words that aren't purely university-identifying words
            const matchedIdSet = new Set(matchedUniIds);
            const uniNameWords = (allUniversitiesList.length > 0
              ? allUniversitiesList.filter((u) => matchedIdSet.has(u.id)).flatMap((u) =>
                  (u.name?.toLowerCase() ?? '').split(/\s+/)
                )
              : []
            );
            const extraWords = words.filter(
              (w) => !skip.has(w) && !uniNameWords.includes(w)
            );
            if (extraWords.length > 0) {
              extraWords.forEach((w) => { query = query.ilike('course_name', `%${w}%`); });
            }
          } else {
            // No university matched — search course name with each word (AND)
            if (words.length > 1) {
              words.forEach((w) => { query = query.ilike('course_name', `%${w}%`); });
            } else {
              query = query.ilike('course_name', `%${normalizedQ}%`);
            }
          }
        }

        // Pagination
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to).abortSignal(controller.signal);

        const [{ data: sessionData }, { data, error: supabaseError, count }] = await Promise.all([
          supabase.auth.getSession(),
          query
        ]);

        if (supabaseError) throw supabaseError;

        const userId = sessionData?.session?.user?.id;
        let matchScores: Record<string, number> = {};
        const pageProgramIds = ((data ?? []) as ProgramRow[]).map((p) => p.id);

        if (userId && pageProgramIds.length > 0) {
          // Only the scores for THIS page — the full match cache can be
          // hundreds of rows and was previously reloaded on every scroll.
          const { data: matches, error: matchError } = await supabase
            .from('student_matches')
            .select('program_id, score')
            .eq('profile_id', userId)
            .in('program_id', pageProgramIds)
            .abortSignal(controller.signal);
          if (matchError) {
            console.error('Failed to load match scores', matchError);
          } else {
            const matchRows = matches ?? [];
            matchScores = matchRows.reduce<Record<string, number>>((acc, entry) => {
              const numericScore =
                typeof entry.score === 'string'
                  ? Number.parseFloat(entry.score)
                  : typeof entry.score === 'number'
                    ? entry.score
                    : null;
              if (numericScore !== null && Number.isFinite(numericScore)) {
                acc[entry.program_id] = numericScore;
              }
              return acc;
            }, {});
          }
        }

        const visiblePrograms = filterVisiblePrograms((data ?? []) as ProgramRow[]);

        const mapped: ProgramSearchResult[] = visiblePrograms.map((program: ProgramRow) => {
          const uni = program.universities;
          const uniId = (uni?.id ?? program.university_id) ?? undefined;
          const uniName =
            typeof uni?.name === 'string' && uni.name?.trim()
              ? uni.name.trim()
              : uniId
                ? allUniversitiesList.find((u) => u.id === uniId)?.name ?? null
                : null;
          const uniMetadata =
            uni && typeof uni.metadata === 'object' && uni.metadata !== null ? (uni.metadata as Record<string, unknown>) : {};
          const logoUrl =
            typeof uniMetadata.logo_url === 'string'
              ? (uniMetadata.logo_url as string)
              : typeof uniMetadata.logoUrl === 'string'
                ? (uniMetadata.logoUrl as string)
                : undefined;
          const location = [uni?.city, uni?.region, uni?.country].filter(Boolean).join(', ');
          const score = matchScores[program.id];
          const tier = tierFromScore(score);
          const programName = program.course_name ?? program.name ?? 'Program';
          const level = program.study_level ?? program.level ?? null;
          const duration = program.duration ?? (program.duration_years ? `${program.duration_years} years` : null);
          return {
            id: program.id,
            universityId: uniId,
            universityName: uniName ?? 'University',
            programName,
            location: location || 'Location unavailable',
            logoUrl: logoUrl ?? null,
            fitScore: score ?? null,
            tier: tier ?? null,
            highlights: [level, duration].filter(Boolean) as string[],
            acceptanceRate: uni?.acceptance_rate ?? null,
            duration: duration ?? null,
            intlTuitionLow: uni?.intl_tuition_low ?? null,
            intlTuitionHigh: uni?.intl_tuition_high ?? null,
            requiresTest: uni?.requires_test ?? null,
            tuition: program.tuition ?? null,
            currency: program.currency ?? uni?.currency ?? null,
            studyLevel: level
          };
        });

        if (controller.signal.aborted) return;

        setResults((prev) => {
          if (isFirstPage) return mapped;
          const existingIds = new Set(prev.map((item) => item.id));
          const incoming = mapped.filter((item) => !existingIds.has(item.id));
          return [...prev, ...incoming];
        });

        const pageCount = mapped.length;
        // Check if we hit the total count or if the page returned less than full size
        if (typeof count === 'number') {
          // 'count' from Supabase is total matching records
          const loadedSoFar = (page + 1) * PAGE_SIZE; // Approximation, better to track cumulative? 
          // Actually 'results.length' + current batch
          // Supabase range is inclusive. 
          // If we have count, we rely on it.
          // But 'results' state resets on filter change.
          // So simply:
          const totalFetched = (page * PAGE_SIZE) + pageCount;
          setHasMore(totalFetched < count);
          setResultCount(count);
        } else {
          setHasMore(pageCount === PAGE_SIZE);
        }

        // Sync local filters with URL ID only on very first visual load if empty
        // logic moved to separate effect or handled implicitly by precedence
        if (isFirstPage && selectedUniversities.length === 0 && selectedPrograms.length === 0) {
          // We only sync if we used the IDs to filter.
          if (programId && mapped.length > 0) {
            const p = mapped[0];
            // Note: Calling setState inside useEffect might trigger re-run if dependencies include it.
            // But we guard with 'length === 0'.
            setSelectedPrograms([p.programName]);
            setSelectedUniversities([p.universityName]);
          } else if (universityId && mapped.length > 0) {
            setSelectedUniversities([mapped[0].universityName]);
          }
        }

      } catch (fetchError) {
        if (controller.signal.aborted) return; // superseded request — ignore
        console.error('[SearchResults] fetch error:', fetchError);
        // Supabase errors are plain objects, not Error instances — never render them raw.
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : typeof fetchError === 'object' && fetchError !== null && 'message' in fetchError
              ? String((fetchError as { message?: unknown }).message)
              : null;
        setError(
          message && !message.startsWith('{') && !message.startsWith('[')
            ? message
            : 'Something went wrong loading results. Please try again.'
        );
      } finally {
        if (!controller.signal.aborted) {
          if (isFirstPage) {
            setIsLoading(false);
          } else {
            setIsLoadingMore(false);
          }
        }
      }
    };

    fetchResults();
    return () => controller.abort();
  }, [page, programId, universityId, selectedUniversities, selectedPrograms, debouncedQuery, chipFilters]);

  const availableUniversities = useMemo(() => {
    // Use the full universities list from Supabase (not the capped filterOptions)
    const names = new Set<string>();
    allUniversities.forEach((uni) => names.add(uni.name));
    selectedUniversities.forEach((name) => names.add(name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allUniversities, selectedUniversities]);

  const availablePrograms = useMemo(() => {
    const source =
      selectedUniversities.length > 0
        ? filterOptions.filter((option) => selectedUniversities.includes(option.universityName))
        : filterOptions;

    const programs = new Set<string>();
    source.forEach((option) => programs.add(option.programName));
    selectedPrograms.forEach((program) => programs.add(program));
    return Array.from(programs).sort((a, b) => a.localeCompare(b));
  }, [filterOptions, selectedPrograms, selectedUniversities]);

  const filteredResults = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase();
    const hasExplicitIdFilter = Boolean(programId || universityId);

    return results.filter((result) => {
      const matchesSearch =
        hasExplicitIdFilter ||
        !normalizedQuery ||
        `${result.universityName} ${result.programName} ${result.location}`.toLowerCase().includes(normalizedQuery) ||
        // Fallback: if server sent it, it likely matched via ID or special logic
        (allUniversities.find(u => u.id === result.universityId)?.name?.toLowerCase().includes(normalizedQuery) ?? false);
      const matchesTier = result.tier ? selectedTiers.includes(result.tier) : true;
      const matchesUniversity =
        selectedUniversities.length === 0 || selectedUniversities.includes(result.universityName);
      const matchesProgram =
        selectedPrograms.length === 0 || selectedPrograms.includes(result.programName);
      return (
        matchesSearch &&
        matchesTier &&
        matchesUniversity &&
        matchesProgram
      );
    });
  }, [
    results,
    searchQuery,
    selectedTiers,
    selectedPrograms,
    selectedUniversities,
    allUniversities,
    programId,
    universityId
  ]);

  const handleToggleUniversity = (name: string) => {
    // If we are un-toggling the university that is currently filtering the page via URL,
    // we should remove the URL filter to allow dynamic expansion of results.
    if (universityId && selectedUniversities.includes(name) && selectedUniversities.length === 1) {
      // Check if the name matches the current ID-based university (we'd need to know the name from results)
      // A simpler heuristic: if there's a universityId param, and we are toggling off the only selected university,
      // it's likely the one from the URL.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('universityId');
      params.delete('q'); // Clear fallback query too
      router.push(`/university-search/results?${params.toString()}`);
    }

    setSelectedUniversities((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const handleToggleProgram = (program: string) => {
    // Similar logic for programs
    if (programId && selectedPrograms.includes(program) && selectedPrograms.length === 1) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('programId');
      params.delete('q');
      router.push(`/university-search/results?${params.toString()}`);
    }

    setSelectedPrograms((prev) =>
      prev.includes(program) ? prev.filter((item) => item !== program) : [...prev, program]
    );
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedTiers(['Reach', 'Match', 'Safe']);
    setSelectedUniversities([]);
    setSelectedPrograms([]);
    setResults([]);
    setPage(0);
    setHasMore(true);
    setResultCount(0);
    setError(null);

    // If there are URL params, clear them to truly reset
    if (programId || universityId || searchParams.get('q')) {
      router.push('/university-search/results');
    }
  };

  const handleSelectSuggestion = (item: Suggestion) => {
    setSearchQuery(item.name);
    // Reset previous manual selections so the new choice takes full effect.
    if (item.type === 'university') {
      setSelectedUniversities([item.name]);
      setSelectedPrograms([]);
    } else {
      setSelectedPrograms([item.name]);
      setSelectedUniversities(item.university ? [item.university] : []);
    }
    setResults([]);
    setPage(0);
    router.push(buildSuggestionResultsUrl(item));
  };

  const handleSearchSubmit = () => {
    router.push(buildSearchResultsUrl(searchQuery));
  };

  const handleLoadMore = () => {
    if (isLoading || isLoadingMore || !hasMore || programId || universityId) return;
    setPage((prev) => prev + 1);
  };

  useEffect(() => {
    if (programId || universityId) return;
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isLoading && !isLoadingMore) {
          setPage((prev) => prev + 1);
        }
      },
      { rootMargin: '320px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, programId, universityId]);

  return (
    <div className="min-h-screen space-y-8 pb-24" >
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Breadcrumbs className="mb-2" />
            <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-foreground md:text-[28px]">University matches</h1>
            <p className="text-muted-foreground">
              Explore programs tailored to your profile and preferences.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link
              href={buildSearchHubUrl(searchQuery, readFiltersFromParams(searchParams))}
              className="gap-2"
            >
              ← Refine in search hub
            </Link>
          </Button>
        </div>

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={handleSearchSubmit}
          onSelectSuggestion={handleSelectSuggestion}
          selectedTiers={selectedTiers}
          onTierChange={(tier) => {
            setSelectedTiers((prev) =>
              prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
            );
          }}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          resultCount={filteredResults.length}
          selectedUniversities={selectedUniversities}
          selectedPrograms={selectedPrograms}
          availableUniversities={availableUniversities}
          availablePrograms={availablePrograms}
          onUniversityToggle={handleToggleUniversity}
          onProgramToggle={handleToggleProgram}
          onClearFilters={handleResetFilters}
        />

        {isLoading ? (
          <div
            className={cn(
              'grid gap-6',
              viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'
            )}
          >
            {Array.from({ length: viewMode === 'grid' ? 6 : 4 }).map((_, index) => (
              <UniversityCardSkeleton key={index} variant={viewMode === 'list' ? 'compact' : 'default'} />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-dashed border-red-300 bg-red-50 p-6 text-sm text-red-700">
            {error}
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border bg-muted/30 py-20 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <span className="text-4xl">🔍</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">No matches found</h3>
            <p className="text-muted-foreground">
              Try adjusting your filters or add one more detail to your profile to unlock matches.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm font-semibold">
              <Button asChild size="sm" variant="outline" className="rounded-full px-4">
                <Link href="/profile/wizard?step=academic_details">Add your grades</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="rounded-full px-4">
                <Link href="/profile/wizard?step=lifestyle_preferences">Set your preferences</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="rounded-full px-4">
                <Link href="/profile/wizard?step=academic_input">Clarify goals & interests</Link>
              </Button>
            </div>
            <button
              onClick={handleResetFilters}
              className="mt-4 text-sm font-medium text-primary hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div
            className={cn(
              'grid gap-6',
              viewMode === 'grid'
                ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
                : 'grid-cols-1'
            )}
          >
            {filteredResults.map((result) => (
              <UniversityCard
                key={result.id}
                id={result.id}
                name={result.universityName}
                program={result.programName}
                location={result.location}
                logoUrl={result.logoUrl ?? undefined}
                fitScore={result.fitScore}
                tier={result.tier ?? undefined}
                highlights={result.highlights}
              />
            ))}
          </div>
        )}
        {hasMore && !isLoading && filteredResults.length > 0 && !programId && !universityId ? (
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-primary transition hover:border-primary disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              {isLoadingMore ? 'Loading more results…' : 'Load more results'}
            </button>
            <div ref={loadMoreRef} className="h-6 w-full" />
          </div>
        ) : null}
      </section>

    </div>
  );
}
