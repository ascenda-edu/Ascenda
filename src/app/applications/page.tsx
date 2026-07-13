import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { SectionNav } from '@/components/layout/section-nav';
import { PLANNER_SECTION_ITEMS } from '@/components/layout/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { ClipboardCheck } from 'lucide-react';
import { NextActionsList, type NextActionItem } from '@/components/applications/next-actions-list';
import { ApplicationList, type ApplicationRow } from '@/components/applications/application-list';

export const metadata: Metadata = {
  title: 'Applications'
};

export default async function ApplicationsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: applications } = await supabase
    .from('applications')
    .select(`
      id,
      status,
      notes,
      program_id,
      program:programs(
        id,
        name:course_name,
        level:study_level,
        universities(name,country),
        deadlines(
          id,
          name,
          deadline_date,
          intake,
          program_id
        )
      ),
      application_checklist(
        id,
        task_name,
        status,
        due_date,
        application_id
      )
    `)
    .eq('profile_id', user.id);

  type ChecklistRecord = {
    id: string;
    task_name: string;
    status: 'todo' | 'doing' | 'done';
    due_date?: string | null;
    application_id?: string | null;
  };

  type DeadlineRecord = {
    id: string;
    name: string;
    deadline_date?: string | null;
    intake?: string | null;
    program_id: string;
  };

  type ApplicationRecord = {
    id: string;
    status: string;
    notes?: string | null;
    program_id: string;
    program?: {
      id: string;
      name?: string | null;
      level?: string | null;
      universities?: { name?: string | null; country?: string | null } | null;
      deadlines?: DeadlineRecord[] | null;
    } | null;
    application_checklist?: ChecklistRecord[] | null;
  };

  const appRecords = ((applications ?? []) as ApplicationRecord[]) ?? [];

  if (appRecords.length === 0) {
    return (
      <DashboardShell>
        <SectionNav items={PLANNER_SECTION_ITEMS} />
        <PageHero
          tone="student"
          eyebrow="Your applications"
          title="Let's get your first one in motion"
          description="Pick a program from your shortlist and we'll set up the tasks, deadlines, and docs for you."
          highlight="Nothing tracked yet"
          accent="Ready when you are"
          stats={[
            { label: 'Applications', value: '0', detail: 'Tracked' },
            { label: 'Deadlines', value: '—', detail: 'Awaiting programs' },
            { label: 'Updates', value: '—', detail: 'Add programs first' }
          ]}
          breadcrumbs={<Breadcrumbs />}
          actions={
            <Button asChild size="sm">
              <Link href="/university-search/shortlist">Add from shortlist</Link>
            </Button>
          }
        />
        <EmptyState
          icon={ClipboardCheck}
          title="No applications yet — let's pick a first one"
          description="Add a program from your shortlist and we'll line up the tasks, deadlines, and documents for you."
          action={
            <Button asChild size="sm">
              <Link href="/university-search/shortlist">Add from shortlist</Link>
            </Button>
          }
          hint="Don't have a shortlist yet? Browse your matches instead."
        />
      </DashboardShell>
    );
  }

  // ─── Tier lookup from student_matches ──────────────────────────────────
  // student_matches encodes tier (Reach / Match / Safe) inside breakdown JSON.
  // Map program_id → tier so application rows can wear the right badge.
  const programIds = appRecords.map((app) => app.program_id);
  const { data: matchRows } = await supabase
    .from('student_matches')
    .select('program_id, breakdown')
    .eq('profile_id', user.id)
    .in('program_id', programIds);

  const tierByProgramId = new Map<string, 'Reach' | 'Match' | 'Safe'>();
  for (const row of (matchRows ?? []) as Array<{ program_id: string; breakdown: Record<string, unknown> | null }>) {
    const tier = row.breakdown?.tier;
    if (tier === 'Reach' || tier === 'Match' || tier === 'Safe') {
      tierByProgramId.set(row.program_id, tier);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────
  const now = Date.now();
  const ONE_DAY = 1000 * 60 * 60 * 24;
  const daysFromNow = (iso?: string | null): number | null => {
    if (!iso) return null;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return null;
    return Math.ceil((ts - now) / ONE_DAY);
  };

  // ─── Build next-actions ────────────────────────────────────────────────
  // One open task per application, ranked across the board by earliest
  // due date (or by application's earliest deadline if no task has a due).
  const nextActionItems: NextActionItem[] = [];
  for (const app of appRecords) {
    const openTasks = (app.application_checklist ?? []).filter((t) => t.status !== 'done');
    if (openTasks.length === 0) continue;

    // Pick the earliest-due open task, falling back to the first.
    const ranked = [...openTasks].sort((a, b) => {
      const da = a.due_date ? Date.parse(a.due_date) : Number.POSITIVE_INFINITY;
      const db = b.due_date ? Date.parse(b.due_date) : Number.POSITIVE_INFINITY;
      return da - db;
    });
    const top = ranked[0];

    const programDeadlines = app.program?.deadlines ?? [];
    const earliestProgramDeadline = programDeadlines
      .map((d) => d.deadline_date)
      .filter((d): d is string => Boolean(d))
      .sort()[0];

    const days = daysFromNow(top.due_date ?? earliestProgramDeadline ?? null);

    nextActionItems.push({
      taskId: top.id,
      applicationId: app.id,
      university: app.program?.universities?.name ?? 'University',
      program: app.program?.name ?? 'Programme',
      taskName: top.task_name,
      dueDate: top.due_date ?? null,
      daysUntilDue: days,
      tasksRemaining: openTasks.length
    });
  }

  // ─── Build the all-applications list ───────────────────────────────────
  const applicationRows: ApplicationRow[] = appRecords.map((app) => {
    const tasks = app.application_checklist ?? [];
    const openTasks = tasks.filter((t) => t.status !== 'done');
    const programDeadlines = app.program?.deadlines ?? [];
    const earliestDeadlineIso = programDeadlines
      .map((d) => d.deadline_date)
      .filter((d): d is string => Boolean(d))
      .sort()[0];

    return {
      id: app.id,
      university: app.program?.universities?.name ?? 'University',
      program: app.program?.name ?? 'Programme',
      status: app.status,
      tier: tierByProgramId.get(app.program_id) ?? null,
      daysUntilDeadline: daysFromNow(earliestDeadlineIso ?? null),
      tasksOpen: openTasks.length,
      tasksTotal: tasks.length
    };
  });

  // ─── Hero numbers ──────────────────────────────────────────────────────
  const submittedCount = appRecords.filter((a) => a.status === 'submitted' || a.status === 'decision' || a.status === 'enrolled').length;
  const inProgressCount = appRecords.filter((a) => a.status === 'in_progress' || a.status === 'planning').length;

  // Find the most urgent next-action for the hero highlight.
  const mostUrgent = [...nextActionItems].sort((a, b) => {
    const da = a.daysUntilDue ?? Number.POSITIVE_INFINITY;
    const db = b.daysUntilDue ?? Number.POSITIVE_INFINITY;
    return da - db;
  })[0];
  const highlight = mostUrgent && mostUrgent.daysUntilDue !== null
    ? mostUrgent.daysUntilDue <= 0
      ? `${mostUrgent.university} ${mostUrgent.taskName} is overdue`
      : `${mostUrgent.daysUntilDue} day${mostUrgent.daysUntilDue === 1 ? '' : 's'} until ${mostUrgent.university} ${mostUrgent.taskName}`
    : 'Nothing urgent right now';

  return (
    <DashboardShell>
      <SectionNav items={PLANNER_SECTION_ITEMS} />

      <PageHero
        tone="student"
        eyebrow="Your applications"
        accent="Today"
        title="Where everything's at"
        description="The most urgent thing first, then everything you're tracking."
        highlight={highlight}
        stats={[
          { label: 'Tracked', value: `${appRecords.length}`, detail: 'Applications' },
          { label: 'In progress', value: `${inProgressCount}`, detail: 'Working on now' },
          { label: 'Submitted', value: `${submittedCount}`, detail: 'Awaiting decision' }
        ]}
        breadcrumbs={<Breadcrumbs />}
        actions={
          <>
            <Button asChild size="sm">
              <Link href="/university-search/shortlist">Add from shortlist</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/applications/tasks">All tasks</Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6 sm:space-y-8">
        {/* ── What's next ───────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                What&apos;s next
              </p>
              <h2 className="text-xl font-semibold text-foreground">Your top three this week</h2>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/applications/tasks">All tasks →</Link>
            </Button>
          </div>
          <NextActionsList items={nextActionItems} />
        </section>

        {/* ── All applications ──────────────────────────────────── */}
        <section className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              All applications
            </p>
            <h2 className="text-xl font-semibold text-foreground">
              {appRecords.length} tracked · in-progress first, submitted at the bottom
            </h2>
          </div>
          <ApplicationList rows={applicationRows} />
        </section>
      </div>
    </DashboardShell>
  );
}
