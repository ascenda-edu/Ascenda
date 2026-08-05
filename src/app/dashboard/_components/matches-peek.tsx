import Link from 'next/link';
import { AlertTriangle, Target } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadMatchesForProfile } from '@/lib/matching/service';
import { UniversityCard } from '@/components/university-card';
import { Button } from '@/components/ui/button';
import { HubCard } from '@/components/dashboard/hub/hub-card';

/**
 * The hub's matches cell, streamed behind Suspense: an uncached match compute
 * can take tens of seconds (full catalogue scoring), and the rest of the
 * dashboard must not block on it.
 */
export async function MatchesPeek({ profileId }: { profileId: string }) {
  const supabase = await createServerSupabaseClient();
  const result = await loadMatchesForProfile(supabase, profileId, { resultLimit: 60 });
  const matchError = Boolean(result.error);
  const matches = matchError ? [] : result.matches;
  const averageScore = matches.length
    ? Math.round(matches.reduce((total, item) => total + item.score, 0) / matches.length)
    : null;
  // The two peek cards surface their own blockingReasons — but flags on
  // matches beyond the top two would otherwise be invisible on the hub, so
  // they get a compact warning row below the grid.
  const flaggedBeyondPeek = matches.slice(2).filter((match) => match.blockingReasons.length > 0);
  const firstFlagged = flaggedBeyondPeek[0] ?? null;

  return (
    <HubCard
      eyebrow="Matches"
      title={averageScore !== null ? `Top recommendations · ${averageScore}% fit` : 'Top recommendations'}
      icon={Target}
      action={matches.length > 0 ? { label: `All ${matches.length} matches`, href: '/matches' } : undefined}
    >
      {matchError ? (
        <div className="space-y-2 rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          <p className="text-base font-semibold text-foreground">Can&apos;t pull your matches right now</p>
          <p>Something&apos;s off on our side. Refresh in a moment and you should be back in business.</p>
        </div>
      ) : matches.length > 0 ? (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            {matches.slice(0, 2).map((match) => (
              <UniversityCard
                key={match.program.id}
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
                ].filter((value): value is string => Boolean(value))}
                variant="compact"
              />
            ))}
          </div>
          {firstFlagged ? (
            <Link
              href="/matches"
              className="hover-lift group flex items-center gap-3 rounded-xl border border-border bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                <span className="font-semibold">Eligibility flag:</span> {firstFlagged.program.name} —{' '}
                {firstFlagged.blockingReasons[0]}
                {flaggedBeyondPeek.length > 1 ? ` · +${flaggedBeyondPeek.length - 1} more` : ''}
              </p>
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="flex h-full flex-col items-start justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-6">
          <p className="text-base font-semibold text-foreground">Tell us a bit more, then we&apos;ll find your matches</p>
          <p className="text-sm text-muted-foreground">Finish your profile and add a country or two — we&apos;ll do the matching.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/profile/wizard">Finish profile</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/matches">See all matches</Link>
            </Button>
          </div>
        </div>
      )}
    </HubCard>
  );
}

export function MatchesPeekSkeleton() {
  return (
    <HubCard eyebrow="Matches" title="Finding your matches…" icon={Target}>
      <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading matches">
        {[0, 1].map((index) => (
          <div key={index} className="h-48 animate-pulse rounded-2xl border border-border bg-muted/40" />
        ))}
      </div>
    </HubCard>
  );
}
