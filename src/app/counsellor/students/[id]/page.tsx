import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, BookOpen, FileText, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysUntil, parseLocalDate } from '@/lib/utils/dates';
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
const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  profile_incomplete: { label: 'Profile incomplete', color: 'border-warning/25 bg-warning-subtle text-warning' },
  deadline_urgent: { label: 'Deadline urgent', color: 'border-danger/25 bg-danger-subtle text-danger' },
  no_matches: { label: 'No matches', color: 'border-info/25 bg-info-subtle text-info' },
  stalled: { label: 'Stalled', color: 'border-warning/25 bg-warning-subtle text-warning' }
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

  const initials = `${student.personal.firstName[0] ?? ''}${student.personal.lastName[0] ?? ''}`.toUpperCase() || '–';
  const avColor = avatarColor(student.id);
  // Computed but not yet surfaced anywhere on this page — see report: the
  // quick-stats grid shows match COUNT but never the average match score.
  const _avgScore = getAvgMatchScore(student.matches);
  const nextDeadlineDays = getNextDeadlineDays(student);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/counsellor" className="hover:text-foreground transition-colors">
          Overview
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <Link href="/counsellor/students" className="hover:text-foreground transition-colors">
          Students
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold text-foreground">
          {student.personal.firstName} {student.personal.lastName}
        </span>
      </nav>
      {/* Header card */}
      <div className="surface-card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className={cn('flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl text-xl font-bold', avColor)}>
            {initials}
          </div>

          {/* Identity */}
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">
                {student.personal.firstName} {student.personal.lastName}
              </h1>
              <span className="text-2xl" role="img" aria-label={`Flag of ${student.personal.nationality}`}>{student.personal.flagEmoji}</span>
              {student.flags.map((flag) => {
                const cfg = FLAG_LABELS[flag];
                return (
                  <span key={flag} className={cn('flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs font-semibold', cfg.color)}>
                    <AlertTriangle className="h-3 w-3" />
                    {cfg.label}
                  </span>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              {student.personal.school} · {student.personal.schoolCity}, {student.personal.schoolCountry}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold',
                student.academic.programmeType === 'IB'
                  ? 'border-feature/25 bg-feature-subtle text-feature'
                  : 'border-info/25 bg-info-subtle text-info'
              )}>
                {student.academic.programmeType === 'IB'
                  ? student.academic.ibPoints ? `IB · ${student.academic.ibPoints} pts` : 'IB'
                  : student.academic.aLevelGrades ? `A-Level · ${student.academic.aLevelGrades}` : 'A-Level'}
              </span>
              {student.academic.clusters.map((c) => (
                <span key={c} className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs capitalize text-muted-foreground">
                  {c.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>

          {/* Actions + Quick stats */}
          <div className="flex flex-col gap-3">
            {/* Message button — opens in-app send modal, fires student notification */}
            <MessageStudentButton
              student={{
                id: student.id,
                firstName: student.personal.firstName,
                lastName: student.personal.lastName
              }}
              variant="header"
            />


            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: 'Profile',
                  value: `${student.profile.completionPct}%`,
                  icon: CheckCircle2,
                  color: student.profile.completionPct === 100 ? 'text-success' : 'text-warning'
                },
                {
                  label: 'Matches',
                  value: String(student.matches.length),
                  icon: BookOpen,
                  color: 'text-primary-ink'
                },
                {
                  label: 'Applications',
                  value: String(student.applications.length),
                  icon: FileText,
                  color: 'text-feature'
                },
                {
                  label: nextDeadlineDays != null ? (nextDeadlineDays <= 7 ? 'Urgent' : 'Next due') : 'Deadlines',
                  value: nextDeadlineDays != null ? `${nextDeadlineDays}d` : '—',
                  icon: Clock,
                  color: nextDeadlineDays != null && nextDeadlineDays <= 7 ? 'text-danger' : 'text-muted-foreground'
                }
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="flex flex-col items-center gap-1 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-center">
                  <Icon className={cn('h-4 w-4', color)} />
                  <p className={cn('text-lg font-bold tabular-nums', color)}>{value}</p>
                  <p className="text-label text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Profile completion bar */}
        {student.profile.completionPct < 100 && (
          <div className="mt-4 space-y-1.5 border-t border-border/60 pt-4">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Profile completion</span>
              <span className="font-semibold text-warning">{student.profile.completionPct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-1.5 rounded-full bg-warning transition-all"
                style={{ width: `${student.profile.completionPct}%` }}
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
      {/* Tabbed detail view */}
      <StudentDetailTabs student={student} evolution={evolution} />
    </div>
  );
}
