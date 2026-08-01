import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireIdentity } from '@/lib/auth/identity';
import { DashboardShell } from '@/components/layout/shell';
import { MatchList } from '@/components/match/match-list';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { SectionNav } from '@/components/layout/section-nav';
import { EXPLORE_SECTION_ITEMS } from '@/components/layout/navigation';
import { loadMatchesForProfile } from '@/lib/matching/service';
import { TrackProgramButton } from '@/components/programs/track-program-button';
import { EmptyState } from '@/components/ui/empty-state';
import { AlertTriangle, Compass, Library, UserCircle } from 'lucide-react';
import { ACTION_TEXT, MATCHES_TEXT } from '@/lib/constants/text';

export const metadata: Metadata = {
  title: 'Matches'
};

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  // One memoised identity lookup for the whole request (@/lib/auth/identity):
  // replaces the copy-pasted getUser()+redirect guard and yields the role the
  // shell needs, so the browser stops re-deriving it.
  const identity = await requireIdentity();
  const supabase = await createServerSupabaseClient();

  // 300 (≈100/tier) covers many "show more" clicks while keeping the RSC
  // payload a third of the previous 900-match serialization. It equals the
  // service's FULL_CACHE_LIMIT — every caller's compute caches at least this
  // many rows — so this force-dynamic, top-level-awaited load is a cache hit
  // whenever ANY caller (e.g. the dashboard) computed within the TTL; the
  // tens-of-seconds recompute happens at most once per TTL, for whoever
  // arrives first.
  const matchResult = await loadMatchesForProfile(supabase, identity.userId, { resultLimit: 300 });

  if (matchResult.error) {
    return (
      <DashboardShell role={identity.role}>
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
        <EmptyState
          icon={<AlertTriangle />}
          title="Hit a snag loading your matches"
          description="Try refreshing in a bit, or pop into your profile and tweak something — that often helps."
        />
      </DashboardShell>
    );
  }

  if (matchResult.missingSections.length > 0) {
    return (
      <DashboardShell role={identity.role}>
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
        <EmptyState
          icon={<UserCircle />}
          title={MATCHES_TEXT.profileIncomplete.emptyMessage}
        />
      </DashboardShell>
    );
  }

  if (matchResult.catalogSize.programs === 0 || matchResult.catalogSize.universities === 0) {
    return (
      <DashboardShell role={identity.role}>
        <SectionNav items={EXPLORE_SECTION_ITEMS} />
        <PageHero
          tone="student"
          eyebrow={MATCHES_TEXT.hero.eyebrow}
          title="The program list is unavailable"
          description={MATCHES_TEXT.catalogUnavailable}
          highlight="Try again soon"
          stats={[{ label: 'Matches', value: '—' }, { label: 'Programs', value: '—' }, { label: 'Updates', value: '—' }]}
          breadcrumbs={<Breadcrumbs />}
          actions={
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard">{ACTION_TEXT.returnToDashboard}</Link>
            </Button>
          }
        />
        <EmptyState icon={<Library />} title={MATCHES_TEXT.catalogUnavailable} />
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
    <DashboardShell role={identity.role}>
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
        <EmptyState
          icon={<Compass />}
          title={MATCHES_TEXT.emptyState.title}
          description={MATCHES_TEXT.emptyState.description}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="sm">
                <Link href="/profile/wizard?step=lifestyle_preferences">{ACTION_TEXT.adjustPreferences}</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/profile/wizard?step=academic_details">{ACTION_TEXT.updateAcademics}</Link>
              </Button>
            </div>
          }
        />
      )}
    </DashboardShell>
  );
}
