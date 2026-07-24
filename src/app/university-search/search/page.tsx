'use client';

// The unified live university-search page. A single surface owns the query,
// the facet rail, the sort/view toolbar, and the results grid — URL is the
// source of truth so every state is deep-linkable and back/forward restores
// it. The old two-step hub + /results flow is gone; /results now redirects
// here.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { SearchX } from 'lucide-react';

import { PageHero } from '@/components/layout/page-hero';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { UniversityCard } from '@/components/university-card';
import { UniversityCardSkeleton } from '@/components/university-card-skeleton';
import { SaveSearchButton } from '@/components/university-search/save-search-button';
import { SavedSearchesRow } from '@/components/university-search/saved-searches-row';
import type { Suggestion } from '@/components/university-search/IntelligentSearchBar';
import {
  ActiveFilterBar,
  CheckboxFacetList,
  FacetGroup,
  FilterRail,
  MobileFilterSheet,
  RangeSlider,
  SearchToolbar,
  SegmentedControl,
  TierPills,
  ToggleSwitch,
  SORT_LABELS,
} from '@/components/university-search/filters';
import { useSearchResults } from '@/hooks/use-search-results';
import {
  ALL_TIERS,
  DEFAULT_FILTERS,
  TUITION_BOUNDS,
  buildSearchUrl,
  filtersToChips,
  parseSearchParams,
  serializeFilters,
  type RankingBand,
  type SearchFilters,
  type SortOption,
} from '@/lib/university-search/search-params';
import type { MatchTier } from '@/lib/matching/match-tier';
import { childFade, stagger } from '@/lib/motion';
import { cn } from '@/lib/utils';

const SEARCH_PATH = '/university-search/search';

// Fallbacks used until /api/search/filter-options resolves (or if it fails).
// These are the EXACT DB values (captured live from the fixed RPC) so the
// fallback lists match real facet values and never yield empty result sets.
const FALLBACK_COUNTRIES = ['Australia', 'Canada', 'United Kingdom', 'United States'];
const FALLBACK_SUBJECTS = [
  'Arts & Humanities',
  'Biological Sciences',
  'Business & Management',
  'Computer Science & IT',
  'Engineering',
  'Health Sciences & Medicine',
];
const FALLBACK_LEVELS = ['Bachelor', 'Bachelor (Honours)', 'Diploma', 'Associate'];

const RANKING_OPTIONS: { value: RankingBand; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'wellKnown', label: 'Well-known' },
  { value: 'topTier', label: 'Top tier' },
];
const RANKING_LABELS: Record<RankingBand, string> = {
  any: 'Any',
  wellKnown: 'Well-known',
  topTier: 'Top tier',
};

const toggleValue = <T,>(arr: T[], value: T): T[] =>
  arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

const formatGbp = (n: number): string => {
  if (n >= 1000) {
    const k = n / 1000;
    return `£${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `£${n}`;
};

type FacetOptions = { countries: string[]; subjects: string[]; levels: string[] };

interface FacetSectionsProps {
  filters: SearchFilters;
  facets: FacetOptions;
  /** When false, the loaded results carry no fit tiers — swap the tier pills for a quiet nudge. */
  showTierFacet: boolean;
  onToggleCountry: (v: string) => void;
  onToggleSubject: (v: string) => void;
  onToggleLevel: (v: string) => void;
  onTuitionChange: (min: number | null, max: number | null) => void;
  onRankingChange: (band: RankingBand) => void;
  onToggleTier: (t: MatchTier) => void;
  onTestOptionalChange: (checked: boolean) => void;
}

// The single facet definition rendered into BOTH the desktop rail and the
// mobile sheet — sharing one component keeps the two from ever drifting apart.
function FacetSections({
  filters,
  facets,
  showTierFacet,
  onToggleCountry,
  onToggleSubject,
  onToggleLevel,
  onTuitionChange,
  onRankingChange,
  onToggleTier,
  onTestOptionalChange,
}: FacetSectionsProps) {
  return (
    <>
      <FacetGroup title="Country" activeCount={filters.countries.length}>
        <CheckboxFacetList
          options={facets.countries}
          selected={filters.countries}
          onToggle={onToggleCountry}
          searchable
          searchPlaceholder="Search countries…"
        />
      </FacetGroup>

      <FacetGroup title="Subject" activeCount={filters.subjects.length}>
        <CheckboxFacetList
          options={facets.subjects}
          selected={filters.subjects}
          onToggle={onToggleSubject}
          searchable
          searchPlaceholder="Search subjects…"
        />
      </FacetGroup>

      <FacetGroup title="Degree level" activeCount={filters.levels.length}>
        <CheckboxFacetList options={facets.levels} selected={filters.levels} onToggle={onToggleLevel} />
      </FacetGroup>

      <FacetGroup
        title="Tuition (GBP/yr)"
        activeCount={filters.tuitionMin !== null || filters.tuitionMax !== null ? 1 : 0}
      >
        <RangeSlider
          min={TUITION_BOUNDS.min}
          max={TUITION_BOUNDS.max}
          step={TUITION_BOUNDS.step}
          valueMin={filters.tuitionMin}
          valueMax={filters.tuitionMax}
          onChange={onTuitionChange}
        />
      </FacetGroup>

      <FacetGroup title="Ranking" activeCount={filters.ranking !== 'any' ? 1 : 0}>
        <SegmentedControl
          options={RANKING_OPTIONS}
          value={filters.ranking}
          onChange={(v) => onRankingChange(v as RankingBand)}
          ariaLabel="University ranking"
        />
      </FacetGroup>

      <FacetGroup
        title="Fit tier"
        activeCount={showTierFacet && filters.tiers.length < ALL_TIERS.length ? filters.tiers.length : 0}
      >
        {showTierFacet ? (
          <TierPills selected={filters.tiers} onToggle={onToggleTier} />
        ) : (
          <div className="surface-subcard !p-4 text-xs leading-relaxed text-muted-foreground">
            Fit filters unlock once your profile has match scores.{' '}
            <Link href="/profile/wizard" className="font-semibold text-primary hover:underline">
              Complete your profile
            </Link>
          </div>
        )}
      </FacetGroup>

      <div className="py-3">
        <ToggleSwitch
          checked={filters.testOptional}
          onChange={onTestOptionalChange}
          label="Test-optional only"
          description="Only programmes at universities that don't require admissions tests."
        />
      </div>
    </>
  );
}

function UnifiedSearchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL is the source of truth. Seed state once from the incoming params, then
  // state drives the URL (below) rather than the other way around.
  const [filters, setFilters] = useState<SearchFilters>(() => parseSearchParams(searchParams));
  const [searchQuery, setSearchQuery] = useState<string>(() => parseSearchParams(searchParams).q);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    searchParams.get('view') === 'list' ? 'list' : 'grid'
  );
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [facets, setFacets] = useState<FacetOptions>({
    countries: FALLBACK_COUNTRIES,
    subjects: FALLBACK_SUBJECTS,
    levels: FALLBACK_LEVELS,
  });

  // Canonical query string for a filter + view state. `view` is not part of
  // SearchFilters, so it's appended here (and omitted when it's the default).
  const buildQueryString = useCallback((f: SearchFilters, v: 'grid' | 'list') => {
    const params = serializeFilters(f);
    if (v === 'list') params.set('view', v);
    return params.toString();
  }, []);

  // Last query string we ourselves wrote. Lets the reconcile effect below tell
  // our own writes apart from external navigation (saved-search clicks,
  // back/forward) without a feedback loop.
  const lastUrlRef = useRef<string>(searchParams.toString());

  // The `q` value at the moment a suggestion drill-down was selected. If the
  // user later edits the text away from this, the pinned programId/universityId
  // no longer matches what they're typing and must be dropped (see below).
  const suggestionQRef = useRef<string | null>(null);

  // Raw input → debounced server query. The instant `searchQuery` still filters
  // the loaded page client-side; the debounced copy feeds the hook so we don't
  // fire a catalogue query (with a count over 119k rows) per keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setFilters((prev) => {
        if (prev.q === searchQuery) return prev;
        const next = { ...prev, q: searchQuery };
        // Typing after a suggestion drill-down: once the text diverges from the
        // q captured at select time, unpin the drill-down ids so the free-text
        // search isn't silently constrained to the old entity.
        if ((prev.programId || prev.universityId) && searchQuery !== suggestionQRef.current) {
          next.programId = null;
          next.universityId = null;
        }
        return next;
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  // State → URL. Debounced so slider drags and rapid toggles don't spam
  // history. The first run is skipped so we don't rewrite the URL we just read.
  const skipInitialWrite = useRef(true);
  useEffect(() => {
    if (skipInitialWrite.current) {
      skipInitialWrite.current = false;
      return;
    }
    const handle = window.setTimeout(() => {
      const next = buildQueryString(filters, viewMode);
      if (next === lastUrlRef.current) return;
      lastUrlRef.current = next;
      router.replace(next ? `${SEARCH_PATH}?${next}` : SEARCH_PATH, { scroll: false });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [filters, viewMode, buildQueryString, router]);

  // URL → state, but only when the change came from outside our own writes
  // (saved-search navigation, browser back/forward). Adopting a non-canonical
  // URL here triggers the write effect above to canonicalise it, which then
  // matches lastUrlRef and stops — no loop.
  useEffect(() => {
    const current = searchParams.toString();
    if (current === lastUrlRef.current) return;
    lastUrlRef.current = current;
    const parsed = parseSearchParams(searchParams);
    setFilters(parsed);
    setSearchQuery(parsed.q);
    setViewMode(searchParams.get('view') === 'list' ? 'list' : 'grid');
  }, [searchParams]);

  // Legacy-URL canonicalisation. Old shared /results links carry the
  // `filters=group:value|…` token; rewrite once on mount to the canonical
  // discrete-param URL so the address bar (and any re-share) is clean.
  const didCanonicalizeLegacy = useRef(false);
  useEffect(() => {
    if (didCanonicalizeLegacy.current) return;
    didCanonicalizeLegacy.current = true;
    if (searchParams.get('filters')) {
      router.replace(buildSearchUrl(parseSearchParams(searchParams)), { scroll: false });
    }
    // Mount-only: seed params are captured above; later param changes flow
    // through the reconcile effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Facet option lists — fetched once; distinct values come from a cached RPC.
  useEffect(() => {
    let active = true;
    const uniqueSorted = (values: (string | null | undefined)[], limit = 200) =>
      Array.from(new Set(values.filter((v): v is string => Boolean(v && v.trim()))))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, limit);

    const load = async () => {
      try {
        const res = await fetch('/api/search/filter-options');
        if (!res.ok) return;
        const options = (await res.json()) as {
          countries?: string[];
          fields?: string[];
          studyLevels?: string[];
        };
        if (!active) return;
        const countries = uniqueSorted(options.countries ?? []);
        const subjects = uniqueSorted(options.fields ?? []);
        const levels = uniqueSorted(options.studyLevels ?? []);
        setFacets((prev) => ({
          countries: countries.length ? countries : prev.countries,
          subjects: subjects.length ? subjects : prev.subjects,
          levels: levels.length ? levels : prev.levels,
        }));
      } catch {
        // Keep the fallbacks.
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const {
    results,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    totalCount,
    loadMore,
    programLabel,
    universityLabel,
  } = useSearchResults(filters);

  // Client-side tier + instant-q filter over the loaded page. `tiers` is
  // client-only (the hook ignores it); the instant q uses the raw input so
  // typing narrows the visible cards without waiting for the debounced refetch.
  const filteredResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const hasExplicitIdFilter = Boolean(filters.programId || filters.universityId);
    return results.filter((result) => {
      const matchesSearch =
        hasExplicitIdFilter ||
        !normalizedQuery ||
        `${result.universityName} ${result.programName} ${result.location}`
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesTier = result.tier ? filters.tiers.includes(result.tier) : true;
      return matchesSearch && matchesTier;
    });
  }, [results, searchQuery, filters.tiers, filters.programId, filters.universityId]);

  const handleToggleCountry = useCallback(
    (v: string) => setFilters((f) => ({ ...f, countries: toggleValue(f.countries, v) })),
    []
  );
  const handleToggleSubject = useCallback(
    (v: string) => setFilters((f) => ({ ...f, subjects: toggleValue(f.subjects, v) })),
    []
  );
  const handleToggleLevel = useCallback(
    (v: string) => setFilters((f) => ({ ...f, levels: toggleValue(f.levels, v) })),
    []
  );
  const handleTuitionChange = useCallback(
    (min: number | null, max: number | null) =>
      setFilters((f) => ({ ...f, tuitionMin: min, tuitionMax: max })),
    []
  );
  const handleRankingChange = useCallback(
    (band: RankingBand) => setFilters((f) => ({ ...f, ranking: band })),
    []
  );
  const handleToggleTier = useCallback(
    (t: MatchTier) => setFilters((f) => ({ ...f, tiers: toggleValue(f.tiers, t) })),
    []
  );
  const handleTestOptionalChange = useCallback(
    (checked: boolean) => setFilters((f) => ({ ...f, testOptional: checked })),
    []
  );
  const handleSortChange = useCallback(
    (sort: SortOption) => setFilters((f) => ({ ...f, sort })),
    []
  );

  // A free-text submit is a fresh keyword search — drop any drill-down.
  const handleSubmitQuery = useCallback(() => {
    setFilters((f) => ({ ...f, q: searchQuery, programId: null, universityId: null }));
  }, [searchQuery]);

  const handleSelectSuggestion = useCallback((item: Suggestion) => {
    // Remember the q we're pinning to so the debounce commit can tell "typed
    // more after the drill-down" from "hasn't touched it yet".
    suggestionQRef.current = item.name;
    setSearchQuery(item.name);
    setFilters((f) =>
      item.type === 'university'
        ? { ...f, q: item.name, universityId: item.id, programId: null }
        : { ...f, q: item.name, programId: item.id, universityId: null }
    );
  }, []);

  const handleClearAll = useCallback(() => {
    setSearchQuery('');
    setFilters(DEFAULT_FILTERS);
  }, []);

  const handleRemoveProgram = useCallback(() => setFilters((f) => ({ ...f, programId: null })), []);
  const handleRemoveUniversity = useCallback(
    () => setFilters((f) => ({ ...f, universityId: null })),
    []
  );
  const handleResetTiers = useCallback(() => setFilters((f) => ({ ...f, tiers: ALL_TIERS })), []);

  // Restore the client-side "view" refinements (fit tiers + instant search
  // text) that can hide already-loaded results, without touching the server
  // facets. Used by the "loaded results are all hidden" empty state.
  const handleResetView = useCallback(() => {
    setSearchQuery('');
    setFilters((f) => ({ ...f, tiers: ALL_TIERS }));
  }, []);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    filters.countries.forEach((c) =>
      chips.push({ key: `country:${c}`, label: c, onRemove: () => handleToggleCountry(c) })
    );
    filters.subjects.forEach((s) =>
      chips.push({ key: `subject:${s}`, label: s, onRemove: () => handleToggleSubject(s) })
    );
    filters.levels.forEach((l) =>
      chips.push({ key: `level:${l}`, label: l, onRemove: () => handleToggleLevel(l) })
    );
    if (filters.tuitionMin !== null || filters.tuitionMax !== null) {
      const lo = filters.tuitionMin;
      const hi = filters.tuitionMax;
      const label =
        lo !== null && hi !== null
          ? `${formatGbp(lo)}–${formatGbp(hi)}`
          : lo !== null
            ? `From ${formatGbp(lo)}`
            : `Up to ${formatGbp(hi as number)}`;
      chips.push({ key: 'tuition', label, onRemove: () => handleTuitionChange(null, null) });
    }
    if (filters.ranking !== 'any') {
      chips.push({
        key: 'ranking',
        label: RANKING_LABELS[filters.ranking],
        onRemove: () => handleRankingChange('any'),
      });
    }
    if (filters.testOptional) {
      chips.push({ key: 'testopt', label: 'Test-optional', onRemove: () => handleTestOptionalChange(false) });
    }
    if (filters.tiers.length !== ALL_TIERS.length) {
      chips.push({
        key: 'tiers',
        label: `Fit: ${filters.tiers.join(' + ')}`,
        onRemove: handleResetTiers,
      });
    }
    if (filters.sort !== 'fit') {
      chips.push({ key: 'sort', label: SORT_LABELS[filters.sort], onRemove: () => handleSortChange('fit') });
    }
    if (filters.programId) {
      chips.push({
        key: 'programId',
        label: `Programme: ${(programLabel ?? searchQuery) || 'selected'}`,
        onRemove: handleRemoveProgram,
      });
    }
    if (filters.universityId) {
      chips.push({
        key: 'universityId',
        label: `University: ${(universityLabel ?? searchQuery) || 'selected'}`,
        onRemove: handleRemoveUniversity,
      });
    }
    return chips;
  }, [
    filters,
    programLabel,
    universityLabel,
    searchQuery,
    handleToggleCountry,
    handleToggleSubject,
    handleToggleLevel,
    handleTuitionChange,
    handleRankingChange,
    handleTestOptionalChange,
    handleSortChange,
    handleRemoveProgram,
    handleRemoveUniversity,
    handleResetTiers,
  ]);

  // ONE rule for the active-filter count so the mobile badge, the rail's
  // Clear-all visibility, and the chip row can never disagree: it's exactly the
  // number of chips shown.
  const activeFilterCount = activeChips.length;

  // The loaded page is being narrowed client-side when the tier filter is
  // active or the instant-q text hasn't yet been committed to filters.q — in
  // that case the server totalCount no longer matches the visible grid.
  const isClientFiltered =
    filters.tiers.length !== ALL_TIERS.length || searchQuery.trim() !== filters.q.trim();

  // Infinite scroll — disabled only when a single PROGRAMME is pinned (it has
  // no "more" to page through). A universityId drill-down still paginates: a
  // university can have hundreds of programmes and the hook pages it correctly.
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (filters.programId) return;
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoading && !isLoadingMore) loadMore();
      },
      { rootMargin: '320px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, filters.programId, loadMore]);

  // Keep the tier pills while loading (we don't yet know if scores exist); hide
  // them only once a non-empty result set has come back with no tiers at all.
  const showTierFacet = isLoading || results.length === 0 || results.some((r) => Boolean(r.tier));

  const facetSections = (
    <FacetSections
      filters={filters}
      facets={facets}
      showTierFacet={showTierFacet}
      onToggleCountry={handleToggleCountry}
      onToggleSubject={handleToggleSubject}
      onToggleLevel={handleToggleLevel}
      onTuitionChange={handleTuitionChange}
      onRankingChange={handleRankingChange}
      onToggleTier={handleToggleTier}
      onTestOptionalChange={handleTestOptionalChange}
    />
  );

  const gridClass = cn(
    'grid gap-6',
    viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'
  );

  return (
    <div className="space-y-6">
      <PageHero
        tone="student"
        eyebrow="Explore"
        title="Find your programme"
        description="Search the full catalogue, layer filters, and preview how each programme fits your profile."
        highlight={totalCount !== null ? `${totalCount.toLocaleString()} programmes` : undefined}
        breadcrumbs={<Breadcrumbs />}
        actions={<SaveSearchButton query={searchQuery} chips={filtersToChips(filters)} />}
      />

      <SavedSearchesRow />

      <div className="grid items-start gap-6 lg:grid-cols-[280px,1fr]">
        <div className="hidden lg:block">
          <FilterRail onClearAll={handleClearAll} activeFilterCount={activeFilterCount}>
            {facetSections}
          </FilterRail>
        </div>

        <section className="min-w-0 space-y-6">
          <div className="space-y-3">
            <SearchToolbar
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onSubmitQuery={handleSubmitQuery}
              onSelectSuggestion={handleSelectSuggestion}
              resultCount={filteredResults.length}
              totalCount={totalCount}
              isClientFiltered={isClientFiltered}
              isLoading={isLoading}
              sort={filters.sort}
              onSortChange={handleSortChange}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              activeFilterCount={activeFilterCount}
              onOpenMobileFilters={() => setMobileFiltersOpen(true)}
            />

            {activeChips.length > 0 ? (
              <ActiveFilterBar chips={activeChips} onClearAll={handleClearAll} />
            ) : null}
          </div>

          {isLoading ? (
            <div className={gridClass}>
              {Array.from({ length: viewMode === 'grid' ? 6 : 4 }).map((_, index) => (
                <UniversityCardSkeleton key={index} variant={viewMode === 'list' ? 'compact' : 'default'} />
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-[28px] border border-dashed border-rose-200/60 bg-rose-500/10 p-6 text-sm text-rose-600 dark:border-rose-500/20 dark:text-rose-400"
            >
              {error}
            </div>
          ) : filteredResults.length === 0 && results.length > 0 ? (
            // The server returned rows, but the client-side view filters
            // (fit-tier selection and/or the instant search text) hid them all.
            // Offer a view reset — not the profile-wizard CTAs, which only make
            // sense when the catalogue itself returned nothing.
            <EmptyState
              icon={SearchX}
              title="Nothing matches your view filters"
              description="Your fit-tier selection or the search text you're typing is hiding every loaded programme. Reset your view to bring them back."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full px-4"
                  onClick={handleResetView}
                >
                  Reset tiers &amp; search
                </Button>
              }
            />
          ) : filteredResults.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No matches found"
              description="Try adjusting your filters or add one more detail to your profile to unlock matches."
              action={
                <div className="flex flex-col items-center gap-4">
                  <div className="flex flex-wrap justify-center gap-2 text-sm font-semibold">
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
                    onClick={handleClearAll}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Clear all filters
                  </button>
                </div>
              }
            />
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="show" className={gridClass}>
              {filteredResults.map((result) => (
                <motion.div
                  key={result.id}
                  variants={childFade}
                  className={cn(
                    '[content-visibility:auto]',
                    viewMode === 'grid'
                      ? '[contain-intrinsic-size:auto_360px]'
                      : '[contain-intrinsic-size:auto_200px]'
                  )}
                >
                  <UniversityCard
                    id={result.id}
                    name={result.universityName}
                    program={result.programName}
                    location={result.location}
                    country={result.country}
                    logoUrl={result.logoUrl ?? undefined}
                    fitScore={result.fitScore}
                    tier={result.tier ?? undefined}
                    tuitionLabel={result.tuitionLabel}
                    durationLabel={result.durationLabel}
                    levelLabel={result.levelLabel}
                    variant={viewMode === 'list' ? 'compact' : 'default'}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}

          {hasMore && !isLoading && filteredResults.length > 0 && !filters.programId ? (
            <div className="mt-2 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-primary transition hover:-translate-y-0.5 hover:border-primary disabled:cursor-not-allowed disabled:text-muted-foreground"
              >
                {isLoadingMore ? 'Loading more results…' : 'Load more results'}
              </button>
              <div ref={loadMoreRef} className="h-6 w-full" />
            </div>
          ) : null}
        </section>
      </div>

      <MobileFilterSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        activeFilterCount={activeFilterCount}
        onClearAll={handleClearAll}
      >
        {facetSections}
      </MobileFilterSheet>
    </div>
  );
}

export default function UnifiedUniversitySearchPage() {
  return (
    <Suspense fallback={<div className="surface-card surface-card--static h-72 animate-pulse" aria-hidden />}>
      <UnifiedSearchInner />
    </Suspense>
  );
}
