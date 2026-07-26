import { notFound } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysUntil, parseLocalDate } from '@/lib/utils/dates';
import { PageHero } from '@/components/layout/page-hero';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadStudentById, loadStudentEvolution } from '@/lib/counsellor/data';
import { avatarColor } from '../../_components/avatar-palette';
import { StudentDetailTabs } from '../../_components/student-detail-tabs';
import { MessageStudentButton } from '../../_components/message-student-button';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

// `stalled` was the app's only orange; there is no orange tone, and "stalled" is
// the same "needs a nudge" state as an incomplete profile, so both wear `warning`.
const FLAG_BADGES: Record<string, { label: string; variant: BadgeVariant }> = {
  profile_incomplete: { label: 'Profile incomplete', variant: 'warning' },
  deadline_urgent: { label: 'Deadline urgent', variant: 'danger' },
  no_matches: { label: 'No matches', variant: 'info' },
  stalled: { label: 'Stalled', variant: 'warning' }
};

function getAvgMatchScore(matches: { score: number }[]) {
  if (matches.length === 0) return null;
  return Math.round(matches.reduce((acc, m) => acc + m.score, 0) / matches.length);
}

function getNextDeadlineDays(student: CounsellorStudent) {
  // Date-only strings must be parsed as LOCAL dates (see lib/utils/dates.ts).
  const upcoming = student.deadlines
    .filter((d) => daysUntil(d.date) >= 0)
    .sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
  if (!upcoming[0]) return null;
  return daysUntil(upcoming[0].date);
}

export default async function StudentDetailPage(props: Props) {
  const params = await props.params;
  const { id } = params;
  const supabase = await createServerSupabaseClient();
  const student = await loadStudentById(supabase, id);
  if (!student) notFound();
  const evolution = await loadStudentEvolution(supabase, id);

  const fullName = `${student.personal.firstName} ${student.personal.lastName}`;
  const initials = `${student.personal.firstName[0] ?? ''}${student.personal.lastName[0] ?? ''}`.toUpperCase() || '–';
  const avColor = avatarColor(student.id);
  const avgScore = getAvgMatchScore(student.matches);
  const nextDeadlineDays = getNextDeadlineDays(student);
  const completionPct = student.profile.completionPct;
  const clusters = student.academic.clusters;
  const programmeLabel = student.academic.programmeType === 'IB'
    ? student.academic.ibPoints ? `IB · ${student.academic.ibPoints} pts` : 'IB'
    : student.academic.aLevelGrades ? `A-Level · ${student.academic.aLevelGrades}` : 'A-Level';

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Counsellor"
        highlight={programmeLabel}
        title={
          <span className="inline-flex flex-wrap items-center gap-2.5">
            <span
              className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-bold', avColor)}
              aria-hidden
            >
              {initials}
            </span>
            {fullName}
            <span role="img" aria-label={`Flag of ${student.personal.nationality}`}>
              {student.personal.flagEmoji}
            </span>
          </span>
        }
        description={`${student.personal.school} · ${student.personal.schoolCity}, ${student.personal.schoolCountry}`}
        breadcrumbs={
          <Breadcrumbs
            homeHref="/counsellor"
            items={[{ label: 'Students', href: '/counsellor/students' }, { label: fullName }]}
          />
        }
        stats={[
          {
            label: 'Profile',
            value: `${completionPct}%`,
            detail: completionPct === 100 ? 'Complete' : 'Still incomplete'
          },
          {
            label: 'Matches',
            // The average score used to be computed here and never rendered.
            value: String(student.matches.length),
            detail: avgScore != null ? `Avg fit ${avgScore}` : 'None generated'
          },
          { label: 'Applications', value: String(student.applications.length), detail: 'Being tracked' },
          {
            label: nextDeadlineDays != null ? (nextDeadlineDays <= 7 ? 'Deadline' : 'Next due') : 'Deadlines',
            value: nextDeadlineDays != null ? `${nextDeadlineDays}d` : '—',
            detail: nextDeadlineDays != null
              ? (nextDeadlineDays <= 7 ? 'Needs attention now' : 'Until the next one')
              : 'None tracked'
          }
        ]}
        actions={
          <>
            {/* Message button — opens in-app send modal, fires student notification */}
            <MessageStudentButton
              student={{
                id: student.id,
                firstName: student.personal.firstName,
                lastName: student.personal.lastName
              }}
              variant="header"
            />
            {student.flags.map((flag) => {
              const cfg = FLAG_BADGES[flag];
              // An unrecognised flag is skipped rather than crashing the page.
              if (!cfg) return null;
              return (
                <Badge key={flag} variant={cfg.variant}>
                  <AlertTriangle className="h-3 w-3" />
                  {cfg.label}
                </Badge>
              );
            })}
          </>
        }
      />

      {/* Fields of interest + profile completion — the two facts from the old
          bespoke header card that the hero has no slot for. */}
      {(clusters.length > 0 || completionPct < 100) && (
        <div className="surface-card space-y-4">
          {clusters.length > 0 && (
            <div className="space-y-2">
              <p className="eyebrow">Fields of interest</p>
              <div className="flex flex-wrap gap-2">
                {clusters.map((c) => (
                  <Badge key={c} className="capitalize">{c.replace(/_/g, ' ')}</Badge>
                ))}
              </div>
            </div>
          )}

          {completionPct < 100 && (
            <div className={cn('space-y-1.5', clusters.length > 0 && 'border-t border-border/60 pt-4')}>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Profile completion</span>
                <span className="font-semibold text-warning">{completionPct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-1.5 rounded-full bg-warning transition-all"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Missing: {(['personal', 'academic', 'subjects', 'lifestyle'] as const)
                  .filter((step) => !student.profile.stepsComplete.includes(step))
                  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                  .join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabbed detail view */}
      <StudentDetailTabs student={student} evolution={evolution} />
    </div>
  );
}
