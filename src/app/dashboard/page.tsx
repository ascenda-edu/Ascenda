import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/shell';
import { DeadlineTimeline } from '@/components/dashboard/deadline-timeline';
import { UniversityCard } from '@/components/university-card';
import { loadMatchesForProfile } from '@/lib/matching/service';
import type { EnrichedMatch } from '@/lib/matching/types';
import { DashboardOverview, type OverviewPayload, type HighlightCard } from '@/components/dashboard/overview';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { TaskListPanel } from '@/components/dashboard/task-list-panel';
import type { Database } from '@/lib/types/database';

export const dynamic = 'force-dynamic';
import { buildStepCompletion, isProfileComplete, ProfileRecordGroup } from '@/lib/profile/completion';
import { PROFILE_STEPS } from '@/lib/profile/steps';
import { AnimatedSection } from '@/components/layout/animated-section';
import { cn } from '@/lib/utils';
import { classifyCompletion, COMPLETION_VISUAL } from '@/lib/theme/categories';

type ChecklistRow = Database['public']['Tables']['application_checklist']['Row'];
type DeadlineRow = Database['public']['Tables']['deadlines']['Row'];
type ApplicationRow = Database['public']['Tables']['applications']['Row'];

export const metadata: Metadata = {
  title: 'Dashboard'
};

const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const formatShortDate = (value?: string | null) => {
  if (!value) return 'TBD';
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 'TBD' : shortDateFormatter.format(new Date(timestamp));
};

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayString = new Date().toDateString();

  const { data: applications } = await supabase
    .from('applications')
    .select('id, program_id')
    .eq('profile_id', user.id);

  const applicationIds = (applications ?? []).map((app) => app.id);
  const applicationProgramIds = (applications ?? []).map((app) => app.program_id);

  const [
    checklistResponse,
    deadlinesResponse,
    matchResult,
    personalResponse,
    academicResponse,
    lifestyleResponse,
    subjectsResponse
  ] = await Promise.all([
    applicationIds.length
      ? supabase.from('application_checklist').select('*').in('application_id', applicationIds).order('due_date', { ascending: true }).limit(5)
      : Promise.resolve({ data: [] }),
    applicationProgramIds.length
      ? supabase.from('deadlines').select('*').in('program_id', applicationProgramIds).gte('deadline_date', today).order('deadline_date', { ascending: true }).limit(5)
      : Promise.resolve({ data: [] }),
    // The dashboard shows 3 match cards and a health stat — no need to load
    // the full (up to ~900-row) match cache for that.
    loadMatchesForProfile(supabase, user.id, { resultLimit: 60 }),
    supabase
      .from('student_personal_information')
      .select('first_name,last_name,email,nationality,resident_country')
      .eq('profile_id', user.id)
      .maybeSingle(),
    supabase
      .from('student_academic_input')
      .select('programme_type,school_name,school_country,graduation_year,intended_clusters,english_required')
      .eq('profile_id', user.id)
      .maybeSingle(),
    supabase
      .from('student_lifestyle_preference')
      .select('extracurricular_interests')
      .eq('profile_id', user.id)
      .maybeSingle(),
    supabase.from('student_subjects').select('id').eq('profile_id', user.id)
  ]);

  const checklist = (checklistResponse.data ?? []) as ChecklistRow[];
  const deadlines = (deadlinesResponse.data ?? []) as DeadlineRow[];
  const matchError = Boolean(matchResult.error);
  const matches: EnrichedMatch[] = matchError ? [] : matchResult.matches;

  // Profile Completion Logic
  const personal = personalResponse.data;
  const academicInput = academicResponse.data;
  const lifestyle = lifestyleResponse.data;

  const records: ProfileRecordGroup = {
    personal: personal ?? null,
    academicInput: academicInput ?? null,
    subjectCount: subjectsResponse.data?.length ?? 0,
    lifestyle: lifestyle ?? null
  };

  const profileIncomplete = !isProfileComplete(records);

  const stepCompletion = buildStepCompletion(records);
  const completedSteps = PROFILE_STEPS.filter((step) => stepCompletion[step.key]).length;
  const completionPercent = Math.round((completedSteps / PROFILE_STEPS.length) * 100);
  const nextStep = PROFILE_STEPS.find((step) => !stepCompletion[step.key]);

  // Derived Overview Data
  const openTasks = checklist.filter((task) => task.status !== 'done').length;
  const now = Date.now();
  const dueSoonCount = checklist.filter((task) => {
    if (!task.due_date) return false;
    const dueTime = Date.parse(task.due_date);
    return !Number.isNaN(dueTime) && dueTime >= now && dueTime <= now + 1000 * 60 * 60 * 24 * 7;
  }).length;

  const nextDeadline = deadlines[0] ?? null;
  const averageMatchScore = matches.length
    ? Math.round(matches.reduce((total, item) => total + item.score, 0) / matches.length)
    : null;

  const isSameToday = (value?: string | null) => {
    if (!value) return false;
    const timestamp = Date.parse(value);
    return !Number.isNaN(timestamp) && new Date(timestamp).toDateString() === todayString;
  };

  const todayFocus = {
    tasks: checklist.filter((task) => isSameToday(task.due_date)).length,
    deadlines: deadlines.filter((deadline) => isSameToday(deadline.deadline_date)).length,
    interviews: checklist.filter((task) => isSameToday(task.due_date) && /interview/i.test(task.task_name ?? '')).length
  };

  const dueTodayTasks = checklist.filter((task) => task.status !== 'done' && isSameToday(task.due_date));
  const dueTodayDeadlines = deadlines.filter((deadline) => isSameToday(deadline.deadline_date));
  const trackedProgramsCount = applicationProgramIds.length;

  const focusItems = [];
  const urgentTask = dueTodayTasks[0];
  if (urgentTask) {
    focusItems.push({
      id: urgentTask.id,
      label: 'Due today',
      title: urgentTask.task_name ?? 'Checklist task',
      detail: 'Close this out to stay on track.'
    });
  }
  const urgentDeadline = dueTodayDeadlines[0] ?? deadlines[0];
  if (urgentDeadline) {
    focusItems.push({
      id: urgentDeadline.id,
      label: 'Milestone',
      title: urgentDeadline.name ?? 'Application milestone',
      detail: urgentDeadline.deadline_date ? `Due ${formatShortDate(urgentDeadline.deadline_date)}` : 'Date TBC'
    });
  }
  const nextTask = checklist.find((task) => task.status !== 'done');
  if (nextTask) {
    focusItems.push({
      id: nextTask.id,
      label: 'Checklist',
      title: nextTask.task_name ?? 'Checklist task',
      detail: nextTask.due_date ? `Due ${formatShortDate(nextTask.due_date)}` : 'No due date'
    });
  }
  const blockerMatch = matches.find((match) => match.blockingReasons.length > 0);
  if (blockerMatch) {
    focusItems.push({
      id: `blocker-${blockerMatch.program.id}`,
      label: 'Eligibility flag',
      title: blockerMatch.program.name,
      detail: blockerMatch.blockingReasons[0]
    });
  }
  if (nextStep) {
    focusItems.push({
      id: 'focus-profile',
      label: 'Profile',
      title: nextStep.title,
      detail: 'Add these details to unlock richer recommendations.'
    });
  }
  if (focusItems.length === 0) {
    focusItems.push({
      id: 'focus-clear',
      label: 'All caught up',
      title: "Nice — you're all caught up",
      detail: 'Add a program or update your profile when you want a new step.'
    });
  }

  const primaryFocus = focusItems[0];

  const priorityHref =
    primaryFocus?.label === 'Profile'
      ? '/profile'
      : primaryFocus?.label === 'Milestone'
        ? '/applications'
        : primaryFocus?.label === 'Eligibility flag'
          ? '/matches'
          : '/applications';

  const highlightCards: HighlightCard[] = [
    {
      id: 'priority',
      label: 'Next priority',
      value: primaryFocus ? primaryFocus.title : 'All clear',
      detail: primaryFocus ? primaryFocus.detail : 'Log progress or add programs to surface new actions.',
      href: priorityHref,
      tone: primaryFocus && primaryFocus.label === 'Due today' ? 'warning' : !primaryFocus ? 'positive' : undefined
    },
    {
      id: 'profile',
      label: 'Profile readiness',
      value: `${completedSteps}/${PROFILE_STEPS.length} sections`,
      detail: nextStep
        ? `${completionPercent}% complete \u00B7 Next: ${nextStep.title}`
        : 'All sections complete \u2014 update anytime',
      href: '/profile',
      tone: completionPercent === 100 ? 'positive' : undefined
    }
  ];

  const overviewPayload: OverviewPayload = {
    highlightCards,
    focusItems,
    nextStepTitle: nextStep?.title ?? null
  };

  const heroHighlight = primaryFocus ? primaryFocus.label : 'All caught up';
  const heroStats = [
    { label: 'Due today', value: todayFocus.tasks > 0 ? `${todayFocus.tasks}` : '0', detail: dueSoonCount > 0 ? `${dueSoonCount} due this week` : 'Nothing urgent' },
    { label: 'Deadlines', value: deadlines.length > 0 ? `${deadlines.length}` : '0', detail: nextDeadline ? `Next: ${formatShortDate(nextDeadline.deadline_date)}` : 'Add a program to track milestones' },
    { label: 'Match health', value: matchError ? '—' : averageMatchScore !== null ? `${averageMatchScore}%` : '-', detail: matchError ? 'Service unavailable' : matches.length ? `${matches[0].program.name}` : 'Finish profile to unlock' }
  ];

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = personal?.first_name?.trim();
  const greeting = firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;
  const heroDescription = primaryFocus
    ? `Here's what's next for you — ${primaryFocus.title.toLowerCase()}. Take it one step at a time.`
    : "You're all caught up. Add a program or polish your profile when you're ready for the next step.";

  return (
    <DashboardShell>
      <PageHero
        tone="student"
        eyebrow="Your dashboard"
        title={greeting}
        description={heroDescription}
        highlight={heroHighlight}
        accent="Today"
        stats={heroStats}
        actions={
          <>
            <Button asChild size="sm">
              <Link href="/university-search/search">Open university search</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/matches">Review matches</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/profile">Update profile</Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {/* 1. Today's focus + key stats (already prioritised inside DashboardOverview) */}
        <DashboardOverview data={overviewPayload} />

        {/* 2. Tasks — inline mark-done, no nav required */}
        <AnimatedSection delay={0.05}>
          <div className="surface-card surface-card--static">
            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Tasks</p>
                  <p className="text-lg font-semibold text-foreground">Mark today&apos;s tasks as you finish</p>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/applications/tasks">Open all tasks →</Link>
                </Button>
              </div>
              <TaskListPanel
                title=""
                tasks={checklist.map((item) => ({
                  id: item.id,
                  name: item.task_name,
                  status: item.status,
                  dueDate: item.due_date ?? undefined
                }))}
              />
            </div>
          </div>
        </AnimatedSection>

        {/* 3. Upcoming deadlines */}
        {deadlines.length > 0 ? (
          <AnimatedSection delay={0.08}>
            <div className="surface-card surface-card--static">
              <div className="relative z-10 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Timeline</p>
                    <p className="text-lg font-semibold text-foreground">Upcoming deadlines</p>
                  </div>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/applications">Plan applications →</Link>
                  </Button>
                </div>
                <DeadlineTimeline
                  items={deadlines.map((deadline) => ({
                    id: deadline.id,
                    name: deadline.name,
                    date: deadline.deadline_date ?? 'TBD',
                    context: deadline.intake ?? 'Application period'
                  }))}
                />
              </div>
            </div>
          </AnimatedSection>
        ) : null}

        {/* 4. Top matches peek — 3 cards max, link to full list */}
        <AnimatedSection delay={0.1}>
          <div className="surface-card surface-card--static">
            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Matches</p>
                  <p className="text-lg font-semibold text-foreground">Top recommendations for you</p>
                </div>
                {matches.length > 0 ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/matches">See all {matches.length} matches →</Link>
                  </Button>
                ) : null}
              </div>
              {matchError ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p className="text-base font-semibold text-foreground">Can&apos;t pull your matches right now</p>
                  <p>Something&apos;s off on our side. Refresh in a moment and you should be back in business.</p>
                </div>
              ) : matches.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {matches.slice(0, 3).map((match) => (
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
                      trackingLabelVariant="planner"
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p className="text-base font-semibold text-foreground">Tell us a bit more, then we&apos;ll find your matches</p>
                  <p>Finish your profile and add a country or two — we&apos;ll do the matching.</p>
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
            </div>
          </div>
        </AnimatedSection>

        {/* 5. Setup nudge — small footer pill, only when truly incomplete */}
        {profileIncomplete && (() => {
          const band = classifyCompletion(completionPercent);
          const visual = COMPLETION_VISUAL[band];
          const Icon = visual.icon;
          return (
            <AnimatedSection delay={0.12}>
              <div
                className={cn(
                  'flex flex-col gap-3 rounded-2xl border border-l-4 bg-card/60 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between',
                  visual.border,
                  visual.accent
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={visual.swatch}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Profile {completionPercent}% complete
                      {nextStep ? <span className="text-muted-foreground"> · Next: {nextStep.title}</span> : null}
                    </p>
                    <div className="mt-2 flex max-w-md items-center gap-1.5">
                      {PROFILE_STEPS.map((step) => (
                        <div
                          key={step.key}
                          className={cn(
                            'h-1.5 flex-1 rounded-full transition-colors',
                            stepCompletion[step.key] ? visual.bar : 'bg-border'
                          )}
                          title={`${step.title}: ${stepCompletion[step.key] ? 'Complete' : 'Incomplete'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <Button asChild size="sm" className="shrink-0">
                  <Link href="/profile/wizard">Continue setup</Link>
                </Button>
              </div>
            </AnimatedSection>
          );
        })()}
      </div>
    </DashboardShell>
  );
}
