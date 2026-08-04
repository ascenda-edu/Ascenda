import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CalendarClock, ListChecks } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireIdentity } from '@/lib/auth/identity';
import { DashboardShell } from '@/components/layout/shell';
import { DeadlineTimeline } from '@/components/dashboard/deadline-timeline';
import { MatchesPeek, MatchesPeekSkeleton } from './_components/matches-peek';
import { CounsellorQuests } from './_components/counsellor-quests';
import { Greeting } from './_components/greeting';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { TaskListPanel } from '@/components/dashboard/task-list-panel';
import { AnimatedSection } from '@/components/layout/animated-section';
import { HubCard } from '@/components/dashboard/hub/hub-card';
import { NextUpCard, type HubFocusItem } from '@/components/dashboard/hub/next-up-card';
import { ProfileProgressCard } from '@/components/dashboard/hub/profile-progress-card';
import { PipelineCard, type PipelineStage } from '@/components/dashboard/hub/pipeline-card';
import { CounsellorCard } from '@/components/dashboard/hub/counsellor-card';
import { QuickLinks } from '@/components/dashboard/hub/quick-links';
import {
  buildStepCompletion,
  isProfileComplete,
  isProfileEssentialComplete,
  type ProfileRecordGroup
} from '@/lib/profile/completion';
import { GettingStartedCard } from '@/components/dashboard/hub/getting-started-card';
import { summariseChecklist } from '@/lib/onboarding/checklist';
import { probeHasShortlist } from '@/lib/onboarding/signals';
import { AscendiCoachMount } from '@/components/onboarding/ascendi-coach-mount';
import { hasSeen } from '@/lib/onboarding/state';
import { getOnboardingState } from '@/lib/onboarding/read';
import { PROFILE_STEPS } from '@/lib/profile/steps';
import { countUnreadForStudent, listInboxRequests, resolveProfileNames } from '@/lib/demo/help-request-client';
import { DEMO_COUNSELLOR } from '@/lib/demo/counsellor';
import { daysUntil, parseLocalDate } from '@/lib/utils/dates';
import { loadApplicationSummaries } from '@/lib/data/applications';
import { soft, unwrap } from '@/lib/data/errors';
import type { Database } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

type ChecklistRow = Database['public']['Tables']['application_checklist']['Row'];
type ChecklistItem = Pick<ChecklistRow, 'id' | 'task_name' | 'status' | 'due_date'>;
type DeadlineRow = Database['public']['Tables']['deadlines']['Row'];
type MeetingItem = Pick<
  Database['public']['Tables']['help_meetings']['Row'],
  'title' | 'scheduled_for' | 'location' | 'status' | 'counsellor_profile_id'
>;
type ApplicationStatus = Database['public']['Enums']['application_status'];

export const metadata: Metadata = {
  title: 'Dashboard'
};

const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

// deadline_date / due_date are date-only strings — parse as LOCAL dates so a
// deadline doesn't shift by the user's UTC offset (see lib/utils/dates).
const formatDateOnly = (value?: string | null) => {
  if (!value) return 'TBD';
  const parsed = parseLocalDate(value);
  return Number.isNaN(parsed.getTime()) ? 'TBD' : shortDateFormatter.format(parsed);
};

const safeDaysUntil = (value?: string | null): number | null => {
  if (!value) return null;
  const days = daysUntil(value);
  return Number.isNaN(days) ? null : days;
};

const PIPELINE_STAGES: Array<{ key: ApplicationStatus; label: string }> = [
  { key: 'planning', label: 'Planning' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'decision', label: 'Awaiting decision' },
  { key: 'enrolled', label: 'Enrolled' }
];

export default async function DashboardPage() {
  // One memoised identity lookup for the whole request (@/lib/auth/identity):
  // replaces the copy-pasted getUser()+redirect guard and yields the role the
  // shell needs, so the browser stops re-deriving it.
  const identity = await requireIdentity();
  const supabase = await createServerSupabaseClient();

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  // Disposition: unwrap (inside loadApplicationSummaries). This read used to
  // discard its error, and everything below is derived from it — pipeline
  // counts, the "Applications" hero stat, the checklist and deadline queries
  // that key off these ids. A failed read rendered a fully-populated dashboard
  // reading "0 applications, nothing due, all caught up".
  const applications = await loadApplicationSummaries(supabase, identity.userId);

  const applicationIds = applications.map((app) => app.id);
  const applicationProgramIds = applications.map((app) => app.program_id);

  const [
    checklistResponse,
    deadlinesResponse,
    personalResponse,
    academicResponse,
    lifestyleResponse,
    subjectsResponse,
    matchCountResponse,
    hasShortlist,
    helpResult,
    meetingResponse
  ] = await Promise.all([
    // No .limit(6) here: openTasks/overdueTasks/dueThisWeekCount below are shown
    // as TOTALS (hero stats + focus items), so we need every row — only the
    // columns we use, with a generous safety cap. Top-N slicing for display
    // happens at render time.
    applicationIds.length
      ? supabase
          .from('application_checklist')
          .select('id, task_name, status, due_date')
          .in('application_id', applicationIds)
          .order('due_date', { ascending: true })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    applicationProgramIds.length
      ? supabase.from('deadlines').select('*').in('program_id', applicationProgramIds).gte('deadline_date', today).order('deadline_date', { ascending: true }).limit(5)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('student_personal_information')
      .select('first_name,last_name,email,nationality,resident_country')
      .eq('profile_id', identity.userId)
      .maybeSingle(),
    supabase
      .from('student_academic_input')
      .select('programme_type,school_name,school_country,graduation_year,intended_clusters,english_required,english_status')
      .eq('profile_id', identity.userId)
      .maybeSingle(),
    supabase
      .from('student_lifestyle_preference')
      .select('extracurricular_interests')
      .eq('profile_id', identity.userId)
      .maybeSingle(),
    supabase.from('student_subjects').select('id').eq('profile_id', identity.userId),
    // Onboarding checklist signals. Both are `head: true` COUNTS — index probes
    // that return no rows — not reads. In particular this does NOT trip the
    // match COMPUTE the note below is about: it asks whether a `student_matches`
    // row already exists, which is precisely the "has the ranking ever run for
    // this student" question the checklist needs, and is answered from the
    // index without scoring anything.
    supabase
      .from('student_matches')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', identity.userId)
      .limit(1),
    // Resolves to `boolean | null`; `null` means the table is unreachable on
    // this database, which drops the shortlist item from the checklist rather
    // than stranding it permanently unticked. See lib/onboarding/signals.ts.
    probeHasShortlist(supabase, identity.userId),
    // NOTE: matches are deliberately NOT loaded here — an uncached match
    // compute can take tens of seconds, so the matches cell streams in behind
    // Suspense (see MatchesPeek) instead of blocking the whole hub.
    // Help threads + unread counts feed the counsellor cell; the hub must
    // still render if the help tables are unreachable. help_requests carries no
    // counsellor column on the message side, so we chain one narrow query for
    // the author of the most recent counsellor reply — normally who "unread
    // replies" are from. But counsellor-INITIATED threads have no help_messages
    // row (request.body is the opener), so when there's no reply we fall back to
    // the counsellor who owns the most relevant thread and resolve the name here
    // (off the critical path) via resolveProfileNames, which batches + caches.
    Promise.all([listInboxRequests(supabase, identity.userId), countUnreadForStudent(supabase, identity.userId)])
      .then(async ([requests, unread]) => {
        let inboxCounsellorId: string | null = null;
        let unreadFromReply = false;
        if (requests.length > 0) {
          // Disposition: soft, fallback = no reply found. This row decides only
          // WHOSE NAME fronts the counsellor card; the fallback path below
          // (most recent thread owner, then the demo persona) is already the
          // designed answer for "no counsellor reply exists", so it is an
          // honest fallback for "we could not read the replies" too. The whole
          // help chain is deliberately degrade-not-fail (see the .catch below),
          // and this makes the failure visible in the log instead of silently
          // renaming the student's counsellor.
          const lastReply = soft<Array<{ author_profile_id: string | null }>>(
            await supabase
              .from('help_messages')
              .select('author_profile_id')
              .in('request_id', requests.map((request) => request.id))
              .eq('author_role', 'counsellor')
              .order('created_at', { ascending: false })
              .limit(1),
            'dashboard.lastCounsellorReply',
            []
          );
          const lastReplyAuthorId = lastReply[0]?.author_profile_id ?? null;
          if (lastReplyAuthorId) {
            inboxCounsellorId = lastReplyAuthorId;
            unreadFromReply = true;
          } else {
            // No counsellor reply row anywhere — the unread is a counsellor's
            // opening message. Attribute it to that counsellor, not the demo
            // persona. requests are ordered created_at DESC, so .find() returns
            // the most recent counsellor-initiated thread, else the most recent
            // thread with an owner.
            inboxCounsellorId =
              requests.find((r) => r.initiated_by === 'counsellor' && r.counsellor_profile_id)
                ?.counsellor_profile_id ??
              requests.find((r) => r.counsellor_profile_id)?.counsellor_profile_id ??
              null;
          }
        }
        let inboxCounsellorName: string | null = null;
        if (inboxCounsellorId) {
          const names = await resolveProfileNames(supabase, [inboxCounsellorId], '');
          const resolved = names.get(inboxCounsellorId);
          inboxCounsellorName = resolved && resolved.length > 0 ? resolved : null;
        }
        return [requests, unread, inboxCounsellorName, unreadFromReply] as const;
      })
      .catch(() => [[], new Map<string, number>(), null, false] as const),
    supabase
      .from('help_meetings')
      .select('title, scheduled_for, location, status, counsellor_profile_id')
      .eq('student_profile_id', identity.userId)
      .in('status', ['proposed', 'confirmed'])
      .gte('scheduled_for', nowIso)
      .order('scheduled_for', { ascending: true })
      .limit(1)
  ]);

  // Dispositions for the parallel reads above. None of them bound `error`
  // before; every one of them rendered a failure as an empty, confident answer.
  //
  // unwrap — the six reads whose empty value is a CLAIM about the student:
  // "no tasks", "no deadlines", "profile 0% complete". There is no honest
  // fallback for those, and the profile numbers additionally drive the
  // onboarding nudge, so a silent failure sends a completed student back to the
  // wizard (the `COMPLETION_COLUMNS` bug, one layer down).
  const checklist = (unwrap(checklistResponse, 'dashboard.checklist') ?? []) as ChecklistItem[];
  const deadlines = (unwrap(deadlinesResponse, 'dashboard.deadlines') ?? []) as DeadlineRow[];
  const personal = unwrap(personalResponse, 'dashboard.personalInformation');
  const academic = unwrap(academicResponse, 'dashboard.academicInput');
  const lifestyle = unwrap(lifestyleResponse, 'dashboard.lifestylePreference');
  const subjects = unwrap(subjectsResponse, 'dashboard.subjects') ?? [];

  // ── Profile completion ──────────────────────────────────────────────────
  const records: ProfileRecordGroup = {
    personal: personal ?? null,
    academicInput: academic ?? null,
    subjectCount: subjects.length,
    lifestyle: lifestyle ?? null
  };
  const stepCompletion = buildStepCompletion(records);
  const profileSteps = PROFILE_STEPS.map((step) => ({
    key: step.key,
    title: step.title,
    done: stepCompletion[step.key]
  }));
  const completedSteps = profileSteps.filter((step) => step.done).length;
  const completionPercent = Math.round((completedSteps / PROFILE_STEPS.length) * 100);
  const nextStep = PROFILE_STEPS.find((step) => !stepCompletion[step.key]) ?? null;

  // ── Pipeline ────────────────────────────────────────────────────────────
  const pipelineStages: PipelineStage[] = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    count: applications.filter((app) => app.status === stage.key).length
  }));
  const submittedCount = applications.filter(
    (app) => app.status === 'submitted' || app.status === 'decision' || app.status === 'enrolled'
  ).length;

  // ── Tasks & deadlines ───────────────────────────────────────────────────
  const openTasks = checklist.filter((task) => task.status !== 'done');
  const overdueTasks = openTasks.filter((task) => {
    const days = safeDaysUntil(task.due_date);
    return days !== null && days < 0;
  });
  const dueTodayTasks = openTasks.filter((task) => safeDaysUntil(task.due_date) === 0);
  const dueThisWeekCount = openTasks.filter((task) => {
    const days = safeDaysUntil(task.due_date);
    return days !== null && days >= 0 && days <= 7;
  }).length;
  const nextDeadline = deadlines[0] ?? null;
  const nextDeadlineDays = nextDeadline ? safeDaysUntil(nextDeadline.deadline_date) : null;

  // ── Counsellor / inbox ──────────────────────────────────────────────────
  const [helpRequests, unreadByRequest, inboxCounsellorName, unreadFromReply] = helpResult;
  const unreadTotal = Array.from(unreadByRequest.values()).reduce((sum, count) => sum + count, 0);
  const openThreads = helpRequests.filter((request) => request.status !== 'resolved');
  const latestSubject = openThreads[0]?.subject ?? helpRequests[0]?.subject ?? null;
  // Disposition: soft, fallback = no meeting. The only read here that belongs to
  // the help/counsellor subsystem, whose posture on this page is already
  // degrade-not-fail (`.catch` on the help chain above) because the hub must
  // still render when the help_* tables are unreachable. Failing the whole
  // dashboard over a meeting card would contradict the decision taken one line
  // earlier for the threads it belongs to.
  const meetingRow = soft<MeetingItem[]>(meetingResponse, 'dashboard.nextMeeting', [])[0] ?? null;

  // Resolve the real counsellor name for the next meeting. The counsellor side
  // runs on live Supabase data, so a second counsellor's meeting must not be
  // attributed to the demo persona. The inbox counsellor name is already
  // resolved above (in the help-threads chain, off the critical path);
  // resolveProfileNames batches + caches, so this at-most-one-id lookup is cheap.
  // DEMO_COUNSELLOR is only the fallback when nothing resolves.
  let meetingCounsellorName: string | null = null;
  if (meetingRow?.counsellor_profile_id) {
    const names = await resolveProfileNames(supabase, [meetingRow.counsellor_profile_id], '');
    const resolved = names.get(meetingRow.counsellor_profile_id);
    meetingCounsellorName = resolved && resolved.length > 0 ? resolved : null;
  }
  // ── Onboarding checklist ────────────────────────────────────────────────
  // Placed here, after `helpRequests` resolves, because every signal is DERIVED
  // from state already loaded above — the checklist stores nothing about which
  // items are ticked. See lib/onboarding/checklist.ts for why that matters.
  // `getOnboardingState`, not `readOnboardingState`: memoised per request, so this and
  // the `<AscendiCoachMount />` below share one query instead of issuing two.
  const onboardingState = await getOnboardingState(identity.userId);
  const checklistSummary = summariseChecklist({
    essentialsComplete: isProfileEssentialComplete(records),
    profileComplete: isProfileComplete(records),
    hasMatches: (matchCountResponse.count ?? 0) > 0,
    hasShortlist,
    hasApplication: applications.length > 0,
    hasTask: checklist.length > 0,
    hasAskedForHelp: helpRequests.length > 0
  });

  const firstNameOf = (fullName: string) => fullName.split(/\s+/)[0];
  const inboxFirstName = inboxCounsellorName ? firstNameOf(inboxCounsellorName) : DEMO_COUNSELLOR.firstName;
  const meetingFirstName = meetingCounsellorName ? firstNameOf(meetingCounsellorName) : DEMO_COUNSELLOR.firstName;
  // The card fronts one counsellor: prefer whoever the next meeting is with,
  // then the latest replier, then the demo persona.
  const cardCounsellorFullName = meetingCounsellorName ?? inboxCounsellorName ?? DEMO_COUNSELLOR.fullName;
  const cardCounsellor = { fullName: cardCounsellorFullName, firstName: firstNameOf(cardCounsellorFullName) };

  const nextMeeting = meetingRow
    ? {
        title: meetingRow.title,
        scheduledFor: meetingRow.scheduled_for,
        location: meetingRow.location,
        status: (meetingRow.status === 'confirmed' ? 'confirmed' : 'proposed') as 'confirmed' | 'proposed'
      }
    : null;
  const meetingSoon = nextMeeting
    ? new Date(nextMeeting.scheduledFor).getTime() - Date.now() <= 1000 * 60 * 60 * 48
    : false;

  // ── Next moves — one hero action + a short queue, every row deep-linked ─
  const focusItems: HubFocusItem[] = [];
  if (overdueTasks.length > 0) {
    focusItems.push({
      id: `overdue-${overdueTasks[0].id}`,
      label: 'Overdue',
      title: overdueTasks.length === 1 ? overdueTasks[0].task_name ?? 'Checklist task' : `${overdueTasks.length} tasks are overdue`,
      detail: overdueTasks.length === 1 ? `Was due ${formatDateOnly(overdueTasks[0].due_date)} — clear it first.` : 'Clear these first to get back on track.',
      href: '/applications/tasks',
      tone: 'rose'
    });
  }
  if (unreadTotal > 0) {
    // "reply/replies" only when an actual counsellor reply backs the unread; a
    // counsellor-initiated opening (no help_messages row) is an unread message.
    const unreadNoun = unreadFromReply
      ? unreadTotal === 1
        ? 'reply'
        : 'replies'
      : unreadTotal === 1
        ? 'message'
        : 'messages';
    focusItems.push({
      id: 'focus-inbox',
      label: 'Inbox',
      title: `${unreadTotal} unread ${unreadNoun} from ${inboxFirstName}`,
      detail: latestSubject ? `Latest thread: ${latestSubject}` : 'Your counsellor is in touch.',
      href: '/inbox',
      tone: 'violet'
    });
  }
  if (dueTodayTasks.length > 0) {
    focusItems.push({
      id: `today-${dueTodayTasks[0].id}`,
      label: 'Due today',
      title: dueTodayTasks[0].task_name ?? 'Checklist task',
      detail: dueTodayTasks.length > 1 ? `Plus ${dueTodayTasks.length - 1} more due today.` : 'Close this out to stay on track.',
      href: '/applications/tasks',
      tone: 'amber'
    });
  }
  if (nextMeeting && meetingSoon) {
    focusItems.push({
      id: 'focus-meeting',
      label: nextMeeting.status === 'confirmed' ? 'Meeting' : 'Proposed meeting',
      title: nextMeeting.title ?? `Catch-up with ${meetingFirstName}`,
      detail:
        nextMeeting.status === 'confirmed'
          ? 'Coming up soon — jot down what you want to cover.'
          : `${meetingFirstName} proposed a time — confirm it in your inbox.`,
      href: '/inbox',
      tone: 'violet'
    });
  }
  if (nextDeadline) {
    focusItems.push({
      id: `deadline-${nextDeadline.id}`,
      label: 'Deadline',
      title: nextDeadline.name ?? 'Application milestone',
      detail:
        nextDeadlineDays !== null
          ? nextDeadlineDays === 0
            ? 'Due today.'
            : `Due ${formatDateOnly(nextDeadline.deadline_date)} — ${nextDeadlineDays} day${nextDeadlineDays === 1 ? '' : 's'} away.`
          : 'Date to be confirmed.',
      href: '/applications',
      tone: nextDeadlineDays !== null && nextDeadlineDays <= 7 ? 'rose' : 'amber'
    });
  }
  const nextOpenTask = openTasks.find((task) => !overdueTasks.includes(task) && !dueTodayTasks.includes(task));
  if (nextOpenTask) {
    focusItems.push({
      id: `task-${nextOpenTask.id}`,
      label: 'Checklist',
      title: nextOpenTask.task_name ?? 'Checklist task',
      detail: nextOpenTask.due_date ? `Due ${formatDateOnly(nextOpenTask.due_date)}` : 'No due date — good one to get ahead on.',
      href: '/applications/tasks',
      tone: 'sky'
    });
  }
  if (nextStep) {
    focusItems.push({
      id: 'focus-profile',
      label: 'Profile',
      title: `Complete ${nextStep.title.toLowerCase()}`,
      detail: 'Richer details unlock sharper matches and requirements.',
      href: '/profile/wizard',
      tone: 'primary'
    });
  }
  if (focusItems.length === 0) {
    focusItems.push({
      id: 'focus-clear',
      label: 'All caught up',
      title: 'Nothing urgent — explore something new',
      detail: 'Browse programmes or revisit your shortlist while things are calm.',
      href: '/university-search/search',
      tone: 'emerald'
    });
  }
  const visibleFocus = focusItems.slice(0, 5);
  const primaryFocus = visibleFocus[0];

  // ── Hero ────────────────────────────────────────────────────────────────
  const firstName = personal?.first_name?.trim() ?? null;
  const heroDescription =
    primaryFocus.id === 'focus-clear'
      ? "You're all caught up — everything you're tracking lives on this page."
      : `Everything in one place — start with ${primaryFocus.title.toLowerCase()}.`;

  const heroStats = [
    {
      label: 'Applications',
      value: `${applicationIds.length}`,
      detail: submittedCount > 0 ? `${submittedCount} submitted` : 'In your pipeline'
    },
    {
      label: 'Due this week',
      value: `${dueThisWeekCount}`,
      detail: openTasks.length > 0 ? `${openTasks.length} open tasks` : 'No open tasks'
    },
    {
      label: 'Next deadline',
      value: nextDeadline ? formatDateOnly(nextDeadline.deadline_date) : '—',
      detail: nextDeadline ? nextDeadline.name ?? 'Milestone' : 'Nothing scheduled'
    },
    {
      label: 'Profile',
      value: `${completionPercent}%`,
      detail: nextStep ? `Next: ${nextStep.title}` : 'All sections complete'
    }
  ];

  return (
    <DashboardShell role={identity.role}>
      <PageHero
        tone="student"
        eyebrow="Home"
        title={<Greeting firstName={firstName} />}
        description={heroDescription}
        highlight={primaryFocus.label}
        stats={heroStats}
        actions={
          <>
            <Button asChild size="sm">
              <Link href="/university-search/search">Explore universities</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/matches">Review matches</Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {/* Row 0 — getting started. ABOVE the priority spine on purpose: while
            it renders, this student has something more basic outstanding than
            anything "Next up" can suggest. It removes itself once the list is
            done or dismissed, so it does not permanently displace the spine.
            Rendered bare, with NO wrapper div: it carries its own `data-tour`
            anchor, and a wrapper would outlive the card and keep claiming a
            `space-y-6` slot after it hid itself. */}
        <GettingStartedCard
          summary={checklistSummary}
          initiallyDismissed={hasSeen(onboardingState, 'checklist_dismissed_at')}
        />

        {/* Row 1 — the priority spine + profile progress */}
        <div className="grid gap-6 lg:grid-cols-12">
          <AnimatedSection className="lg:col-span-8" data-tour="next-up">
            <NextUpCard items={visibleFocus} />
          </AnimatedSection>
          <AnimatedSection className="lg:col-span-4" delay={0.05} data-tour="profile-progress">
            <ProfileProgressCard percent={completionPercent} steps={profileSteps} nextStepTitle={nextStep?.title ?? null} />
          </AnimatedSection>
        </div>

        {/* Row 2 — pipeline, deadlines, counsellor */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <AnimatedSection delay={0.05}>
            <PipelineCard stages={pipelineStages} />
          </AnimatedSection>
          <AnimatedSection delay={0.08}>
            <HubCard
              eyebrow="Timeline"
              title="Upcoming deadlines"
              icon={CalendarClock}
              iconClassName="bg-warning-subtle text-warning ring-warning/25"
              action={deadlines.length > 0 ? { label: 'Plan', href: '/applications' } : undefined}
            >
              <DeadlineTimeline
                items={deadlines.slice(0, 3).map((deadline) => ({
                  id: deadline.id,
                  name: deadline.name,
                  date: deadline.deadline_date ?? 'TBD',
                  context: deadline.intake ?? 'Application period'
                }))}
              />
            </HubCard>
          </AnimatedSection>
          <AnimatedSection className="md:col-span-2 lg:col-span-1" delay={0.11} data-tour="counsellor-card">
            <CounsellorCard
              counsellor={cardCounsellor}
              openThreads={openThreads.length}
              unreadTotal={unreadTotal}
              latestSubject={latestSubject}
              nextMeeting={nextMeeting}
            />
          </AnimatedSection>
        </div>

        {/* Row 3 — tasks (inline mark-done) + top matches */}
        <div className="grid gap-6 lg:grid-cols-12">
          <AnimatedSection className="lg:col-span-5" delay={0.05}>
            <HubCard
              eyebrow="Tasks"
              title="Knock out today's list"
              icon={ListChecks}
              iconClassName="bg-success-subtle text-success ring-success/25"
              action={{ label: 'All tasks', href: '/applications/tasks' }}
            >
              <TaskListPanel
                title=""
                tasks={checklist.slice(0, 6).map((item) => ({
                  id: item.id,
                  name: item.task_name,
                  status: item.status,
                  dueDate: item.due_date ?? undefined
                }))}
              />
            </HubCard>
          </AnimatedSection>
          <AnimatedSection className="lg:col-span-7" delay={0.08} data-tour="matches-peek">
            <Suspense fallback={<MatchesPeekSkeleton />}>
              <MatchesPeek profileId={identity.userId} />
            </Suspense>
          </AnimatedSection>
        </div>

        {/* Row 3.5 — counsellor-assigned university decks (hidden when none;
            no AnimatedSection so a null panel leaves no empty gap in the stack) */}
        <Suspense fallback={null}>
          <CounsellorQuests profileId={identity.userId} />
        </Suspense>

        {/* Row 4 — launch strip to the rest of the app */}
        <AnimatedSection delay={0.05}>
          <QuickLinks />
        </AnimatedSection>
      </div>

      {/* Ascendi's coach. It does NOT start anything on its own — at most it offers,
          in a small card beside the chat launcher, and only on a first visit to this
          section. Mounted last so every `data-tour` anchor above already exists by
          the time it measures them. */}
      <AscendiCoachMount />
    </DashboardShell>
  );
}
