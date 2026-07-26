'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Clock, Sparkles, Target, Trash2, GitCompareArrows } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { PageHero } from '@/components/layout/page-hero';
import { Skeleton } from '@/components/ui/skeleton';
import { useShortlist } from '@/components/university-search/shortlist-store';
import { ComparisonModal } from '@/components/university-search/ComparisonModal';
import type { ProgramSearchResult } from '@/components/university-search/types';
import { cn } from '@/lib/utils';
import { classifyFitTier, TIER_VISUAL, TIER_LABEL, type FitTier } from '@/lib/theme/categories';
import { getFitScoreVisuals } from '@/lib/theme/fit-score';

const stageTone = {
  Researching: 'bg-warning-subtle text-warning border-warning/25',
  Shortlisted: 'bg-info-subtle text-info border-info/25',
  Active: 'bg-success-subtle text-success border-success/25'
};

const classifyFit = classifyFitTier;

export default function UniversitySearchShortlistPage() {
  const { items, removeItem, ready } = useShortlist();
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);

  const comparisonItems: ProgramSearchResult[] = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        universityId: item.id,
        universityName: item.name,
        programName: item.program ?? 'Program',
        location: item.location ?? '',
        fitScore: item.fitScore ?? null,
        tier: null,
        highlights: [],
        durationLabel: null,
        levelLabel: null,
        tuitionLabel: null,
        requiresTest: null,
      })),
    [items]
  );

  const metrics = useMemo(() => {
    const count = items.length;
    const scored = items.filter((item) => typeof item.fitScore === 'number') as { fitScore: number }[];
    const avgFit = scored.length ? Math.round(scored.reduce((sum, item) => sum + item.fitScore, 0) / scored.length) : null;
    const tierCounts: Record<FitTier, number> = { reach: 0, match: 0, safety: 0 };
    items.forEach((item) => {
      const tier = classifyFit(item.fitScore ?? null);
      if (tier) tierCounts[tier] += 1;
    });
    return { count, avgFit, tierCounts };
  }, [items]);

  if (!ready) {
    return (
      <div className="space-y-8 pb-24">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      <header className="space-y-6">
        <PageHero
          tone="student"
          eyebrow="Explore · Shortlist"
          title="Shortlist"
          description="Courses you saved from search and matches. Track fit, next actions, and reopen them in results to compare."
          highlight={`${items.length} saved`}
          breadcrumbs={<Breadcrumbs />}
          actions={
            <>
              {items.length >= 2 && (
                <Button size="sm" onClick={() => setIsComparisonOpen(true)} className="gap-2">
                  <GitCompareArrows className="h-4 w-4" />
                  Compare {items.length} programs
                </Button>
              )}
              <Button asChild size="sm" variant="secondary">
                <Link href="/university-search/search">Add more courses</Link>
              </Button>
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-dashed border-border/70">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <span className="eyebrow">Shortlisted</span>
              <Sparkles className="h-5 w-5 text-warning" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-foreground">{metrics.count}</p>
              <p className="text-xs text-muted-foreground">Saved from search</p>
            </CardContent>
          </Card>
          <Card className="border-dashed border-border/70">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <span className="eyebrow">Reach / Match / Safe</span>
              <Target className="h-5 w-5 text-success" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-foreground tabular-nums">
                {metrics.tierCounts.reach}/{metrics.tierCounts.match}/{metrics.tierCounts.safety}
              </p>
              <p className="text-xs text-muted-foreground">Banding across saved programs</p>
            </CardContent>
          </Card>
          <Card className="border-dashed border-border/70">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <span className="eyebrow">Avg fit</span>
              <Target className="h-5 w-5 text-success" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-foreground">{metrics.avgFit !== null ? `${metrics.avgFit}%` : 'N/A'}</p>
              <p className="text-xs text-muted-foreground">Across shortlisted programs</p>
            </CardContent>
          </Card>
          <Card className="border-dashed border-border/70">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <span className="eyebrow">Next steps</span>
              <Clock className="h-5 w-5 text-feature" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-foreground">
                {items.reduce<string | null>((earliest, item) => {
                  if (!item.due) return earliest;
                  if (!earliest) return item.due;
                  return item.due < earliest ? item.due : earliest;
                }, null) ?? 'Set due dates'}
              </p>
              <p className="text-xs text-muted-foreground">Use next actions to keep momentum</p>
            </CardContent>
          </Card>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Saved programs</p>
            <h2 className="text-xl font-semibold text-foreground">Shortlist board</h2>
            <p className="text-sm text-muted-foreground">Refine your picks, open them in results, or remove them here.</p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/40 px-8 py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Sparkles className="h-6 w-6 text-primary-ink" aria-hidden />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No courses saved yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Shortlist directly from results to track actions and compare programs.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/university-search/search">Browse results</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {items.map((item) => {
              const tier = classifyFit(item.fitScore ?? null);
              const visual = tier ? TIER_VISUAL[tier] : null;
              const TierIcon = visual?.icon;
              return (
                <Card
                  key={item.id}
                  className={cn(
                    'border border-l-4 bg-card hover-lift',
                    visual ? cn(visual.border, visual.accent) : 'border-l-border'
                  )}
                >
                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        {visual ? (
                          <div className={visual.swatch}>
                            {TierIcon ? <TierIcon className="h-4 w-4" /> : null}
                          </div>
                        ) : null}
                        <div className="min-w-0">
                          <p className="eyebrow">
                            {item.location ?? 'Location TBC'}
                          </p>
                          <CardTitle className="text-xl text-foreground">{item.name}</CardTitle>
                          <p className="text-sm text-muted-foreground">{item.program}</p>
                        </div>
                      </div>
                      {/* Banded, not always-green. This chip used to be hardcoded to the
                          success tone, so a 20%-fit programme advertised its score in
                          "good" green — contradicting the tier chip directly beneath it —
                          and "Fit TBD" did the same with no score at all. */}
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1',
                          getFitScoreVisuals(item.fitScore).badgeClass
                        )}
                      >
                        {typeof item.fitScore === 'number' ? `${Math.round(item.fitScore)}% fit` : 'Fit TBD'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {visual && tier ? (
                        <span
                          className={cn(visual.chip, 'uppercase tracking-[0.18em]')}
                          role="status"
                          aria-label={`Banding: ${TIER_LABEL[tier]}`}
                        >
                          {TierIcon ? <TierIcon className="h-3 w-3" aria-hidden /> : null}
                          {TIER_LABEL[tier]}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                          Fit TBD
                        </span>
                      )}
                      <span
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em]',
                          stageTone[item.stage as keyof typeof stageTone] ?? 'bg-muted text-foreground border-border'
                        )}
                        role="status"
                        aria-label={`Stage: ${item.stage ?? 'Researching'}`}
                      >
                        {item.stage ?? 'Researching'}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                        <span>{item.due ?? 'Set a date'}</span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    <div className="rounded-2xl bg-muted/60 p-4">
                      <p className="eyebrow">Next action</p>
                      <p className="mt-1 text-sm text-foreground">{item.nextAction ?? 'Add a next action to keep momentum.'}</p>
                    </div>
                  </CardContent>

                  <CardFooter className="flex flex-wrap items-center justify-between gap-3 pt-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeItem(item.id)}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Remove
                    </Button>
                    {item.id.endsWith('-shortlist') ? (
                      // Legacy title-based ids don't resolve to a real /course/[id]
                      // row, so we omit the link rather than render a dead end.
                      <span className="text-xs text-muted-foreground">Open from search to view course</span>
                    ) : (
                      <Button asChild size="sm" variant="secondary" className="gap-2">
                        <Link href={`/course/${item.id}`}>
                          Open course <ArrowUpRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <ComparisonModal
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        universities={comparisonItems}
        onRemove={(id) => removeItem(id)}
        maxItems={5}
      />
    </div>
  );
}
