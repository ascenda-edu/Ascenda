import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { PROFILE_STEPS } from '@/lib/profile/steps';
import { buildStepCompletion } from '@/lib/profile/completion';
import { loadMatchesForProfile } from '@/lib/matching/service';
import type { EnrichedMatch } from '@/lib/matching/types';
import type { Database } from '@/lib/types/database';

type ApplicationRow = Database['public']['Tables']['applications']['Row'];
type ChecklistRow = Database['public']['Tables']['application_checklist']['Row'];
type DeadlineRow = Database['public']['Tables']['deadlines']['Row'];
type SubjectRow = Database['public']['Tables']['student_subjects']['Row'];

const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const formatShortDate = (value?: string | null) => {
  if (!value) {
    return 'TBD';
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'TBD';
  }
  return shortDateFormatter.format(new Date(timestamp));
};

export async function GET() {
  // Route handlers need the route-handler factory — the Server-Component one
  // drops refreshed session cookies (its cookie set/remove are no-ops).
  const supabase = createRouteHandlerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: applications } = await supabase
    .from('applications')
    .select('id, program_id')
    .eq('profile_id', user.id);

  const applicationIds = (applications ?? []).map((app) => app.id);
  const applicationProgramIds = (applications ?? []).map((app) => app.program_id);

  const [
    checklistResponse,
    deadlinesResponse,
    personalResponse,
    academicResponse,
    lifestyleResponse,
    subjectsResponse
  ] = await Promise.all([
    applicationIds.length
      ? supabase.from('application_checklist').select('*').in('application_id', applicationIds).order('due_date', { ascending: true }).limit(5)
      : Promise.resolve({ data: [] as ChecklistRow[], error: null }),
    applicationProgramIds.length
      ? supabase
        .from('deadlines')
        .select('*')
        .in('program_id', applicationProgramIds)
        .gte('deadline_date', today)
        .order('deadline_date', { ascending: true })
        .limit(5)
      : Promise.resolve({ data: [] as DeadlineRow[], error: null }),
    supabase.from('student_personal_information').select('*').eq('profile_id', user.id).maybeSingle(),
    supabase.from('student_academic_input').select('*').eq('profile_id', user.id).maybeSingle(),
    supabase.from('student_lifestyle_preference').select('*').eq('profile_id', user.id).maybeSingle(),
    supabase.from('student_subjects').select('*').eq('profile_id', user.id)
  ]);

  const queryErrors = [
    checklistResponse.error,
    deadlinesResponse.error,
    personalResponse.error,
    academicResponse.error,
    lifestyleResponse.error,
    subjectsResponse.error
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
  }

  const checklist = (checklistResponse.data ?? []) as ChecklistRow[];
  const deadlines = (deadlinesResponse.data ?? []) as DeadlineRow[];
  const personal = personalResponse.data ?? null;
  const academicInput = academicResponse.data ?? null;
  const lifestyle = lifestyleResponse.data ?? null;
  const subjects = (subjectsResponse.data ?? []) as SubjectRow[];
  const matchResult = await loadMatchesForProfile(supabase, user.id, { resultLimit: 3 });

  const openTasks = checklist.filter((task) => task.status !== 'done').length;
  const now = Date.now();
  const dueSoonCount = checklist.filter((task) => {
    if (!task.due_date) return false;
    const dueTime = Date.parse(task.due_date);
    return !Number.isNaN(dueTime) && dueTime >= now && dueTime <= now + 1000 * 60 * 60 * 24 * 7;
  }).length;

  const nextDeadline = deadlines[0] ?? null;

  const enrichedMatches: EnrichedMatch[] =
    matchResult.error || matchResult.missingSections.length > 0 ? [] : matchResult.matches.slice(0, 3);

  const averageMatchScore = enrichedMatches.length
    ? Math.round(enrichedMatches.reduce((total, item) => total + item.score, 0) / enrichedMatches.length)
    : null;

  const stepCompletion = buildStepCompletion({
    personal,
    academicInput,
    subjectCount: subjects.length,
    lifestyle
  });
  const completedSteps = PROFILE_STEPS.filter((step) => stepCompletion[step.key]).length;
  const completionPercent = Math.round((completedSteps / PROFILE_STEPS.length) * 100);
  const nextStep = PROFILE_STEPS.find((step) => !stepCompletion[step.key]);

  const todayString = new Date().toDateString();
  const isSameToday = (value?: string | null) => {
    if (!value) return false;
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return false;
    }
    return new Date(timestamp).toDateString() === todayString;
  };

  const dailySummary = {
    tasks: checklist.filter((task) => isSameToday(task.due_date)).length,
    deadlines: deadlines.filter((deadline) => isSameToday(deadline.deadline_date)).length,
    interviews: checklist.filter(
      (task) => isSameToday(task.due_date) && /interview/i.test(task.task_name ?? '')
    ).length
  };

  const highlightCards = [
    {
      id: 'profile',
      label: 'Profile readiness',
      value: `${completionPercent}%`,
      detail: nextStep ? `${nextStep.title} needs attention` : 'All sections complete',
      tone: completionPercent === 100 ? 'positive' : undefined
    },
    {
      id: 'tasks',
      label: 'Checklist',
      value: openTasks > 0 ? `${openTasks} open` : 'All clear',
      detail: dueSoonCount > 0 ? `${dueSoonCount} due this week` : 'No deadlines in the next 7 days',
      tone: openTasks === 0 ? 'positive' : dueSoonCount > 0 ? 'warning' : undefined
    },
    {
      id: 'deadline',
      label: 'Next deadline',
      value: nextDeadline ? formatShortDate(nextDeadline.deadline_date) : 'TBD',
      detail: nextDeadline ? nextDeadline.name : 'Track a program to unlock deadlines',
      tone: nextDeadline ? undefined : 'muted'
    },
    {
      id: 'matches',
      label: 'Match momentum',
      value: enrichedMatches.length > 0 ? `${enrichedMatches[0].score}%` : 'Profile first',
      detail:
        enrichedMatches.length > 0
          ? `${enrichedMatches[0].program.name} • ${enrichedMatches[0].university.name}`
          : 'Update your profile to unlock matches',
      tone: enrichedMatches.length > 0 && enrichedMatches[0].score >= 80 ? 'positive' : undefined
    }
  ] as const;

  const focusItems: { id: string; label: string; title: string; detail: string }[] = [];
  if (nextStep) {
    focusItems.push({
      id: 'focus-profile',
      label: 'Profile',
      title: nextStep.title,
      detail: 'Add these details to unlock richer recommendations.'
    });
  }

  const nextTask = checklist.find((task) => task.status !== 'done');
  if (nextTask) {
    focusItems.push({
      id: nextTask.id,
      label: 'Checklist',
      title: nextTask.task_name,
      detail: nextTask.due_date ? `Due ${formatShortDate(nextTask.due_date)}` : 'No due date'
    });
  }

  const blockerMatch = enrichedMatches.find((match) => match.blockingReasons.length > 0);

  if (blockerMatch) {
    focusItems.push({
      id: `blocker-${blockerMatch.program.id}`,
      label: 'Eligibility flag',
      title: blockerMatch.program.name,
      detail: blockerMatch.blockingReasons[0]
    });
  } else if (nextDeadline) {
    focusItems.push({
      id: 'focus-deadline',
      label: 'Milestone',
      title: nextDeadline.name,
      detail: `Due ${formatShortDate(nextDeadline.deadline_date)}`
    });
  }

  if (focusItems.length === 0) {
    focusItems.push({
      id: 'focus-clear',
      label: 'Systems check',
      title: 'You are on track',
      detail: 'Keep logging progress or add programs to surface new actions.'
    });
  }

  const steps = PROFILE_STEPS.map((step) => ({
    key: step.key,
    title: step.title,
    description: step.description,
    complete: stepCompletion[step.key]
  }));

  return NextResponse.json(
    {
      highlightCards,
      focusItems,
      completionPercent,
      completedSteps,
      steps,
      averageMatchScore,
      nextStepTitle: nextStep?.title ?? null,
      todayFocus: dailySummary
    },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
