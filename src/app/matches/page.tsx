import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/shell';
import { MatchList } from '@/components/match/match-list';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { SectionNav } from '@/components/layout/section-nav';
import { EXPLORE_SECTION_ITEMS } from '@/components/layout/navigation';
import { loadMatchesForProfile } from '@/lib/matching/service';
import { TrackProgramButton } from '@/components/programs/track-program-button';
import { ACTION_TEXT, MATCHES_TEXT } from '@/lib/constants/text';

export const metadata: Metadata = {
  title: 'Matches'
};

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 300 (≈100/tier) covers many "show more" clicks while keeping the RSC
  // payload a third of the previous 900-match serialization. It equals the
  // service's FULL_CACHE_LIMIT — every caller's compute caches at least this
  // many rows — so this force-dynamic, top-level-awaited load is a cache hit
  // whenever ANY caller (e.g. the dashboard) computed within the TTL; the
  // tens-of-seconds recompute happens at most once per TTL, for whoever
  // arrives first.
  const matchResult = await loadMatchesForProfile(supabase, user.id, { resultLimit: 300 });

  if (matchResult.error) {
    return (
      <DashboardShell>
        <SectionNav items={EXPLORE_SECTION_ITEMS} />
        <PageHero
          tone="student"
          eyebrow={MATCHES_TEXT.hero.eyebrow}
          title="We can't pull your matches right now"
          description="Something's off on our side. Give it another go in a minute."
          highlight="Try again soon"
          stats={[{ label: 'Matches', value: '—' }, { label: 'Programs', value: '—' }, { label: 'Updates', value: '—' }]}
          breadcrumbs={<Breadcrumbs />}
          actions={
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard">{ACTION_TEXT.returnToDashboard}</Link>
            </Button>
          }
        />
        <div className="rounded-[28px] border border-dashed border-border bg-muted/60 p-8 text-center text-muted-foreground">
          <p className="text-base font-semibold text-foreground">Hit a snag loading your matches</p>
          <p className="mt-2 text-sm">Try refreshing in a bit, or pop into your profile and tweak something — that often helps.</p>
        </div>
      </DashboardShell>
    );
  }

  if (matchResult.missingSections.length > 0) {
    return (
      <DashboardShell>
        <SectionNav items={EXPLORE_SECTION_ITEMS} />
        <PageHero
          tone="student"
          eyebrow={MATCHES_TEXT.hero.eyebrow}
          title={MATCHES_TEXT.profileIncomplete.title}
          description={MATCHES_TEXT.profileIncomplete.description}
          highlight={MATCHES_TEXT.profileIncomplete.highlight}
          stats={[{ label: 'Matches', value: '—' }, { label: 'Programs', value: '0' }, { label: 'Updates', value: '—' }]}
          actions={
            <Button asChild size="sm">
              <Link href="/profile/wizard">{ACTION_TEXT.finishProfile}</Link>
            </Button>
          }
        />
        <div className="rounded-[28px] border border-dashed border-border bg-muted/60 p-8 text-center text-muted-foreground">
          {MATCHES_TEXT.profileIncomplete.emptyMessage}
        </div>
      </DashboardShell>
    );
  }

  if (matchResult.catalogSize.programs === 0 || matchResult.catalogSize.universities === 0) {
    return (
      <DashboardShell>
        <div className="rounded-[28px] border border-dashed border-border bg-muted/60 p-8 text-center text-muted-foreground">
          {MATCHES_TEXT.catalogUnavailable}
        </div>
      </DashboardShell>
    );
  }

  const enriched = matchResult.matches;

  const heroStats = [
    { label: 'Programs', value: `${matchResult.catalogSize.programs}`, detail: 'in catalog' },
    { label: 'Eligible matches', value: `${enriched.length}`, detail: 'Ranked for you' },
    { label: 'Top fit', value: enriched[0] ? `${enriched[0].score}%` : '—', detail: 'Highest score' }
  ];
  const topMatch = enriched[0];

  return (
    <DashboardShell>
      <SectionNav items={EXPLORE_SECTION_ITEMS} />
      <PageHero
        tone="student"
        eyebrow={MATCHES_TEXT.hero.eyebrow}
        title={MATCHES_TEXT.hero.title}
        description={MATCHES_TEXT.hero.description}
        highlight={MATCHES_TEXT.hero.highlight}
        stats={heroStats}
        breadcrumbs={<Breadcrumbs />}
        actions={
          <>
            {topMatch ? (
              <TrackProgramButton
                programId={topMatch.program.id}
                programName={topMatch.program.name}
                universityName={topMatch.university.name}
                location={topMatch.university.country}
                fitScore={topMatch.score}
                labelVariant="planner"
              />
            ) : (
              <Button asChild size="sm">
                <Link href="/applications">{ACTION_TEXT.addToPlanner}</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard">{ACTION_TEXT.returnToDashboard}</Link>
            </Button>
          </>
        }
      />
      {enriched.length ? (
        <MatchList matches={enriched} />
      ) : (
        <div className="rounded-[28px] border border-dashed border-border bg-muted/60 p-8 text-center text-muted-foreground">
          <p className="text-base font-semibold text-foreground">{MATCHES_TEXT.emptyState.title}</p>
          <p className="mt-2 text-sm">
            {MATCHES_TEXT.emptyState.description}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/profile/wizard?step=lifestyle_preferences">{ACTION_TEXT.adjustPreferences}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/profile/wizard?step=academic_details">{ACTION_TEXT.updateAcademics}</Link>
            </Button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
