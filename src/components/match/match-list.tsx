'use client';

import { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParamState } from '@/lib/hooks/use-search-param-state';
import { UniversityCard } from '@/components/university-card';
import type { MatchTier } from '@/lib/matching/match-tier';
import { cn } from '@/lib/utils';
import { Grid, LayoutList, ChevronDown, Info } from 'lucide-react';
import type { EnrichedMatch } from '@/lib/matching/types';
import { MATCHES_TEXT } from '@/lib/constants/text';
import { TIER_VISUAL, type FitTier } from '@/lib/theme/categories';

const MATCH_TIER_TO_FIT: Record<MatchTier, FitTier> = {
  Reach: 'reach',
  Match: 'match',
  Safe: 'safety'
};

interface MatchListProps {
  matches: EnrichedMatch[];
}

const TIER_ORDER: MatchTier[] = ['Match', 'Safe', 'Reach'];
const TIER_DESCRIPTIONS: Record<MatchTier, string> = MATCHES_TEXT.tierDescriptions;

const INITIAL_PER_TIER = 6;
const EXPAND_STEP = 12;
const MAX_PER_UNIVERSITY = 2;
const tierCardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as any } }
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as any } }
};

/** Deduplicate per-university, preserving sort order. */
const dedupeByUniversity = (items: EnrichedMatch[], maxPerUni: number): EnrichedMatch[] => {
  const uniCounts = new Map<string, number>();
  const out: EnrichedMatch[] = [];
  for (const item of items) {
    const key = item.university.id || item.university.name;
    const count = uniCounts.get(key) ?? 0;
    if (count >= maxPerUni) continue;
    uniCounts.set(key, count + 1);
    out.push(item);
  }
  return out;
};

export const MatchList = ({ matches }: MatchListProps) => {
  const [selectedTierParam, setSelectedTier] = useSearchParamState('tier', 'All');
  // Both params come straight off the URL, so they have to be validated rather than cast.
  // An unrecognised ?tier= (stale link, renamed tier, hand-edited URL) used to blank the
  // whole page: `matches.length` is still non-zero so the no-results state never showed,
  // and no tier group's `tier === selectedTier`, so every card vanished with no explanation.
  const selectedTier: MatchTier | 'All' =
    (TIER_ORDER as string[]).includes(selectedTierParam) ? (selectedTierParam as MatchTier) : 'All';
  const [viewModeParam, setViewMode] = useSearchParamState('view', 'grid');
  const viewMode: 'grid' | 'list' = viewModeParam === 'list' ? 'list' : 'grid';
  const [tierLimits, setTierLimits] = useState<Record<MatchTier, number>>({
    Reach: INITIAL_PER_TIER,
    Match: INITIAL_PER_TIER,
    Safe: INITIAL_PER_TIER
  });

  const filteredMatches = useMemo(() => {
    if (selectedTier === 'All') return matches;
    return matches.filter((m) => m.tier === selectedTier);
  }, [matches, selectedTier]);

  const tierGroups = useMemo(() => {
    const accumulator: Record<MatchTier, EnrichedMatch[]> = {
      Reach: [],
      Match: [],
      Safe: []
    };
    filteredMatches.forEach((match) => {
      accumulator[match.tier].push(match);
    });
    return TIER_ORDER.map((tier) => {
      const all = dedupeByUniversity(accumulator[tier], MAX_PER_UNIVERSITY);
      const visible = all.slice(0, tierLimits[tier]);
      return {
        tier,
        visible,
        totalDeduped: all.length,
        totalRaw: accumulator[tier].length,
        hasMore: all.length > tierLimits[tier]
      };
    });
  }, [filteredMatches, tierLimits]);

  const handleShowMore = useCallback((tier: MatchTier) => {
    setTierLimits((prev) => ({
      ...prev,
      [tier]: prev[tier] + EXPAND_STEP
    }));
  }, []);

  const totalShown = tierGroups.reduce((sum, g) => sum + g.visible.length, 0);

  return (
    <div className="space-y-8 pb-24">
      {/* `match-tiers` — the reach/match/safe legend and filter. Anchored here
          rather than on a tier group below because this bar is always present, and
          the coach drops any step whose anchor is missing (see
          lib/onboarding/tours.ts). */}
      <div
        data-tour="match-tiers"
        className="surface-toolbar flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      >
        <div className="relative z-10 flex flex-col gap-1">
          <p className="eyebrow">
            {MATCHES_TEXT.list.headerEyebrow}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {totalShown} of {matches.length} program{matches.length === 1 ? '' : 's'} ranked by admission probability
          </p>
          <div className="hidden sm:flex items-center gap-1.5 mt-1">
            <Info className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <p className="text-label text-muted-foreground/80">
              <span className={cn('font-semibold', TIER_VISUAL.reach.text)}>Reach</span>
              {' \u00B7 '}
              <span className={cn('font-semibold', TIER_VISUAL.match.text)}>Match</span>
              {' \u00B7 '}
              <span className={cn('font-semibold', TIER_VISUAL.safety.text)}>Safe</span>
              {' \u2014 tiers weigh each programme\u2019s selectivity against your academic profile; the % on each card is its estimated admission chance.'}
            </p>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-background/80 p-1.5 shadow-e-1">
            {(['All', ...TIER_ORDER] as const).map((tier) => (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                aria-pressed={selectedTier === tier}
                className={cn(
                  'rounded-xl px-3 py-1.5 text-xs font-medium capitalize transition-[color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  selectedTier === tier
                    ? 'bg-primary text-primary-foreground shadow-e-2'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {tier}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-background/80 p-1.5 shadow-e-1">
            <button
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-xl transition-[color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                viewMode === 'grid'
                  ? 'bg-primary/10 text-primary-ink shadow-e-1'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="Grid view"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-xl transition-[color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                viewMode === 'list'
                  ? 'bg-primary/10 text-primary-ink shadow-e-1'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="List view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* `match-list` — the ranked results themselves, NOT the wrapper above. The
          wrapper is the whole page; spotlighting it would dim nothing and point at
          everything. */}
      <section data-tour="match-list" className="space-y-6">
        {matches.length === 0 ? (
          <div className="rounded-4xl border border-dashed border-border bg-muted/60 p-10 text-center text-muted-foreground">
            {MATCHES_TEXT.list.noResults}
          </div>
        ) : (
          tierGroups.map(({ tier, visible, totalDeduped, hasMore }) => {
            const visual = TIER_VISUAL[MATCH_TIER_TO_FIT[tier]];
            const TierIcon = visual.icon;
            return (selectedTier === 'All' ? totalDeduped > 0 : tier === selectedTier) ? (
              <motion.div
                key={tier}
                className={cn('surface-stage space-y-5 border-l-4', visual.border, visual.accent)}
                variants={tierCardVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-40px' }}
              >
                <div className="flex flex-col gap-3 border-b border-border pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={visual.swatch}>
                        <TierIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className={cn('eyebrow', visual.text)}>Tier</p>
                        <h3 className="text-2xl font-semibold text-foreground">
                          {tier} programs
                          <span className="ml-2 text-base font-normal text-muted-foreground">
                            ({totalDeduped})
                          </span>
                        </h3>
                      </div>
                    </div>
                    <span className={cn(visual.chip, 'shrink-0 uppercase tracking-[0.3em]')}>
                      {tier}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{TIER_DESCRIPTIONS[tier]}</p>
                </div>

                {visible.length ? (
                  <>
                    <div
                      className={cn(
                        'grid gap-6',
                        viewMode === 'grid'
                          ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
                          : 'grid-cols-1'
                      )}
                    >
                      <AnimatePresence initial={false}>
                      {visible.map((match) => (
                        <motion.div
                          key={match.program.id}
                          variants={cardVariants}
                          initial="hidden"
                          animate="show"
                          layout
                        >
                          <UniversityCard
                            id={match.program.id}
                            name={match.university.name}
                            program={match.program.name}
                            location={match.university.country}
                            fitScore={match.score}
                            tier={match.tier}
                            reasons={match.blockingReasons}
                            highlights={[
                              match.program.field ?? match.program.level ?? 'Program',
                              match.program.tuition != null
                                ? `${match.program.currency ?? 'GBP'} ${Math.round(match.program.tuition).toLocaleString()}/yr`
                                : null,
                              match.program.language && match.program.language !== 'English' ? match.program.language : null
                            ].filter((h): h is string => h != null)}
                            variant={viewMode === 'list' ? 'compact' : 'default'}
                          />
                        </motion.div>
                      ))}
                      </AnimatePresence>
                    </div>
                    {hasMore && (
                      <div className="flex justify-center pt-4">
                        <button
                          onClick={() => handleShowMore(tier)}
                          className="group flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-e-2 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-e-3"
                        >
                          Show {Math.min(EXPAND_STEP, totalDeduped - tierLimits[tier])} more {tier.toLowerCase()} programs
                          <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
                    No programs in this tier yet.
                  </div>
                )}
              </motion.div>
            ) : null;
          })
        )}
      </section>

    </div>
  );
};
