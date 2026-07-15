'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, SlidersHorizontal, ChevronDown, X, Filter, FilterX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSearchParamState } from '@/lib/hooks/use-search-param-state';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import { StudentCard } from './student-card';
import type { DashboardFilter } from '../page';

interface StudentRosterProps {
  students: CounsellorStudent[];
  externalFilter?: DashboardFilter;
  onClearExternalFilter?: () => void;
  initialProgramme?: 'IB' | 'A_LEVEL';
  initialField?: string;
  initialFlagFilter?: 'flagged';
}

type SortKey = 'name' | 'completion' | 'matchScore' | 'lastActive';
type ProgrammeFilter = 'all' | 'IB' | 'A_LEVEL';
type FlagFilter = 'all' | 'flagged' | 'clear';

const STAGE_MAP: Record<string, string> = {
  planning: 'Planning',
  inProgress: 'In Progress',
  submitted: 'Submitted',
  decision: 'Decision'
};

const TIER_MAP: Record<string, string> = {
  reach: 'Reach',
  match: 'Match',
  safe: 'Safe'
};

function getAvgScore(s: CounsellorStudent) {
  if (s.matches.length === 0) return 0;
  return s.matches.reduce((acc, m) => acc + m.score, 0) / s.matches.length;
}

export const StudentRoster = ({ students, externalFilter, onClearExternalFilter, initialProgramme, initialField, initialFlagFilter }: StudentRosterProps) => {
  const [sortKey, setSortKey] = useSearchParamState('sort', 'name');
  const [programme, setProgramme] = useSearchParamState('programme', initialProgramme ?? 'all');
  const [flagFilter, setFlagFilter] = useSearchParamState('filter', initialFlagFilter ?? 'all');
  const [fieldFilter, setFieldFilter] = useSearchParamState('field', initialField ?? '');
  // Free-text query stays in local state for instant filtering; the URL param
  // trails it on a debounce so keystrokes don't spam router.replace.
  const [qParam, setQueryParam] = useSearchParamState('q', '');
  const [query, setQuery] = useState(qParam);
  const [filtersOpen, setFiltersOpen] = useState(!!(initialProgramme || initialField || initialFlagFilter));
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQueryParam(query), 250);
    return () => clearTimeout(t);
  }, [query, setQueryParam]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = useMemo(() => {
    let list = [...students];

    // Apply dashboard-level (external) filters first
    if (externalFilter?.type === 'stage' && externalFilter.value) {
      const stageValue = externalFilter.value === 'inProgress' ? 'in_progress' : externalFilter.value;
      list = list.filter((s) => s.applications.some((app) => app.status === stageValue));
    } else if (externalFilter?.type === 'tier' && externalFilter.value) {
      const targetTier = TIER_MAP[externalFilter.value];
      list = list.filter((s) => s.matches.some((m) => m.tier === targetTier));
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (s) =>
          `${s.personal.firstName} ${s.personal.lastName}`.toLowerCase().includes(q) ||
          s.personal.school.toLowerCase().includes(q) ||
          s.personal.nationality.toLowerCase().includes(q) ||
          s.personal.schoolCountry.toLowerCase().includes(q)
      );
    }

    if (programme !== 'all') {
      list = list.filter((s) => s.academic.programmeType === programme);
    }

    if (fieldFilter) list = list.filter((s) => s.academic.clusters.includes(fieldFilter));

    if (flagFilter === 'flagged') list = list.filter((s) => s.flags.length > 0);
    if (flagFilter === 'clear') list = list.filter((s) => s.flags.length === 0);

    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return `${a.personal.firstName} ${a.personal.lastName}`.localeCompare(`${b.personal.firstName} ${b.personal.lastName}`);
        case 'completion':
          return b.profile.completionPct - a.profile.completionPct;
        case 'matchScore':
          return getAvgScore(b) - getAvgScore(a);
        case 'lastActive':
          return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
        default:
          return 0;
      }
    });

    return list;
  }, [students, query, sortKey, programme, fieldFilter, flagFilter, externalFilter]);

  const SORT_OPTS: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'completion', label: 'Completion %' },
    { key: 'matchScore', label: 'Match score' },
    { key: 'lastActive', label: 'Last active' }
  ];

  const hasExternalFilter = !!(externalFilter?.type && externalFilter.value);
  const filterLabel = externalFilter?.type === 'stage'
    ? STAGE_MAP[externalFilter.value!]
    : externalFilter?.type === 'tier'
      ? TIER_MAP[externalFilter.value!]
      : '';

  return (
    <div className="space-y-6">
      {/* Dashboard Filter Feedback */}
      <AnimatePresence>
        {hasExternalFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary">
              <Filter className="h-3 w-3" />
              Showing {filterLabel} students
              <button
                onClick={onClearExternalFilter}
                className="ml-1 rounded-full p-0.5 hover:bg-primary/10"
                title="Clear dashboard filter"
                aria-label="Clear filters"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              Click the chart again to reset
            </p>
          </motion.div>
        )}
        {fieldFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold capitalize text-primary">
              <Filter className="h-3 w-3" />
              Field: {fieldFilter.replace(/_/g, ' ')}
              <button
                onClick={() => setFieldFilter('')}
                className="ml-1 rounded-full p-0.5 hover:bg-primary/10"
                title="Clear field filter"
                aria-label="Clear field filter"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search + filter bar */}
      <div className="panel flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="student-roster-search" className="sr-only">
            Search by name, school, or nationality
          </label>
          <input
            id="student-roster-search"
            ref={searchRef}
            type="text"
            placeholder="Search by name, school, nationality…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline-block">
            /
          </kbd>
        </div>

        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className={cn(
            'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
            filtersOpen ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted/60'
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          <ChevronDown className={cn('h-3.5 w-3.5 transition', filtersOpen && 'rotate-180')} />
        </button>

        <span className="shrink-0 text-sm text-muted-foreground">
          {filtered.length} of {students.length}
        </span>
      </div>

      {/* Expanded filters */}
      {filtersOpen && (
        <div className="surface-card surface-card--static grid grid-cols-2 gap-4 md:grid-cols-3">
          {/* Sort */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Sort by</p>
            <div className="flex flex-col gap-1">
              {SORT_OPTS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  aria-pressed={sortKey === key}
                  className={cn(
                    'rounded-xl px-3 py-1.5 text-left text-sm transition',
                    sortKey === key ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Programme */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Programme</p>
            <div className="flex flex-col gap-1">
              {(['all', 'IB', 'A_LEVEL'] as ProgrammeFilter[]).map((val) => (
                <button
                  key={val}
                  onClick={() => setProgramme(val)}
                  aria-pressed={programme === val}
                  className={cn(
                    'rounded-xl px-3 py-1.5 text-left text-sm transition',
                    programme === val ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  {val === 'all' ? 'All' : val === 'IB' ? 'IB' : 'A-Level'}
                </button>
              ))}
            </div>
          </div>

          {/* Flags */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Status</p>
            <div className="flex flex-col gap-1">
              {(['all', 'flagged', 'clear'] as FlagFilter[]).map((val) => (
                <button
                  key={val}
                  onClick={() => setFlagFilter(val)}
                  aria-pressed={flagFilter === val}
                  className={cn(
                    'rounded-xl px-3 py-1.5 text-left text-sm transition',
                    flagFilter === val ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  {val === 'all' ? 'All students' : val === 'flagged' ? 'Needs attention' : 'On track'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <motion.div
          layout
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((student) => (
              <motion.div
                key={student.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="[content-visibility:auto] [contain-intrinsic-size:auto_220px]"
              >
                <StudentCard student={student} highlight={query.trim()} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-border bg-muted/40 p-12 text-center">
          <p className="text-base font-semibold text-foreground">No students match these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">Adjust the search, programme, or status filter.</p>
          {(hasExternalFilter || query || programme !== 'all' || flagFilter !== 'all') && (
            <button
              onClick={() => {
                onClearExternalFilter?.();
                setQuery('');
                setProgramme('all');
                setFlagFilter('all');
                setFieldFilter('');
                setSortKey('name');
              }}
              className="mt-4 flex items-center gap-2 mx-auto rounded-full border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted/60"
            >
              <FilterX className="h-4 w-4" />
              Reset all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};
