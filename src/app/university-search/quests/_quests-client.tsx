'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, Heart, Scroll, Sparkles, Star, Swords } from 'lucide-react';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useShortlist } from '@/components/university-search/shortlist-store';
import { DECK_FIT, DECK_RARITY } from '@/lib/counsellor/deck-theme';
import type { StudentQuestDeck } from '@/lib/counsellor/decks';
import { cn } from '@/lib/utils';

// Student-facing quest log: counsellor-assigned decks with per-card actions
// that reuse existing flows (open the course page, save to Shortlist, start an
// application). "Cleared" = the student already has an application for the
// programme; starting one from here flips the card optimistically.

export function QuestsClient({ decks }: { decks: StudentQuestDeck[] }) {
  const { items: shortlistItems, addItem } = useShortlist();
  const { showToast } = useToast();

  // Programmes the student has started an application for. Seeded from the
  // server-computed `cleared` flag, then extended optimistically as they act.
  const [started, setStarted] = useState<Set<string>>(
    () => new Set(decks.flatMap((d) => d.quests.filter((q) => q.cleared).map((q) => q.programId)))
  );
  const [tracking, setTracking] = useState<string | null>(null);
  const shortlistIds = useMemo(() => new Set(shortlistItems.map((i) => i.id)), [shortlistItems]);

  const totals = useMemo(() => {
    const quests = decks.flatMap((d) => d.quests);
    return {
      quests: quests.length,
      cleared: quests.filter((q) => started.has(q.programId)).length,
      decks: decks.length,
    };
  }, [decks, started]);

  const startApplication = async (programId: string, label: string) => {
    if (started.has(programId) || tracking) return;
    setTracking(programId);
    try {
      const res = await fetch('/api/applications/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start application');
      setStarted((prev) => new Set(prev).add(programId));
      showToast({
        title: data.status === 'exists' ? 'Already in your applications' : `Application started · ${label}`,
        variant: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Could not start application',
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setTracking(null);
    }
  };

  const saveToShortlist = (programId: string, courseName: string, university: string, country: string) => {
    addItem({ id: programId, name: university, program: courseName, location: country || undefined });
    showToast({ title: `Saved to shortlist · ${university}`, variant: 'success' });
  };

  return (
    <div className="space-y-8 pb-24">
      <header className="space-y-6">
        <PageHero
          tone="student"
          eyebrow="Explore · Quests"
          title="Quests from your counsellor"
          description="Decks your counsellor curated for you. Clear a quest by starting an application — or save it to your shortlist to weigh it against your own picks."
          highlight={decks.length > 0 ? `${totals.cleared}/${totals.quests} cleared` : undefined}
          breadcrumbs={<Breadcrumbs />}
        />

        {decks.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Quests cleared" value={`${totals.cleared}/${totals.quests}`} icon={CheckCircle2} tone="text-emerald-500" />
            <StatCard label="Active decks" value={String(totals.decks)} icon={Scroll} tone="text-violet-500" />
            <StatCard
              label="Progress"
              value={totals.quests ? `${Math.round((totals.cleared / totals.quests) * 100)}%` : '—'}
              icon={Swords}
              tone="text-sky-500"
            />
          </div>
        )}
      </header>

      {decks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/40 px-8 py-16 text-center">
          <div className="mb-4 rounded-full bg-violet-500/10 p-4">
            <Scroll className="h-6 w-6 text-violet-500" aria-hidden />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No quests yet</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            When your counsellor assigns you a deck of universities, it shows up here as a quest log. In the meantime,
            keep exploring on your own.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/university-search/search">Explore universities</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {decks.map((deck) => {
            const cleared = deck.quests.filter((q) => started.has(q.programId)).length;
            return (
              <section key={deck.deckId} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl" aria-hidden>{deck.theme.emoji ?? '🗡️'}</span>
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">{deck.deckName}</h2>
                      {deck.message && <p className="mt-0.5 max-w-2xl text-sm italic text-muted-foreground">“{deck.message}”</p>}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {cleared}/{deck.quests.length} cleared
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {deck.quests.map((quest) => {
                    const rarity = DECK_RARITY[quest.rarity];
                    const fit = DECK_FIT[quest.fit];
                    const isStarted = started.has(quest.programId);
                    const isShortlisted = shortlistIds.has(quest.programId);
                    return (
                      <Card
                        key={quest.programId}
                        className={cn(
                          'border transition hover:-translate-y-px hover:shadow-md',
                          isStarted && 'border-emerald-300/60 bg-emerald-500/[0.03]'
                        )}
                      >
                        <CardHeader className="space-y-2 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                {quest.country || 'Location TBC'}
                              </p>
                              <p className="truncate text-base font-semibold text-foreground" title={quest.university}>
                                {quest.university}
                              </p>
                              <p className="truncate text-sm text-muted-foreground" title={quest.courseName}>
                                {quest.courseName}
                              </p>
                            </div>
                            <span className={cn('flex shrink-0 items-center gap-0.5', rarity.color)} aria-label={`Rarity: ${rarity.label}`}>
                              {Array.from({ length: rarity.stars }).map((_, i) => (
                                <Star key={i} className="h-3 w-3 fill-current" />
                              ))}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]', fit.badge)}>
                              {fit.label}
                            </span>
                            <span className={cn('rounded-full border px-2.5 py-0.5 text-[10px] font-semibold', rarity.badge)}>
                              {rarity.label}
                            </span>
                            {isStarted && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" aria-hidden /> Cleared
                              </span>
                            )}
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3 pt-0">
                          {quest.note && (
                            <div className="rounded-xl bg-muted/50 p-3 text-sm text-foreground">
                              <span className="mr-1 font-semibold text-muted-foreground">Counsellor:</span>
                              {quest.note}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <Button asChild size="sm" variant="secondary" className="gap-1.5">
                              <Link href={`/course/${quest.programId}?from=quests`}>
                                Open course <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn(
                                'gap-1.5',
                                isShortlisted &&
                                  'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
                              )}
                              disabled={isShortlisted}
                              onClick={() => saveToShortlist(quest.programId, quest.courseName, quest.university, quest.country)}
                            >
                              <Heart className={cn('h-3.5 w-3.5', isShortlisted && 'fill-current')} aria-hidden />
                              {isShortlisted ? 'Shortlisted' : 'Shortlist'}
                            </Button>
                            <Button
                              size="sm"
                              className="gap-1.5"
                              disabled={isStarted || tracking === quest.programId}
                              onClick={() => startApplication(quest.programId, quest.university)}
                            >
                              <Sparkles className="h-3.5 w-3.5" aria-hidden />
                              {isStarted ? 'In applications' : tracking === quest.programId ? 'Starting…' : 'Start application'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof CheckCircle2;
  tone: string;
}) {
  return (
    <Card className="border-dashed border-border/70">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{label}</span>
        <Icon className={cn('h-5 w-5', tone)} aria-hidden />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
