import Link from 'next/link';
import { AlertTriangle, Clock, CheckCircle2, BookOpen, Eye, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysUntil, parseLocalDate } from '@/lib/utils/dates';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import { TIER_VISUAL, COMPLETION_VISUAL, classifyCompletion } from '@/lib/theme/categories';
import { avatarColor } from './avatar-palette';
import { MessageStudentButton } from './message-student-button';

interface StudentCardProps {
  student: CounsellorStudent;
  highlight?: string;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/20 px-0.5 text-primary-ink not-italic">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const TIER_COLORS = {
  Reach: cn(TIER_VISUAL.reach.bg, TIER_VISUAL.reach.text, TIER_VISUAL.reach.border),
  Match: cn(TIER_VISUAL.match.bg, TIER_VISUAL.match.text, TIER_VISUAL.match.border),
  Safe: cn(TIER_VISUAL.safety.bg, TIER_VISUAL.safety.text, TIER_VISUAL.safety.border)
};

function getInitials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '–';
}

// Completion banding is COMPLETION_VISUAL's, not a private copy of the same
// thresholds (100 / 75 / 50 → full / high / mid / low).
function getCompletionColor(pct: number) {
  return COMPLETION_VISUAL[classifyCompletion(pct)].bar;
}

function getNextDeadline(student: CounsellorStudent) {
  // Date-only strings must be parsed as LOCAL dates (see lib/utils/dates.ts).
  const upcoming = student.deadlines
    .filter((d) => daysUntil(d.date) >= 0)
    .sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
  return upcoming[0] ?? null;
}

function formatRelative(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSecs = Math.floor(diffInMs / 1000);
  const diffInMins = Math.floor(diffInSecs / 60);
  const diffInHours = Math.floor(diffInMins / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInSecs < 60) return 'just now';
  if (diffInMins < 60) return `${diffInMins}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function isActiveSoon(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  return diffInMs < 2 * 24 * 60 * 60 * 1000;
}

export const StudentCard = ({ student, highlight = '' }: StudentCardProps) => {
  const initials = getInitials(student.personal.firstName, student.personal.lastName);
  const avColor = avatarColor(student.id);
  const completionColor = getCompletionColor(student.profile.completionPct);
  const nextDeadline = getNextDeadline(student);
  const tierCounts = {
    Reach: student.matches.filter((m) => m.tier === 'Reach').length,
    Match: student.matches.filter((m) => m.tier === 'Match').length,
    Safe: student.matches.filter((m) => m.tier === 'Safe').length
  };

  const daysLeft = nextDeadline ? daysUntil(nextDeadline.date) : null;

  return (
    <div className="group surface-card hover-lift relative flex flex-col gap-4">
      {/* Main card link overlay */}
      <Link
        href={`/counsellor/students/${student.id}`}
        className="absolute inset-0 z-0"
        aria-label={`View ${student.personal.firstName} profile`}
      />

      {/* Header */}
      <div className="relative z-10 flex items-start gap-3">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold', avColor)}>
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-foreground group-hover:text-primary-ink transition-colors">
              <Highlight text={`${student.personal.firstName} ${student.personal.lastName}`} query={highlight} />
            </p>
            <span className="text-base" role="img" aria-label={`Flag of ${student.personal.nationality}`}>{student.personal.flagEmoji}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <Highlight text={student.personal.school} query={highlight} />
          </p>
          <p className="text-xs text-muted-foreground">{student.personal.schoolCity}, {student.personal.schoolCountry}</p>
          <p className={cn(
            'mt-1 text-label font-medium',
            isActiveSoon(student.lastActive) ? 'text-success' : 'text-muted-foreground'
          )}>
            Active {formatRelative(student.lastActive)}
          </p>
        </div>
        {student.flags.length > 0 && (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-subtle">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          </div>
        )}

        {/* Quick actions */}
        <div className="absolute right-0 top-0 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 z-20">
          <Link
            href={`/counsellor/students/${student.id}`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground backdrop-blur-sm transition hover:border-primary/40 hover:text-primary-ink"
          >
            <Eye className="h-3.5 w-3.5" />
          </Link>
          <MessageStudentButton
            student={{
              id: student.id,
              firstName: student.personal.firstName,
              lastName: student.personal.lastName
            }}
            variant={null}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground backdrop-blur-sm transition hover:border-primary/40 hover:text-primary-ink"
          >
            <Mail className="h-3.5 w-3.5" />
          </MessageStudentButton>
        </div>
      </div>

      {/* Programme badge */}
      <div className="relative z-10 flex flex-wrap items-center gap-2">
        <span className={cn(
          'rounded-full border px-3 py-0.5 text-xs font-semibold',
          student.academic.programmeType === 'IB'
            ? 'border-feature/25 bg-feature-subtle text-feature'
            : 'border-info/25 bg-info-subtle text-info'
        )}>
          {student.academic.programmeType === 'IB'
            ? student.academic.ibPoints ? `IB · ${student.academic.ibPoints} pts` : 'IB'
            : student.academic.aLevelGrades ? `A-Level · ${student.academic.aLevelGrades}` : 'A-Level'}
        </span>
        <span className="rounded-full border border-primary/15 bg-primary/8 px-3 py-0.5 text-xs text-foreground">
          {student.academic.clusters[0]?.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Profile completion */}
      <div className="relative z-10 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Profile complete</span>
          <span className={cn('font-semibold', student.profile.completionPct === 100 ? 'text-success' : 'text-warning')}>
            {student.profile.completionPct}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
          <div
            className={cn('h-1.5 rounded-full transition-[width]', completionColor)}
            style={{ width: `${student.profile.completionPct}%` }}
          />
        </div>
      </div>

      {/* Match tier pills */}
      {student.matches.length > 0 ? (
        <div className="relative z-10 flex items-center gap-1.5">
          {Object.entries(tierCounts).map(([tier, count]) =>
            count > 0 ? (
              <span
                key={tier}
                className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', TIER_COLORS[tier as keyof typeof TIER_COLORS])}
              >
                {count} {tier}
              </span>
            ) : null
          )}
        </div>
      ) : (
        <div className="relative z-10 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          No matches generated yet
        </div>
      )}

      {/* Footer: next deadline */}
      <div className="relative z-10 border-t border-border/60 pt-3">
        {nextDeadline ? (
          <div className={cn('flex items-center gap-2 text-xs', daysLeft !== null && daysLeft <= 7 ? 'text-danger' : 'text-muted-foreground')}>
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {daysLeft !== null && daysLeft <= 0 ? 'Overdue: ' : daysLeft !== null && daysLeft <= 7 ? `${daysLeft}d: ` : ''}
              {nextDeadline.university} · {parseLocalDate(nextDeadline.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            No upcoming deadlines
          </div>
        )}
      </div>
    </div>
  );
};
