'use client';

import { LayoutGrid, LayoutList, SlidersHorizontal } from 'lucide-react';
import { IntelligentSearchBar, type Suggestion } from '@/components/university-search/IntelligentSearchBar';
import type { SortOption } from '@/lib/university-search/search-params';
import { cn } from '@/lib/utils';
import { SortMenu } from './SortMenu';

interface SearchToolbarProps {
  query: string;
  onQueryChange: (v: string) => void;
  onSubmitQuery: () => void;
  onSelectSuggestion: (item: Suggestion) => void;
  resultCount: number;
  totalCount: number | null;
  /** true when the loaded page is being narrowed client-side (tier filter or instant-q) */
  isClientFiltered: boolean;
  isLoading: boolean;
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (m: 'grid' | 'list') => void;
  activeFilterCount: number;
  onOpenMobileFilters: () => void;
}

function CountText({
  resultCount,
  totalCount,
  isClientFiltered,
  isLoading,
}: Pick<SearchToolbarProps, 'resultCount' | 'totalCount' | 'isClientFiltered' | 'isLoading'>) {
  if (isLoading) {
    return (
      <span className="inline-flex items-center" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading results</span>
        <span aria-hidden className="h-4 w-24 animate-pulse rounded-full bg-muted" />
      </span>
    );
  }
  // When client filters (tiers / instant-q) narrow the loaded page, the server
  // totalCount no longer describes what's on screen — report the shown count
  // instead of a figure that contradicts the visible grid.
  const label = isClientFiltered
    ? totalCount === null
      ? `${resultCount.toLocaleString()} shown`
      : `${resultCount.toLocaleString()} of ${totalCount.toLocaleString()} shown`
    : totalCount === null
      ? `${resultCount.toLocaleString()}+ results`
      : `${totalCount.toLocaleString()} ${totalCount === 1 ? 'programme' : 'programmes'}`;
  return (
    <span className="whitespace-nowrap text-sm font-medium tabular-nums text-muted-foreground" aria-live="polite">
      {label}
    </span>
  );
}

export function SearchToolbar({
  query,
  onQueryChange,
  onSubmitQuery,
  onSelectSuggestion,
  resultCount,
  totalCount,
  isClientFiltered,
  isLoading,
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
  activeFilterCount,
  onOpenMobileFilters,
}: SearchToolbarProps) {
  // top offset clears the fixed navbar, which grows at `sm` (60px logo) — so the
  // sticky offset must bump at `sm` too, not `md`. `!overflow-visible` overrides
  // `surface-toolbar`'s `overflow-hidden` so the search autocomplete panel and
  // the SortMenu dropdown (absolute-positioned descendants) aren't clipped; the
  // rounded radius doesn't need overflow clipping.
  return (
    <div className="surface-toolbar !overflow-visible sticky top-20 sm:top-24 z-20 rounded-2xl !px-3 !py-3 sm:!px-4">
      {/* Stable layout: one row on lg+, an intentional two-row wrap below (search
          on the first row, controls on the second) — never a jumpy 1↔2 reflow. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          className="w-full lg:min-w-[200px] lg:flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitQuery();
          }}
        >
          <IntelligentSearchBar
            value={query}
            onChange={onQueryChange}
            onSelectSuggestion={onSelectSuggestion}
            placeholder="Search universities or courses…"
            variant="minimal"
          />
        </form>

        <div className="flex items-center gap-2">
          <div className="mr-auto hidden md:block lg:mr-2">
            <CountText
              resultCount={resultCount}
              totalCount={totalCount}
              isClientFiltered={isClientFiltered}
              isLoading={isLoading}
            />
          </div>

          <SortMenu value={sort} onChange={onSortChange} />

          <div
            role="group"
            aria-label="View mode"
            className="flex items-center gap-1 rounded-full border border-transparent bg-transparent p-1 transition-colors hover:border-border dark:hover:border-white/10"
          >
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              aria-pressed={viewMode === 'grid'}
              aria-label="Grid view"
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                viewMode === 'grid' ? 'bg-primary/10 text-primary-ink' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              aria-pressed={viewMode === 'list'}
              aria-label="List view"
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                viewMode === 'list' ? 'bg-primary/10 text-primary-ink' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutList className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenMobileFilters}
            className="relative inline-flex h-11 min-h-[44px] items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-[box-shadow,border-color,background-color] duration-200 cursor-pointer hover:shadow-e-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden dark:border-white/10"
          >
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>Filters</span>
            {activeFilterCount > 0 ? (
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}
