import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, BookOpen, FileText, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysUntil, parseLocalDate } from '@/lib/utils/dates';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadStudentById, loadStudentEvolution } from '@/lib/counsellor/data';
import { loadStudentQuestDecks } from '@/lib/counsellor/decks';
import { StudentDetailTabs } from '../../_components/student-detail-tabs';
import { MessageStudentButton } from '../../_components/message-student-button';
import { CharacterSheet } from '../../_components/character-sheet';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  profile_incomplete: { label: 'Profile incomplete', color: 'border-amber-200/60 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  deadline_urgent: { label: 'Deadline urgent', color: 'border-red-200/60 bg-red-500/10 text-red-600' },
  no_matches: { label: 'No matches', color: 'border-sky-200/60 bg-sky-500/10 text-sky-600' },
  stalled: { label: 'Stalled', color: 'border-orange-200/60 bg-orange-500/10 text-orange-600' }
};

const AVATAR_PALETTE = [
  'bg-violet-500/20 text-violet-700 dark:text-violet-300',
  'bg-sky-500/20 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  'bg-rose-500/20 text-rose-700 dark:text-rose-300',
  'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
];

function avatarColor(id: string) {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

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
  const [evolution, questDecks] = await Promise.all([
    loadStudentEvolution(supabase, id),
    // Deck tables may not exist until the migration is applied — degrade to an
    // empty quest log rather than tripping the section error boundary.
    loadStudentQuestDecks(supabase, id).catch(() => []),
  ]);

  const initials = `${student.personal.firstName[0] ?? ''}${student.personal.lastName[0] ?? ''}`.toUpperCase() || '–';
  const avColor = avatarColor(student.id);
  const avgScore = getAvgMatchScore(student.matches);
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
      <div className="surface-card surface-card--static">
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
                  ? 'border-violet-200/60 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                  : 'border-sky-200/60 bg-sky-500/10 text-sky-700 dark:text-sky-300'
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
                  color: student.profile.completionPct === 100 ? 'text-emerald-600' : 'text-amber-600'
                },
                {
                  label: 'Matches',
                  value: String(student.matches.length),
                  icon: BookOpen,
                  color: 'text-primary'
                },
                {
                  label: 'Applications',
                  value: String(student.applications.length),
                  icon: FileText,
                  color: 'text-violet-600'
                },
                {
                  label: nextDeadlineDays != null ? (nextDeadlineDays <= 7 ? 'Urgent' : 'Next due') : 'Deadlines',
                  value: nextDeadlineDays != null ? `${nextDeadlineDays}d` : '—',
                  icon: Clock,
                  color: nextDeadlineDays != null && nextDeadlineDays <= 7 ? 'text-red-500' : 'text-muted-foreground'
                }
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="flex flex-col items-center gap-1 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-center">
                  <Icon className={cn('h-4 w-4', color)} />
                  <p className={cn('text-lg font-bold tabular-nums', color)}>{value}</p>
                  <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
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
              <span className="font-semibold text-amber-600">{student.profile.completionPct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-1.5 rounded-full bg-amber-500 transition-all"
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
      {/* RPG character sheet: level/XP, stat blocks, assigned-deck quest log */}
      <CharacterSheet student={student} questDecks={questDecks} />
      {/* Tabbed detail view */}
      <StudentDetailTabs student={student} evolution={evolution} />
    </div>
  );
}
