'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Globe, GraduationCap, DollarSign, Calendar, ExternalLink, Bookmark, BookmarkCheck, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { trackEvent } from '@/lib/analytics';
import type { Scholarship } from './types';
import { filterScholarships } from './utils';
import { SCHOLARSHIP_VISUAL, type ScholarshipCategory } from '@/lib/theme/categories';
import { parseLocalDate, daysUntil } from '@/lib/utils/dates';

interface ScholarshipExplorerProps {
  scholarships: Scholarship[];
}

const resolveCategory = (raw: string | null | undefined): ScholarshipCategory => {
  const key = (raw ?? 'General') as ScholarshipCategory;
  return key in SCHOLARSHIP_VISUAL ? key : 'General';
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

const listVariants = {
  show: { transition: { staggerChildren: 0.06 } },
};

function formatDeadline(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Rolling';
  try {
    return parseLocalDate(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [level, setLevel] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
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
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, category, or country…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
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
              'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all hover:-translate-y-0.5',
              showFilters || hasFilters
                ? 'border-primary/30 bg-primary/5 text-primary'
                : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Filter className="h-4 w-4" />
            {showFilters ? 'Hide filters' : 'Filters'}
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
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
                  <label htmlFor="scholarship-filter-country" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                    <Globe className="h-3 w-3" /> Country
                  </label>
                  <select
                    id="scholarship-filter-country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">All countries</option>
                    {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="scholarship-filter-level" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                    <GraduationCap className="h-3 w-3" /> Level
                  </label>
                  <select
                    id="scholarship-filter-level"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">All levels</option>
                    {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="scholarship-filter-max-award" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                    <DollarSign className="h-3 w-3" /> Max award (USD)
                  </label>
                  <input
                    id="scholarship-filter-max-award"
                    type="number"
                    placeholder="e.g. 50000"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status row */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{filtered.length}</span> of {scholarships.length} scholarships
            {saved.size > 0 && <span className="ml-2 text-emerald-600">· {saved.size} saved</span>}
          </p>
          {hasFilters && (
            <button onClick={resetFilters} className="text-[11px] font-medium text-muted-foreground hover:text-rose-500 transition-colors flex items-center gap-1">
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center"
          >
            <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No scholarships match these filters</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Try widening your search or clearing filters</p>
            <button onClick={resetFilters} className="mt-4 text-xs font-semibold text-primary hover:underline">Clear all filters</button>
          </motion.div>
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
                    'group relative overflow-hidden rounded-2xl border border-l-4 bg-card p-4 sm:p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
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
                            <span className="rounded-full bg-rose-500/10 border border-rose-200/50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-rose-600 motion-safe:animate-pulse dark:text-rose-400 dark:border-rose-500/20">
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
                          <span className={cn('flex items-center gap-1', urgent && 'text-rose-500 font-medium dark:text-rose-400')}>
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
                        <p className="text-[10px] text-muted-foreground">per award</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleSave(scholarship)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:-translate-y-0.5',
                            isSaved
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-200/50'
                              : 'border border-border text-muted-foreground hover:border-primary/20 hover:text-primary hover:bg-primary/5'
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
                            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:text-foreground hover:bg-muted/40"
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
