import {
  AlertTriangle,
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Compass,
  FileText,
  Flag,
  GraduationCap,
  Heart,
  ListChecks,
  MapPin,
  Mail,
  MessageSquare,
  PenLine,
  Sparkles,
  Shield,
  Target,
  Timer,
  TrendingUp,
  UserCircle,
  Users,
  type LucideIcon
} from 'lucide-react';
import { parseLocalDate } from '@/lib/utils/dates';

/**
 * Single source of truth for category styling on the student surface.
 *
 * Counsellor patterns we mirror:
 *   rose   = urgent / overdue / reach
 *   amber  = todo / pending / match / warning
 *   emerald = done / submitted / safety / positive
 *   sky    = in-progress / informational / planning
 *   violet = essay / session / counsellor-flavoured
 *   primary = neutral hero / call-to-action accent
 *
 * Each category exposes:
 *   - icon: a lucide icon component
 *   - text / bg / border / ring / accent class strings
 *   - chip: a single-line className for inline pills.
 *           ALL chips are pill-shaped (rounded-full) and pre-include
 *           `inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold`
 *           so call sites should NOT add their own radius / padding.
 *   - swatch: a single-line className for icon-in-box (h-9 w-9 rounded-2xl)
 */

export type CategoryTone =
  | 'rose'
  | 'amber'
  | 'emerald'
  | 'sky'
  | 'violet'
  | 'primary'
  | 'neutral';

export interface CategoryVisual {
  tone: CategoryTone;
  icon: LucideIcon;
  /** Foreground text colour (light + dark adjusted). */
  text: string;
  /** Soft background tint. */
  bg: string;
  /** Border colour for cards using this tone. */
  border: string;
  /** Ring colour for icon-in-box. */
  ring: string;
  /** Left-accent stripe colour, e.g. for `border-l-4`. */
  accent: string;
  /** Compact pill: bg + text + border together. */
  chip: string;
  /** Icon-in-box wrapper. Apply to a <div>; size is opinionated to h-9 w-9 rounded-2xl. */
  swatch: string;
  /** Soft progress-bar fill colour. */
  bar: string;
}

const TONE: Record<CategoryTone, Omit<CategoryVisual, 'icon' | 'tone'>> = {
  rose: {
    text: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-200/60 dark:border-rose-500/20',
    ring: 'ring-rose-500/20',
    accent: 'border-l-rose-500',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-200/60 dark:text-rose-400 dark:border-rose-500/20',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400',
    bar: 'bg-rose-500'
  },
  amber: {
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-200/60 dark:border-amber-500/20',
    ring: 'ring-amber-500/20',
    accent: 'border-l-amber-500',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-200/60 dark:text-amber-400 dark:border-amber-500/20',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400',
    bar: 'bg-amber-500'
  },
  emerald: {
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-200/60 dark:border-emerald-500/20',
    ring: 'ring-emerald-500/20',
    accent: 'border-l-emerald-500',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-200/60 dark:text-emerald-400 dark:border-emerald-500/20',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400',
    bar: 'bg-emerald-500'
  },
  sky: {
    text: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-200/60 dark:border-sky-500/20',
    ring: 'ring-sky-500/20',
    accent: 'border-l-sky-500',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-sky-500/10 text-sky-600 border border-sky-200/60 dark:text-sky-400 dark:border-sky-500/20',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400',
    bar: 'bg-sky-500'
  },
  violet: {
    text: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-200/60 dark:border-violet-500/20',
    ring: 'ring-violet-500/20',
    accent: 'border-l-violet-500',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-violet-500/10 text-violet-600 border border-violet-200/60 dark:text-violet-400 dark:border-violet-500/20',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400',
    bar: 'bg-violet-500'
  },
  primary: {
    text: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/20',
    ring: 'ring-primary/20',
    accent: 'border-l-primary',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary border border-primary/20',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20',
    bar: 'bg-primary'
  },
  neutral: {
    text: 'text-muted-foreground',
    bg: 'bg-muted/40',
    border: 'border-border',
    ring: 'ring-border',
    accent: 'border-l-border',
    chip:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-muted/60 text-foreground border border-border',
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-2xl bg-muted/60 text-foreground ring-1 ring-border',
    bar: 'bg-muted-foreground/30'
  }
};

const make = (tone: CategoryTone, icon: LucideIcon): CategoryVisual => ({
  tone,
  icon,
  ...TONE[tone]
});

/* ─── Application priority / status ─────────────────────────────────── */

export type ApplicationPriority = 'high' | 'medium' | 'watch';
export const PRIORITY_VISUAL: Record<ApplicationPriority, CategoryVisual> = {
  high: make('rose', AlertTriangle),
  medium: make('amber', Target),
  watch: make('sky', Compass)
};
export const PRIORITY_LABEL: Record<ApplicationPriority, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  watch: 'Keep an eye on'
};

export type ApplicationStatusTone = 'planning' | 'in_progress' | 'submitted' | 'decision';
export const APPLICATION_STATUS_VISUAL: Record<ApplicationStatusTone, CategoryVisual> = {
  planning: make('sky', Compass),
  in_progress: make('amber', Timer),
  submitted: make('emerald', CheckCircle2),
  decision: make('violet', Award)
};

/* ─── Reach / Match / Safety tier ───────────────────────────────────── */

export type FitTier = 'reach' | 'match' | 'safety';
export const TIER_VISUAL: Record<FitTier, CategoryVisual> = {
  reach: make('rose', TrendingUp),
  match: make('amber', Target),
  safety: make('emerald', Shield)
};
export const TIER_LABEL: Record<FitTier, string> = {
  reach: 'Reach',
  match: 'Match',
  safety: 'Safety'
};

export const classifyFitTier = (fitScore: number | null | undefined): FitTier | null => {
  if (typeof fitScore !== 'number' || Number.isNaN(fitScore)) return null;
  if (fitScore >= 80) return 'safety';
  if (fitScore >= 60) return 'match';
  return 'reach';
};

/* ─── Document / requirement status ─────────────────────────────────── */

export type DocStatus = 'received' | 'pending' | 'overdue';
export const DOC_STATUS_VISUAL: Record<DocStatus, CategoryVisual> = {
  received: make('emerald', CheckCircle2),
  pending: make('amber', Clock),
  overdue: make('rose', AlertTriangle)
};

/* ─── Task / requirement type ───────────────────────────────────────── */

export type TaskType = 'essay' | 'reference' | 'test' | 'interview' | 'document' | 'general';
export const TASK_VISUAL: Record<TaskType, CategoryVisual> = {
  essay: make('violet', PenLine),
  reference: make('sky', Mail),
  test: make('amber', ClipboardCheck),
  interview: make('rose', Calendar),
  document: make('primary', FileText),
  general: make('neutral', ListChecks)
};

export const inferTaskType = (label?: string | null): TaskType => {
  const l = (label ?? '').toLowerCase();
  if (l.includes('essay') || l.includes('personal statement') || l.includes('writing')) return 'essay';
  if (l.includes('reference') || l.includes('recommend') || l.includes('letter')) return 'reference';
  if (l.includes('test') || l.includes('exam') || l.includes('sat') || l.includes('ielts') || l.includes('toefl'))
    return 'test';
  if (l.includes('interview')) return 'interview';
  if (l.includes('document') || l.includes('transcript') || l.includes('upload')) return 'document';
  return 'general';
};

/* ─── Deadline urgency ──────────────────────────────────────────────── */

export type DeadlineUrgency = 'overdue' | 'this-week' | 'this-month' | 'later' | 'unknown';
export const DEADLINE_VISUAL: Record<DeadlineUrgency, CategoryVisual> = {
  overdue: make('rose', AlertTriangle),
  'this-week': make('amber', CalendarClock),
  'this-month': make('sky', Calendar),
  later: make('emerald', Calendar),
  unknown: make('neutral', Calendar)
};

export const classifyDeadlineUrgency = (
  isoDate?: string | null,
  now: Date = new Date()
): DeadlineUrgency => {
  if (!isoDate) return 'unknown';
  // Date-only strings must parse as LOCAL dates — new Date('YYYY-MM-DD') is UTC
  // midnight, which shifts the deadline by the user's UTC offset (see lib/utils/dates).
  const target = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? parseLocalDate(isoDate) : new Date(isoDate);
  if (Number.isNaN(target.getTime())) return 'unknown';
  const days = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'overdue';
  if (days <= 7) return 'this-week';
  if (days <= 30) return 'this-month';
  return 'later';
};

/* ─── Profile section ───────────────────────────────────────────────── */

export type ProfileSection = 'personal' | 'academics' | 'lifestyle' | 'aspirations';
export const PROFILE_SECTION_VISUAL: Record<ProfileSection, CategoryVisual> = {
  personal: make('sky', UserCircle),
  academics: make('violet', GraduationCap),
  lifestyle: make('amber', Heart),
  aspirations: make('emerald', Target)
};

/* ─── Profile completion banding ────────────────────────────────────── */

export type CompletionBand = 'low' | 'mid' | 'high' | 'full';
export const COMPLETION_VISUAL: Record<CompletionBand, CategoryVisual> = {
  low: make('rose', AlertTriangle),
  mid: make('amber', Target),
  high: make('sky', TrendingUp),
  full: make('emerald', CheckCircle2)
};

export const classifyCompletion = (percent: number): CompletionBand => {
  if (percent >= 100) return 'full';
  if (percent >= 75) return 'high';
  if (percent >= 50) return 'mid';
  return 'low';
};

/* ─── Scholarship category ──────────────────────────────────────────── */

export type ScholarshipCategory = 'Merit' | 'Regional' | 'STEM' | 'Need' | 'Sports' | 'General';
export const SCHOLARSHIP_VISUAL: Record<ScholarshipCategory, CategoryVisual> = {
  Merit: make('violet', Award),
  Regional: make('sky', MapPin),
  STEM: make('emerald', Briefcase),
  Need: make('amber', Heart),
  Sports: make('rose', Target),
  General: make('neutral', Sparkles)
};

/* ─── Toolbox tools ─────────────────────────────────────────────────── */

export type ToolboxTool = 'essay' | 'chances' | 'requirements' | 'timeline' | 'hub';
export const TOOL_VISUAL: Record<ToolboxTool, CategoryVisual> = {
  essay: make('violet', PenLine),
  chances: make('amber', Target),
  requirements: make('sky', ClipboardList),
  timeline: make('rose', CalendarClock),
  hub: make('primary', Sparkles)
};

/* ─── Update / signal types (Updates feed on applications) ─────────── */

export type SignalType = 'deadline' | 'scholarship' | 'portal' | 'task';
export const SIGNAL_VISUAL: Record<SignalType, CategoryVisual> = {
  deadline: make('rose', CalendarClock),
  scholarship: make('emerald', Award),
  portal: make('sky', BookOpen),
  task: make('amber', ListChecks)
};

/* ─── Note types (faculty parity) ───────────────────────────────────── */

export type NoteType = 'session' | 'flag' | 'update';
export const NOTE_VISUAL: Record<NoteType, CategoryVisual> = {
  session: make('violet', MessageSquare),
  flag: make('amber', Flag),
  update: make('sky', TrendingUp)
};

/* ─── Re-export icons used as default fallbacks ─────────────────────── */
export { Users };
