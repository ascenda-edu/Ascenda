'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Globe, GraduationCap, DollarSign, Calendar, ExternalLink, Bookmark, BookmarkCheck, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { trackEvent } from '@/lib/analytics';
import type { Scholarship } from './types';
import { filterScholarships } from './utils';
import { SCHOLARSHIP_VISUAL, type ScholarshipCategory } from '@/lib/theme/categories';
import { parseLocalDate, daysUntil } from '@/lib/utils/dates';
import { useSearchParamState } from '@/lib/hooks/use-search-param-state';
import { EASE, DURATION, stagger } from '@/lib/motion';

interface ScholarshipExplorerProps {
  scholarships: Scholarship[];
}

const resolveCategory = (raw: string | null | undefined): ScholarshipCategory => {
  const key = (raw ?? 'General') as ScholarshipCategory;
  return key in SCHOLARSHIP_VISUAL ? key : 'General';
};

// Kept local rather than importing `cardFade`: these cards animate out of an
// AnimatePresence list on filter change, and the exit scales without translating so a
// removed card doesn't appear to travel. Curve and durations are the shared tokens.
const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: DURATION.exit, ease: EASE } },
};

const listVariants = stagger;

function formatDeadline(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Rolling';
  try {
    return parseLocalDate(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function isUrgent(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const diff = daysUntil(dateStr);
  return diff >= 0 && diff <= 30;
}

export const ScholarshipExplorer = ({ scholarships }: ScholarshipExplorerProps) => {
  const [query, setQuery] = useSearchParamState('q', '');
  const [country, setCountry] = useSearchParamState('country', '');
  const [level, setLevel] = useSearchParamState('level', '');
  const [maxAmount, setMaxAmount] = useSearchParamState('maxAmount', '');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { showToast } = useToast();

  // Persist saved scholarships locally so the list survives a refresh. (There's
  // no `scholarships` table yet, so localStorage is the only durable store.)
  const SAVED_KEY = 'ascenda-saved-scholarships';
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(new Set(JSON.parse(raw) as string[]));
    } catch {
      // ignore malformed/unavailable storage
    }
    setSavedLoaded(true);
  }, []);

  useEffect(() => {
    if (!savedLoaded) return;
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify([...saved]));
    } catch {
      // ignore
    }
  }, [saved, savedLoaded]);

  const countries = useMemo(
    () => Array.from(new Set(scholarships.map((s) => s.country).filter(Boolean))) as string[],
    [scholarships]
  );
  const levels = useMemo(
    () => Array.from(new Set(scholarships.map((s) => s.level ?? 'Any level'))).sort(),
    [scholarships]
  );

  const filtered = useMemo(
    () => filterScholarships(scholarships, {
      country,
      level: level === 'Any level' ? undefined : level,
      query,
      maxAmount: maxAmount && isFinite(Number(maxAmount)) ? Number(maxAmount) : null,
    }),
    [scholarships, country, level, query, maxAmount]
  );

  const activeFilterCount = [country, level, maxAmount].filter(Boolean).length;
  const hasFilters = query || country || level || maxAmount;

  const resetFilters = () => { setQuery(''); setCountry(''); setLevel(''); setMaxAmount(''); };

  const toggleSave = (s: Scholarship) => {
    const wasSaved = saved.has(s.id);
    setSaved((prev) => {
      const next = new Set(prev);
      if (wasSaved) {
        next.delete(s.id);
      } else {
        next.add(s.id);
      }
      return next;
    });
    if (wasSaved) {
      showToast({ title: `Removed "${s.name}" from saved scholarships`, variant: 'info' });
    } else {
      trackEvent('scholarship_saved', { scholarshipId: s.id });
      showToast({ title: `Saved "${s.name}" to your scholarship list`, variant: 'success' });
    }
  };

  return (
    <div className="relative space-y-5">
      {/* Search + filter bar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-e-1 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              aria-label="Search scholarships"
              placeholder="Search by name, category, or country…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters((f) => !f)}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-[transform,color,background-color,border-color] hover:-translate-y-0.5',
              showFilters || hasFilters
                ? 'border-primary/30 bg-primary/5 text-primary-ink'
                : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Filter className="h-4 w-4" />
            {showFilters ? 'Hide filters' : 'Filters'}
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-label font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3 pt-2 border-t border-border/50">
                <div className="space-y-1.5">
                  <label htmlFor="scholarship-filter-country" className="eyebrow flex items-center gap-1.5">
                    <Globe className="h-3 w-3" /> Country
                  </label>
                  {/* 'all' is a sentinel — Radix rejects an empty item value, and
                    * "All countries" is a real choice, not a placeholder. Mapped
                    * back to '' at the edge so filterScholarships is unchanged. */}
                  <Select
                    value={country || 'all'}
                    onValueChange={(value) => setCountry(value === 'all' ? '' : value)}
                  >
                    <SelectTrigger id="scholarship-filter-country" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All countries</SelectItem>
                      {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="scholarship-filter-level" className="eyebrow flex items-center gap-1.5">
                    <GraduationCap className="h-3 w-3" /> Level
                  </label>
                  <Select
                    value={level || 'all'}
                    onValueChange={(value) => setLevel(value === 'all' ? '' : value)}
                  >
                    <SelectTrigger id="scholarship-filter-level" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All levels</SelectItem>
                      {levels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="scholarship-filter-max-award" className="eyebrow flex items-center gap-1.5">
                    <DollarSign className="h-3 w-3" /> Max award (USD)
                  </label>
                  <input
                    id="scholarship-filter-max-award"
                    type="number"
                    placeholder="e.g. 50000"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status row */}
        <div className="flex items-center justify-between">
          <p className="text-label text-muted-foreground">
            <span className="font-semibold text-foreground">{filtered.length}</span> of {scholarships.length} scholarships
            {saved.size > 0 && <span className="ml-2 text-success">· {saved.size} saved</span>}
          </p>
          {hasFilters && (
            <button onClick={resetFilters} className="text-label font-medium text-muted-foreground hover:text-danger transition-colors flex items-center gap-1">
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <EmptyState
            key="empty"
            icon={Search}
            title="No scholarships match these filters"
            hint="Try widening your search or clearing filters"
            action={
              <button onClick={resetFilters} className="text-xs font-semibold text-primary-ink hover:underline">
                Clear all filters
              </button>
            }
          />
        ) : (
          <motion.div
            key="list"
            className="space-y-3"
            variants={listVariants}
            initial="hidden"
            animate="show"
          >
            {filtered.map((scholarship) => {
              const category = resolveCategory(scholarship.category);
              const visual = SCHOLARSHIP_VISUAL[category];
              const CatIcon = visual.icon;
              const isSaved = saved.has(scholarship.id);
              const urgent = isUrgent(scholarship.deadline);

              return (
                <motion.article
                  key={scholarship.id}
                  variants={cardVariants}
                  layout
                  className={cn(
                    'hover-lift group relative overflow-hidden rounded-2xl border border-l-4 bg-card p-4 sm:p-5 shadow-e-1',
                    visual.border,
                    visual.accent
                  )}
                >
                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-1 min-w-0 items-start gap-3">
                      <div className={visual.swatch}>
                        <CatIcon className="h-4 w-4" />
                      </div>
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn(visual.chip, 'uppercase tracking-[0.15em]')}>{category}</span>
                          {urgent && (
                            <span className="rounded-full bg-danger-subtle border border-danger/25 px-2.5 py-0.5 text-label font-bold uppercase tracking-[0.15em] text-danger motion-safe:animate-pulse">
                              Closing soon
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-foreground leading-snug">{scholarship.name}</h3>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {scholarship.country ?? scholarship.region ?? 'Global'}
                          </span>
                          <span className="flex items-center gap-1">
                            <GraduationCap className="h-3 w-3" />
                            {scholarship.level ?? 'Any level'}
                          </span>
                          <span className={cn('flex items-center gap-1', urgent && 'text-danger font-medium')}>
                            <Calendar className="h-3 w-3" />
                            {formatDeadline(scholarship.deadline)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: amount + actions */}
                    <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-xl font-bold text-foreground tabular-nums">
                          {scholarship.amount ? `${scholarship.currency ?? 'USD'} ${scholarship.amount.toLocaleString()}` : '—'}
                        </p>
                        <p className="text-label text-muted-foreground">per award</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleSave(scholarship)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-[transform,color,background-color,border-color] hover:-translate-y-0.5',
                            isSaved
                              ? 'bg-success-subtle text-success border border-success/25'
                              : 'border border-border text-muted-foreground hover:border-primary/20 hover:text-primary-ink hover:bg-primary/5'
                          )}
                        >
                          {isSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                          {isSaved ? 'Saved' : 'Save'}
                        </button>
                        {scholarship.url && (
                          <a
                            href={scholarship.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-[transform,color,background-color,border-color] hover:-translate-y-0.5 hover:border-primary/20 hover:text-foreground hover:bg-muted/40"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Details
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
