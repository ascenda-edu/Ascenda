'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  Globe,
  Heart,
  Search as SearchIcon,
  X,
  type LucideIcon
} from 'lucide-react';
import { AnimatedBlobBanner } from '@/components/animated-blob-banner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IntelligentSearchBar, Suggestion } from '@/components/university-search/IntelligentSearchBar';
import { SavedSearchesRow } from '@/components/university-search/saved-searches-row';
import {
  buildSearchResultsUrl,
  buildSuggestionResultsUrl,
  readFiltersFromParams,
  type FilterChip,
  type FilterGroupKey
} from '@/lib/university-search/search-params';

type FilterGroup = {
  key: FilterGroupKey;
  title: string;
  description: string;
  options: string[];
};

const FILTER_VISUAL: Record<FilterGroupKey, { icon: LucideIcon; chip: string; swatch: string; text: string }> = {
  country: {
    icon: Globe,
    chip: 'bg-sky-500/10 text-sky-600 border border-sky-200/60 dark:text-sky-400 dark:border-sky-500/20',
    swatch:
      'flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400',
    text: 'text-sky-600 dark:text-sky-400'
  },
  subject: {
    icon: BookOpen,
    chip: 'bg-violet-500/10 text-violet-600 border border-violet-200/60 dark:text-violet-400 dark:border-violet-500/20',
    swatch:
      'flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400',
    text: 'text-violet-600 dark:text-violet-400'
  },
  fitFocus: {
    icon: Compass,
    chip:
      'bg-emerald-500/10 text-emerald-600 border border-emerald-200/60 dark:text-emerald-400 dark:border-emerald-500/20',
    swatch:
      'flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400',
    text: 'text-emerald-600 dark:text-emerald-400'
  },
  lifestyle: {
    icon: Heart,
    chip: 'bg-amber-500/10 text-amber-600 border border-amber-200/60 dark:text-amber-400 dark:border-amber-500/20',
    swatch:
      'flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400',
    text: 'text-amber-600 dark:text-amber-400'
  }
};

const DEFAULT_FILTER_GROUPS: FilterGroup[] = [
  {
    key: 'country',
    title: 'Country',
    description: 'Where do you picture yourself living?',
    options: ['USA', 'UK', 'Canada', 'Australia', 'Singapore']
  },
  {
    key: 'subject',
    title: 'Subject',
    description: 'Pick the themes you want to explore.',
    options: ['Computer Science', 'Engineering', 'Design', 'Business', 'Humanities']
  },
  {
    key: 'fitFocus',
    title: 'Fit focus',
    description: 'Dial in what matters most for you.',
    options: ['Career outcomes', 'Research focus', 'Campus feel', 'Internships', 'Cost']
  },
  {
    key: 'lifestyle',
    title: 'Lifestyle',
    description: 'Choose the campus setting you want.',
    options: ['Big city', 'College town', 'Suburban', 'Coastal', 'Rural', 'Tech hub', 'Arts scene']
  }
];

interface FilterDropdownProps {
  group: FilterGroup;
  /** Values from this group that are currently selected. */
  selected: Set<string>;
  /** Toggle a value within this group. */
  onToggle: (group: FilterGroupKey, value: string) => void;
}

function FilterDropdown({ group, selected, onToggle }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visual = FILTER_VISUAL[group.key];
  const Icon = visual.icon;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent | globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside as EventListener);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside as EventListener);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const groupSelected = useMemo(
    () => group.options.filter((option) => selected.has(option)),
    [group.options, selected]
  );

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return group.options;
    return group.options.filter((option) => option.toLowerCase().includes(trimmed));
  }, [group.options, query]);

  return (
    <div className="surface-subcard space-y-3 shadow-none" ref={containerRef}>
      <div className="flex items-start gap-3">
        <div className={visual.swatch}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <p className={cn('text-xs font-semibold uppercase tracking-[0.3em]', visual.text)}>{group.title}</p>
          <p className="helper-text">{group.description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:border-border/80'
        )}
        aria-expanded={open}
      >
        <span className={cn('truncate', groupSelected.length === 0 && 'text-muted-foreground')}>
          {groupSelected.length === 0
            ? `Select ${group.title.toLowerCase()}`
            : groupSelected.length === 1
              ? groupSelected[0]
              : `${groupSelected.length} selected`}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {groupSelected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {groupSelected.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(group.key, option)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition hover:opacity-90',
                visual.chip
              )}
            >
              {option}
              <X className="h-3 w-3 shrink-0" aria-hidden />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="rounded-xl border border-border bg-background shadow-lg">
          <div className="relative border-b border-border p-2">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${group.title.toLowerCase()}…`}
              className="w-full rounded-lg border border-transparent bg-muted/40 py-1.5 pl-8 pr-3 text-sm focus:border-primary/30 focus:outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
            ) : (
              filtered.map((option) => {
                const isSelected = selected.has(option);
                return (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => onToggle(group.key, option)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition',
                        isSelected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60 text-foreground'
                      )}
                    >
                      <span>{option}</span>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

type SelectedByGroup = Record<FilterGroupKey, Set<string>>;

const emptySelectedByGroup = (): SelectedByGroup => ({
  country: new Set<string>(),
  subject: new Set<string>(),
  fitFocus: new Set<string>(),
  lifestyle: new Set<string>()
});

const chipsToSelectedByGroup = (chips: FilterChip[]): SelectedByGroup => {
  const next = emptySelectedByGroup();
  chips.forEach((chip) => next[chip.group].add(chip.value));
  return next;
};

const selectedByGroupToChips = (selected: SelectedByGroup): FilterChip[] => {
  const chips: FilterChip[] = [];
  (Object.keys(selected) as FilterGroupKey[]).forEach((group) => {
    selected[group].forEach((value) => chips.push({ group, value }));
  });
  return chips;
};

const totalSelected = (selected: SelectedByGroup): number =>
  (Object.keys(selected) as FilterGroupKey[]).reduce((sum, key) => sum + selected[key].size, 0);

function UniversitySearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get('q') ?? '';
  const initialChips = readFiltersFromParams(searchParams);
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(DEFAULT_FILTER_GROUPS);
  const [selectedByGroup, setSelectedByGroup] = useState<SelectedByGroup>(() =>
    chipsToSelectedByGroup(initialChips)
  );
  const [searchQuery, setSearchQuery] = useState(initialQuery);

  const selectedTotal = totalSelected(selectedByGroup);

  useEffect(() => {
    const uniqueSorted = (values: (string | null | undefined)[], limit = 60) =>
      Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, limit);

    const loadFilters = async () => {
      try {
        // Distinct values come from a cached API route backed by a
        // SELECT DISTINCT SQL function — never scan the 119k-row programs
        // table from the browser to derive ≤60 option strings.
        const res = await fetch('/api/search/filter-options');
        if (!res.ok) {
          console.warn('Using fallback filters — filter-options route failed', res.status);
          return;
        }
        const options = (await res.json()) as {
          countries?: string[];
          fields?: string[];
          studyLevels?: string[];
          levels?: string[];
          modes?: string[];
        };

        const countries = uniqueSorted(options.countries ?? []);
        const subjects = uniqueSorted([
          ...(options.fields ?? []),
          ...(options.studyLevels ?? []),
          ...(options.levels ?? [])
        ]);
        const fitFocus = uniqueSorted(options.modes ?? [], 16);

        setFilterGroups((prev) =>
          prev.map((group) => {
            if (group.key === 'country' && countries.length) return { ...group, options: countries };
            if (group.key === 'subject' && subjects.length) return { ...group, options: subjects };
            if (group.key === 'fitFocus' && fitFocus.length) return { ...group, options: fitFocus };
            // Lifestyle stays curated — DB region/city values aren't student-friendly.
            return group;
          })
        );
      } catch (err) {
        console.warn('Using fallback filters due to unexpected error', err);
      }
    };

    void loadFilters();
  }, []);

  const toggleFilter = (group: FilterGroupKey, value: string) => {
    setSelectedByGroup((prev) => {
      const nextSet = new Set(prev[group]);
      if (nextSet.has(value)) nextSet.delete(value);
      else nextSet.add(value);
      return { ...prev, [group]: nextSet };
    });
  };

  const resetFilters = () => {
    setSelectedByGroup(emptySelectedByGroup());
  };

  const handleSubmit = (event?: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    router.push(buildSearchResultsUrl(searchQuery, selectedByGroupToChips(selectedByGroup)));
  };

  const handleSelectSuggestion = (item: Suggestion) => {
    setSearchQuery(item.name);
    router.push(buildSuggestionResultsUrl(item));
  };

  return (
    <div className="space-y-8">
      <section className="surface-stage relative z-20 rounded-[28px] p-8 !overflow-visible">
        <div className="absolute inset-0 overflow-hidden rounded-[28px] pointer-events-none">
          <AnimatedBlobBanner className="opacity-80" />
        </div>
        <div className="relative z-20 space-y-8">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">Search hub</p>
            <div className="space-y-4">
              <h1 className="text-[1.5rem] font-semibold leading-tight text-foreground md:text-[2rem]">Cue up your next university discover session.</h1>
              <p className="text-base text-muted-foreground">
                Drop a keyword, layer filters, and preview how well each program syncs with your profile before you meet a counselor.
              </p>
            </div>
            <form
              onSubmit={handleSubmit}
              className="surface-stat space-y-3 rounded-[28px] p-4 !overflow-visible"
            >
              <label htmlFor="search-keyword" className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                universities or courses
              </label>
              <div className="space-y-3">
                <IntelligentSearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSelectSuggestion={handleSelectSuggestion}
                  inputId="search-keyword"
                  inputName="q"
                  placeholder="Search universities or courses by name, subject, or vibe"
                />
                <Button size="lg" className="w-full" type="submit" variant="soft">
                  Search
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <SavedSearchesRow />

      <section className="surface-card surface-card--static">
        <div className="flex flex-col gap-2 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">Filter universities</p>
          <h2 className="text-2xl font-semibold text-foreground">Tune the signals to surface better matches.</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {filterGroups.map((group) => (
            <FilterDropdown
              key={group.key}
              group={group}
              selected={selectedByGroup[group.key]}
              onToggle={toggleFilter}
            />
          ))}
        </div>
        {selectedByGroup.lifestyle.size > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Lifestyle picks help us prioritise — they don&apos;t hard-filter results.
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-4 border-t border-border pt-6 md:flex-row md:items-center md:justify-between">
          <p className="helper-text">
            {selectedTotal > 0
              ? `${selectedTotal} filter${selectedTotal === 1 ? '' : 's'} selected — click Apply to search`
              : 'Select filters above to narrow your search'}
          </p>
          <div className="flex gap-3">
            {selectedTotal > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset filters
              </button>
            )}
            <Button size="sm" type="button" onClick={handleSubmit}>Apply filters</Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function UniversitySearchPage() {
  return (
    <Suspense fallback={<div className="surface-stage h-72 animate-pulse rounded-[28px]" aria-hidden />}>
      <UniversitySearchPageInner />
    </Suspense>
  );
}
