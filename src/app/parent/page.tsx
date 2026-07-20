import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  Check,
  Circle,
  ClipboardCheck,
  MessageSquare,
  UserCircle,
} from 'lucide-react';
import { PageHero } from '@/components/layout/page-hero';
import { SectionNav } from '@/components/layout/section-nav';
import { PARENT_SECTION_ITEMS } from '@/components/layout/navigation';
import { AnimatedSection } from '@/components/layout/animated-section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { loadChildOverview } from '@/lib/parent/data';
import { parseLocalDate, formatRelativeTime } from '@/lib/utils/dates';
import { resolveParentContext } from './_lib/context';
import { ChildSwitcher } from './_components/child-switcher';
import { NoLinkedChildren } from './_components/no-linked-children';

export const metadata: Metadata = { title: 'Overview · Parent' };
export const dynamic = 'force-dynamic';

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

// deadline_date is a date-only string — parse as LOCAL (see lib/utils/dates).
const formatDateOnly = (value?: string | null) => {
  if (!value) return 'TBD';
  const parsed = parseLocalDate(value);
  return Number.isNaN(parsed.getTime()) ? 'TBD' : shortDateFormatter.format(parsed);
};

export default async function ParentOverviewPage() {
  const { supabase, linkedChildren, activeChild } = await resolveParentContext();

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <SectionNav items={PARENT_SECTION_ITEMS} />
        <PageHero
          tone="student"
          eyebrow="Parent"
          title="Welcome to your family view"
          description="A calm window into your child's university journey — progress, deadlines, costs, and a direct line to their counsellor."
          stats={[
            { label: 'Linked students', value: '0', detail: 'Awaiting link' },
            { label: 'Applications', value: '—', detail: 'Nothing to show yet' },
            { label: 'Deadlines', value: '—', detail: 'Nothing to show yet' },
          ]}
        />
        <NoLinkedChildren />
      </div>
    );
  }

  const overview = await loadChildOverview(supabase, activeChild);
  const child = overview.child;

  const highlight =
    overview.overdueTasks > 0
      ? `${overview.overdueTasks} task${overview.overdueTasks === 1 ? ' is' : 's are'} overdue`
      : overview.dueThisWeek > 0
        ? `${overview.dueThisWeek} due this week`
        : 'On track';

  const pipelineMax = Math.max(1, ...overview.pipeline.map((s) => s.count));

  return (
    <div className="space-y-6">
      <SectionNav items={PARENT_SECTION_ITEMS} />

      <PageHero
        tone="student"
        eyebrow="Parent"
        title={`How ${child.firstName} is doing`}
        description="A read-only mirror of their application journey — nothing here changes their work."
        highlight={highlight}
        stats={[
          {
            label: 'Applications',
            value: `${overview.applicationsTotal}`,
            detail: overview.submittedCount > 0 ? `${overview.submittedCount} submitted` : 'In the pipeline',
          },
          {
            label: 'Due this week',
            value: `${overview.dueThisWeek}`,
            detail: overview.openTasks > 0 ? `${overview.openTasks} open tasks` : 'No open tasks',
          },
          {
            label: 'Next deadline',
            value: overview.nextDeadline ? formatDateOnly(overview.nextDeadline.date) : '—',
            detail: overview.nextDeadline ? overview.nextDeadline.university : 'Nothing scheduled',
          },
          {
            label: 'Profile',
            value: `${overview.completionPercent}%`,
            detail: overview.completionPercent === 100 ? 'All sections complete' : 'In progress',
          },
        ]}
        actions={
          <>
            <ChildSwitcher linkedChildren={linkedChildren} activeChildId={child.profileId} />
            <Button asChild size="sm" variant="secondary">
              <Link href="/parent/messages">Message counsellor</Link>
            </Button>
          </>
        }
      />

      {/* Row 1 — pipeline, deadlines, counsellor update */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <AnimatedSection>
          <div className="surface-card surface-card--static h-full">
            <div className="relative z-10">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Pipeline</p>
              <p className="mb-4 text-lg font-semibold text-foreground">Where the applications stand</p>
              <ul className="space-y-3">
                {overview.pipeline.map((stage) => (
                  <li key={stage.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{stage.label}</span>
                      <span className="font-semibold text-foreground">{stage.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          stage.key === 'submitted' || stage.key === 'enrolled'
                            ? 'bg-emerald-500/70'
                            : stage.key === 'in_progress'
                              ? 'bg-sky-500/70'
                              : 'bg-amber-500/60'
                        )}
                        style={{ width: `${(stage.count / pipelineMax) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/parent/progress"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Full progress view <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.05}>
          <div className="surface-card surface-card--static h-full">
            <div className="relative z-10">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Timeline</p>
              <p className="mb-4 text-lg font-semibold text-foreground">Upcoming deadlines</p>
              {overview.upcomingDeadlines.length > 0 ? (
                <ul className="space-y-3">
                  {overview.upcomingDeadlines.slice(0, 3).map((deadline) => (
                    <li key={deadline.id} className="flex items-start gap-3">
                      <div
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          deadline.daysUntil <= 7
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        )}
                      >
                        <CalendarClock className="h-4 w-4" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{deadline.university}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateOnly(deadline.date)} ·{' '}
                          {deadline.daysUntil === 0
                            ? 'today'
                            : `${deadline.daysUntil} day${deadline.daysUntil === 1 ? '' : 's'} away`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming deadlines — a calm stretch.</p>
              )}
              <Link
                href="/parent/deadlines"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                All deadlines <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection className="md:col-span-2 lg:col-span-1" delay={0.08}>
          <div className="surface-card surface-card--static h-full">
            <div className="relative z-10">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Counsellor</p>
              <p className="mb-4 text-lg font-semibold text-foreground">Latest update</p>
              {overview.latestCounsellorNote ? (
                <blockquote className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-3 text-sm text-foreground">
                  <p className="line-clamp-4">{overview.latestCounsellorNote.body}</p>
                  <footer className="mt-2 text-xs text-muted-foreground">
                    {formatRelativeTime(overview.latestCounsellorNote.date)}
                  </footer>
                </blockquote>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No updates yet — the counsellor&apos;s session notes will appear here.
                </p>
              )}
              <Link
                href="/parent/messages"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Open messages
              </Link>
            </div>
          </div>
        </AnimatedSection>
      </div>

      {/* Row 2 — profile completion + tasks snapshot */}
      <div className="grid gap-6 lg:grid-cols-12">
        <AnimatedSection className="lg:col-span-7" delay={0.05}>
          <div className="surface-card surface-card--static h-full">
            <div className="relative z-10">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Profile</p>
              <p className="mb-1 text-lg font-semibold text-foreground">
                {child.firstName}&apos;s profile is {overview.completionPercent}% complete
              </p>
              <p className="mb-4 text-xs text-muted-foreground">
                A complete profile sharpens their university matches and requirements.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {overview.profileSteps.map((step) => (
                  <li
                    key={step.key}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                      step.done
                        ? 'border-emerald-500/20 bg-emerald-500/5 text-foreground'
                        : 'border-border bg-muted/20 text-muted-foreground'
                    )}
                  >
                    {step.done ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-amber-500/70" aria-hidden />
                    )}
                    <span className="flex-1">{step.title}</span>
                    <span className="sr-only">{step.done ? '— complete' : '— not complete yet'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection className="lg:col-span-5" delay={0.08}>
          <div className="surface-card surface-card--static h-full">
            <div className="relative z-10">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Tasks</p>
              <p className="mb-4 text-lg font-semibold text-foreground">Workload at a glance</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    label: 'Open',
                    value: overview.openTasks,
                    icon: ClipboardCheck,
                    tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
                  },
                  {
                    label: 'This week',
                    value: overview.dueThisWeek,
                    icon: CalendarClock,
                    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                  },
                  {
                    label: 'Overdue',
                    value: overview.overdueTasks,
                    icon: UserCircle,
                    tone:
                      overview.overdueTasks > 0
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                  },
                ].map(({ label, value, icon: Icon, tone }) => (
                  <div key={label} className="rounded-xl border border-border bg-background p-3 text-center">
                    <div className={cn('mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg', tone)}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </div>
                    <p className="text-xl font-semibold text-foreground">{value}</p>
                    <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Tasks are {child.firstName}&apos;s to manage — this is just visibility. If something looks stuck,
                the counsellor is a message away.
              </p>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
